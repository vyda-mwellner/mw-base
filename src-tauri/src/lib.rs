//! Tauri commands of the building: JSON documents in one data folder, read and written by `ui/store.ts`, and the
//! stages, database and git tools, whose config sits in the same folder.

mod backup;
mod cluster;
mod config;
mod connections;
mod deploy;
mod devserver;
mod docker;
mod error;
mod health;
mod incidents;
mod kube;
mod landscape;
mod logs;
mod mail;
mod notes;
mod paths;
mod placement;
mod postgres;
mod queries;
mod security;
mod settings;
#[cfg(target_os = "macos")]
mod sound_output;
mod store;
mod team;
mod tickets;
mod usage;
mod vault;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::ipc::Channel;
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Manager, RunEvent, Runtime, State, Url};

use backup::{Outcome, Plan};
use cluster::{ErrorCount, ForwardStatus, ForwardTarget, Forwards, Workload};
use connections::ConnectionView;
use deploy::{CommitSearch, DeployStatus, Gitops, GitopsConfig};
use devserver::{DevServerStatus, DevServers};
use docker::{DockerOverview, LogLine, SetupCommand};
use error::{AppError, AppResult};
use health::ServiceHealth;
use kube::{Cluster, Since, now_millis};
use landscape::Snapshot;
use logs::LogReport;
use mail::Mail;
use notes::{Category, NoteContent};
use postgres::SectionResult;
use queries::QueryDefinition;
use settings::{Settings, StagesInfo};
use store::{Doc, Store, StoreResult};
use team::Team;
use tickets::Jira;
use vault::{Credential, Vault};

#[tauri::command]
fn read_doc(store: State<Store>, path: String) -> StoreResult<Option<String>> {
    store.read(&path)
}

#[tauri::command]
fn read_docs(store: State<Store>, dir: String) -> StoreResult<Vec<Doc>> {
    store.read_dir(&dir)
}

#[tauri::command]
fn write_doc(store: State<Store>, path: String, content: String) -> StoreResult<()> {
    store.write(&path, &content)
}

#[tauri::command]
fn remove_doc(store: State<Store>, path: String) -> StoreResult<()> {
    store.remove(&path)
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

struct AppState {
    root: PathBuf,
    vault: Vault,
    forwards: Forwards,
    incidents_file: PathBuf,
    incidents: Mutex<incidents::Records>,
    dev_servers: DevServers,
    /// One setup run at a time: two compose runs on the same stack would fight over its containers.
    setup_running: tokio::sync::Mutex<()>,
}

impl AppState {
    fn workspace(&self) -> AppResult<PathBuf> {
        Ok(Settings::load(&self.root)?.workspace_dir()?.to_path_buf())
    }

    fn local_setup(&self) -> AppResult<PathBuf> {
        Settings::load(&self.root)?.local_setup_dir()
    }

    fn gitops(&self, workspace: &Path) -> AppResult<Gitops> {
        GitopsConfig::load(&self.root)?.open(workspace)
    }

    fn cluster(&self, env: &str) -> AppResult<Cluster> {
        Cluster::new(env, Settings::load(&self.root)?.kubeconfigs())
    }

    /// A sign that cannot be saved only loses its count, the overview still answers.
    fn observe_incidents(&self, env: &str, workloads: &[Workload]) {
        let mut records = self.incidents.lock().expect("incidents lock poisoned");
        if incidents::observe(&mut records, env, workloads, now_millis())
            && let Err(error) = incidents::save(&self.incidents_file, &records)
        {
            eprintln!("base: {} not saved: {error}", config::RESTARTS);
        }
    }
}

#[tauri::command]
async fn stages_info(state: State<'_, AppState>) -> AppResult<StagesInfo> {
    Ok(settings::stages_info(&state.root))
}

#[tauri::command]
async fn list_connections(state: State<'_, AppState>) -> AppResult<Vec<ConnectionView>> {
    Ok(connections::load_all(&state.root)?
        .iter()
        .map(|connection| connections::view(connection, &state.vault))
        .collect())
}

#[tauri::command]
async fn unlock_connection(state: State<'_, AppState>, id: String, password: String) -> AppResult<ConnectionView> {
    let all = connections::load_all(&state.root)?;
    let connection = connections::find(&all, &id)?;
    let credential = Credential { user: connection.user.clone(), password };
    postgres::check(connection, &all, &credential).await?;
    state.vault.store(&connection.id, credential);
    Ok(connections::view(connection, &state.vault))
}

#[tauri::command]
async fn lock_connection(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.vault.forget(&id);
    Ok(())
}

#[tauri::command]
async fn list_queries(state: State<'_, AppState>) -> AppResult<Vec<QueryDefinition>> {
    queries::load_all(&state.root)
}

#[tauri::command]
async fn run_query(
    state: State<'_, AppState>,
    query_id: String,
    connection_id: String,
    params: HashMap<String, String>,
) -> AppResult<Vec<SectionResult>> {
    let query = queries::find(&state.root, &query_id)?;
    if !query.connections.is_empty() && !query.connections.contains(&connection_id) {
        return Err(AppError::Invalid(format!("Query '{query_id}' ist nicht für '{connection_id}' vorgesehen")));
    }
    let all = connections::load_all(&state.root)?;
    let connection = connections::find(&all, &connection_id)?;
    let credential = connections::credential(connection, &state.vault)?;
    let values = queries::validate(&query.params, &params)?;
    postgres::run(connection, &all, &credential, &query, &values).await
}

#[tauri::command]
async fn deploy_overview(state: State<'_, AppState>) -> AppResult<DeployStatus> {
    let workspace = state.workspace()?;
    let gitops = state.gitops(&workspace)?;
    let manifest = landscape::manifest(&state.root)?;
    let jira = Jira::load(&state.root)?;
    let team = Team::load(&state.root)?;
    deploy::overview(&workspace, &gitops, manifest, &jira, &team).await
}

/// Returns one line per repo that could not be fetched, the others are updated all the same.
#[tauri::command]
async fn fetch_repos(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    let workspace = state.workspace()?;
    let gitops = state.gitops(&workspace)?;
    let apps = landscape::manifest(&state.root)?.apps;
    let repos = std::iter::once(gitops.name().to_string()).chain(deploy::app_repos(&apps)).collect();
    Ok(deploy::fetch(&workspace, repos).await)
}

#[tauri::command]
async fn search_commits(state: State<'_, AppState>, term: String) -> AppResult<CommitSearch> {
    // the git tools run on a complete config only, so a missing gitops.json shows here as well
    GitopsConfig::load(&state.root)?;
    let apps = landscape::manifest(&state.root)?.apps;
    let jira = Jira::load(&state.root)?;
    deploy::search(&state.workspace()?, deploy::app_repos(&apps), &term, &jira).await
}

/// Without a workspace or `git/gitops.json` the overview only misses the tags of gitops.
#[tauri::command]
async fn cluster_overview(state: State<'_, AppState>, env: String) -> AppResult<Vec<Workload>> {
    let cluster = state.cluster(&env)?;
    let targets = cluster::targets(&landscape::manifest(&state.root)?);
    let gitops = state.workspace().ok().and_then(|workspace| state.gitops(&workspace).ok());
    let workloads = cluster::overview(&cluster, &targets, gitops.as_ref()).await?;
    state.observe_incidents(&env, &workloads);
    Ok(workloads)
}

#[tauri::command]
async fn cluster_incidents(state: State<'_, AppState>) -> AppResult<incidents::Records> {
    Ok(state.incidents.lock().expect("incidents lock poisoned").clone())
}

#[tauri::command]
async fn cluster_logs(state: State<'_, AppState>, env: String, app_id: String, since: Since) -> AppResult<LogReport> {
    let cluster = state.cluster(&env)?;
    let manifest = landscape::manifest(&state.root)?;
    let targets = cluster::targets(&manifest);
    let target = targets
        .iter()
        .find(|target| target.id == app_id)
        .ok_or_else(|| AppError::Invalid(format!("'{app_id}' hat keinen Namespace in {}", config::APPS)))?;
    cluster::logs(&cluster, target, since, &manifest.own_code).await
}

#[tauri::command]
async fn cluster_errors(state: State<'_, AppState>, env: String) -> AppResult<Vec<ErrorCount>> {
    let cluster = state.cluster(&env)?;
    let targets = cluster::targets(&landscape::manifest(&state.root)?);
    cluster::error_counts(&cluster, &targets).await
}

#[tauri::command]
async fn docker_overview(state: State<'_, AppState>) -> AppResult<DockerOverview> {
    docker::overview(&state.local_setup()?).await
}

#[tauri::command]
async fn run_setup(state: State<'_, AppState>, command: SetupCommand, on_log: Channel<LogLine>) -> AppResult<()> {
    let _running =
        state.setup_running.try_lock().map_err(|_| AppError::Invalid("Es läuft noch ein anderer Setup-Lauf".into()))?;
    docker::run_setup(&state.local_setup()?, command, &on_log).await
}

#[tauri::command]
async fn list_dev_servers(state: State<'_, AppState>) -> AppResult<Vec<DevServerStatus>> {
    let targets = devserver::targets(&landscape::manifest(&state.root)?);
    Ok(state.dev_servers.list(&targets).await)
}

#[tauri::command]
async fn start_dev_server(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let targets = devserver::targets(&landscape::manifest(&state.root)?);
    let target = targets.iter().find(|target| target.id == id).ok_or_else(|| {
        AppError::Invalid(format!("'{id}' ist kein Frontend mit Repo und lokalem Port in {}", config::APPS))
    })?;
    state.dev_servers.start(target, &state.workspace()?).await
}

#[tauri::command]
async fn stop_dev_server(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.dev_servers.stop(&id);
    Ok(())
}

#[tauri::command]
async fn dev_server_log(state: State<'_, AppState>, id: String) -> AppResult<Vec<String>> {
    Ok(state.dev_servers.log(&id))
}

#[tauri::command]
async fn mail_inbox(state: State<'_, AppState>) -> AppResult<Vec<Mail>> {
    let settings = Settings::load(&state.root)?;
    mail::inbox(settings.greenmail_url()?).await
}

#[tauri::command]
async fn purge_mail(state: State<'_, AppState>) -> AppResult<()> {
    let settings = Settings::load(&state.root)?;
    mail::purge(settings.greenmail_url()?).await
}

#[tauri::command]
async fn vault_notes(state: State<'_, AppState>) -> AppResult<Vec<Category>> {
    notes::list(&Settings::load(&state.root)?.vault_dir()?)
}

#[tauri::command]
async fn vault_note(state: State<'_, AppState>, path: String) -> AppResult<NoteContent> {
    notes::read(&Settings::load(&state.root)?.vault_dir()?, &path)
}

#[tauri::command]
async fn backup_plan(state: State<'_, AppState>) -> AppResult<Plan> {
    backup::load(&state.root)
}

/// Copying a whole folder can take a while, so it runs beside the async workers.
#[tauri::command]
async fn run_backup(state: State<'_, AppState>) -> AppResult<Vec<Outcome>> {
    let plan = backup::load(&state.root)?;
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || backup::run(&plan, &home))
        .await
        .map_err(|error| AppError::Invalid(format!("Backup abgebrochen: {error}")))?
}

#[tauri::command]
async fn landscape_scan(state: State<'_, AppState>) -> AppResult<Option<Snapshot>> {
    landscape::load_scan(&state.root)
}

/// Reads every checkout of the workspace, so it runs beside the async workers and takes a while.
#[tauri::command]
async fn run_landscape_scan(state: State<'_, AppState>) -> AppResult<Snapshot> {
    let settings = Settings::load(&state.root)?;
    let workspace = settings.workspace_dir()?.to_path_buf();
    let local_setup = settings.local_setup_dir().ok();
    let manifest = landscape::manifest(&state.root)?;
    let env = paths::child_env().await;
    let snapshot = tauri::async_runtime::spawn_blocking(move || {
        landscape::scan(manifest, &workspace, local_setup.as_deref(), env)
    })
    .await
    .map_err(|error| AppError::Invalid(format!("Scan abgebrochen: {error}")))?;
    landscape::save_scan(&state.root, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
async fn claude_usage(since: String) -> AppResult<Vec<usage::Day>> {
    usage::daily(&since).await
}

#[tauri::command]
async fn security_feed() -> AppResult<String> {
    security::feed().await
}

#[tauri::command]
async fn service_health(state: State<'_, AppState>) -> AppResult<Vec<ServiceHealth>> {
    health::check_all(&state.root).await
}

#[derive(serde::Serialize)]
struct ForwardsView {
    targets: Vec<ForwardTarget>,
    running: Vec<ForwardStatus>,
}

#[tauri::command]
async fn list_forwards(state: State<'_, AppState>) -> AppResult<ForwardsView> {
    Ok(ForwardsView { targets: cluster::forward_targets(&state.root)?, running: state.forwards.list() })
}

#[tauri::command]
async fn start_forward(state: State<'_, AppState>, env: String, id: String) -> AppResult<ForwardsView> {
    let cluster = state.cluster(&env)?;
    let targets = cluster::forward_targets(&state.root)?;
    let target = targets
        .iter()
        .find(|target| target.id == id)
        .ok_or_else(|| AppError::Invalid(format!("Unbekannter Port-Forward '{id}'")))?;
    state.forwards.start(&cluster, target).await?;
    Ok(ForwardsView { targets, running: state.forwards.list() })
}

#[tauri::command]
async fn stop_forward(state: State<'_, AppState>, env: String, id: String) -> AppResult<ForwardsView> {
    state.forwards.stop(&env, &id);
    list_forwards(state).await
}

fn is_app_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" => true,
        "http" | "https" => {
            url.host_str() == Some("tauri.localhost") || (tauri::is_dev() && url.host_str() == Some("localhost"))
        }
        _ => false,
    }
}

// A report is HTML the app built, but a link in it must never take the window away from the app.
fn stay_in_app<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("stay-in-app").on_navigation(|_, url| is_app_url(url)).build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(stay_in_app())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_doc,
            read_docs,
            write_doc,
            remove_doc,
            quit,
            stages_info,
            list_connections,
            unlock_connection,
            lock_connection,
            list_queries,
            run_query,
            deploy_overview,
            fetch_repos,
            search_commits,
            cluster_overview,
            cluster_incidents,
            cluster_logs,
            cluster_errors,
            list_forwards,
            start_forward,
            stop_forward,
            docker_overview,
            run_setup,
            service_health,
            mail_inbox,
            purge_mail,
            list_dev_servers,
            start_dev_server,
            stop_dev_server,
            dev_server_log,
            vault_notes,
            vault_note,
            backup_plan,
            run_backup,
            landscape_scan,
            run_landscape_scan,
            claude_usage,
            security_feed
        ])
        .setup(|app| {
            let root = paths::root();
            if let Err(error) = std::fs::create_dir_all(&root) {
                eprintln!("base: Datenordner {} nicht anlegbar: {error}", root.display());
            }
            app.manage(Store::at(root.clone()));
            let incidents_file = root.join(config::RESTARTS);
            app.manage(AppState {
                incidents: Mutex::new(incidents::load(&incidents_file)),
                incidents_file,
                dev_servers: DevServers::load(root.join(config::DEV_SERVERS)),
                root,
                vault: Vault::default(),
                forwards: Forwards::default(),
                setup_running: tokio::sync::Mutex::new(()),
            });
            #[cfg(target_os = "macos")]
            sound_output::watch(app.handle());
            // Hidden in the config until it stands in its corner, or it would show in the middle first and jump.
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = placement::bottom_right(&window) {
                    eprintln!("base: Fenster nicht in die Ecke gesetzt: {error}");
                }
                window.show()?;
                // Shown late, the app is not activated: unfocused, the window can stay unseen behind a fullscreen app.
                if let Err(error) = window.set_focus() {
                    eprintln!("base: Fenster nicht nach vorn geholt: {error}");
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("base konnte nicht starten")
        .run(|app, event| {
            // kubectl port-forward and the dev servers run as children, without this they would outlive the app
            if let RunEvent::Exit = event {
                let state = app.state::<AppState>();
                state.forwards.stop_all();
                state.dev_servers.stop_all();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed(url: &str) -> bool {
        is_app_url(&Url::parse(url).unwrap())
    }

    #[test]
    fn keeps_navigation_inside_the_app() {
        assert!(allowed("tauri://localhost/buero/status"));
        assert!(allowed("http://tauri.localhost/buero"));
        assert!(!allowed("https://example.org/"));
        assert!(!allowed("file:///etc/hosts"));
    }
}
