use std::collections::HashMap;
use std::path::Path;

use serde::Serialize;

use crate::config;
use crate::error::{AppError, AppResult};

const SECTION_MARKER: &str = "-- section:";
const MAX_TEXT_PARAM: usize = 500;

#[derive(Debug, Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ChartKind {
    Bar,
    Hbar,
    Stacked,
    Line,
    Stat,
    Record,
    Text,
    Table,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ParamKind {
    Text,
    Uuid,
    Choice,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct QueryParam {
    pub name: String,
    pub kind: ParamKind,
    pub options: Vec<String>,
}

/// A cell of `column` opens the query that has a param named `param`, with the cell value filled in.
#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct QueryLink {
    pub column: String,
    pub param: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct QuerySection {
    pub title: Option<String>,
    pub chart: ChartKind,
    pub x: Option<String>,
    pub y: Vec<String>,
    /// Column whose values become one series each, for rows shaped like (x, series, y).
    pub series: Option<String>,
    pub info: Option<String>,
    pub links: Vec<QueryLink>,
    pub sql: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QueryDefinition {
    pub id: String,
    pub area: String,
    pub title: String,
    pub description: Option<String>,
    /// Connection ids the query is meant for, empty means all.
    pub connections: Vec<String>,
    pub params: Vec<QueryParam>,
    pub sections: Vec<QuerySection>,
}

/// Reads `stages/abfragen/` on every call, so a new or edited query shows up without a restart.
pub fn load_all(root: &Path) -> AppResult<Vec<QueryDefinition>> {
    let dir = root.join(config::QUERIES);
    if !dir.is_dir() {
        return Err(config::missing(root, config::QUERIES));
    }
    let mut files = Vec::new();
    collect_sql_files(&dir, &mut files)?;
    files.sort();

    files
        .iter()
        .map(|path| {
            let relative = path.strip_prefix(&dir).unwrap_or(path).with_extension("");
            let id = relative.to_string_lossy().replace('\\', "/");
            let area = relative
                .parent()
                .and_then(|parent| parent.file_name())
                .map(|name| area_title(&name.to_string_lossy()))
                .unwrap_or_default();
            Ok(parse(&id, &area, &std::fs::read_to_string(path)?))
        })
        .collect()
}

pub fn find(root: &Path, id: &str) -> AppResult<QueryDefinition> {
    load_all(root)?
        .into_iter()
        .find(|query| query.id == id)
        .ok_or_else(|| AppError::Invalid(format!("Unbekannte Query '{id}'")))
}

fn collect_sql_files(dir: &Path, files: &mut Vec<std::path::PathBuf>) -> AppResult<()> {
    let entries = std::fs::read_dir(dir)
        .map_err(|error| AppError::Invalid(format!("{} kann nicht gelesen werden: {error}", dir.display())))?;
    for path in entries.filter_map(|entry| entry.ok().map(|entry| entry.path())) {
        if path.is_dir() {
            collect_sql_files(&path, files)?;
        } else if path.extension().is_some_and(|ext| ext == "sql") {
            files.push(path);
        }
    }
    Ok(())
}

/// `2_Auswertungen_Bestellungen` shows as "Auswertungen Bestellungen", the number only sets the order.
fn area_title(folder: &str) -> String {
    folder.trim_start_matches(|c: char| c.is_ascii_digit()).trim_start_matches(['-', '_']).replace('_', " ")
}

/// Without `-- section:` markers the whole file is one section that shares the header with the query.
pub fn parse(id: &str, area: &str, text: &str) -> QueryDefinition {
    let mut query = QueryDefinition {
        id: id.to_string(),
        area: area.to_string(),
        title: id.rsplit('/').next().unwrap_or(id).to_string(),
        description: None,
        connections: Vec::new(),
        params: Vec::new(),
        sections: Vec::new(),
    };

    let mut parts = text.split(SECTION_MARKER);
    let preamble = parts.next().unwrap_or_default();
    for (key, value) in header(preamble) {
        match key.as_str() {
            "title" => query.title = value,
            "description" => query.description = Some(value),
            "connections" => query.connections = list(&value),
            "param" => query.params.extend(param(&value)),
            _ => {}
        }
    }

    let marked: Vec<&str> = parts.collect();
    if marked.is_empty() {
        query.sections.push(section(None, preamble));
    } else {
        for part in marked {
            let (title, body) = part.split_once('\n').unwrap_or((part, ""));
            query.sections.push(section(Some(title.trim().to_string()), body));
        }
    }
    query
}

fn section(title: Option<String>, body: &str) -> QuerySection {
    let mut section = QuerySection {
        title,
        chart: ChartKind::Table,
        x: None,
        y: Vec::new(),
        series: None,
        info: None,
        links: Vec::new(),
        sql: body.trim().to_string(),
    };
    let mut info = Vec::new();
    for (key, value) in header(body) {
        match key.as_str() {
            "chart" => section.chart = chart_kind(&value),
            "x" => section.x = Some(value),
            "y" => section.y = list(&value),
            "series" => section.series = Some(value),
            "info" => info.push(value),
            "link" => section.links.extend(list(&value).iter().filter_map(|item| link(item))),
            _ => {}
        }
    }
    section.info = (!info.is_empty()).then(|| info.join(" "));
    section
}

fn header(text: &str) -> impl Iterator<Item = (String, String)> + '_ {
    text.lines()
        .map(str::trim)
        .skip_while(|line| line.is_empty())
        .take_while(|line| line.starts_with("--"))
        .filter_map(|line| line.trim_start_matches('-').split_once(':'))
        .map(|(key, value)| (key.trim().to_lowercase(), value.trim().to_string()))
}

/// `name`, `name uuid` or `name = a | b | c`, where the first option is the default.
fn param(value: &str) -> Option<QueryParam> {
    if let Some((name, options)) = value.split_once('=') {
        return Some(QueryParam {
            name: name.trim().to_string(),
            kind: ParamKind::Choice,
            options: options.split('|').map(str::trim).filter(|o| !o.is_empty()).map(String::from).collect(),
        });
    }
    let mut words = value.split_whitespace();
    let name = words.next()?.to_string();
    let kind = match words.next() {
        Some("uuid") => ParamKind::Uuid,
        _ => ParamKind::Text,
    };
    Some(QueryParam { name, kind, options: Vec::new() })
}

/// `order_id -> orderId`
fn link(value: &str) -> Option<QueryLink> {
    let (column, param) = value.split_once("->")?;
    let (column, param) = (column.trim(), param.trim());
    (!column.is_empty() && !param.is_empty()).then(|| QueryLink { column: column.into(), param: param.into() })
}

fn chart_kind(value: &str) -> ChartKind {
    match value.to_lowercase().as_str() {
        "bar" => ChartKind::Bar,
        "hbar" => ChartKind::Hbar,
        "stacked" => ChartKind::Stacked,
        "line" => ChartKind::Line,
        "stat" => ChartKind::Stat,
        "record" => ChartKind::Record,
        "text" => ChartKind::Text,
        _ => ChartKind::Table,
    }
}

fn list(value: &str) -> Vec<String> {
    value.split(',').map(str::trim).filter(|item| !item.is_empty()).map(String::from).collect()
}

pub fn validate(params: &[QueryParam], values: &HashMap<String, String>) -> AppResult<HashMap<String, String>> {
    let mut checked = HashMap::new();
    for param in params {
        let value = values.get(&param.name).map(|value| value.trim()).unwrap_or_default();
        let valid = match param.kind {
            ParamKind::Choice => param.options.iter().any(|option| option == value),
            ParamKind::Uuid => is_uuid(value),
            ParamKind::Text => !value.is_empty() && value.len() <= MAX_TEXT_PARAM,
        };
        if !valid {
            return Err(AppError::Invalid(format!("'{value}' ist kein gültiger Wert für {}", param.name)));
        }
        checked.insert(param.name.clone(), value.to_string());
    }
    Ok(checked)
}

fn is_uuid(value: &str) -> bool {
    value.len() == 36
        && value.char_indices().all(|(index, c)| match index {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

/// Values arrive as `($n::text)`, so the SQL casts them where it needs another type: `:batchId::uuid`.
pub fn bind_params(sql: &str, names: &[&str]) -> (String, Vec<String>) {
    let chars: Vec<char> = sql.chars().collect();
    let mut out = String::with_capacity(sql.len());
    let mut used: Vec<String> = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let next = chars.get(i + 1).copied();
        if c == '\'' {
            let end = (i + 1..chars.len()).find(|&j| chars[j] == '\'').map_or(chars.len(), |j| j + 1);
            out.extend(&chars[i..end]);
            i = end;
            continue;
        }
        if c == '-' && next == Some('-') {
            let end = (i..chars.len()).find(|&j| chars[j] == '\n').unwrap_or(chars.len());
            out.extend(&chars[i..end]);
            i = end;
            continue;
        }
        let starts_name = next.is_some_and(|n| n.is_ascii_alphabetic() || n == '_');
        if c == ':' && starts_name && (i == 0 || chars[i - 1] != ':') {
            let end = (i + 1..chars.len())
                .find(|&j| !(chars[j].is_ascii_alphanumeric() || chars[j] == '_'))
                .unwrap_or(chars.len());
            let name: String = chars[i + 1..end].iter().collect();
            if names.contains(&name.as_str()) {
                let position = match used.iter().position(|known| known == &name) {
                    Some(position) => position,
                    None => {
                        used.push(name);
                        used.len() - 1
                    }
                };
                out.push_str(&format!("(${}::text)", position + 1));
                i = end;
                continue;
            }
        }
        out.push(c);
        i += 1;
    }
    (out, used)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_query_and_section_header_from_one_block() {
        let query = parse(
            "1_Shop/orders",
            "Shop",
            "-- title: Orders per tenant\n-- chart: hbar\n-- x: tenant\n-- y: open, closed\n-- connections: dev, prod\nSELECT 1",
        );
        assert_eq!(query.title, "Orders per tenant");
        assert_eq!(query.connections, vec!["dev", "prod"]);
        assert_eq!(query.sections.len(), 1);
        assert_eq!(query.sections[0].chart, ChartKind::Hbar);
        assert_eq!(query.sections[0].x.as_deref(), Some("tenant"));
        assert_eq!(query.sections[0].y, vec!["open", "closed"]);
    }

    #[test]
    fn splits_sections_with_their_own_chart_settings() {
        let query = parse(
            "q",
            "",
            "-- title: Report\n-- param: weeks = 5 | 10 | 20\n\n-- section: By channel\n-- chart: stacked\n-- series: kanal\n-- info: P90: 90 % were faster.\n-- info: The rest took longer.\nSELECT 1;\n\n-- section: Raw\nSELECT 2;",
        );
        assert_eq!(
            query.params,
            vec![QueryParam {
                name: "weeks".into(),
                kind: ParamKind::Choice,
                options: vec!["5".into(), "10".into(), "20".into()]
            }]
        );
        assert_eq!(query.sections.len(), 2);
        assert_eq!(query.sections[0].title.as_deref(), Some("By channel"));
        assert_eq!(query.sections[0].chart, ChartKind::Stacked);
        assert_eq!(query.sections[0].series.as_deref(), Some("kanal"));
        assert_eq!(query.sections[0].info.as_deref(), Some("P90: 90 % were faster. The rest took longer."));
        assert_eq!(query.sections[1].chart, ChartKind::Table);
        assert_eq!(query.sections[1].info, None);
        assert_eq!(query.sections[1].sql, "SELECT 2;");
    }

    #[test]
    fn reads_links_from_columns_to_params() {
        let query =
            parse("q", "", "-- link: id -> batchId, order_number -> bestellnummer\n-- link: broken, -> x\nSELECT 1");
        assert_eq!(
            query.sections[0].links,
            vec![
                QueryLink { column: "id".into(), param: "batchId".into() },
                QueryLink { column: "order_number".into(), param: "bestellnummer".into() },
            ]
        );
    }

    #[test]
    fn ignores_comments_after_the_header() {
        let query = parse("plain", "", "SELECT 1\n-- chart: bar");
        assert_eq!(query.title, "plain");
        assert_eq!(query.sections[0].chart, ChartKind::Table);
    }

    #[test]
    fn strips_the_ordering_number_from_area_folders() {
        assert_eq!(area_title("2_Auswertungen_Bestellungen"), "Auswertungen Bestellungen");
        assert_eq!(area_title("10-Shop"), "Shop");
    }

    #[test]
    fn binds_declared_params_but_leaves_casts_strings_and_comments_alone() {
        let (sql, used) = bind_params(
            "-- uses :batchId\nSELECT ':batchId', day::date FROM t WHERE id = :batchId::uuid AND n < :weeks::int OR id = :batchId::uuid AND x = :other",
            &["batchId", "weeks"],
        );
        assert_eq!(
            sql,
            "-- uses :batchId\nSELECT ':batchId', day::date FROM t WHERE id = ($1::text)::uuid AND n < ($2::text)::int OR id = ($1::text)::uuid AND x = :other"
        );
        assert_eq!(used, vec!["batchId", "weeks"]);
    }

    #[test]
    fn reads_the_queries_of_the_data_folder_with_their_area() {
        let dir = tempfile::tempdir().unwrap();
        let area = dir.path().join(config::QUERIES).join("2_Auswertungen_Bestellungen");
        std::fs::create_dir_all(&area).unwrap();
        std::fs::write(area.join("010-wochenuebersicht.sql"), "-- title: Wochenübersicht\nSELECT 1").unwrap();
        std::fs::write(area.join("notes.txt"), "no query").unwrap();

        let queries = load_all(dir.path()).unwrap();
        assert_eq!(queries.len(), 1);
        assert_eq!(queries[0].id, "2_Auswertungen_Bestellungen/010-wochenuebersicht");
        assert_eq!(
            (queries[0].area.as_str(), queries[0].title.as_str()),
            ("Auswertungen Bestellungen", "Wochenübersicht")
        );
    }

    #[test]
    fn names_the_missing_query_folder() {
        let dir = tempfile::tempdir().unwrap();
        let error = load_all(dir.path()).unwrap_err().to_string();
        assert!(error.starts_with("stages/abfragen fehlt im Datenordner"), "{error}");
    }

    #[test]
    fn accepts_only_valid_param_values() {
        let params = vec![
            QueryParam { name: "batchId".into(), kind: ParamKind::Uuid, options: vec![] },
            QueryParam { name: "weeks".into(), kind: ParamKind::Choice, options: vec!["5".into(), "10".into()] },
        ];
        let values = |batch: &str, weeks: &str| {
            HashMap::from([("batchId".to_string(), batch.to_string()), ("weeks".to_string(), weeks.to_string())])
        };
        let checked = validate(&params, &values(" 7fe8cf3b-64b4-408d-bfe1-2cff3db66764 ", "10")).unwrap();
        assert_eq!(checked["batchId"], "7fe8cf3b-64b4-408d-bfe1-2cff3db66764");
        assert!(validate(&params, &values("7fe8cf3b", "10")).is_err());
        assert!(validate(&params, &values("7fe8cf3b-64b4-408d-bfe1-2cff3db66764", "15")).is_err());
    }
}
