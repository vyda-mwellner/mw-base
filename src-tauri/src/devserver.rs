//! The frontends of `landschaft/apps.json` served from their checkouts: `nx serve` or `npm run start`, each as
//! a process group of its own, so stopping one stops the ng serve that npm started under it.

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::net::TcpStream;
use tokio::process::Child;
use tokio::task::JoinSet;

use crate::error::{AppError, AppResult};
use crate::landscape::{Kind, Manifest};
use crate::paths;

const LOG_LINES: usize = 500;
const PROBE_TIMEOUT: Duration = Duration::from_millis(300);

/// A frontend of `apps.json` with a repo and a local port, served from its checkout in the workspace.
#[derive(Debug)]
pub struct Target {
    pub id: String,
    label: String,
    repo: String,
    /// The app folder in an Nx monorepo, none for a repo that is one Angular app.
    path: Option<String>,
    port: u16,
}

pub fn targets(manifest: &Manifest) -> Vec<Target> {
    manifest
        .apps
        .iter()
        .filter(|app| app.kind == Kind::Frontend && !app.cluster_only)
        .filter_map(|app| {
            Some(Target {
                id: app.id.clone(),
                label: app.label.clone(),
                repo: app.repo.clone()?,
                path: app.path.clone(),
                port: local_port(app.health.as_deref()?)?,
            })
        })
        .collect()
}

/// `http://localhost:4500/` gives 4500, an address on another host gives nothing.
fn local_port(health: &str) -> Option<u16> {
    let address = health.split_once("://")?.1.split('/').next()?;
    let (host, port) = address.rsplit_once(':')?;
    matches!(host, "localhost" | "127.0.0.1").then(|| port.parse().ok()).flatten()
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Off,
    /// Started by the app, the port is not open yet: `ng serve` still builds.
    Starting,
    Running,
    /// The port is open, but not by the app, e.g. `npm start` in a terminal.
    External,
    /// Started by the app and ended on its own.
    Ended,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevServerStatus {
    pub id: String,
    pub label: String,
    pub repo: String,
    pub port: u16,
    pub phase: Phase,
    /// Epoch millis, only for a server the app started.
    pub started_at: Option<i64>,
    pub error: Option<String>,
}

enum Own {
    None,
    Alive,
    Ended,
}

fn phase(own: Own, port_open: bool) -> Phase {
    match (own, port_open) {
        (Own::Alive, true) => Phase::Running,
        (Own::Alive, false) => Phase::Starting,
        (Own::Ended, _) => Phase::Ended,
        (Own::None, true) => Phase::External,
        (Own::None, false) => Phase::Off,
    }
}

/// What `dev-servers.json` keeps of a server, so the next run of the app can take it over.
#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Started {
    /// The pid of the first process, which is also the id of the process group.
    pid: u32,
    started_at: i64,
    /// Part of the command line of that process, like `nx serve dashboard`, so a reused pid is not taken.
    command: String,
}

enum Process {
    Child(Child),
    /// Started by an earlier run of the app that was killed rather than quit, like `tauri dev` does on a rebuild.
    Adopted(u32),
}

struct Server {
    process: Process,
    command: String,
    started_at: i64,
    log: Arc<Mutex<VecDeque<String>>>,
    ended: Option<String>,
}

impl Server {
    fn adopted(started: Started) -> Self {
        let note = "Aus einem früheren Lauf der App übernommen, die Ausgabe davor ist nicht erhalten".to_string();
        Server {
            process: Process::Adopted(started.pid),
            command: started.command,
            started_at: started.started_at,
            log: Arc::new(Mutex::new(VecDeque::from([note]))),
            ended: None,
        }
    }

    fn refresh(&mut self) {
        if self.ended.is_some() {
            return;
        }
        match &mut self.process {
            Process::Child(child) => {
                if let Ok(Some(status)) = child.try_wait() {
                    let last = self.log.lock().expect("log lock poisoned").back().cloned();
                    self.ended = Some(match last {
                        Some(line) if !status.success() => line,
                        _ => format!("beendet ({status})"),
                    });
                }
            }
            Process::Adopted(pid) => {
                if !alive(*pid) {
                    self.ended = Some("beendet".into());
                }
            }
        }
    }

    fn stop(&mut self) {
        match &mut self.process {
            Process::Child(child) => kill_group(child),
            Process::Adopted(pid) => signal_group(*pid),
        }
    }

    fn started(&self) -> Option<Started> {
        if self.ended.is_some() {
            return None;
        }
        let pid = match &self.process {
            Process::Child(child) => child.id()?,
            Process::Adopted(pid) => *pid,
        };
        Some(Started { pid, started_at: self.started_at, command: self.command.clone() })
    }
}

/// The dev servers the app started; an ended one stays listed with its last line until it is started again.
#[derive(Default)]
pub struct DevServers {
    servers: Mutex<HashMap<String, Server>>,
    /// Without one, as in the tests, nothing outlives the app.
    file: Option<PathBuf>,
}

impl DevServers {
    /// Takes over what an earlier run left behind: still alive, an orphan of launchd and still the same command.
    pub fn load(file: PathBuf) -> Self {
        let saved: HashMap<String, Started> =
            std::fs::read_to_string(&file).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default();
        let servers = saved
            .into_iter()
            .filter(|(_, started)| adoptable(started))
            .map(|(id, started)| (id, Server::adopted(started)))
            .collect();
        let this = Self { servers: Mutex::new(servers), file: Some(file) };
        this.save(&this.servers.lock().expect("dev servers lock poisoned"));
        this
    }

    /// A file that cannot be written only costs the take-over after a crash, the server itself runs.
    fn save(&self, servers: &HashMap<String, Server>) {
        let Some(file) = &self.file else { return };
        let started: BTreeMap<&String, Started> =
            servers.iter().filter_map(|(id, server)| Some((id, server.started()?))).collect();
        let written = serde_json::to_string_pretty(&started).map_err(std::io::Error::from).and_then(|text| {
            if let Some(dir) = file.parent() {
                std::fs::create_dir_all(dir)?;
            }
            std::fs::write(file, text + "\n")
        });
        if let Err(error) = written {
            eprintln!("base: {} not saved: {error}", file.display());
        }
    }

    pub async fn list(&self, targets: &[Target]) -> Vec<DevServerStatus> {
        let own: HashMap<String, (bool, i64, Option<String>)> = {
            let mut servers = self.servers.lock().expect("dev servers lock poisoned");
            servers
                .iter_mut()
                .map(|(id, server)| {
                    server.refresh();
                    (id.clone(), (server.ended.is_none(), server.started_at, server.ended.clone()))
                })
                .collect()
        };
        let mut probes = JoinSet::new();
        for (index, port) in targets.iter().map(|target| target.port).enumerate() {
            probes.spawn(async move { (index, port_open(port).await) });
        }
        let mut open = vec![false; targets.len()];
        for (index, is_open) in probes.join_all().await {
            open[index] = is_open;
        }
        targets
            .iter()
            .zip(open)
            .map(|(target, port_open)| {
                let (state, started_at, error) = match own.get(&target.id) {
                    Some((true, started_at, _)) => (Own::Alive, Some(*started_at), None),
                    Some((false, started_at, error)) => (Own::Ended, Some(*started_at), error.clone()),
                    None => (Own::None, None, None),
                };
                DevServerStatus {
                    id: target.id.clone(),
                    label: target.label.clone(),
                    repo: target.repo.clone(),
                    port: target.port,
                    phase: phase(state, port_open),
                    started_at,
                    error,
                }
            })
            .collect()
    }

    /// Does nothing for a server the app already runs, refuses a port that is taken by something else.
    pub async fn start(&self, target: &Target, workspace: &Path) -> AppResult<()> {
        if self.is_alive(&target.id) {
            return Ok(());
        }
        if port_open(target.port).await {
            return Err(AppError::Invalid(format!(
                "{}: Port {} ist schon belegt, läuft es schon im Terminal?",
                target.label, target.port
            )));
        }
        let dir = workspace.join(&target.repo);
        if !dir.is_dir() {
            return Err(AppError::Invalid(format!("{}: {} nicht gefunden", target.label, dir.display())));
        }
        let (program, args) = launch(target, &dir)?;
        let mut command = paths::command(program).await;
        command
            .args(&args)
            .current_dir(&dir)
            .envs([("NG_CLI_ANALYTICS", "false"), ("NX_TUI", "false"), ("NO_COLOR", "1"), ("FORCE_COLOR", "0")])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // npm starts ng serve as its own child: only the whole group can be stopped at once
        #[cfg(unix)]
        command.process_group(0);
        let mut child = command
            .spawn()
            .map_err(|error| AppError::Invalid(format!("{}: {program} startet nicht: {error}", target.label)))?;
        let log = Arc::new(Mutex::new(VecDeque::new()));
        collect(child.stdout.take(), Arc::clone(&log));
        collect(child.stderr.take(), Arc::clone(&log));
        let server = Server {
            process: Process::Child(child),
            command: args.join(" "),
            started_at: now_millis(),
            log,
            ended: None,
        };
        let mut servers = self.servers.lock().expect("dev servers lock poisoned");
        if let Some(mut old) = servers.insert(target.id.clone(), server) {
            old.stop();
        }
        self.save(&servers);
        Ok(())
    }

    pub fn stop(&self, id: &str) {
        let mut servers = self.servers.lock().expect("dev servers lock poisoned");
        if let Some(mut server) = servers.remove(id) {
            server.stop();
        }
        self.save(&servers);
    }

    pub fn stop_all(&self) {
        let mut servers = self.servers.lock().expect("dev servers lock poisoned");
        for (_, mut server) in servers.drain() {
            server.stop();
        }
        self.save(&servers);
    }

    pub fn log(&self, id: &str) -> Vec<String> {
        self.servers
            .lock()
            .expect("dev servers lock poisoned")
            .get(id)
            .map(|server| server.log.lock().expect("log lock poisoned").iter().cloned().collect())
            .unwrap_or_default()
    }

    fn is_alive(&self, id: &str) -> bool {
        let mut servers = self.servers.lock().expect("dev servers lock poisoned");
        servers.get_mut(id).is_some_and(|server| {
            server.refresh();
            server.ended.is_none()
        })
    }
}

/// `nx serve <project>` in a monorepo, the name from the `project.json` of the app; `npm run start` otherwise.
fn launch(target: &Target, dir: &Path) -> AppResult<(&'static str, Vec<String>)> {
    let Some(path) = &target.path else {
        return Ok((NPM, vec!["run".into(), "start".into()]));
    };
    let file = dir.join(path).join("project.json");
    let project = std::fs::read_to_string(&file)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|json| Some(json.get("name")?.as_str()?.to_string()))
        .ok_or_else(|| AppError::Invalid(format!("{}: kein Projektname in {}", target.label, file.display())))?;
    Ok((NPX, vec!["nx".into(), "serve".into(), project]))
}

#[cfg(not(windows))]
const NPM: &str = "npm";
#[cfg(not(windows))]
const NPX: &str = "npx";
#[cfg(windows)]
const NPM: &str = "npm.cmd";
#[cfg(windows)]
const NPX: &str = "npx.cmd";

async fn port_open(port: u16) -> bool {
    matches!(tokio::time::timeout(PROBE_TIMEOUT, TcpStream::connect(("localhost", port))).await, Ok(Ok(_)))
}

fn collect(stream: Option<impl AsyncRead + Unpin + Send + 'static>, log: Arc<Mutex<VecDeque<String>>>) {
    let Some(stream) = stream else { return };
    let mut lines = BufReader::new(stream).lines();
    tauri::async_runtime::spawn(async move {
        while let Ok(Some(line)) = lines.next_line().await {
            let line = clean(&line);
            if line.trim().is_empty() {
                continue;
            }
            let mut log = log.lock().expect("log lock poisoned");
            if log.len() == LOG_LINES {
                log.pop_front();
            }
            log.push_back(line);
        }
    });
}

static ANSI: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\x1b\[[0-9;?]*[ -/]*[@-~]").expect("ANSI pattern is valid"));

/// Colors stay in despite NO_COLOR with some tools, and a progress line redraws itself after `\r`.
fn clean(line: &str) -> String {
    let last = line.rsplit('\r').find(|part| !part.trim().is_empty()).unwrap_or("");
    ANSI.replace_all(last, "").trim_end().to_string()
}

fn kill_group(child: &mut Child) {
    match child.id() {
        Some(pid) => signal_group(pid),
        None => {
            let _ = child.start_kill();
        }
    }
}

#[cfg(unix)]
fn signal_group(pid: u32) {
    // SAFETY: killpg only sends a signal, the group id is the pid of a server started with process_group(0)
    unsafe {
        libc::killpg(pid as libc::pid_t, libc::SIGTERM);
    }
}

#[cfg(windows)]
fn signal_group(pid: u32) {
    let _ = std::process::Command::new("taskkill").args(["/T", "/F", "/PID", &pid.to_string()]).status();
}

#[cfg(unix)]
fn alive(pid: u32) -> bool {
    // SAFETY: signal 0 sends nothing, it only asks whether the process exists
    unsafe { libc::kill(pid as libc::pid_t, 0) == 0 }
}

#[cfg(windows)]
fn alive(_pid: u32) -> bool {
    false
}

#[cfg(unix)]
fn adoptable(started: &Started) -> bool {
    std::process::Command::new("/bin/ps")
        .args(["-o", "ppid=,command=", "-p", &started.pid.to_string()])
        .output()
        .is_ok_and(|output| orphan_running(&String::from_utf8_lossy(&output.stdout), &started.command))
}

/// Without the orphan check of `ps` a server could belong to another running app, so Windows takes none over.
#[cfg(windows)]
fn adoptable(_started: &Started) -> bool {
    false
}

/// `ps` prints the parent first: an orphan belongs to launchd, a server of another running app or a terminal does not.
fn orphan_running(ps_line: &str, command: &str) -> bool {
    ps_line.trim().split_once(char::is_whitespace).is_some_and(|(ppid, line)| ppid == "1" && line.contains(command))
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest() -> Manifest {
        serde_json::from_value(serde_json::json!({
            "groups": [],
            "apps": [
                { "id": "server", "label": "server", "group": "neu", "kind": "backend", "repo": "server",
                  "health": "http://localhost:9980/actuator/health" },
                { "id": "dashboard", "label": "Dashboard", "group": "neu", "kind": "frontend", "repo": "web",
                  "path": "apps/dashboard", "health": "http://localhost:4850/" },
                { "id": "audit-gui", "label": "audit-gui", "group": "alt", "kind": "frontend", "repo": "audit-gui",
                  "health": "http://localhost:4500/" },
                { "id": "no-port", "label": "no-port", "group": "alt", "kind": "frontend", "repo": "no-port" },
                { "id": "no-repo", "label": "no-repo", "group": "alt", "kind": "frontend",
                  "health": "http://localhost:4100/" }
            ]
        }))
        .unwrap()
    }

    #[test]
    fn takes_the_frontends_with_repo_and_local_port() {
        let targets = targets(&manifest());

        let ids: Vec<_> = targets.iter().map(|target| target.id.as_str()).collect();
        assert_eq!(ids, ["dashboard", "audit-gui"]);
        assert_eq!(targets[0].path.as_deref(), Some("apps/dashboard"));
        assert_eq!(targets[1].port, 4500);
    }

    #[test]
    fn reads_the_port_of_a_local_address_only() {
        assert_eq!(local_port("http://localhost:4500/"), Some(4500));
        assert_eq!(local_port("http://127.0.0.1:4850"), Some(4850));
        assert_eq!(local_port("http://localhost/"), None);
        assert_eq!(local_port("https://dev.example.org:443/"), None);
        assert_eq!(local_port("tcp://localhost:5432"), Some(5432));
    }

    #[test]
    fn tells_own_from_external_servers() {
        assert_eq!(phase(Own::Alive, false), Phase::Starting);
        assert_eq!(phase(Own::Alive, true), Phase::Running);
        assert_eq!(phase(Own::Ended, true), Phase::Ended);
        assert_eq!(phase(Own::None, true), Phase::External);
        assert_eq!(phase(Own::None, false), Phase::Off);
    }

    #[test]
    fn serves_an_nx_app_by_its_project_name_and_a_plain_repo_by_npm_start() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("apps/dashboard")).unwrap();
        std::fs::write(dir.path().join("apps/dashboard/project.json"), r#"{ "name": "web-dashboard" }"#).unwrap();
        let targets = targets(&manifest());

        assert_eq!(
            launch(&targets[0], dir.path()).unwrap(),
            (NPX, vec!["nx".into(), "serve".into(), "web-dashboard".into()])
        );
        assert_eq!(launch(&targets[1], dir.path()).unwrap(), (NPM, vec!["run".into(), "start".into()]));
        assert!(launch(&targets[0], &dir.path().join("missing")).is_err());
    }

    #[test]
    fn takes_over_only_an_orphan_of_launchd_that_still_runs_the_same_command() {
        assert!(orphan_running("    1 npm exec nx serve dashboard\n", "nx serve dashboard"));
        assert!(
            !orphan_running("  20828 npm exec nx serve dashboard\n", "nx serve dashboard"),
            "a running app owns it"
        );
        assert!(!orphan_running("    1 /usr/sbin/cupsd -l\n", "nx serve dashboard"), "the pid was reused");
        assert!(!orphan_running("", "run start"), "the process is gone");
    }

    #[test]
    fn forgets_a_saved_server_that_is_gone_and_keeps_the_file_in_step() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("werkstatt/dev-server.json");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        let gone = Started { pid: 999_999, started_at: 1, command: "run start".into() };
        std::fs::write(&file, serde_json::to_string(&HashMap::from([("audit-gui", gone)])).unwrap()).unwrap();

        let servers = DevServers::load(file.clone());

        assert!(servers.servers.lock().unwrap().is_empty());
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "{}\n");
    }

    #[test]
    fn strips_colors_and_keeps_the_last_redraw_of_a_line() {
        assert_eq!(clean("\x1b[32m✔\x1b[39m Compiled successfully."), "✔ Compiled successfully.");
        assert_eq!(clean("Building... 10%\rBuilding... 100%\r"), "Building... 100%");
        assert_eq!(clean("  \r"), "");
    }

    #[tokio::test]
    async fn lists_every_target_and_has_no_log_for_a_server_it_did_not_start() {
        let servers = DevServers::default();
        let targets = vec![Target {
            id: "closed".into(),
            label: "closed".into(),
            repo: "closed".into(),
            path: None,
            port: free_port(),
        }];

        let list = servers.list(&targets).await;

        assert_eq!(list.len(), 1);
        assert_eq!(list[0].phase, Phase::Off);
        assert!(servers.log("closed").is_empty());
    }

    /// npm starts node as its own child, which has to end with the group.
    #[tokio::test]
    #[ignore = "needs npm and node"]
    async fn runs_npm_start_and_stops_its_children_too() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = dir.path();
        let repo = workspace.join("demo-gui");
        std::fs::create_dir_all(&repo).unwrap();
        let port = free_port();
        std::fs::write(repo.join("package.json"), r#"{ "scripts": { "start": "node server.js" } }"#).unwrap();
        std::fs::write(
            repo.join("server.js"),
            format!("require('http').createServer((_, res) => res.end()).listen({port}, () => console.log('ready'));"),
        )
        .unwrap();
        let target = Target { id: "demo".into(), label: "demo".into(), repo: "demo-gui".into(), path: None, port };
        let servers = DevServers::default();

        servers.start(&target, workspace).await.unwrap();
        let running =
            wait_for(|| async { servers.list(std::slice::from_ref(&target)).await[0].phase == Phase::Running });
        assert!(running.await, "never came up, log: {:?}", servers.log("demo"));
        assert!(servers.log("demo").iter().any(|line| line == "ready"));

        servers.stop("demo");
        assert!(wait_for(|| async { !port_open(port).await }).await, "node kept the port");
    }

    async fn wait_for<F: std::future::Future<Output = bool>>(check: impl Fn() -> F) -> bool {
        for _ in 0..100 {
            if check().await {
                return true;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        false
    }

    fn free_port() -> u16 {
        std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
    }
}
