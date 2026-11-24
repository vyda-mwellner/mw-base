//! Whether the local services answer: every app of `landschaft/apps.json` with a `health` target.

use std::path::Path;
use std::sync::LazyLock;
use std::time::Duration;

use serde::Serialize;
use tokio::net::TcpStream;
use tokio::task::JoinSet;

use crate::error::AppResult;
use crate::landscape::{self, Kind};

const TIMEOUT: Duration = Duration::from_secs(2);

static CLIENT: LazyLock<reqwest::Client> =
    LazyLock::new(|| reqwest::Client::builder().timeout(TIMEOUT).build().expect("http client always builds"));

#[derive(Debug, Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Health {
    Up,
    Down,
    Off,
}

#[derive(Debug, Serialize)]
pub struct ServiceHealth {
    pub id: String,
    pub label: String,
    pub group: String,
    pub kind: Kind,
    /// The folder of local-setup that runs it, none for what runs on its own like a dev server.
    pub stack: Option<String>,
    pub target: String,
    pub health: Health,
    pub detail: String,
}

/// Probed in parallel, in the order of the file.
pub async fn check_all(root: &Path) -> AppResult<Vec<ServiceHealth>> {
    let manifest = landscape::manifest(root)?;
    let mut probes = JoinSet::new();
    for (index, entry) in manifest.apps.iter().cloned().enumerate() {
        let Some(target) = entry.health else { continue };
        let group = manifest.group_label(&entry.group);
        probes.spawn(async move {
            let (health, detail) = probe(&target).await;
            let service = ServiceHealth {
                id: entry.id,
                label: entry.label,
                group,
                kind: entry.kind,
                stack: entry.stack,
                target,
                health,
                detail,
            };
            (index, service)
        });
    }
    let mut results = probes.join_all().await;
    results.sort_by_key(|(index, _)| *index);
    Ok(results.into_iter().map(|(_, service)| service).collect())
}

async fn probe(target: &str) -> (Health, String) {
    match target.strip_prefix("tcp://") {
        Some(address) => tcp(address).await,
        None => http(target).await,
    }
}

async fn tcp(address: &str) -> (Health, String) {
    match tokio::time::timeout(TIMEOUT, TcpStream::connect(address)).await {
        Ok(Ok(_)) => (Health::Up, "Port offen".into()),
        Ok(Err(_)) => (Health::Off, "nicht gestartet".into()),
        Err(_) => (Health::Down, "keine Antwort".into()),
    }
}

async fn http(url: &str) -> (Health, String) {
    match CLIENT.get(url).send().await {
        Ok(response) => {
            let code = response.status().as_u16();
            let body = response.json::<serde_json::Value>().await.ok();
            classify(code, body.as_ref().and_then(|body| body.get("status")?.as_str()))
        }
        Err(error) if error.is_connect() => (Health::Off, "nicht gestartet".into()),
        Err(error) if error.is_timeout() => (Health::Down, "keine Antwort".into()),
        Err(error) => (Health::Down, error.to_string()),
    }
}

/// An actuator answers 503 with `{"status":"DOWN"}` when a dependency like the database is gone.
fn classify(code: u16, status: Option<&str>) -> (Health, String) {
    let ok = (200..300).contains(&code);
    match status {
        Some("UP") if ok => (Health::Up, "UP".into()),
        Some(status) => (Health::Down, format!("{status} (HTTP {code})")),
        None if ok => (Health::Up, format!("HTTP {code}")),
        None => (Health::Down, format!("HTTP {code}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_actuator_status_and_falls_back_to_the_http_code() {
        assert_eq!(classify(200, Some("UP")), (Health::Up, "UP".into()));
        assert_eq!(classify(503, Some("DOWN")), (Health::Down, "DOWN (HTTP 503)".into()));
        assert_eq!(classify(200, None), (Health::Up, "HTTP 200".into()));
        assert_eq!(classify(404, None), (Health::Down, "HTTP 404".into()));
    }

    #[tokio::test]
    async fn treats_a_closed_port_as_not_started() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        assert_eq!(tcp(&listener.local_addr().unwrap().to_string()).await.0, Health::Up);
        // A freed ephemeral port can be taken by a parallel test, nothing listens on port 1 without root.
        assert_eq!(tcp("127.0.0.1:1").await.0, Health::Off);
        assert_eq!(http("http://127.0.0.1:1/").await.0, Health::Off);
    }
}
