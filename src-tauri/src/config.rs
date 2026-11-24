//! The config files of the stages and git tools, at fixed places in the data folder. The webview never names one.

use std::path::Path;

use serde::de::DeserializeOwned;

use crate::error::{AppError, AppResult};

pub const SETTINGS: &str = "einstellungen/pfade.json";
pub const BACKUP: &str = "einstellungen/backup.json";
pub const CONNECTIONS: &str = "stages/verbindungen.json";
pub const FORWARDS: &str = "stages/forwards.json";
pub const QUERIES: &str = "stages/abfragen";
pub const RESTARTS: &str = "stages/restarts.json";
pub const JIRA: &str = "git/jira.json";
pub const TEAM: &str = "git/team.json";
pub const GITOPS: &str = "git/gitops.json";
pub const APPS: &str = "landschaft/apps.json";
/// The last scan of the workspace, written by the shell.
pub const SCAN: &str = "landschaft/scan.json";
/// The dev servers that still run, written by the shell, so a restart of the shell can take them over.
pub const DEV_SERVERS: &str = "werkstatt/dev-server.json";

pub fn missing(root: &Path, relative: &str) -> AppError {
    AppError::Invalid(format!("{relative} fehlt im Datenordner {}", root.display()))
}

pub fn read(root: &Path, relative: &str) -> AppResult<String> {
    std::fs::read_to_string(root.join(relative)).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => missing(root, relative),
        _ => AppError::Invalid(format!("{relative} im Datenordner kann nicht gelesen werden: {error}")),
    })
}

pub fn parse<T: DeserializeOwned>(root: &Path, relative: &str) -> AppResult<T> {
    serde_json::from_str(&read(root, relative)?)
        .map_err(|error| AppError::Invalid(format!("{relative} im Datenordner ist fehlerhaft: {error}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_a_missing_file_by_its_place_in_the_data_folder() {
        let dir = tempfile::tempdir().unwrap();
        let error = read(dir.path(), CONNECTIONS).unwrap_err().to_string();
        assert_eq!(error, format!("stages/verbindungen.json fehlt im Datenordner {}", dir.path().display()));
    }

    #[test]
    fn names_the_file_whose_json_is_broken() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("git")).unwrap();
        std::fs::write(dir.path().join(TEAM), "{ kaputt").unwrap();
        let error = parse::<serde_json::Value>(dir.path(), TEAM).unwrap_err().to_string();
        assert!(error.starts_with("git/team.json im Datenordner ist fehlerhaft: "), "{error}");
    }
}
