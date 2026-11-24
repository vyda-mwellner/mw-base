use std::sync::LazyLock;

use regex::Regex;
use serde_json::Value;

static ADDRESS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(localhost|127\.0\.0\.1|host\.docker\.internal|local-[a-z0-9-]+):(\d{2,5})").unwrap()
});
static TS_ENTRY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(\w+)\s*:\s*['"`]([^'"`\n]*)['"`]"#).unwrap());
static PROPERTY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*([\w.\-\[\]]+)\s*[=:]\s*(.*)$").unwrap());

/// One `host:port` (or a bare `port: 3025`) found in a config file.
#[derive(Debug, Clone, PartialEq)]
pub struct Reference {
    pub key: String,
    /// Empty for a bare port entry.
    pub host: String,
    pub port: u16,
}

impl Reference {
    pub fn leaf_key(&self) -> &str {
        self.key.rsplit('.').next().unwrap_or(&self.key)
    }
}

/// Dotted key path and scalar value of every entry, with the file type picked from the name.
fn entries(file_name: &str, text: &str) -> Vec<(String, String)> {
    let lower = file_name.to_lowercase();
    if lower.ends_with(".yml") || lower.ends_with(".yaml") {
        yaml_entries(text)
    } else if lower.ends_with(".json") {
        serde_json::from_str::<Value>(text).map(|value| json_entries(&value)).unwrap_or_default()
    } else if lower.ends_with(".ts") || lower.ends_with(".js") {
        TS_ENTRY.captures_iter(text).map(|c| (c[1].to_string(), c[2].to_string())).collect()
    } else {
        text.lines()
            .filter(|line| !line.trim_start().starts_with('#'))
            .filter_map(|line| PROPERTY.captures(line))
            .map(|c| (c[1].to_string(), c[2].trim().to_string()))
            .collect()
    }
}

pub fn references(file_name: &str, text: &str) -> Vec<Reference> {
    let mut found = Vec::new();
    for (key, value) in entries(file_name, text) {
        let leaf = key.rsplit('.').next().unwrap_or(&key);
        if leaf.eq_ignore_ascii_case("port") {
            if let Ok(port) = value.trim().parse() {
                found.push(Reference { key: key.clone(), host: String::new(), port });
            }
            continue;
        }
        for address in ADDRESS.captures_iter(&value) {
            if let Ok(port) = address[2].parse() {
                found.push(Reference { key: key.clone(), host: address[1].to_string(), port });
            }
        }
    }
    found
}

/// Enough YAML for Spring and compose files: nested maps, scalar lists, comments and `---` documents.
pub fn yaml_entries(text: &str) -> Vec<(String, String)> {
    let mut parents: Vec<(usize, String)> = Vec::new();
    let mut entries = Vec::new();
    for raw in text.lines() {
        let line = strip_comment(raw);
        let content = line.trim();
        if content.is_empty() {
            continue;
        }
        if content == "---" {
            parents.clear();
            continue;
        }
        let indent = line.len() - line.trim_start().len();

        if let Some(item) = content.strip_prefix("- ").or(if content == "-" { Some("") } else { None }) {
            while parents.last().is_some_and(|(depth, _)| *depth > indent) {
                parents.pop();
            }
            if let Some((key, value)) = split_key(item) {
                let depth = indent + 2;
                while parents.last().is_some_and(|(d, _)| *d >= depth) {
                    parents.pop();
                }
                push_entry(&mut parents, &mut entries, depth, key, value);
            } else if !item.is_empty() {
                entries.push((path(&parents), unquote(item)));
            }
            continue;
        }

        let Some((key, value)) = split_key(content) else {
            continue;
        };
        while parents.last().is_some_and(|(depth, _)| *depth >= indent) {
            parents.pop();
        }
        push_entry(&mut parents, &mut entries, indent, key, value);
    }
    entries
}

fn push_entry(
    parents: &mut Vec<(usize, String)>,
    entries: &mut Vec<(String, String)>,
    depth: usize,
    key: &str,
    value: &str,
) {
    if value.is_empty() || value == "|" || value == ">" {
        parents.push((depth, key.to_string()));
    } else {
        let mut full = path(parents);
        if !full.is_empty() {
            full.push('.');
        }
        full.push_str(key);
        entries.push((full, unquote(value)));
    }
}

/// `key: value` or `key:`, but not the colon inside `http://host:8080`.
fn split_key(content: &str) -> Option<(&str, &str)> {
    let (key, value) = match content.find(": ") {
        Some(index) => (&content[..index], content[index + 2..].trim()),
        None => (content.strip_suffix(':')?, ""),
    };
    let key = key.trim().trim_matches(|c| c == '"' || c == '\'');
    let valid = !key.is_empty() && !key.contains(' ') && !key.contains("//");
    valid.then_some((key, value))
}

fn strip_comment(line: &str) -> &str {
    if line.trim_start().starts_with('#') {
        return "";
    }
    match line.find(" #") {
        Some(index) => &line[..index],
        None => line,
    }
}

fn unquote(value: &str) -> String {
    value.trim().trim_matches(|c| c == '"' || c == '\'').to_string()
}

fn path(parents: &[(usize, String)]) -> String {
    parents.iter().map(|(_, key)| key.as_str()).collect::<Vec<_>>().join(".")
}

fn json_entries(value: &Value) -> Vec<(String, String)> {
    let mut entries = Vec::new();
    walk_json(value, String::new(), &mut entries);
    entries
}

fn walk_json(value: &Value, prefix: String, entries: &mut Vec<(String, String)>) {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                let path = if prefix.is_empty() { key.clone() } else { format!("{prefix}.{key}") };
                walk_json(child, path, entries);
            }
        }
        Value::Array(items) => items.iter().for_each(|item| walk_json(item, prefix.clone(), entries)),
        Value::String(text) => entries.push((prefix, text.clone())),
        Value::Number(number) => entries.push((prefix, number.to_string())),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn walks_nested_spring_keys_and_skips_comments() {
        let yaml = "server:\n  port: 8080 # local\nct-backend:\n  baseUrl: http://localhost:8083\n# old: http://localhost:1\nspring:\n  datasource:\n    url: jdbc:postgresql://localhost:5438/postgres\n";
        assert_eq!(
            yaml_entries(yaml),
            vec![
                ("server.port".to_string(), "8080".to_string()),
                ("ct-backend.baseUrl".to_string(), "http://localhost:8083".to_string()),
                ("spring.datasource.url".to_string(), "jdbc:postgresql://localhost:5438/postgres".to_string()),
            ]
        );
    }

    #[test]
    fn keeps_list_items_under_their_key_in_both_indent_styles() {
        let yaml = "services:\n  postgres:\n    container_name: local-postgres\n    ports:\n      - \"5438:5432\"\n  other:\n    ports:\n    - 9000:9000\n";
        assert_eq!(
            yaml_entries(yaml),
            vec![
                ("services.postgres.container_name".to_string(), "local-postgres".to_string()),
                ("services.postgres.ports".to_string(), "5438:5432".to_string()),
                ("services.other.ports".to_string(), "9000:9000".to_string()),
            ]
        );
    }

    #[test]
    fn finds_every_address_and_bare_ports() {
        let yaml = "cors:\n  origins: http://localhost:4400, http://localhost:4500\nspring:\n  mail:\n    port: 3025\nauth:\n  url: http://local-keycloak:8080/realms/ps\n";
        let found = references("application.yml", yaml);
        assert_eq!(found.len(), 4);
        assert_eq!(found[0], Reference { key: "cors.origins".into(), host: "localhost".into(), port: 4400 });
        assert_eq!(found[2], Reference { key: "spring.mail.port".into(), host: String::new(), port: 3025 });
        assert_eq!(found[3].host, "local-keycloak");
        assert_eq!(found[3].leaf_key(), "url");
    }

    #[test]
    fn reads_angular_configs_from_json_and_environment_files() {
        let json = r#"{ "psServerUrl": "http://localhost:9090", "keycloak": { "url": "http://localhost:8081" } }"#;
        let keys: Vec<String> = references("config.json", json).into_iter().map(|r| r.key).collect();
        assert_eq!(keys, vec!["keycloak.url", "psServerUrl"]);

        let ts = "export const environment = {\n  apiBaseUrl: 'http://localhost:8080/',\n  orderUrl: \"http://localhost:4600\",\n};";
        let ports: Vec<u16> = references("environment.ts", ts).into_iter().map(|r| r.port).collect();
        assert_eq!(ports, vec![8080, 4600]);
    }
}
