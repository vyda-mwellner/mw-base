//! The compose stacks of local-setup: what docker runs of them, and `setup.sh` to start and stop them, so the
//! window never drifts from the scripts.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Command;

use crate::error::{AppError, AppResult};
use crate::paths;

const PS_FORMAT: &str = r#"{"id":{{json .ID}},"name":{{json .Names}},"image":{{json .Image}},"state":{{json .State}},"status":{{json .Status}},"ports":{{json .Ports}},"workingDir":{{json (.Label "com.docker.compose.project.working_dir")}}}"#;

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Container {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub ports: String,
    #[serde(skip_serializing)]
    pub working_dir: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stack {
    pub name: String,
    pub default_stack: bool,
    pub containers: Vec<Container>,
}

#[derive(Debug, Serialize)]
pub struct DockerOverview {
    pub stacks: Vec<Stack>,
    /// Running containers of other projects.
    pub others: Vec<Container>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SetupCommand {
    Up { stack: String },
    Down { stack: String },
    Restart { stack: String },
}

#[derive(Debug, Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum LogStream {
    Command,
    Stdout,
    Stderr,
}

#[derive(Debug, Serialize, Clone)]
pub struct LogLine {
    pub stream: LogStream,
    pub text: String,
}

/// Every folder of local-setup with a `docker-compose.yml`.
pub fn stack_names(root: &Path) -> AppResult<Vec<String>> {
    let mut names = Vec::new();
    for entry in std::fs::read_dir(root)? {
        let path = entry?.path();
        if path.join("docker-compose.yml").is_file()
            && let Some(name) = path.file_name().and_then(|name| name.to_str())
        {
            names.push(name.to_string());
        }
    }
    names.sort();
    Ok(names)
}

pub async fn overview(root: &Path) -> AppResult<DockerOverview> {
    let names = stack_names(root)?;
    let defaults = default_stacks(root);
    let mut docker = paths::command("docker").await;
    docker.args(["ps", "-a", "--format", PS_FORMAT]).kill_on_drop(true);
    let output = tokio::time::timeout(Duration::from_secs(15), docker.output())
        .await
        .map_err(|_| AppError::Docker("docker ps antwortet nicht - läuft der Docker-Daemon?".into()))?
        .map_err(|error| AppError::Docker(format!("docker nicht startbar: {error}")))?;
    if !output.status.success() {
        return Err(AppError::Docker(failure(&String::from_utf8_lossy(&output.stderr))));
    }
    let containers = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(serde_json::from_str)
        .collect::<Result<Vec<Container>, _>>()?;
    Ok(sort_into_stacks(root, names, &defaults, containers))
}

fn sort_into_stacks(
    root: &Path,
    names: Vec<String>,
    defaults: &[String],
    containers: Vec<Container>,
) -> DockerOverview {
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let mut stacks: Vec<Stack> = names
        .into_iter()
        .map(|name| Stack { default_stack: defaults.contains(&name), name, containers: Vec::new() })
        .collect();
    let mut others = Vec::new();
    for container in containers {
        match stack_of(&root, &container.working_dir)
            .and_then(|name| stacks.iter_mut().find(|stack| stack.name == name))
        {
            Some(stack) => stack.containers.push(container),
            None if container.state == "running" => others.push(container),
            None => {}
        }
    }
    for stack in &mut stacks {
        stack.containers.sort_by(|a, b| a.name.cmp(&b.name));
    }
    others.sort_by(|a, b| a.name.cmp(&b.name));
    DockerOverview { stacks, others }
}

/// The CLI names the socket it tried at length; that the daemon is down is all the rack has room for.
fn failure(stderr: &str) -> String {
    let stderr = stderr.trim();
    let daemon_down = ["Cannot connect to the Docker daemon", "failed to connect to the docker API"]
        .iter()
        .any(|sign| stderr.contains(sign));
    if daemon_down { "Docker-Daemon läuft nicht - Colima oder Docker Desktop starten".into() } else { stderr.into() }
}

/// Read from setup.sh, so the window starts exactly what `setup up` starts.
fn default_stacks(root: &Path) -> Vec<String> {
    let Ok(script) = std::fs::read_to_string(root.join("setup.sh")) else {
        return Vec::new();
    };
    script
        .lines()
        .find_map(|line| line.trim().strip_prefix("DEFAULT_FOLDERS=("))
        .map(|list| {
            list.trim_end_matches(')').split_whitespace().map(|name| name.trim_matches('"').to_string()).collect()
        })
        .unwrap_or_default()
}

/// Matched by the compose working dir, so a "db" project of another repo does not count as ours.
fn stack_of(root: &Path, working_dir: &str) -> Option<String> {
    if working_dir.is_empty() {
        return None;
    }
    let dir = PathBuf::from(working_dir);
    let dir = dir.canonicalize().unwrap_or(dir);
    if dir.parent()? != root {
        return None;
    }
    dir.file_name()?.to_str().map(String::from)
}

pub async fn run_setup(root: &Path, setup: SetupCommand, log: &Channel<LogLine>) -> AppResult<()> {
    let known = stack_names(root)?;
    let steps = match setup {
        SetupCommand::Up { stack } => vec![stack_args("up", &stack, &known)?],
        SetupCommand::Down { stack } => vec![stack_args("down", &stack, &known)?],
        SetupCommand::Restart { stack } => vec![stack_args("down", &stack, &known)?, stack_args("up", &stack, &known)?],
    };
    for args in steps {
        run_script(root, &args, log).await?;
    }
    Ok(())
}

fn stack_args(action: &str, stack: &str, known: &[String]) -> AppResult<Vec<String>> {
    if !known.iter().any(|name| name == stack) {
        return Err(AppError::Invalid(format!("Unbekannter Stack '{stack}'")));
    }
    Ok(vec![action.into(), "-x".into(), stack.into()])
}

async fn run_script(root: &Path, args: &[String], log: &Channel<LogLine>) -> AppResult<()> {
    send(log, LogStream::Command, format!("$ setup {}", args.join(" ")));
    let mut child = script_command(root)
        .await
        .args(args)
        .current_dir(root)
        .env("COMPOSE_ANSI", "never")
        .env("COMPOSE_PROGRESS", "plain")
        .env("BUILDKIT_PROGRESS", "plain")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;

    let stdout = child.stdout.take().expect("stdout is piped");
    let stderr = child.stderr.take().expect("stderr is piped");
    tokio::join!(forward(stdout, LogStream::Stdout, log), forward(stderr, LogStream::Stderr, log));

    let status = child.wait().await?;
    if status.success() {
        Ok(())
    } else {
        Err(AppError::Docker(format!("setup {} fehlgeschlagen ({status})", args.join(" "))))
    }
}

async fn forward(reader: impl AsyncRead + Unpin, stream: LogStream, log: &Channel<LogLine>) {
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        send(log, stream, line);
    }
}

fn send(log: &Channel<LogLine>, stream: LogStream, text: String) {
    if let Err(error) = log.send(LogLine { stream, text }) {
        eprintln!("base: setup output not forwarded: {error}");
    }
}

#[cfg(windows)]
async fn script_command(root: &Path) -> Command {
    let mut command = paths::command("powershell").await;
    command.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"]).arg(root.join("setup.ps1"));
    command
}

#[cfg(not(windows))]
async fn script_command(root: &Path) -> Command {
    let mut command = paths::command("bash").await;
    command.arg(root.join("setup.sh"));
    command
}

#[cfg(test)]
mod tests {
    use super::*;

    fn local_setup() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        for stack in ["db", "keycloak", "mail"] {
            std::fs::create_dir_all(dir.path().join(stack)).unwrap();
            std::fs::write(dir.path().join(stack).join("docker-compose.yml"), "services: {}").unwrap();
        }
        std::fs::create_dir_all(dir.path().join("scripts")).unwrap();
        std::fs::write(dir.path().join("setup.sh"), "#!/bin/bash\n  DEFAULT_FOLDERS=(\"db\" keycloak)\n").unwrap();
        dir
    }

    fn container(name: &str, state: &str, working_dir: &Path) -> Container {
        Container {
            id: name.into(),
            name: name.into(),
            image: "image".into(),
            state: state.into(),
            status: String::new(),
            ports: String::new(),
            working_dir: working_dir.display().to_string(),
        }
    }

    #[test]
    fn finds_the_stacks_and_the_default_set_of_setup_sh() {
        let dir = local_setup();
        assert_eq!(stack_names(dir.path()).unwrap(), ["db", "keycloak", "mail"]);
        assert_eq!(default_stacks(dir.path()), ["db", "keycloak"]);
    }

    #[test]
    fn puts_a_container_on_its_stack_by_working_dir_and_keeps_only_running_strangers() {
        let dir = local_setup();
        let elsewhere = tempfile::tempdir().unwrap();
        let containers = vec![
            container("local-postgres", "running", &dir.path().join("db")),
            container("other-db", "running", &elsewhere.path().join("db")),
            container("old-thing", "exited", &elsewhere.path().join("db")),
        ];

        let overview =
            sort_into_stacks(dir.path(), stack_names(dir.path()).unwrap(), &default_stacks(dir.path()), containers);

        let db = &overview.stacks[0];
        assert!(db.default_stack);
        assert_eq!(db.containers.iter().map(|each| each.name.as_str()).collect::<Vec<_>>(), ["local-postgres"]);
        assert_eq!(overview.others.iter().map(|each| each.name.as_str()).collect::<Vec<_>>(), ["other-db"]);
    }

    #[tokio::test]
    #[ignore = "needs a running docker daemon and the local-setup of the data folder"]
    async fn reads_the_stacks_of_the_real_local_setup() {
        let root = crate::settings::Settings::load(&paths::root()).unwrap().local_setup_dir().unwrap();
        let overview = overview(&root).await.unwrap();
        assert!(!overview.stacks.is_empty());
    }

    #[test]
    fn says_short_that_the_daemon_is_down_and_keeps_any_other_error() {
        let colima = "failed to connect to the docker API at unix:///Users/me/.colima/default/docker.sock; check if the path is correct";
        assert_eq!(failure(colima), "Docker-Daemon läuft nicht - Colima oder Docker Desktop starten");
        assert_eq!(failure("permission denied\n"), "permission denied");
    }

    #[test]
    fn refuses_a_stack_that_is_not_in_local_setup() {
        let known = vec!["db".to_string()];
        assert_eq!(stack_args("down", "db", &known).unwrap(), ["down", "-x", "db"]);
        assert!(stack_args("down", "../etc", &known).is_err());
    }
}
