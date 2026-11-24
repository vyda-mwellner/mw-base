use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::cluster::Workload;
use crate::error::AppResult;

/// By env: since when the app watches it and the newest container restart it saw there.
pub type Records = BTreeMap<String, Record>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub watched_since: i64,
    pub last: Option<Incident>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Incident {
    pub at: i64,
    pub app: String,
    pub reason: String,
}

/// A missing or broken file starts the count anew: the sign is not worth failing the cluster view for.
pub fn load(file: &Path) -> Records {
    std::fs::read_to_string(file).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default()
}

pub fn save(file: &Path, records: &Records) -> AppResult<()> {
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(file, serde_json::to_string_pretty(records)? + "\n")?;
    Ok(())
}

/// Takes the newest restart the pods still show. A rollout replaces the pod and its last state with it, so a crash
/// only counts when the overview reads it before that. Returns whether the record changed and wants saving.
pub fn observe(records: &mut Records, env: &str, workloads: &[Workload], now: i64) -> bool {
    let newest = workloads
        .iter()
        .flat_map(|workload| workload.pods.iter().map(move |pod| (workload, pod)))
        .filter_map(|(workload, pod)| {
            let termination = pod.last_termination.as_ref()?;
            Some(Incident {
                at: termination.finished_at?,
                app: workload.label.clone(),
                reason: termination.reason.clone(),
            })
        })
        .max_by_key(|incident| incident.at);
    let mut changed = !records.contains_key(env);
    let record = records.entry(env.to_string()).or_insert(Record { watched_since: now, last: None });
    if let Some(incident) = newest
        && record.last.as_ref().is_none_or(|last| incident.at > last.at)
    {
        record.last = Some(incident);
        changed = true;
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cluster::{Pod, Termination};

    const NOW: i64 = 1_790_000_000_000;

    fn workload(label: &str, crashes: &[(&str, i64)]) -> Workload {
        Workload {
            id: label.into(),
            label: label.into(),
            group: "Backend".into(),
            namespace: "apps".into(),
            desired: Some(1),
            ready: 1,
            tag: None,
            gitops_tag: None,
            memory_limit_mib: None,
            pods: crashes
                .iter()
                .map(|(reason, at)| Pod {
                    name: format!("{label}-pod"),
                    phase: "Running".into(),
                    ready: true,
                    restarts: 1,
                    started_at: None,
                    waiting: None,
                    last_termination: Some(Termination {
                        reason: (*reason).into(),
                        exit_code: Some(137),
                        finished_at: Some(*at),
                    }),
                    memory_mib: None,
                    cpu_millis: None,
                })
                .collect(),
            error: None,
        }
    }

    #[test]
    fn starts_watching_on_the_first_look_and_takes_the_newest_restart_of_any_pod() {
        let mut records = Records::new();
        let workloads =
            [workload("orders-api", &[("OOMKilled", NOW - 5_000)]), workload("keycloak", &[("Error", NOW - 9_000)])];

        assert!(observe(&mut records, "prod", &workloads, NOW));
        assert_eq!(
            records["prod"],
            Record {
                watched_since: NOW,
                last: Some(Incident { at: NOW - 5_000, app: "orders-api".into(), reason: "OOMKilled".into() })
            }
        );
    }

    #[test]
    fn keeps_the_record_until_a_newer_restart_shows_up() {
        let mut records = Records::new();
        observe(&mut records, "dev", &[workload("orders-api", &[("OOMKilled", NOW - 5_000)])], NOW);

        assert!(!observe(&mut records, "dev", &[workload("orders-api", &[("OOMKilled", NOW - 5_000)])], NOW + 1));
        assert!(
            !observe(&mut records, "dev", &[workload("orders-api", &[])], NOW + 2),
            "a replaced pod forgets nothing"
        );
        assert!(observe(&mut records, "dev", &[workload("billing-api", &[("Error", NOW + 3)])], NOW + 4));
        assert_eq!(records["dev"].last.as_ref().map(|last| last.app.as_str()), Some("billing-api"));
        assert_eq!(records["dev"].watched_since, NOW);
    }

    #[test]
    fn writes_the_records_and_reads_them_back() {
        let dir = std::env::temp_dir().join(format!("base-incidents-{}", std::process::id()));
        let file = dir.join("restarts.json");
        let _ = std::fs::remove_dir_all(&dir);
        assert!(load(&file).is_empty());

        let mut records = Records::new();
        observe(&mut records, "test", &[workload("orders-api", &[("OOMKilled", NOW)])], NOW);
        save(&file, &records).unwrap();
        assert_eq!(load(&file), records);

        std::fs::write(&file, "{ kaputt").unwrap();
        assert!(load(&file).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
