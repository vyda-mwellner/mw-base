use std::collections::HashSet;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::config;
use crate::error::{AppError, AppResult};
use crate::vault::{Credential, Vault};

#[derive(Debug, Deserialize, Clone, Copy, Default)]
#[serde(rename_all = "kebab-case")]
pub enum SslMode {
    Disable,
    #[default]
    Prefer,
    Require,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    #[serde(default)]
    pub user: String,
    /// Only for the disposable local container - remote passwords go through the vault.
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub ssl_mode: SslMode,
    #[serde(default)]
    pub production: bool,
    #[serde(default)]
    pub server_address: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ConnectionsFile {
    connections: Vec<ConnectionConfig>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionView {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub production: bool,
    pub requires_password: bool,
    /// Epoch millis, absent while locked.
    pub unlocked_until: Option<u64>,
}

/// Two connections with one server address would let the check of `verify_server` pass for the wrong one.
pub fn load_all(root: &Path) -> AppResult<Vec<ConnectionConfig>> {
    let connections = config::parse::<ConnectionsFile>(root, config::CONNECTIONS)?.connections;
    let mut seen = HashSet::new();
    match connections.iter().filter_map(|c| c.server_address.as_deref()).find(|address| !seen.insert(*address)) {
        Some(address) => Err(AppError::Invalid(format!(
            "serverAddress {address} steht in {} bei mehr als einer Verbindung",
            config::CONNECTIONS
        ))),
        None => Ok(connections),
    }
}

pub fn find<'a>(all: &'a [ConnectionConfig], id: &str) -> AppResult<&'a ConnectionConfig> {
    all.iter()
        .find(|connection| connection.id == id)
        .ok_or_else(|| AppError::Invalid(format!("Unbekannte Verbindung '{id}'")))
}

/// DEV, TEST and PROD share one port-forward, so only the address the server reports tells which one answers.
pub fn verify_server(connection: &ConnectionConfig, all: &[ConnectionConfig], actual: Option<&str>) -> AppResult<()> {
    let Some(expected) = connection.server_address.as_deref() else {
        return Ok(());
    };
    if actual == Some(expected) {
        return Ok(());
    }
    let endpoint = format!("{}:{}", connection.host, connection.port);
    let label = &connection.label;
    let message = match actual {
        None => format!(
            "Der Server auf {endpoint} nennt keine Adresse, für {label} ist {expected} eingetragen ({})",
            config::CONNECTIONS
        ),
        Some(address) => match all.iter().find(|other| other.server_address.as_deref() == Some(address)) {
            Some(other) => format!(
                "Auf {endpoint} antwortet {0}, nicht {label} - den Port-Forward umstellen oder die Kachel {0} wählen",
                other.label
            ),
            None => format!(
                "Auf {endpoint} antwortet der Server {address}, für {label} ist {expected} eingetragen ({})",
                config::CONNECTIONS
            ),
        },
    };
    Err(AppError::Invalid(message))
}

pub fn view(connection: &ConnectionConfig, vault: &Vault) -> ConnectionView {
    let unlocked_until = match connection.password {
        Some(_) => None,
        None => vault.unlocked_until(&connection.id).map(|secs| secs * 1000),
    };
    ConnectionView {
        id: connection.id.clone(),
        label: connection.label.clone(),
        host: connection.host.clone(),
        port: connection.port,
        database: connection.database.clone(),
        user: connection.user.clone(),
        production: connection.production,
        requires_password: connection.password.is_none(),
        unlocked_until,
    }
}

pub fn credential(connection: &ConnectionConfig, vault: &Vault) -> AppResult<Credential> {
    if let Some(password) = &connection.password {
        return Ok(Credential { user: connection.user.clone(), password: password.clone() });
    }
    vault.load(&connection.id).ok_or_else(|| AppError::Locked(connection.label.clone()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn forwarded(id: &str, label: &str, address: Option<&str>) -> ConnectionConfig {
        ConnectionConfig {
            id: id.into(),
            label: label.into(),
            host: "localhost".into(),
            port: 5430,
            database: "postgres".into(),
            user: "root".into(),
            password: None,
            ssl_mode: SslMode::Prefer,
            production: id == "prod",
            server_address: address.map(String::from),
        }
    }

    fn environments() -> Vec<ConnectionConfig> {
        vec![
            forwarded("dev", "DEV", Some("10.0.0.10")),
            forwarded("test", "TEST", Some("10.1.0.10")),
            forwarded("prod", "PROD", Some("10.2.0.10")),
        ]
    }

    #[test]
    fn accepts_the_server_the_connection_expects() {
        let all = environments();
        assert!(verify_server(&all[0], &all, Some("10.0.0.10")).is_ok());
    }

    #[test]
    fn names_the_environment_that_answers_instead() {
        let all = environments();
        let error = verify_server(&all[0], &all, Some("10.2.0.10")).unwrap_err().to_string();
        assert!(error.starts_with("Auf localhost:5430 antwortet PROD, nicht DEV"), "{error}");
        assert!(error.contains("die Kachel PROD wählen"), "{error}");
    }

    #[test]
    fn shows_an_unknown_server_with_its_address() {
        let all = environments();
        let error = verify_server(&all[2], &all, Some("10.2.0.99")).unwrap_err().to_string();
        assert!(error.contains("antwortet der Server 10.2.0.99, für PROD ist 10.2.0.10 eingetragen"), "{error}");
    }

    #[test]
    fn refuses_a_server_without_an_address() {
        let all = environments();
        assert!(verify_server(&all[1], &all, None).is_err());
    }

    #[test]
    fn skips_a_connection_without_an_expected_address() {
        let local = forwarded("local", "LOCAL", None);
        assert!(verify_server(&local, &environments(), Some("172.18.0.2")).is_ok());
        assert!(verify_server(&local, &environments(), None).is_ok());
    }

    fn connections_file(connections: serde_json::Value) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("stages")).unwrap();
        let text = serde_json::json!({ "connections": connections }).to_string();
        std::fs::write(dir.path().join(config::CONNECTIONS), text).unwrap();
        dir
    }

    #[test]
    fn reads_the_connections_of_the_data_folder() {
        let dir = connections_file(serde_json::json!([
            { "id": "local", "label": "LOCAL", "host": "localhost", "port": 5438, "database": "postgres", "user": "postgres", "password": "postgres", "sslMode": "disable" },
            { "id": "prod", "label": "PROD", "host": "localhost", "port": 5430, "database": "postgres", "user": "root", "serverAddress": "10.2.0.10", "production": true }
        ]));
        let all = load_all(dir.path()).unwrap();
        let prod = find(&all, "prod").unwrap();
        assert!(prod.production && prod.password.is_none());
        assert!(matches!(find(&all, "local").unwrap().ssl_mode, SslMode::Disable));
    }

    #[test]
    fn refuses_two_connections_with_one_server_address() {
        let dir = connections_file(serde_json::json!([
            { "id": "dev", "label": "DEV", "host": "localhost", "port": 5430, "database": "postgres", "serverAddress": "10.0.0.10" },
            { "id": "prod", "label": "PROD", "host": "localhost", "port": 5430, "database": "postgres", "serverAddress": "10.0.0.10" }
        ]));
        let error = load_all(dir.path()).unwrap_err().to_string();
        assert!(error.contains("serverAddress 10.0.0.10 steht in stages/verbindungen.json"), "{error}");
    }
}
