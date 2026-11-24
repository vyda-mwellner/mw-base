use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;
use serde::Serialize;
use serde_json::Value;
use tokio_postgres::config::SslMode as PgSslMode;
use tokio_postgres::types::ToSql;
use tokio_postgres::{Client, Transaction};

use crate::connections::{self, ConnectionConfig, SslMode};
use crate::error::{AppError, AppResult};
use crate::queries::{QueryDefinition, bind_params};
use crate::vault::Credential;

const MAX_ROWS: usize = 5000;
const STATEMENT_TIMEOUT: &str = "60s";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Column {
    pub name: String,
    pub type_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<Column>,
    pub rows: Vec<Vec<Value>>,
    pub truncated: bool,
    pub duration_ms: u64,
}

pub async fn check(connection: &ConnectionConfig, all: &[ConnectionConfig], credential: &Credential) -> AppResult<()> {
    connect(connection, all, credential).await?;
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct SectionResult {
    pub result: Option<QueryResult>,
    pub error: Option<String>,
}

/// Each section gets its own savepoint, so a failing section does not take the others down.
pub async fn run(
    connection: &ConnectionConfig,
    all: &[ConnectionConfig],
    credential: &Credential,
    query: &QueryDefinition,
    values: &HashMap<String, String>,
) -> AppResult<Vec<SectionResult>> {
    let mut client = connect(connection, all, credential).await?;
    let mut transaction = client.build_transaction().read_only(true).start().await?;
    // calendar weeks and timestamps should follow the team's clock, not the server's UTC
    transaction
        .batch_execute(&format!(
            "SET LOCAL statement_timeout = '{STATEMENT_TIMEOUT}'; SET LOCAL TimeZone = 'Europe/Berlin'"
        ))
        .await?;

    let names: Vec<&str> = query.params.iter().map(|param| param.name.as_str()).collect();
    let mut results = Vec::with_capacity(query.sections.len());
    for section in &query.sections {
        let savepoint = transaction.savepoint("section").await?;
        let outcome = run_section(&savepoint, &section.sql, &names, values).await;
        savepoint.rollback().await?;
        results.push(match outcome {
            Ok(result) => SectionResult { result: Some(result), error: None },
            Err(error) => SectionResult { result: None, error: Some(error.to_string()) },
        });
    }
    transaction.rollback().await?;
    Ok(results)
}

/// Postgres renders the rows as JSON itself, which spares a Rust mapping for every column type.
async fn run_section(
    transaction: &Transaction<'_>,
    sql: &str,
    names: &[&str],
    values: &HashMap<String, String>,
) -> AppResult<QueryResult> {
    let started = Instant::now();
    let (body, used) = bind_params(strip_trailing_semicolon(sql), names);
    let args: Vec<&(dyn ToSql + Sync)> = used.iter().map(|name| &values[name] as &(dyn ToSql + Sync)).collect();

    let statement = transaction.prepare(&body).await?;
    let columns: Vec<Column> = statement
        .columns()
        .iter()
        .map(|column| Column { name: column.name().to_string(), type_name: column.type_().name().to_string() })
        .collect();
    ensure_unique(&columns)?;

    // the newline before the closing parenthesis keeps a trailing line comment from swallowing it
    let wrapped = format!(
        "SELECT coalesce(json_agg(q), '[]'::json) FROM (SELECT * FROM (\n{body}\n) AS src LIMIT {}) AS q",
        MAX_ROWS + 1
    );
    let json: Value = transaction.query_one(&wrapped, &args).await?.get(0);

    let mut rows: Vec<Vec<Value>> = match json {
        Value::Array(objects) => objects.into_iter().map(|object| to_row(object, &columns)).collect(),
        _ => Vec::new(),
    };
    let truncated = rows.len() > MAX_ROWS;
    rows.truncate(MAX_ROWS);

    Ok(QueryResult { columns, rows, truncated, duration_ms: started.elapsed().as_millis() as u64 })
}

/// Checks the server address on the connection the query then uses, a separate probe could race a forward switch.
async fn connect(
    connection: &ConnectionConfig,
    all: &[ConnectionConfig],
    credential: &Credential,
) -> AppResult<Client> {
    let mut config = tokio_postgres::Config::new();
    config
        .host(&connection.host)
        .port(connection.port)
        .dbname(&connection.database)
        .user(&credential.user)
        .password(&credential.password)
        .application_name("base")
        .connect_timeout(Duration::from_secs(10))
        .ssl_mode(match connection.ssl_mode {
            SslMode::Disable => PgSslMode::Disable,
            SslMode::Prefer => PgSslMode::Prefer,
            SslMode::Require => PgSslMode::Require,
        });

    // libpq prefer/require: encrypted but unverified, like the JDBC default the backends use
    let tls =
        TlsConnector::builder().danger_accept_invalid_certs(true).danger_accept_invalid_hostnames(true).build()?;
    let (client, driver) = config.connect(MakeTlsConnector::new(tls)).await?;
    tauri::async_runtime::spawn(async move {
        if let Err(error) = driver.await {
            eprintln!("base: postgres connection closed with error: {error}");
        }
    });
    let address: Option<String> = client.query_one("SELECT host(inet_server_addr())", &[]).await?.get(0);
    connections::verify_server(connection, all, address.as_deref())?;
    Ok(client)
}

fn strip_trailing_semicolon(sql: &str) -> &str {
    sql.trim().trim_end_matches(';').trim_end()
}

fn ensure_unique(columns: &[Column]) -> AppResult<()> {
    let mut seen = HashSet::new();
    match columns.iter().find(|column| !seen.insert(column.name.as_str())) {
        Some(duplicate) => Err(AppError::Invalid(format!(
            "Spalte '{}' kommt doppelt vor - bitte eindeutige Aliase vergeben",
            duplicate.name
        ))),
        None => Ok(()),
    }
}

fn to_row(object: Value, columns: &[Column]) -> Vec<Value> {
    let Value::Object(mut fields) = object else {
        return Vec::new();
    };
    columns.iter().map(|column| fields.remove(&column.name).unwrap_or(Value::Null)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::queries::parse;

    fn local() -> (ConnectionConfig, Credential) {
        let all = connections::load_all(&crate::paths::root()).unwrap();
        let connection = connections::find(&all, "local").unwrap().clone();
        let credential = Credential { user: connection.user.clone(), password: connection.password.clone().unwrap() };
        (connection, credential)
    }

    #[test]
    fn strips_trailing_semicolons_and_whitespace() {
        assert_eq!(strip_trailing_semicolon("SELECT 1;\n\n"), "SELECT 1");
    }

    #[test]
    fn keeps_column_order_of_the_statement() {
        let columns = vec![
            Column { name: "b".into(), type_name: "int4".into() },
            Column { name: "a".into(), type_name: "text".into() },
        ];
        let row = to_row(serde_json::json!({ "a": "x", "b": 1 }), &columns);
        assert_eq!(row, vec![serde_json::json!(1), serde_json::json!("x")]);
    }

    #[tokio::test]
    #[ignore = "needs the local db stack and stages/verbindungen.json in the data folder"]
    async fn runs_against_the_local_container() {
        let (connection, credential) = local();
        let query = parse(
            "q",
            "",
            "-- param: name\n-- section: ok\nSELECT 1 AS one, :name AS label, NULL::date AS nothing;\n-- section: broken\nSELECT * FROM missing_table",
        );
        let values = HashMap::from([("name".to_string(), "x".to_string())]);
        let results = run(&connection, &[], &credential, &query, &values).await.unwrap();

        let ok = results[0].result.as_ref().unwrap();
        assert_eq!(ok.columns.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), ["one", "label", "nothing"]);
        assert_eq!(ok.rows, vec![vec![serde_json::json!(1), serde_json::json!("x"), Value::Null]]);
        assert!(results[1].error.as_deref().unwrap().contains("missing_table"));
    }

    #[tokio::test]
    #[ignore = "needs the local db stack and stages/verbindungen.json in the data folder"]
    async fn refuses_writes() {
        let (connection, credential) = local();
        let results =
            run(&connection, &[], &credential, &parse("q", "", "SELECT lo_create(0)"), &HashMap::new()).await.unwrap();
        let error = results[0].error.as_deref().unwrap();
        assert!(error.contains("read-only transaction"), "{error}");
    }

    #[tokio::test]
    #[ignore = "needs the local db stack and stages/verbindungen.json in the data folder"]
    async fn reports_the_server_message_for_a_wrong_password() {
        let (connection, _) = local();
        let credential = Credential { user: "postgres".into(), password: "wrong".into() };
        let error = check(&connection, &[], &credential).await.unwrap_err();
        assert!(error.to_string().contains("password authentication failed"), "{error}");
    }

    #[tokio::test]
    #[ignore = "needs the local db stack and stages/verbindungen.json in the data folder"]
    async fn refuses_a_server_with_another_address() {
        let (mut connection, credential) = local();
        connection.server_address = Some("10.0.0.10".into());
        let error = check(&connection, &[], &credential).await.unwrap_err().to_string();
        assert!(error.contains("antwortet der Server") && error.contains("10.0.0.10 eingetragen"), "{error}");
    }

    #[test]
    fn rejects_duplicate_column_names() {
        let columns = vec![
            Column { name: "count".into(), type_name: "int8".into() },
            Column { name: "count".into(), type_name: "int8".into() },
        ];
        assert!(ensure_unique(&columns).is_err());
    }
}
