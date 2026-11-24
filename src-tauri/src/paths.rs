//! The data folder, `~/.config/base` or wherever `BASE_HOME` points, and the env of child processes.

use std::path::PathBuf;

use tokio::sync::OnceCell;

pub fn root() -> PathBuf {
    if let Some(home) = std::env::var_os("BASE_HOME") {
        return PathBuf::from(home);
    }
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"));
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .unwrap_or_else(|| home.join(".config"));
    base.join("base")
}

/// A Finder or desktop launch does not get the PATH of the shell, so it comes from a login shell.
pub async fn child_env() -> &'static [(String, String)] {
    static ENV: OnceCell<Vec<(String, String)>> = OnceCell::const_new();
    ENV.get_or_init(resolve_env).await
}

pub async fn command(program: &str) -> tokio::process::Command {
    let mut command = tokio::process::Command::new(program);
    command.envs(child_env().await.iter().map(|(name, value)| (name, value)));
    #[cfg(windows)]
    command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW, otherwise every call flashes a console
    command
}

#[cfg(windows)]
async fn resolve_env() -> Vec<(String, String)> {
    Vec::new()
}

#[cfg(not(windows))]
async fn resolve_env() -> Vec<(String, String)> {
    let shell = login_shell_env().await;
    let home = std::env::var("HOME").unwrap_or_default();
    let mut path: Vec<String> = shell.into_iter().filter(|(name, _)| name == "PATH").map(|(_, value)| value).collect();
    path.extend(std::env::var("PATH").ok());
    path.extend(
        ["/opt/homebrew/bin", "/usr/local/bin", "/Applications/Docker.app/Contents/Resources/bin"].map(String::from),
    );
    path.extend([".docker/bin", ".orbstack/bin", ".rd/bin"].map(|dir| format!("{home}/{dir}")));
    vec![("PATH".to_string(), path.join(":"))]
}

#[cfg(not(windows))]
async fn login_shell_env() -> Vec<(String, String)> {
    use std::time::Duration;
    use tokio::process::Command;

    let script = format!("printf '{SHELL_ENV_MARKER}PATH=%s\\n' \"$PATH\"");
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let output =
        Command::new(shell).args(["-ilc", &script]).stdin(std::process::Stdio::null()).kill_on_drop(true).output();
    match tokio::time::timeout(Duration::from_secs(5), output).await {
        Ok(Ok(output)) => parse_shell_env(&String::from_utf8_lossy(&output.stdout)),
        _ => Vec::new(),
    }
}

#[cfg(not(windows))]
const SHELL_ENV_MARKER: &str = "__BASE_ENV__";

/// Only marked lines count - an interactive shell may print a banner or prompt noise around them.
#[cfg(not(windows))]
fn parse_shell_env(output: &str) -> Vec<(String, String)> {
    output
        .lines()
        .filter_map(|line| line.split_once(SHELL_ENV_MARKER)?.1.split_once('='))
        .filter(|(_, value)| !value.is_empty())
        .map(|(name, value)| (name.to_string(), value.to_string()))
        .collect()
}

#[cfg(all(test, not(windows)))]
mod tests {
    use super::*;

    #[test]
    fn keeps_marked_non_empty_variables_only() {
        let output = format!(
            "Welcome to zsh\n{SHELL_ENV_MARKER}PATH=/usr/bin:/bin\nPATH=/unmarked\n{SHELL_ENV_MARKER}KUBECONFIG=\n"
        );
        assert_eq!(parse_shell_env(&output), vec![("PATH".to_string(), "/usr/bin:/bin".to_string())]);
    }
}
