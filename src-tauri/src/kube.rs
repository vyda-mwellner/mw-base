use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use serde::Deserialize;
use tokio::net::TcpStream;
use tokio::process::{Child, Command};

use crate::error::{AppError, AppResult};
use crate::paths;

pub const ENVS: [&str; 3] = ["dev", "test", "prod"];
const TUNNEL_TIMEOUT: Duration = Duration::from_secs(2);
/// Per container. `--tail` keeps the newest lines, `--limit-bytes` would keep the oldest and drop the last hours.
pub const LOG_TAIL_LINES: usize = 50_000;

/// Every call the app makes against a cluster. None of them changes it: a port-forward only opens a local port.
pub enum Call<'a> {
    Get { namespace: &'a str, selector: &'a str },
    Top { namespace: &'a str, selector: &'a str },
    Logs { namespace: &'a str, selector: &'a str, since: Since },
    PortForward { namespace: &'a str, target: &'a str, local_port: u16, remote_port: u16 },
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub enum Since {
    #[serde(rename = "1h")]
    Hour,
    #[serde(rename = "3h")]
    ThreeHours,
    #[serde(rename = "6h")]
    SixHours,
    #[serde(rename = "24h")]
    Day,
    #[serde(rename = "72h")]
    ThreeDays,
}

impl Since {
    pub fn millis(self) -> i64 {
        let minutes = match self {
            Since::Hour => 60,
            Since::ThreeHours => 180,
            Since::SixHours => 360,
            Since::Day => 1440,
            Since::ThreeDays => 4320,
        };
        minutes * 60_000
    }

    fn arg(self) -> &'static str {
        match self {
            Since::Hour => "1h",
            Since::ThreeHours => "3h",
            Since::SixHours => "6h",
            Since::Day => "24h",
            Since::ThreeDays => "72h",
        }
    }
}

impl Call<'_> {
    fn args(&self) -> Vec<String> {
        let args: Vec<&str> = match self {
            Call::Get { namespace, selector } => {
                vec!["get", "deployments,pods", "-n", namespace, "-l", selector, "-o", "json", "--request-timeout=20s"]
            }
            Call::Top { namespace, selector } => {
                vec!["top", "pods", "-n", namespace, "-l", selector, "--no-headers", "--request-timeout=20s"]
            }
            // with a selector kubectl hands out only the last 10 lines unless --tail says otherwise
            Call::Logs { namespace, selector, since } => {
                let tail = format!("--tail={LOG_TAIL_LINES}");
                let args = ["logs", "-n", namespace, "-l", selector, "--prefix", "--timestamps", &tail, "--since"];
                return args
                    .into_iter()
                    .chain([since.arg(), "--max-log-requests=10", "--request-timeout=60s"])
                    .map(String::from)
                    .collect();
            }
            Call::PortForward { namespace, target, local_port, remote_port } => {
                let ports = format!("{local_port}:{remote_port}");
                return ["port-forward", "-n", namespace, target, &ports].map(String::from).to_vec();
            }
        };
        args.into_iter().map(String::from).collect()
    }
}

#[derive(Debug, Clone)]
pub struct Cluster {
    pub env: &'static str,
    kubeconfig: PathBuf,
}

impl Cluster {
    pub fn new(env: &str, kubeconfigs: &Kubeconfigs) -> AppResult<Cluster> {
        let env = ENVS
            .into_iter()
            .find(|known| *known == env)
            .ok_or_else(|| AppError::Invalid(format!("Unbekannte Umgebung '{env}'")))?;
        let kubeconfig = kubeconfigs.of(env);
        if !kubeconfig.is_file() {
            return Err(AppError::Invalid(format!(
                "Keine Kubeconfig für {} unter {}",
                env.to_uppercase(),
                kubeconfig.display()
            )));
        }
        Ok(Cluster { env, kubeconfig })
    }

    pub fn label(&self) -> String {
        self.env.to_uppercase()
    }

    pub async fn run(&self, call: Call<'_>) -> AppResult<String> {
        let output = self.command(&call).await.stdin(Stdio::null()).kill_on_drop(true).output().await?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).into_owned())
        } else {
            Err(AppError::Invalid(format!("{}: {}", self.label(), String::from_utf8_lossy(&output.stderr).trim())))
        }
    }

    pub async fn spawn(&self, call: Call<'_>) -> AppResult<Child> {
        let mut command = self.command(&call).await;
        command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
        Ok(command.spawn()?)
    }

    /// An API server on this machine is the local end of a tunnel: without it kubectl would wait for its timeout.
    pub async fn ensure_reachable(&self) -> AppResult<()> {
        let mut command = self.kubectl().await;
        command.args(["config", "view", "--minify", "-o", "jsonpath={.clusters[0].cluster.server}"]);
        let output = command.stdin(Stdio::null()).output().await?;
        let Some(address) = local_address(&String::from_utf8_lossy(&output.stdout)) else {
            return Ok(());
        };
        match tokio::time::timeout(TUNNEL_TIMEOUT, TcpStream::connect(&address)).await {
            Ok(Ok(_)) => Ok(()),
            _ => Err(AppError::Invalid(format!(
                "{}: der API-Server auf {address} antwortet nicht - läuft der Tunnel?",
                self.label()
            ))),
        }
    }

    async fn command(&self, call: &Call<'_>) -> Command {
        let mut command = self.kubectl().await;
        command.args(call.args());
        command
    }

    async fn kubectl(&self) -> Command {
        let mut command = paths::command("kubectl").await;
        command.arg("--kubeconfig").arg(&self.kubeconfig);
        command
    }
}

/// One kubeconfig per env in `dir`, named by `file` with `{env}` filled in.
#[derive(Debug, Clone)]
pub struct Kubeconfigs {
    pub dir: PathBuf,
    pub file: String,
}

impl Kubeconfigs {
    pub fn of(&self, env: &str) -> PathBuf {
        self.dir.join(self.file.replace("{env}", env))
    }

    pub fn envs(&self) -> Vec<&'static str> {
        ENVS.into_iter().filter(|env| self.of(env).is_file()).collect()
    }
}

/// `host:port` of an API server on this machine, which is the local end of a tunnel.
fn local_address(server: &str) -> Option<String> {
    let authority = server.trim().split_once("://")?.1.split('/').next()?;
    let (host, port) = authority.rsplit_once(':').unwrap_or((authority, "443"));
    let local = host == "localhost" || host == "[::1]" || host.starts_with("127.");
    local.then(|| format!("{host}:{port}"))
}

pub fn now_millis() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_millis() as i64)
}

/// A Kubernetes quantity of memory, `657Mi`, `1Gi`, `1G` or plain bytes, in MiB.
pub fn mebibytes(quantity: &str) -> Option<u32> {
    const UNITS: [(&str, f64); 8] = [
        ("Ki", 1024.0),
        ("Mi", 1_048_576.0),
        ("Gi", 1_073_741_824.0),
        ("Ti", 1_099_511_627_776.0),
        ("k", 1e3),
        ("M", 1e6),
        ("G", 1e9),
        ("T", 1e12),
    ];
    let (number, factor) = UNITS
        .iter()
        .find_map(|(unit, factor)| Some((quantity.strip_suffix(unit)?, *factor)))
        .unwrap_or((quantity, 1.0));
    Some((number.parse::<f64>().ok()? * factor / 1_048_576.0).round() as u32)
}

/// A Kubernetes quantity of CPU, `250m` or `0.5` cores, in millicores.
pub fn millicores(quantity: &str) -> Option<u32> {
    match quantity.strip_suffix('m') {
        Some(millis) => millis.parse().ok(),
        None => Some((quantity.parse::<f64>().ok()? * 1000.0).round() as u32),
    }
}

/// Epoch millis of a UTC time as Kubernetes writes it, `2026-11-03T13:03:14.499860167Z`.
pub fn epoch_millis(time: &str) -> Option<i64> {
    let (date, clock) = time.strip_suffix('Z')?.split_once('T')?;
    let numbers = |text: &str, separator: char| -> Option<Vec<i64>> {
        text.split(separator).map(|part| part.parse().ok()).collect()
    };
    let (clock, fraction) = clock.split_once('.').unwrap_or((clock, ""));
    let (date, clock) = (numbers(date, '-')?, numbers(clock, ':')?);
    let ([year, month, day], [hour, minute, second]) = (date.as_slice(), clock.as_slice()) else {
        return None;
    };
    let millis = match fraction.get(..3).unwrap_or(fraction) {
        "" => 0,
        digits => format!("{digits:0<3}").parse::<i64>().ok()?,
    };
    let seconds = days_from_civil(*year, *month, *day) * 86_400 + hour * 3600 + minute * 60 + second;
    Some(seconds * 1000 + millis)
}

/// Howard Hinnant's algorithm, so a date needs no time crate.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let day_of_year = (153 * ((month + 9) % 12) + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_kubernetes_times_to_the_millisecond() {
        assert_eq!(epoch_millis("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(epoch_millis("2026-11-03T13:03:14.499860167Z"), Some(1_793_710_994_499));
        assert_eq!(epoch_millis("2024-02-29T23:59:59.5Z"), Some(1_709_251_199_500));
        assert_eq!(epoch_millis("2026-11-03 13:03:14"), None);
    }

    #[test]
    fn reads_memory_and_cpu_quantities() {
        assert_eq!(mebibytes("657Mi"), Some(657));
        assert_eq!(mebibytes("1Gi"), Some(1024));
        assert_eq!(mebibytes("1G"), Some(954));
        assert_eq!(mebibytes("524288Ki"), Some(512));
        assert_eq!(mebibytes("lots"), None);
        assert_eq!(millicores("250m"), Some(250));
        assert_eq!(millicores("2"), Some(2000));
        assert_eq!(millicores("0.5"), Some(500));
    }

    #[test]
    fn checks_only_an_api_server_on_this_machine() {
        assert_eq!(local_address("https://127.0.0.1:5443").as_deref(), Some("127.0.0.1:5443"));
        assert_eq!(local_address("https://localhost/").as_deref(), Some("localhost:443"));
        assert_eq!(local_address("https://203.0.113.7:5443"), None);
        assert_eq!(local_address(""), None);
    }

    #[test]
    fn reads_logs_of_every_pod_of_the_selector_and_only_reads() {
        let call = Call::Logs { namespace: "apps", selector: "app=orders-api", since: Since::Hour };
        let args = call.args();
        assert!(args.starts_with(&["logs".to_string()]));
        assert!(args.contains(&"--tail=50000".to_string()) && args.contains(&"1h".to_string()));
        let forward =
            Call::PortForward { namespace: "auth", target: "svc/keycloak", local_port: 8443, remote_port: 8443 };
        assert_eq!(forward.args(), ["port-forward", "-n", "auth", "svc/keycloak", "8443:8443"]);
    }

    #[test]
    fn names_the_kubeconfig_of_every_env_by_the_configured_file() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("cluster-prod.yaml"), "").unwrap();
        let kubeconfigs = Kubeconfigs { dir: dir.path().to_path_buf(), file: "cluster-{env}.yaml".into() };

        assert_eq!(kubeconfigs.of("dev"), dir.path().join("cluster-dev.yaml"));
        assert_eq!(kubeconfigs.envs(), ["prod"]);
        let error = Cluster::new("dev", &kubeconfigs).unwrap_err().to_string();
        assert!(error.starts_with("Keine Kubeconfig für DEV unter "), "{error}");
    }
}
