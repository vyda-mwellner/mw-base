use std::path::Path;
use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::config;
use crate::error::AppResult;

static CONVENTIONAL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[A-Za-z]+(?:\([^)]*\)!?:?|!?:)\s*").unwrap());
static TRAILER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?:\s+\(#\d+\)|\s+#[A-Za-z][\w-]*)+\s*$").unwrap());

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JiraFile {
    base_url: String,
    projects: Vec<String>,
}

/// Knows the ticket keys of the configured projects only: a plain `[A-Z]+-\d+` also takes `UTF-8` or `build-dev-539`.
pub struct Jira {
    browse: String,
    key: Option<Regex>,
}

#[derive(Debug, Serialize)]
pub struct Ticket {
    pub key: String,
    pub url: String,
}

impl Jira {
    pub fn load(root: &Path) -> AppResult<Jira> {
        let file: JiraFile = config::parse(root, config::JIRA)?;
        Ok(Jira::new(&file.base_url, &file.projects))
    }

    pub fn new(base_url: &str, projects: &[String]) -> Jira {
        let names: Vec<String> = projects
            .iter()
            .map(|project| project.trim())
            .filter(|project| !project.is_empty())
            .map(regex::escape)
            .collect();
        let key = (!names.is_empty()).then(|| Regex::new(&format!(r"(?i)\b(?:{})-\d+\b", names.join("|"))).unwrap());
        Jira { browse: format!("{}/browse/", base_url.trim().trim_end_matches('/')), key }
    }

    /// Each key once and upper case, in the order it first shows up.
    pub fn keys(&self, message: &str) -> Vec<String> {
        let Some(key) = &self.key else { return Vec::new() };
        let mut keys: Vec<String> = Vec::new();
        for found in key.find_iter(message) {
            let found = found.as_str().to_uppercase();
            if !keys.contains(&found) {
                keys.push(found);
            }
        }
        keys
    }

    pub fn ticket(&self, key: &str) -> Ticket {
        Ticket { key: key.to_string(), url: format!("{}{key}", self.browse) }
    }

    /// `feat(SHOP-1886): avoid two open carts (#172) #no-check` reads as `avoid two open carts`.
    pub fn summary(&self, subject: &str) -> String {
        let mut text = subject.trim();
        if let Some(found) = self.key.as_ref().and_then(|key| key.find(text)).filter(|found| found.start() == 0) {
            text = text[found.end()..].trim_start_matches(|c: char| c == ':' || c == '-' || c.is_whitespace());
        }
        let text = CONVENTIONAL.replace(text, "");
        let text = TRAILER.replace(&text, "");
        match text.trim() {
            "" => subject.trim().to_string(),
            summary => summary.to_string(),
        }
    }
}

/// Sorts by project, then by number, so `OPS-9` comes before `OPS-10`.
pub fn order(key: &str) -> (String, u64) {
    match key.rsplit_once('-') {
        Some((project, number)) => (project.to_string(), number.parse().unwrap_or(u64::MAX)),
        None => (key.to_string(), u64::MAX),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn jira() -> Jira {
        Jira::new("https://example.atlassian.net/", &["SHOP".into(), "OPS".into()])
    }

    #[test]
    fn finds_only_keys_of_the_configured_projects() {
        let message = "Merge pull request #172 from example-org/feature/shop-1886-avoid\n\nfeat(SHOP-1886): x, see OPS-12, UTF-8, build-dev-539, OTHER-1";
        assert_eq!(jira().keys(message), vec!["SHOP-1886", "OPS-12"]);
        assert!(jira().keys("OPS-12a or XOPS-3").is_empty());
        assert!(Jira::new("https://x", &[]).keys("OPS-12").is_empty());
    }

    #[test]
    fn links_a_key_to_the_browse_page() {
        assert_eq!(jira().ticket("OPS-12").url, "https://example.atlassian.net/browse/OPS-12");
    }

    #[test]
    fn reads_the_subject_without_type_scope_and_ci_markers() {
        let jira = jira();
        assert_eq!(jira.summary("feat(SHOP-1886): avoid two open carts"), "avoid two open carts");
        assert_eq!(jira.summary("feat(OPS-36) wording (#190) #no-check"), "wording");
        assert_eq!(jira.summary("OPS-2132 chore(ci): update dependencies"), "update dependencies");
        assert_eq!(jira.summary("fix!: drop the old endpoint"), "drop the old endpoint");
        assert_eq!(jira.summary("Acme -> Example #no-check"), "Acme -> Example");
        assert_eq!(jira.summary("feat(OPS-1):"), "feat(OPS-1):");
    }

    #[test]
    fn sorts_keys_by_project_and_number() {
        let mut keys = vec!["SHOP-2", "OPS-10", "OPS-9"];
        keys.sort_by_key(|key| order(key));
        assert_eq!(keys, vec!["OPS-9", "OPS-10", "SHOP-2"]);
    }
}
