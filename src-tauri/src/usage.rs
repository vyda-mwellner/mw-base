//! What Claude Code cost per day, as the `ccusage` CLI reads it from the local session logs.

use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::paths;

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Day {
    /// `YYYY-MM-DD`; older versions of ccusage call it `date`.
    #[serde(alias = "date")]
    pub period: String,
    pub total_cost: f64,
    pub total_tokens: u64,
    #[serde(default)]
    pub model_breakdowns: Vec<ModelCost>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelCost {
    pub model_name: String,
    pub cost: f64,
}

#[derive(Debug, Deserialize)]
struct Report {
    daily: Vec<Day>,
}

/// From `since` (`YYYYMMDD`) on. `--offline` takes the prices ccusage ships with instead of fetching them.
pub async fn daily(since: &str) -> AppResult<Vec<Day>> {
    if since.len() != 8 || !since.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(AppError::Invalid(format!("'{since}' ist kein Datum wie 20261101")));
    }
    let mut command = paths::command("ccusage").await;
    command.args(["daily", "--json", "--offline", "--since", since]).kill_on_drop(true);
    let output = tokio::time::timeout(Duration::from_secs(60), command.output())
        .await
        .map_err(|_| AppError::Invalid("ccusage antwortet nicht".into()))?
        .map_err(|error| AppError::Invalid(format!("ccusage nicht startbar, ist es installiert? {error}")))?;
    if !output.status.success() {
        return Err(AppError::Invalid(format!("ccusage: {}", String::from_utf8_lossy(&output.stderr).trim())));
    }
    parse(&String::from_utf8_lossy(&output.stdout))
}

fn parse(json: &str) -> AppResult<Vec<Day>> {
    let report: Report = serde_json::from_str(json)
        .map_err(|error| AppError::Invalid(format!("Ausgabe von ccusage nicht lesbar: {error}")))?;
    Ok(report.daily)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_days_with_their_models_and_takes_the_old_name_of_the_date() {
        let json = r#"{
            "daily": [
                { "period": "2026-11-22", "totalCost": 49.07, "totalTokens": 137069284, "inputTokens": 828,
                  "modelBreakdowns": [{ "modelName": "claude-opus-5-5", "cost": 49.07, "inputTokens": 828 }] },
                { "date": "2026-11-23", "totalCost": 21.67, "totalTokens": 62541155 }
            ],
            "totals": { "totalCost": 70.74 }
        }"#;

        let days = parse(json).unwrap();

        assert_eq!(days[0].model_breakdowns, vec![ModelCost { model_name: "claude-opus-5-5".into(), cost: 49.07 }]);
        assert_eq!(days[1].period, "2026-11-23");
        assert!(days[1].model_breakdowns.is_empty());
    }

    #[tokio::test]
    async fn refuses_anything_but_a_plain_date() {
        assert!(daily("2026-11-01").await.is_err());
        assert!(daily("--help").await.is_err());
    }

    #[tokio::test]
    #[ignore = "needs ccusage and the session logs of Claude Code"]
    async fn reads_the_real_usage() {
        assert!(!daily("20261101").await.unwrap().is_empty());
    }
}
