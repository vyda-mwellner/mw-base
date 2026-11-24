//! The apps of `landschaft/apps.json`, and the scan of their checkouts: ports, calls between them, code figures.

mod addresses;
mod code;

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::config;
use crate::error::AppResult;
use addresses::Reference;
use code::Repo;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Frontend,
    Backend,
    Service,
    Infra,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum EdgeKind {
    Call,
    Link,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub label: String,
    /// Drawn as its own column next to the others, like the shared infrastructure.
    #[serde(default)]
    pub side: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Manifest {
    pub groups: Vec<Group>,
    pub apps: Vec<AppEntry>,
    /// Package prefixes like `com.example.`: the first stack frame in one of them is where a problem is grouped.
    #[serde(rename = "ownCode", default)]
    pub own_code: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AppEntry {
    pub id: String,
    pub label: String,
    pub group: String,
    pub kind: Kind,
    pub repo: Option<String>,
    /// The app folder in an Nx monorepo, none for a repo that is one app.
    pub path: Option<String>,
    /// The folder of local-setup whose compose stack runs it.
    pub stack: Option<String>,
    /// `http://...` is fetched, `tcp://host:port` only connected to. A localhost port makes a frontend a dev server.
    pub health: Option<String>,
    /// The unit in gitops, `{unit}` in the paths of `git/gitops.json`.
    pub gitops: Option<String>,
    /// Namespace of its deployment, which puts the app into the cluster view.
    pub namespace: Option<String>,
    /// Runs only in the cluster, so the workshop has no dev server and the map no card for it.
    #[serde(rename = "clusterOnly", default)]
    pub cluster_only: bool,
}

impl AppEntry {
    /// The value of the `app` label of its deployment and pods: the gitops unit, or the id for Keycloak.
    pub fn k8s_app(&self) -> &str {
        self.gitops.as_deref().unwrap_or(&self.id)
    }
}

impl Manifest {
    pub fn group_label(&self, id: &str) -> String {
        self.groups.iter().find(|group| group.id == id).map_or_else(|| id.to_string(), |group| group.label.clone())
    }
}

pub fn manifest(root: &Path) -> AppResult<Manifest> {
    config::parse(root, config::APPS)
}

/// The last scan, none before the first one.
pub fn load_scan(root: &Path) -> AppResult<Option<Snapshot>> {
    if !root.join(config::SCAN).exists() {
        return Ok(None);
    }
    config::parse(root, config::SCAN).map(Some)
}

/// Written by the shell only, next to the manifest it was made from.
pub fn save_scan(root: &Path, snapshot: &Snapshot) -> AppResult<()> {
    std::fs::write(root.join(config::SCAN), serde_json::to_string_pretty(snapshot)? + "\n")?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// Epoch millis of the run.
    pub generated_at: u64,
    pub groups: Vec<Group>,
    pub apps: Vec<AppInfo>,
    pub edges: Vec<Edge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub id: String,
    pub label: String,
    pub group: String,
    pub kind: Kind,
    pub repo: Option<String>,
    pub path: Option<String>,
    /// The repo is not checked out next to local-setup.
    pub missing: bool,
    pub ports: Vec<u16>,
    pub tech: Vec<String>,
    pub loc: Option<Loc>,
    pub facts: Vec<Fact>,
    /// Gradle modules or the Nx libs the app reaches.
    pub modules: Vec<String>,
    pub git: Option<GitStats>,
    /// Addresses in the config that belong to no known app.
    pub unresolved: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Loc {
    pub total: u64,
    pub production: u64,
    pub test: u64,
    pub files: u64,
    pub by_language: Vec<LanguageLines>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageLines {
    pub language: String,
    pub lines: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fact {
    pub label: String,
    pub value: String,
}

impl Fact {
    fn new(label: &str, value: impl ToString) -> Fact {
        Fact { label: label.to_string(), value: value.to_string() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStats {
    pub last_commit: Option<String>,
    pub commits30: u32,
    pub commits90: u32,
    pub contributors90: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    pub from: String,
    pub to: String,
    pub kind: EdgeKind,
    /// Config file and key that point at the target, e.g. "application.yml · ct-backend.baseUrl".
    pub via: Vec<String>,
}

/// What a scanned app knows before the edges are resolved.
struct Scanned {
    info: AppInfo,
    containers: Vec<String>,
    references: Vec<(String, Reference)>,
}

/// Without local-setup the infrastructure cards have no ports, the apps are scanned all the same.
pub fn scan(manifest: Manifest, workspace: &Path, local_setup: Option<&Path>, env: &[(String, String)]) -> Snapshot {
    let mut repos: HashMap<String, Option<Repo>> = HashMap::new();
    let scanned: Vec<Scanned> = manifest
        .apps
        .iter()
        .filter(|entry| !entry.cluster_only)
        .map(|entry| {
            let repo = entry.repo.as_ref().and_then(|name| {
                repos.entry(name.clone()).or_insert_with(|| Repo::open(&workspace.join(name), env)).as_ref()
            });
            scan_app(local_setup, entry, repo, env)
        })
        .collect();

    let owners = owners_by_address(&scanned);
    let edges = resolve_edges(&scanned, &owners);
    let apps = scanned
        .into_iter()
        .map(|app| AppInfo { unresolved: unresolved(&app.references, &owners), ..app.info })
        .collect();

    Snapshot {
        generated_at: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()
            as u64,
        groups: manifest.groups,
        apps,
        edges,
    }
}

fn scan_app(local_setup: Option<&Path>, entry: &AppEntry, repo: Option<&Repo>, env: &[(String, String)]) -> Scanned {
    let mut info = AppInfo {
        id: entry.id.clone(),
        label: entry.label.clone(),
        group: entry.group.clone(),
        kind: entry.kind,
        repo: entry.repo.clone(),
        path: entry.path.clone(),
        missing: entry.repo.is_some() && repo.is_none(),
        ports: Vec::new(),
        tech: Vec::new(),
        loc: None,
        facts: Vec::new(),
        modules: Vec::new(),
        git: None,
        unresolved: Vec::new(),
    };
    let mut containers = Vec::new();
    if let Some(stack) = &entry.stack {
        let compose = local_setup.map(|dir| read_compose(dir, stack)).unwrap_or_default();
        info.ports = compose.ports;
        containers = compose.containers;
        if repo.is_none() {
            info.tech.extend(compose.image);
        }
    }

    let mut references = Vec::new();
    if let Some(repo) = repo {
        let app_path = entry.path.clone().unwrap_or_default();
        let nx_libs = if entry.kind == Kind::Frontend && !app_path.is_empty() {
            code::reachable_libs(repo, &app_path)
        } else {
            Vec::new()
        };
        let scopes: Vec<String> = std::iter::once(app_path.clone()).chain(nx_libs.iter().cloned()).collect();

        let (loc, counters) = code::measure(repo, &scopes);
        info.loc = Some(loc);
        info.tech = code::tech(repo);
        info.git = Some(code::git_stats(repo, &scopes, env));
        match entry.kind {
            Kind::Backend => {
                info.facts = counters.backend_facts();
                info.modules = code::gradle_modules(repo);
            }
            Kind::Frontend => {
                info.facts = counters.frontend_facts();
                info.modules = nx_libs.clone();
            }
            Kind::Service | Kind::Infra => {}
        }
        if info.ports.is_empty() {
            info.ports = own_ports(repo, entry, &app_path);
        }
        references = config_references(repo, entry, &app_path, &scopes);
    }
    Scanned { info, containers, references }
}

fn own_ports(repo: &Repo, entry: &AppEntry, app_path: &str) -> Vec<u16> {
    let port = match entry.kind {
        Kind::Backend => repo
            .files_in(&[app_path.to_string()])
            .filter(|file| {
                file.ends_with("src/main/resources/application.yml")
                    || file.ends_with("src/main/resources/application.yaml")
            })
            .filter_map(|file| repo.read(file))
            .find_map(|text| {
                addresses::yaml_entries(&text).into_iter().find(|(key, _)| key == "server.port")?.1.parse().ok()
            }),
        Kind::Frontend if !app_path.is_empty() => repo
            .read(&format!("{app_path}/project.json"))
            .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
            .and_then(|project| project.pointer("/targets/serve/options/port")?.as_u64())
            .map(|port| port as u16),
        Kind::Frontend => repo
            .read("angular.json")
            .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
            .and_then(|angular| {
                let project = angular.get("projects")?.as_object()?.values().next()?.clone();
                let serve = project.pointer("/architect/serve").or(project.pointer("/targets/serve"))?.clone();
                // `ng serve` falls back to 4200 when the workspace sets no port
                Some(serve.pointer("/options/port").and_then(|port| port.as_u64()).unwrap_or(4200) as u16)
            }),
        Kind::Service | Kind::Infra => code::exposed_port(repo, app_path),
    };
    port.into_iter().collect()
}

/// Which files hold an app's addresses: Spring configs for backends, environments and assets for Angular.
fn config_references(repo: &Repo, entry: &AppEntry, app_path: &str, scopes: &[String]) -> Vec<(String, Reference)> {
    let is_config = |file: &str| -> bool {
        let name = file.rsplit('/').next().unwrap_or(file);
        match entry.kind {
            Kind::Backend => file.contains("src/main/resources/") && name.starts_with("application"),
            Kind::Frontend => {
                (file.contains("/environments/") && name.ends_with(".ts"))
                    || (file.contains("/assets/") && name.ends_with(".json") && !file.contains("/i18n/"))
                    || name.starts_with("proxy.conf")
            }
            Kind::Service | Kind::Infra => {
                !name.starts_with("package")
                    && [".env", ".yml", ".yaml", ".properties", ".toml", ".json"].iter().any(|ext| name.ends_with(ext))
            }
        }
    };
    let own_scope = [app_path.to_string()];
    let mut found = Vec::new();
    for file in repo.files_in(&own_scope).filter(|file| is_config(file)) {
        let Some(text) = repo.read(file) else {
            continue;
        };
        let name = file.rsplit('/').next().unwrap_or(file).to_string();
        found.extend(addresses::references(&name, &text).into_iter().map(|reference| (name.clone(), reference)));
    }
    found.retain(|(_, reference)| !is_cors(&reference.key) && reference.key != "server.port");

    // a monorepo may list every backend in every app config; a key like `auth-server-url` is read whole by keycloak-js
    if entry.kind == Kind::Frontend {
        let is_identifier = |key: &str| key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
        let keys: BTreeSet<String> = found
            .iter()
            .map(|(_, reference)| reference.leaf_key().to_string())
            .filter(|key| is_identifier(key))
            .collect();
        let used = code::used_keys(repo, scopes, &keys);
        found.retain(|(_, reference)| !is_identifier(reference.leaf_key()) || used.contains(reference.leaf_key()));
    }
    found
}

/// CORS origins name the callers of an app, not what it calls.
fn is_cors(key: &str) -> bool {
    let key = key.to_lowercase();
    key.contains("cors") || key.contains("origin")
}

/// Host port and container name to the app behind it; the first app in the manifest wins a shared port.
fn owners_by_address(scanned: &[Scanned]) -> HashMap<String, String> {
    let mut owners: HashMap<String, String> = HashMap::new();
    for app in scanned {
        let addresses = app.info.ports.iter().map(u16::to_string).chain(app.containers.iter().cloned());
        for address in addresses {
            owners.entry(address).or_insert_with(|| app.info.id.clone());
        }
    }
    owners
}

fn target_of(owners: &HashMap<String, String>, reference: &Reference) -> Option<String> {
    let by_container = reference.host.starts_with("local-").then(|| owners.get(&reference.host)).flatten();
    by_container.or_else(|| owners.get(&reference.port.to_string())).cloned()
}

fn resolve_edges(scanned: &[Scanned], owners: &HashMap<String, String>) -> Vec<Edge> {
    let kinds: HashMap<&str, Kind> = scanned.iter().map(|app| (app.info.id.as_str(), app.info.kind)).collect();
    let mut edges: BTreeMap<(String, String, EdgeKind), BTreeSet<String>> = BTreeMap::new();
    for app in scanned {
        for (file, reference) in &app.references {
            let Some(target) = target_of(owners, reference) else {
                continue;
            };
            if target == app.info.id {
                continue;
            }
            let kind =
                if kinds.get(target.as_str()) == Some(&Kind::Frontend) { EdgeKind::Link } else { EdgeKind::Call };
            edges.entry((app.info.id.clone(), target, kind)).or_default().insert(format!("{file} · {}", reference.key));
        }
    }
    edges.into_iter().map(|((from, to, kind), via)| Edge { from, to, kind, via: via.into_iter().collect() }).collect()
}

/// Bare `port:` entries are left out, most of them are settings of the app itself.
fn unresolved(references: &[(String, Reference)], owners: &HashMap<String, String>) -> Vec<String> {
    references
        .iter()
        .filter(|(_, reference)| !reference.host.is_empty() && target_of(owners, reference).is_none())
        .map(|(file, reference)| format!("{}:{} ({file} · {})", reference.host, reference.port, reference.key))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

#[derive(Default)]
struct Compose {
    ports: Vec<u16>,
    containers: Vec<String>,
    image: Option<String>,
}

/// Host ports, container names and image of a stack of local-setup.
fn read_compose(local_setup: &Path, stack: &str) -> Compose {
    let text = std::fs::read_to_string(local_setup.join(stack).join("docker-compose.yml")).unwrap_or_default();
    let entries = addresses::yaml_entries(&text);
    let mut compose = Compose { ports: Vec::new(), containers: Vec::new(), image: None };
    for (key, value) in &entries {
        if key.ends_with(".container_name") {
            compose.containers.push(value.clone());
        } else if key.ends_with(".ports") {
            let parts: Vec<&str> = value.split(':').collect();
            if let Some(port) = parts.len().checked_sub(2).and_then(|index| parts[index].parse().ok()) {
                compose.ports.push(port);
            }
        } else if key.ends_with(".image") && compose.image.is_none() {
            compose.image = Some(value.clone());
        }
    }
    compose
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_apps_and_ignores_the_keys_of_the_workspace_scan() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("landschaft")).unwrap();
        std::fs::write(
            dir.path().join(config::APPS),
            r#"{
                "groups": [{ "id": "infra", "label": "Infrastruktur", "side": true }],
                "apps": [{ "id": "keycloak", "label": "Keycloak", "group": "infra", "kind": "infra", "stack": "keycloak", "namespace": "auth" }],
                "ownCode": ["com.example."]
            }"#,
        )
        .unwrap();

        let manifest = manifest(dir.path()).unwrap();
        assert_eq!(manifest.group_label("infra"), "Infrastruktur");
        assert_eq!(manifest.apps[0].k8s_app(), "keycloak");
        assert_eq!(manifest.apps[0].namespace.as_deref(), Some("auth"));
        assert_eq!(manifest.own_code, ["com.example."]);
    }

    #[test]
    #[ignore = "needs the workspace and local-setup of the data folder"]
    fn scans_the_real_workspace() {
        let root = crate::paths::root();
        let settings = crate::settings::Settings::load(&root).unwrap();
        let local_setup = settings.local_setup_dir().ok();
        let snapshot = scan(manifest(&root).unwrap(), settings.workspace_dir().unwrap(), local_setup.as_deref(), &[]);
        assert!(snapshot.apps.iter().any(|app| app.loc.is_some()));
        assert!(!snapshot.edges.is_empty());
    }
}
