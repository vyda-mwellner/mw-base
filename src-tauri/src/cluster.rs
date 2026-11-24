use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Child;
use tokio::task::JoinSet;

use crate::config;
use crate::deploy::Gitops;
use crate::error::{AppError, AppResult};
use crate::kube::{Call, Cluster, Since, epoch_millis, mebibytes, millicores, now_millis};
use crate::landscape::Manifest;
use crate::logs::{self, LogReport};

/// Memory and CPU of a pod from `kubectl top`, by pod name.
type Usage = HashMap<String, (Option<u32>, Option<u32>)>;

const FORWARD_READY_TIMEOUT: Duration = Duration::from_secs(20);

/// An app of `apps.json` with a namespace, which is all the cluster view needs to find it.
#[derive(Debug, Clone)]
pub struct Target {
    pub id: String,
    label: String,
    group: String,
    namespace: String,
    app: String,
    unit: Option<String>,
}

pub fn targets(manifest: &Manifest) -> Vec<Target> {
    manifest
        .apps
        .iter()
        .filter_map(|app| {
            Some(Target {
                id: app.id.clone(),
                label: app.label.clone(),
                group: manifest.group_label(&app.group),
                namespace: app.namespace.clone()?,
                app: app.k8s_app().to_string(),
                unit: app.gitops.clone(),
            })
        })
        .collect()
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Workload {
    pub id: String,
    pub label: String,
    pub group: String,
    pub namespace: String,
    /// Replicas the deployment asks for, null when the namespace has no deployment of the app.
    pub desired: Option<u32>,
    pub ready: u32,
    /// The image tag of the deployment, and the one gitops gives the unit for this env.
    pub tag: Option<String>,
    pub gitops_tag: Option<String>,
    /// The memory limit of a container, null when the deployment sets none.
    pub memory_limit_mib: Option<u32>,
    pub pods: Vec<Pod>,
    /// Why the namespace could not be read.
    pub error: Option<String>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Pod {
    pub name: String,
    pub phase: String,
    pub ready: bool,
    pub restarts: u32,
    pub started_at: Option<i64>,
    /// Why a container does not run, like `CrashLoopBackOff` or `ImagePullBackOff`.
    pub waiting: Option<String>,
    pub last_termination: Option<Termination>,
    /// From the metrics-server, null when it has no figure for the pod.
    pub memory_mib: Option<u32>,
    pub cpu_millis: Option<u32>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Termination {
    /// `OOMKilled`, `Error`, `Completed`.
    pub reason: String,
    pub exit_code: Option<i64>,
    pub finished_at: Option<i64>,
}

/// One `get` and one `top` per namespace, all of them side by side. Without a metrics-server a pod has no usage.
pub async fn overview(cluster: &Cluster, targets: &[Target], gitops: Option<&Gitops>) -> AppResult<Vec<Workload>> {
    cluster.ensure_reachable().await?;
    let mut namespaces: Vec<(String, Vec<String>)> = Vec::new();
    for target in targets {
        match namespaces.iter_mut().find(|(namespace, _)| *namespace == target.namespace) {
            Some((_, apps)) => apps.push(target.app.clone()),
            None => namespaces.push((target.namespace.clone(), vec![target.app.clone()])),
        }
    }
    let mut calls = JoinSet::new();
    for (namespace, apps) in namespaces {
        let cluster = cluster.clone();
        calls.spawn(async move {
            let selector = format!("app in ({})", apps.join(","));
            let (items, top) = tokio::join!(
                cluster.run(Call::Get { namespace: &namespace, selector: &selector }),
                cluster.run(Call::Top { namespace: &namespace, selector: &selector }),
            );
            (namespace, items.and_then(items_of), top.map(|top| usage(&top)).unwrap_or_default())
        });
    }
    let read = calls.join_all().await;

    let mut workloads = Vec::new();
    for target in targets {
        let empty = Usage::new();
        let (items, usage) = match read.iter().find(|(namespace, ..)| *namespace == target.namespace) {
            Some((_, items, usage)) => (Some(items), usage),
            None => (None, &empty),
        };
        let mut workload = match items {
            Some(Ok(items)) => workload(target, items, usage),
            Some(Err(error)) => Workload { error: Some(error.to_string()), ..workload(target, &[], usage) },
            None => workload(target, &[], usage),
        };
        if let (Some(gitops), Some(unit)) = (gitops, &target.unit) {
            workload.gitops_tag = gitops.unit_tag(cluster.env, unit).await;
        }
        workloads.push(workload);
    }
    Ok(workloads)
}

pub async fn logs(cluster: &Cluster, target: &Target, since: Since, own_code: &[String]) -> AppResult<LogReport> {
    cluster.ensure_reachable().await?;
    let selector = format!("app={}", target.app);
    let text = cluster.run(Call::Logs { namespace: &target.namespace, selector: &selector, since }).await?;
    let now = now_millis();
    Ok(logs::report(&text, (now - since.millis(), now), own_code))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorCount {
    pub id: String,
    pub errors: Option<usize>,
    pub warnings: Option<usize>,
    /// Why the logs could not be read.
    pub error: Option<String>,
}

/// ERROR and WARN entries of the last three hours per app, one `logs` each, side by side. Only the numbers are kept.
pub async fn error_counts(cluster: &Cluster, targets: &[Target]) -> AppResult<Vec<ErrorCount>> {
    cluster.ensure_reachable().await?;
    let mut calls = JoinSet::new();
    for (index, target) in targets.iter().cloned().enumerate() {
        let cluster = cluster.clone();
        calls.spawn(async move {
            let selector = format!("app={}", target.app);
            let call = Call::Logs { namespace: &target.namespace, selector: &selector, since: Since::ThreeHours };
            let count = match cluster.run(call).await {
                Ok(text) => {
                    let counts = logs::counts(&text);
                    ErrorCount {
                        id: target.id,
                        errors: Some(counts.errors),
                        warnings: Some(counts.warnings),
                        error: None,
                    }
                }
                Err(error) => {
                    ErrorCount { id: target.id, errors: None, warnings: None, error: Some(error.to_string()) }
                }
            };
            (index, count)
        });
    }
    let mut counts = calls.join_all().await;
    counts.sort_by_key(|(index, _)| *index);
    Ok(counts.into_iter().map(|(_, count)| count).collect())
}

/// `kubectl top pods --no-headers`: name, CPU and memory per line.
fn usage(top: &str) -> Usage {
    top.lines()
        .filter_map(|line| match line.split_whitespace().collect::<Vec<_>>().as_slice() {
            [name, cpu, memory] => Some((name.to_string(), (mebibytes(memory), millicores(cpu)))),
            _ => None,
        })
        .collect()
}

fn items_of(json: String) -> AppResult<Vec<Value>> {
    let mut list: Value = serde_json::from_str(&json)?;
    Ok(match list["items"].take() {
        Value::Array(items) => items,
        _ => Vec::new(),
    })
}

fn workload(target: &Target, items: &[Value], usage: &Usage) -> Workload {
    let of_app = |item: &&Value, kind: &str, labels: &str| {
        item["kind"] == kind && item.pointer(labels).and_then(Value::as_str) == Some(target.app.as_str())
    };
    let deployment = items.iter().find(|item| of_app(item, "Deployment", "/spec/selector/matchLabels/app"));
    // the pods of a finished job, like the config job of Keycloak, are no workload
    let pods = items
        .iter()
        .filter(|item| of_app(item, "Pod", "/metadata/labels/app") && item["status"]["phase"] != "Succeeded")
        .map(|item| pod(item, usage))
        .collect();
    let number = |pointer: &str| deployment.and_then(|item| item.pointer(pointer)).and_then(Value::as_u64);
    Workload {
        id: target.id.clone(),
        label: target.label.clone(),
        group: target.group.clone(),
        namespace: target.namespace.clone(),
        desired: deployment.map(|_| number("/spec/replicas").unwrap_or(1) as u32),
        ready: number("/status/readyReplicas").unwrap_or(0) as u32,
        tag: deployment
            .and_then(|item| item.pointer("/spec/template/spec/containers/0/image"))
            .and_then(Value::as_str)
            .and_then(image_tag),
        gitops_tag: None,
        memory_limit_mib: deployment
            .and_then(|item| item.pointer("/spec/template/spec/containers/0/resources/limits/memory"))
            .and_then(Value::as_str)
            .and_then(mebibytes),
        pods,
        error: None,
    }
}

fn pod(item: &Value, usage: &Usage) -> Pod {
    let statuses = item["status"]["containerStatuses"].as_array().map(Vec::as_slice).unwrap_or_default();
    let text = |value: &Value| value.as_str().map(String::from);
    let last_termination = statuses.iter().find_map(|status| {
        let terminated = &status["lastState"]["terminated"];
        Some(Termination {
            reason: text(&terminated["reason"])?,
            exit_code: terminated["exitCode"].as_i64(),
            finished_at: terminated["finishedAt"].as_str().and_then(epoch_millis),
        })
    });
    let name = text(&item["metadata"]["name"]).unwrap_or_default();
    let (memory_mib, cpu_millis) = usage.get(&name).copied().unwrap_or_default();
    Pod {
        name,
        phase: text(&item["status"]["phase"]).unwrap_or_default(),
        ready: !statuses.is_empty() && statuses.iter().all(|status| status["ready"] == true),
        restarts: statuses.iter().filter_map(|status| status["restartCount"].as_u64()).sum::<u64>() as u32,
        started_at: item["status"]["startTime"].as_str().and_then(epoch_millis),
        waiting: statuses.iter().find_map(|status| text(&status["state"]["waiting"]["reason"])),
        last_termination,
        memory_mib,
        cpu_millis,
    }
}

/// `registry.example.com/shop/orders-api:build-dev-565` gives `build-dev-565`; a digest is no tag.
fn image_tag(image: &str) -> Option<String> {
    let name = image.rsplit('/').next()?;
    name.split_once(':').filter(|_| !name.contains('@')).map(|(_, tag)| tag.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForwardTarget {
    pub id: String,
    pub label: String,
    namespace: String,
    /// `pod/<name>` or `svc/<name>`.
    target: String,
    pub local_port: u16,
    remote_port: u16,
    /// The envs that have it, all when empty.
    #[serde(default)]
    pub envs: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ForwardsFile {
    forwards: Vec<ForwardTarget>,
}

pub fn forward_targets(root: &Path) -> AppResult<Vec<ForwardTarget>> {
    let targets = config::parse::<ForwardsFile>(root, config::FORWARDS)?.forwards;
    match targets.iter().find(|forward| !forward.target.starts_with("pod/") && !forward.target.starts_with("svc/")) {
        Some(forward) => Err(AppError::Invalid(format!(
            "Port-Forward '{}' in {}: Ziel muss pod/… oder svc/… sein",
            forward.id,
            config::FORWARDS
        ))),
        None => Ok(targets),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForwardStatus {
    pub env: String,
    pub id: String,
    pub label: String,
    pub local_port: u16,
    pub started_at: i64,
    pub running: bool,
    /// The last line kubectl wrote to stderr, once it ended.
    pub error: Option<String>,
}

struct Running {
    env: &'static str,
    id: String,
    label: String,
    local_port: u16,
    started_at: i64,
    child: Child,
    last_error: Arc<Mutex<Option<String>>>,
    ended: Option<String>,
}

/// The port-forwards the app started, ended ones stay listed with their last error until stopped or replaced.
#[derive(Default)]
pub struct Forwards {
    running: Mutex<Vec<Running>>,
}

impl Forwards {
    pub fn list(&self) -> Vec<ForwardStatus> {
        let mut running = self.running.lock().expect("forwards lock poisoned");
        for forward in running.iter_mut().filter(|forward| forward.ended.is_none()) {
            if let Ok(Some(status)) = forward.child.try_wait() {
                let last_error = forward.last_error.lock().expect("stderr lock poisoned").clone();
                forward.ended = Some(last_error.unwrap_or_else(|| format!("kubectl beendet ({status})")));
            }
        }
        running
            .iter()
            .map(|forward| ForwardStatus {
                env: forward.env.to_string(),
                id: forward.id.clone(),
                label: forward.label.clone(),
                local_port: forward.local_port,
                started_at: forward.started_at,
                running: forward.ended.is_none(),
                error: forward.ended.clone(),
            })
            .collect()
    }

    /// Takes over the local port: a forward of another env on it ends first.
    pub async fn start(&self, cluster: &Cluster, target: &ForwardTarget) -> AppResult<()> {
        if !target.envs.is_empty() && !target.envs.iter().any(|env| env == cluster.env) {
            return Err(AppError::Invalid(format!("{} gibt es auf {} nicht", target.label, cluster.label())));
        }
        self.release(target.local_port);
        cluster.ensure_reachable().await?;
        let call = Call::PortForward {
            namespace: &target.namespace,
            target: &target.target,
            local_port: target.local_port,
            remote_port: target.remote_port,
        };
        let mut child = cluster.spawn(call).await?;
        let last_error = Arc::new(Mutex::new(None));
        let stderr = drain_stderr(&mut child, Arc::clone(&last_error));
        let mut stdout = BufReader::new(child.stdout.take().expect("stdout is piped")).lines();
        let ready = tokio::time::timeout(FORWARD_READY_TIMEOUT, async {
            while let Ok(Some(line)) = stdout.next_line().await {
                if line.starts_with("Forwarding from") {
                    return true;
                }
            }
            false
        })
        .await
        .unwrap_or(false);

        if !ready {
            let _ = child.kill().await;
            let _ = stderr.await;
            let reason = last_error.lock().expect("stderr lock poisoned").clone().unwrap_or_default();
            return Err(AppError::Invalid(forward_failure(target, cluster, &reason)));
        }
        // kubectl writes a line per connection, a full pipe would stall the forward
        tauri::async_runtime::spawn(async move { while let Ok(Some(_)) = stdout.next_line().await {} });
        let started_at = now_millis();
        self.running.lock().expect("forwards lock poisoned").push(Running {
            env: cluster.env,
            id: target.id.clone(),
            label: target.label.clone(),
            local_port: target.local_port,
            started_at,
            child,
            last_error,
            ended: None,
        });
        Ok(())
    }

    pub fn stop(&self, env: &str, id: &str) {
        self.running.lock().expect("forwards lock poisoned").retain_mut(|forward| {
            let stopped = forward.env == env && forward.id == id;
            if stopped {
                let _ = forward.child.start_kill();
            }
            !stopped
        });
    }

    pub fn stop_all(&self) {
        let mut running = self.running.lock().expect("forwards lock poisoned");
        for forward in running.iter_mut() {
            let _ = forward.child.start_kill();
        }
        running.clear();
    }

    fn release(&self, local_port: u16) {
        self.running.lock().expect("forwards lock poisoned").retain_mut(|forward| {
            let taken = forward.local_port == local_port;
            if taken {
                let _ = forward.child.start_kill();
            }
            !taken
        });
    }
}

fn drain_stderr(child: &mut Child, last_error: Arc<Mutex<Option<String>>>) -> tauri::async_runtime::JoinHandle<()> {
    let mut lines = BufReader::new(child.stderr.take().expect("stderr is piped")).lines();
    tauri::async_runtime::spawn(async move {
        while let Ok(Some(line)) = lines.next_line().await {
            if !line.trim().is_empty() {
                *last_error.lock().expect("stderr lock poisoned") = Some(line.trim().to_string());
            }
        }
    })
}

fn forward_failure(target: &ForwardTarget, cluster: &Cluster, reason: &str) -> String {
    let port = target.local_port;
    if reason.contains("address already in use") {
        return format!("Port {port} ist schon belegt, vielleicht von einem Port-Forward im Terminal");
    }
    let reason = if reason.is_empty() { "kubectl meldet keine Bereitschaft" } else { reason };
    format!("{} auf {} startet nicht: {reason}", target.label, cluster.label())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn target(app: &str) -> Target {
        Target {
            id: "orders-api".into(),
            label: "orders-api".into(),
            group: "Backend".into(),
            namespace: "apps".into(),
            app: app.into(),
            unit: Some(app.into()),
        }
    }

    fn items() -> Vec<Value> {
        vec![
            json!({
                "kind": "Deployment",
                "spec": {
                    "replicas": 2,
                    "selector": { "matchLabels": { "app": "orders-api" } },
                    "template": { "spec": { "containers": [{
                        "image": "registry.example.com/shop/orders-api:build-dev-565",
                        "resources": { "limits": { "memory": "1Gi" } }
                    }] } }
                },
                "status": { "readyReplicas": 1 }
            }),
            json!({
                "kind": "Pod",
                "metadata": { "name": "orders-api-7d4b-mk29f", "labels": { "app": "orders-api" } },
                "status": {
                    "phase": "Running",
                    "startTime": "2026-11-03T13:03:01Z",
                    "containerStatuses": [{
                        "ready": false,
                        "restartCount": 3,
                        "state": { "waiting": { "reason": "CrashLoopBackOff" } },
                        "lastState": { "terminated": { "reason": "OOMKilled", "exitCode": 137, "finishedAt": "2026-11-03T13:10:00Z" } }
                    }]
                }
            }),
            json!({
                "kind": "Pod",
                "metadata": { "name": "keycloak-config-job-k94gw", "labels": { "app": "orders-api" } },
                "status": { "phase": "Succeeded" }
            }),
            json!({ "kind": "Pod", "metadata": { "name": "shop-gui-1", "labels": { "app": "shop-gui" } }, "status": { "phase": "Running" } }),
        ]
    }

    #[test]
    fn reads_replicas_tag_and_the_crash_of_a_pod() {
        let usage = Usage::from([("orders-api-7d4b-mk29f".to_string(), (Some(657), Some(2)))]);
        let workload = workload(&target("orders-api"), &items(), &usage);

        assert_eq!((workload.desired, workload.ready), (Some(2), 1));
        assert_eq!(workload.memory_limit_mib, Some(1024));
        assert_eq!(workload.tag.as_deref(), Some("build-dev-565"));
        assert_eq!(workload.pods.len(), 1, "finished jobs and other apps are left out");
        let pod = &workload.pods[0];
        assert_eq!((pod.ready, pod.restarts, pod.waiting.as_deref()), (false, 3, Some("CrashLoopBackOff")));
        assert_eq!((pod.memory_mib, pod.cpu_millis), (Some(657), Some(2)));
        assert_eq!(
            pod.last_termination,
            Some(Termination {
                reason: "OOMKilled".into(),
                exit_code: Some(137),
                finished_at: epoch_millis("2026-11-03T13:10:00Z")
            })
        );
    }

    #[test]
    fn has_no_desired_count_when_the_namespace_lacks_the_deployment() {
        let workload = workload(&target("billing-api"), &items(), &Usage::new());
        assert_eq!((workload.desired, workload.pods.len()), (None, 0));
    }

    #[test]
    fn reads_the_usage_of_every_pod_from_top() {
        let usage = usage("orders-api-7d4b-mk29f   2m   657Mi\nkeycloak-79bc   1   1Gi\n\n");
        assert_eq!(usage["orders-api-7d4b-mk29f"], (Some(657), Some(2)));
        assert_eq!(usage["keycloak-79bc"], (Some(1024), Some(1000)));
    }

    #[test]
    fn takes_the_tag_after_the_last_slash_only() {
        assert_eq!(image_tag("quay.io/keycloak/keycloak:19.0.3").as_deref(), Some("19.0.3"));
        assert_eq!(image_tag("localhost:5000/orders-api").as_deref(), None);
        assert_eq!(image_tag("orders-api@sha256:abc"), None);
    }

    #[test]
    fn puts_every_app_with_a_namespace_into_the_tab_with_its_label_value() {
        let manifest: Manifest = serde_json::from_value(json!({
            "groups": [{ "id": "infra", "label": "Infrastruktur" }],
            "apps": [
                { "id": "keycloak", "label": "Keycloak", "group": "infra", "kind": "infra", "namespace": "auth" },
                { "id": "orders", "label": "Orders", "group": "infra", "kind": "backend", "gitops": "orders-api", "namespace": "apps" },
                { "id": "search", "label": "Search", "group": "infra", "kind": "service", "gitops": "search-api" }
            ]
        }))
        .unwrap();
        let targets = targets(&manifest);
        let apps: Vec<(&str, &str)> = targets.iter().map(|target| (target.id.as_str(), target.app.as_str())).collect();
        assert_eq!(apps, [("keycloak", "keycloak"), ("orders", "orders-api")]);
        assert_eq!(targets[0].group, "Infrastruktur");
    }

    fn dev_cluster() -> Cluster {
        let settings = crate::settings::Settings::load(&crate::paths::root()).unwrap();
        Cluster::new("dev", settings.kubeconfigs()).unwrap()
    }

    #[tokio::test]
    #[ignore = "needs the DEV cluster, its kubeconfig and landschaft/apps.json in the data folder"]
    async fn reads_the_backends_and_their_logs_on_dev() {
        let cluster = dev_cluster();
        let manifest = crate::landscape::manifest(&crate::paths::root()).unwrap();
        let targets = targets(&manifest);
        let workloads = overview(&cluster, &targets, None).await.unwrap();
        assert!(
            workloads.iter().all(|workload| workload.error.is_none() && workload.desired.is_some()),
            "{workloads:#?}"
        );

        let report = logs(&cluster, &targets[0], Since::Day, &manifest.own_code).await.unwrap();
        assert!(report.entries > 0);
        assert_eq!(report.timeline.len(), 24);
        let mut running = workloads.iter().flat_map(|workload| &workload.pods).filter(|pod| pod.phase == "Running");
        assert!(running.all(|pod| pod.memory_mib.is_some()), "{workloads:#?}");

        let counts = error_counts(&cluster, &targets).await.unwrap();
        assert!(counts.iter().all(|count| count.error.is_none() && count.errors.is_some()), "{counts:#?}");
    }

    #[tokio::test]
    #[ignore = "needs the DEV cluster, its kubeconfig, stages/forwards.json and the local port of its first forward"]
    async fn forwards_the_first_target_on_dev_and_stops_it() {
        let cluster = dev_cluster();
        let targets = forward_targets(&crate::paths::root()).unwrap();
        let first = &targets[0];
        let forwards = Forwards::default();

        forwards.start(&cluster, first).await.unwrap();
        assert!(forwards.list()[0].running);
        assert!(tokio::net::TcpStream::connect(("127.0.0.1", first.local_port)).await.is_ok());

        forwards.stop("dev", &first.id);
        assert!(forwards.list().is_empty());
    }

    fn forwards_file(forwards: Value) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("stages")).unwrap();
        std::fs::write(dir.path().join(config::FORWARDS), json!({ "forwards": forwards }).to_string()).unwrap();
        dir
    }

    #[test]
    fn reads_the_forwards_of_the_data_folder() {
        let dir = forwards_file(json!([
            { "id": "app-db", "label": "App-DB", "namespace": "apps", "target": "pod/port-forwarder-postgres-db", "localPort": 5430, "remotePort": 5432 },
            { "id": "keycloak", "label": "Keycloak", "namespace": "apps", "target": "svc/keycloak", "localPort": 8443, "remotePort": 8443, "envs": ["prod"] }
        ]));
        let targets = forward_targets(dir.path()).unwrap();
        assert!(targets.iter().any(|forward| forward.id == "app-db" && forward.local_port == 5430));
        assert_eq!(targets[1].envs, ["prod"]);
    }

    #[test]
    fn refuses_a_forward_to_anything_but_a_pod_or_service() {
        let dir = forwards_file(json!([
            { "id": "node", "label": "Node", "namespace": "apps", "target": "node/worker-1", "localPort": 22, "remotePort": 22 }
        ]));
        let error = forward_targets(dir.path()).unwrap_err().to_string();
        assert!(error.starts_with("Port-Forward 'node' in stages/forwards.json"), "{error}");
    }
}
