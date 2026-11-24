use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::LazyLock;
use std::time::Duration;

use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tokio::task::JoinSet;

use crate::config;
use crate::error::{AppError, AppResult};
use crate::kube::ENVS;
use crate::landscape::{AppEntry, Kind, Manifest};
use crate::paths;
use crate::team::Team;
use crate::tickets::{self, Jira, Ticket};

const FETCH_TIMEOUT: Duration = Duration::from_secs(90);
const MAX_HITS_PER_REPO: &str = "30";
const MAX_RELEASE_COMMITS: usize = 300;
/// A record separator in front of every commit, since the raw message `%B` spans lines.
const LOG_FORMAT: &str = "--format=%x1e%m%x1f%H%x1f%h%x1f%an%x1f%ae%x1f%ct%x1f%P%x1f%s%x1f%B";

static NEW_TAG: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?m)^\s*newTag:\s*["']?([^"'\s]+)"#).unwrap());
static INGRESS_HOST: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?m)^\s*-?\s*host:\s*["']?([^"'\s]+)"#).unwrap());

/// What the app assumes about the gitops repo, from `git/gitops.json`. `{env}` and `{unit}` are filled in.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitopsConfig {
    /// The folder of the checkout in the workspace.
    repo: String,
    /// The branch CI writes new tags to.
    main_branch: String,
    /// The branch the cluster of an env reads; an env without one reads `main_branch`.
    branches: BTreeMap<String, String>,
    /// The kustomization of a cluster, whose resources name the units that run there.
    cluster: String,
    /// The folder of a unit, whose `kustomization.yaml` sets the `newTag`.
    unit: String,
    ingress: String,
    /// The start page of a GUI is its first ingress host in this domain, else its first host.
    #[serde(default)]
    preferred_domain: String,
}

impl GitopsConfig {
    pub fn load(root: &Path) -> AppResult<GitopsConfig> {
        config::parse(root, config::GITOPS)
    }

    pub fn open(self, workspace: &Path) -> AppResult<Gitops> {
        let dir = workspace.join(&self.repo);
        if dir.join(".git").exists() {
            Ok(Gitops { dir, config: self })
        } else {
            Err(AppError::Invalid(format!(
                "Kein Git-Checkout unter {} - \"repo\" in {} prüfen",
                dir.display(),
                config::GITOPS
            )))
        }
    }
}

/// The gitops checkout, read through its remote-tracking refs only.
#[derive(Debug, Clone)]
pub struct Gitops {
    dir: PathBuf,
    config: GitopsConfig,
}

impl Gitops {
    pub fn name(&self) -> &str {
        &self.config.repo
    }

    fn branch(&self, env: &str) -> &str {
        self.config.branches.get(env).unwrap_or(&self.config.main_branch)
    }

    fn cluster_ref(&self, env: &str) -> String {
        format!("origin/{}", self.branch(env))
    }

    /// An env that reads another branch than the one CI writes to gets a new tag only with the next merge.
    fn main_ref_ahead_of(&self, env: &str) -> Option<String> {
        (self.branch(env) != self.config.main_branch).then(|| format!("origin/{}", self.config.main_branch))
    }

    fn unit_file(&self, env: &str, unit: &str) -> String {
        format!("{}/kustomization.yaml", fill(&self.config.unit, env, unit).trim_end_matches('/'))
    }

    fn is_active(&self, cluster: &str, env: &str, unit: &str) -> bool {
        is_active(cluster, &fill(&self.config.unit, env, unit))
    }

    async fn show(&self, reference: &str, file: &str) -> Option<String> {
        git(&self.dir, &["show", &format!("{reference}:{file}")]).await
    }

    async fn cluster(&self, env: &str) -> String {
        self.show(&self.cluster_ref(env), &fill(&self.config.cluster, env, "")).await.unwrap_or_default()
    }

    /// The tag of the unit on the branch the cluster of the env reads.
    pub async fn unit_tag(&self, env: &str, unit: &str) -> Option<String> {
        self.tag_on(&self.cluster_ref(env), &self.unit_file(env, unit)).await
    }

    async fn tag_on(&self, reference: &str, file: &str) -> Option<String> {
        self.show(reference, file).await.and_then(|text| tag(&text))
    }

    async fn start_page(&self, env: &str, unit: &str) -> Option<String> {
        let ingress = self.show(&self.cluster_ref(env), &fill(&self.config.ingress, env, unit)).await?;
        start_page(&ingress, &self.config.preferred_domain)
    }
}

fn fill(template: &str, env: &str, unit: &str) -> String {
    template.replace("{env}", env).replace("{unit}", unit)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployStatus {
    pub repos: Vec<RepoFetch>,
    pub deploys: Vec<RepoDeploy>,
    /// dev to test, then test to prod.
    pub releases: Vec<Release>,
    pub links: Vec<GuiLink>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GuiLink {
    pub id: String,
    pub label: String,
    pub group: String,
    /// Env to the start page of the GUI there; an env it does not run on is missing.
    pub urls: BTreeMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoFetch {
    pub name: String,
    /// Epoch millis of the last `git fetch`, null when the repo was never fetched or is missing.
    pub fetched_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoDeploy {
    /// The repo, or the app id for an app without one.
    pub name: String,
    pub group: String,
    pub kind: Kind,
    /// The gitops units built from the repo, like the GUIs of one Nx workspace.
    pub units: Vec<String>,
    pub envs: Vec<EnvDeploy>,
    /// Commits on `dev` that are not on `test`, and on `test` that are not on `prod`, merges and copies of commits
    /// already there (a cherry-picked hotfix) left out.
    pub waiting_for_test: Option<u32>,
    pub waiting_for_prod: Option<u32>,
    /// The page of the repo, read from its `origin` remote; missing for a remote elsewhere.
    pub github: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvDeploy {
    pub env: String,
    pub tag: Option<String>,
    /// Epoch millis of the gitops commit that set the tag on the branch the cluster reads.
    pub since: Option<i64>,
    /// The unit is listed, and not commented out, in `clusters/<env>/kustomization.yaml`.
    pub active: bool,
    /// PROD only: a tag CI already wrote to gitops main that the release merge has not brought to prod yet.
    pub next_tag: Option<String>,
    /// The units of the repo whose tag or state differs from the first unit, which the other fields describe.
    pub deviations: Vec<Deviation>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Deviation {
    pub unit: String,
    pub tag: Option<String>,
    pub active: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitHit {
    pub repo: String,
    pub sha: String,
    pub short_sha: String,
    pub subject: String,
    pub author: String,
    /// Epoch millis.
    pub date: i64,
    /// The envs whose branch contains the commit.
    pub on: Vec<String>,
    pub tickets: Vec<Ticket>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitSearch {
    pub hits: Vec<CommitHit>,
    /// Only tickets whose key holds the search term: for them the search found every commit, not just some.
    pub tickets: Vec<TicketHit>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketHit {
    #[serde(flatten)]
    pub ticket: Ticket,
    pub summary: String,
    pub repos: Vec<TicketRepo>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TicketRepo {
    pub repo: String,
    pub commits: u32,
    /// Per env: how many of those commits its branch contains.
    pub on: BTreeMap<String, u32>,
}

/// What `from` has and `to` still lacks, by ticket over all repos, merges included for their keys. A cherry-pick of
/// a commit `to` already has counts as there.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub from: String,
    pub to: String,
    pub tickets: Vec<ReleaseTicket>,
    /// Commits without a ticket key, merges left out.
    pub untracked: Vec<Untracked>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseTicket {
    #[serde(flatten)]
    pub ticket: Ticket,
    pub summary: String,
    pub repos: Vec<String>,
    /// Oldest commit first.
    pub authors: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Untracked {
    pub repo: String,
    /// The oldest of the folded commits.
    pub short_sha: String,
    pub subject: String,
    /// Commits of the repo in a row with this subject, folded into one line, like a run of "time tracking".
    pub count: u32,
}

#[derive(Debug)]
struct LogEntry {
    sha: String,
    short_sha: String,
    author: String,
    email: String,
    /// Epoch millis.
    date: i64,
    parents: Vec<String>,
    /// `--cherry-mark` found the same patch on the other side of the range, under another sha.
    copy: bool,
    subject: String,
    message: String,
}

impl LogEntry {
    fn merge(&self) -> bool {
        self.parents.len() > 1
    }
}

/// The repos of the apps that have a gitops unit, each once, in the order of `apps.json`.
pub fn app_repos(apps: &[AppEntry]) -> Vec<String> {
    let mut repos: Vec<String> = Vec::new();
    for repo in apps.iter().filter(|app| app.gitops.is_some()).filter_map(|app| app.repo.clone()) {
        if !repos.contains(&repo) {
            repos.push(repo);
        }
    }
    repos
}

/// Reads remote-tracking refs only, so it shows the state of the last fetch.
pub async fn overview(
    workspace: &Path,
    gitops: &Gitops,
    manifest: Manifest,
    jira: &Jira,
    team: &Team,
) -> AppResult<DeployStatus> {
    let app_repos = app_repos(&manifest.apps);
    let repos = std::iter::once(gitops.name().to_string())
        .chain(app_repos.iter().cloned())
        .map(|name| RepoFetch { fetched_at: fetched_at(&workspace.join(&name)), name })
        .collect();
    let mut clusters = Vec::new();
    for env in ENVS {
        clusters.push(gitops.cluster(env).await);
    }

    let mut tasks = JoinSet::new();
    for (index, (name, apps)) in by_repo(&manifest.apps).into_iter().enumerate() {
        let group = manifest.group_label(&apps[0].group);
        let kind = apps[0].kind;
        let units: Vec<String> = apps.iter().filter_map(|app| app.gitops.clone()).collect();
        let repo_dir = apps[0].repo.as_ref().map(|repo| workspace.join(repo));
        let (gitops, clusters) = (gitops.clone(), clusters.clone());
        tasks.spawn(async move {
            let mut envs = Vec::new();
            for (env, cluster) in ENVS.iter().zip(&clusters) {
                let mut deploys = Vec::new();
                for unit in &units {
                    let active = gitops.is_active(cluster, env, unit);
                    deploys.push((unit.clone(), env_deploy(&gitops, env, unit, active).await));
                }
                envs.push(combine(deploys));
            }
            let (waiting_for_test, waiting_for_prod, github) = match &repo_dir {
                Some(dir) => (
                    waiting(dir, "origin/test", "origin/dev").await,
                    waiting(dir, "origin/prod", "origin/test").await,
                    git(dir, &["remote", "get-url", "origin"]).await.and_then(|remote| github_page(&remote)),
                ),
                None => (None, None, None),
            };
            (index, RepoDeploy { name, group, kind, units, envs, waiting_for_test, waiting_for_prod, github })
        });
    }
    let (mut deploys, links) = tokio::join!(tasks.join_all(), links(gitops, &manifest, &clusters));
    deploys.sort_by_key(|(index, _)| *index);
    let releases = releases(workspace, &app_repos, jira, team).await;
    Ok(DeployStatus { repos, deploys: deploys.into_iter().map(|(_, deploy)| deploy).collect(), releases, links })
}

/// GUIs only, the ingress of a backend leads to an API and not to a page.
async fn links(gitops: &Gitops, manifest: &Manifest, clusters: &[String]) -> Vec<GuiLink> {
    let mut links = Vec::new();
    for app in manifest.apps.iter().filter(|app| app.kind == Kind::Frontend) {
        let Some(unit) = &app.gitops else { continue };
        let mut urls = BTreeMap::new();
        for (env, cluster) in ENVS.iter().zip(clusters) {
            if !gitops.is_active(cluster, env, unit) {
                continue;
            }
            if let Some(url) = gitops.start_page(env, unit).await {
                urls.insert(env.to_string(), url);
            }
        }
        links.push(GuiLink {
            id: app.id.clone(),
            label: app.label.clone(),
            group: manifest.group_label(&app.group),
            urls,
        });
    }
    links
}

fn github_page(remote: &str) -> Option<String> {
    let remote = remote.trim();
    let path = remote
        .strip_prefix("git@github.com:")
        .or_else(|| remote.strip_prefix("ssh://git@github.com/"))
        .or_else(|| remote.strip_prefix("https://github.com/"))?;
    Some(format!("https://github.com/{}", path.trim_end_matches(".git")))
}

/// The first host in `preferred_domain`, else the first host at all, like a GUI that has a domain of its own.
fn start_page(ingress: &str, preferred_domain: &str) -> Option<String> {
    let hosts: Vec<&str> =
        INGRESS_HOST.captures_iter(ingress).map(|captures| captures.get(1).unwrap().as_str()).collect();
    let preferred = hosts.iter().find(|host| !preferred_domain.is_empty() && host.ends_with(preferred_domain));
    let host = preferred.or(hosts.first())?;
    Some(format!("https://{host}/"))
}

/// The apps with a gitops unit by repo, in the order of `apps.json`; an app without a repo stands for itself.
fn by_repo(apps: &[AppEntry]) -> Vec<(String, Vec<&AppEntry>)> {
    let mut repos: Vec<(String, Vec<&AppEntry>)> = Vec::new();
    for app in apps.iter().filter(|app| app.gitops.is_some()) {
        let name = app.repo.as_ref().unwrap_or(&app.id);
        match repos.iter_mut().find(|(known, _)| known == name) {
            Some((_, apps)) => apps.push(app),
            None => repos.push((name.clone(), vec![app])),
        }
    }
    repos
}

/// CI tags every unit of a repo with the same build, so the first unit stands for all and the others only show
/// when they differ. `deploys` holds one entry per unit, never none.
fn combine(mut deploys: Vec<(String, EnvDeploy)>) -> EnvDeploy {
    let (_, mut first) = deploys.remove(0);
    first.deviations = deploys
        .into_iter()
        .filter(|(_, deploy)| deploy.tag != first.tag || deploy.active != first.active)
        .map(|(unit, deploy)| Deviation { unit, tag: deploy.tag, active: deploy.active })
        .collect();
    first
}

async fn releases(workspace: &Path, repos: &[String], jira: &Jira, team: &Team) -> Vec<Release> {
    const STAGES: [(&str, &str); 2] = [("dev", "test"), ("test", "prod")];
    let mut tasks = JoinSet::new();
    for (stage, (from, to)) in STAGES.into_iter().enumerate() {
        for (index, name) in repos.iter().cloned().enumerate() {
            let dir = workspace.join(&name);
            tasks.spawn(async move {
                let (base, head) = (format!("origin/{to}"), format!("origin/{from}"));
                let entries = lacking(&dir, &base, &head, Some(MAX_RELEASE_COMMITS)).await.unwrap_or_default();
                let complete = entries.len() < MAX_RELEASE_COMMITS;
                (stage, index, name, pending(entries, complete))
            });
        }
    }
    let mut logs = tasks.join_all().await;
    logs.sort_by_key(|(stage, index, _, _)| (*stage, *index));
    let logs: Vec<(String, Vec<LogEntry>)> = logs.into_iter().map(|(_, _, name, entries)| (name, entries)).collect();
    let (to_test, to_prod) = logs.split_at(repos.len());
    STAGES.into_iter().zip([to_test, to_prod]).map(|((from, to), logs)| release(from, to, logs, jira, team)).collect()
}

/// The commits of `head` that `base` lacks, newest first. `copy` marks one whose patch `base` already has under
/// another sha, like a hotfix of PROD cherry-picked down.
async fn lacking(dir: &Path, base: &str, head: &str, limit: Option<usize>) -> Option<Vec<LogEntry>> {
    let range = format!("{base}...{head}");
    let limit = limit.map(|limit| limit.to_string());
    let mut args = vec!["log", "--cherry-mark", "--right-only", LOG_FORMAT];
    if let Some(limit) = &limit {
        args.extend(["-n", limit.as_str()]);
    }
    args.extend([range.as_str(), "--"]);
    let mut entries = log_entries(&git(dir, &args).await?);
    for entry in entries.iter_mut().filter(|entry| entry.copy) {
        // Git gives every empty commit the same patch id, so a "trigger build" would match any other one.
        entry.copy = git(dir, &["diff-tree", "--quiet", &format!("{}^", entry.sha), &entry.sha]).await.is_none();
    }
    Some(entries)
}

/// Drops the copies, and the merges that bring nothing else: a second pull request of a hotfix branch PROD got
/// first still names the ticket. A parent missing from `entries` is on the base already, unless the log was cut at
/// its limit, so without `complete` every merge stays.
fn pending(entries: Vec<LogEntry>, complete: bool) -> Vec<LogEntry> {
    let by_sha: HashMap<&str, &LogEntry> = entries.iter().map(|entry| (entry.sha.as_str(), entry)).collect();
    let reach = |starts: &[String]| {
        let mut seen = HashSet::new();
        let mut stack: Vec<&str> = starts.iter().map(String::as_str).collect();
        while let Some(sha) = stack.pop() {
            if let Some((&known, entry)) = by_sha.get_key_value(sha)
                && seen.insert(known)
            {
                stack.extend(entry.parents.iter().map(String::as_str));
            }
        }
        seen
    };
    let kept: HashSet<String> = entries
        .iter()
        .filter(|entry| {
            if !entry.merge() {
                return !entry.copy;
            }
            if !complete {
                return true;
            }
            let mainline = reach(&entry.parents[..1]);
            reach(&entry.parents[1..])
                .into_iter()
                .any(|sha| !mainline.contains(sha) && !by_sha[sha].merge() && !by_sha[sha].copy)
        })
        .map(|entry| entry.sha.clone())
        .collect();
    entries.into_iter().filter(|entry| kept.contains(&entry.sha)).collect()
}

/// `logs` holds per repo the commits of `from` that `to` still lacks, newest first as git prints them. The result
/// is newest first too: a ticket by its latest commit, a run of the same subject by its latest one.
fn release(from: &str, to: &str, logs: &[(String, Vec<LogEntry>)], jira: &Jira, team: &Team) -> Release {
    let mut found: Vec<(String, Vec<&LogEntry>, Vec<String>)> = Vec::new();
    let mut untracked: Vec<(i64, Untracked)> = Vec::new();
    for (repo, entries) in logs {
        for entry in entries.iter().rev() {
            let keys = jira.keys(&entry.message);
            if keys.is_empty() && !entry.merge() {
                match untracked.last_mut() {
                    Some((date, last)) if last.repo == *repo && last.subject == entry.subject => {
                        *date = entry.date;
                        last.count += 1;
                    }
                    _ => untracked.push((
                        entry.date,
                        Untracked {
                            repo: repo.clone(),
                            short_sha: entry.short_sha.clone(),
                            subject: entry.subject.clone(),
                            count: 1,
                        },
                    )),
                }
            }
            for key in keys {
                let index = match found.iter().position(|(known, _, _)| *known == key) {
                    Some(index) => index,
                    None => {
                        found.push((key, Vec::new(), Vec::new()));
                        found.len() - 1
                    }
                };
                let (_, mentions, repos) = &mut found[index];
                mentions.push(entry);
                if !repos.contains(repo) {
                    repos.push(repo.clone());
                }
            }
        }
    }
    found.sort_by_key(|(key, mentions, _)| {
        (std::cmp::Reverse(mentions.iter().map(|entry| entry.date).max()), tickets::order(key))
    });
    untracked.sort_by_key(|(date, _)| std::cmp::Reverse(*date));
    Release {
        from: from.to_string(),
        to: to.to_string(),
        tickets: found
            .into_iter()
            .map(|(key, mentions, repos)| ReleaseTicket {
                ticket: jira.ticket(&key),
                summary: summary(&mentions, jira),
                repos,
                authors: authors(&mentions, team),
            })
            .collect(),
        untracked: untracked.into_iter().map(|(_, commit)| commit).collect(),
    }
}

/// The oldest commit names the work, later ones tend to be "fix broken test". `mentions` come oldest first,
/// so of two commits with the same date (a rebase gives a whole branch one) the first one in history wins.
fn summary(mentions: &[&LogEntry], jira: &Jira) -> String {
    let oldest = |merges: bool| mentions.iter().filter(|entry| merges || !entry.merge()).min_by_key(|entry| entry.date);
    oldest(false).or_else(|| oldest(true)).map(|entry| jira.summary(&entry.subject)).unwrap_or_default()
}

/// Whoever merges a pull request need not have written it, so a merge counts only for a ticket that has nothing else.
fn authors(mentions: &[&LogEntry], team: &Team) -> Vec<String> {
    let mut work: Vec<&LogEntry> = mentions.iter().copied().filter(|entry| !entry.merge()).collect();
    if work.is_empty() {
        work = mentions.to_vec();
    }
    work.sort_by_key(|entry| entry.date);
    let mut names: Vec<String> = Vec::new();
    for entry in work {
        let name = team.name(&entry.author, &entry.email);
        if !names.contains(&name) {
            names.push(name);
        }
    }
    names
}

async fn env_deploy(gitops: &Gitops, env: &str, unit: &str, active: bool) -> EnvDeploy {
    let tag_now = gitops.unit_tag(env, unit).await;
    let file = gitops.unit_file(env, unit);
    let since =
        git(&gitops.dir, &["log", "-1", "--first-parent", "--format=%ct", &gitops.cluster_ref(env), "--", &file])
            .await
            .and_then(|seconds| seconds.trim().parse::<i64>().ok())
            .map(|seconds| seconds * 1000);
    let next_tag = match gitops.main_ref_ahead_of(env) {
        Some(main) => gitops.tag_on(&main, &file).await.filter(|next| Some(next) != tag_now.as_ref()),
        None => None,
    };
    EnvDeploy { env: env.to_string(), tag: tag_now, since, active, next_tag, deviations: Vec::new() }
}

async fn waiting(repo: &Path, base: &str, head: &str) -> Option<u32> {
    let entries = lacking(repo, base, head, None).await?;
    entries.iter().filter(|entry| !entry.merge() && !entry.copy).count().try_into().ok()
}

fn tag(kustomization: &str) -> Option<String> {
    NEW_TAG.captures(kustomization).map(|captures| captures[1].to_string())
}

/// A resource line that is not commented out and ends with the folder of the unit, like `- ../../<unit path>`.
fn is_active(cluster: &str, unit_path: &str) -> bool {
    let unit_path = unit_path.trim_matches('/');
    cluster.lines().any(|line| {
        line.trim().strip_prefix('-').is_some_and(|item| {
            let item = item.trim().trim_end_matches('/');
            item == unit_path || item.strip_suffix(unit_path).is_some_and(|rest| rest.ends_with('/'))
        })
    })
}

fn fetched_at(repo: &Path) -> Option<i64> {
    let modified = std::fs::metadata(repo.join(".git").join("FETCH_HEAD")).ok()?.modified().ok()?;
    Some(modified.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as i64)
}

/// Fetches gitops and every app repo in parallel and returns one line per repo that failed.
pub async fn fetch(workspace: &Path, repos: Vec<String>) -> Vec<String> {
    let mut tasks = JoinSet::new();
    for name in repos {
        let dir = workspace.join(&name);
        tasks.spawn(async move {
            let mut command = Command::new("git");
            command
                .arg("-C")
                .arg(&dir)
                .args(["fetch", "--quiet", "--prune", "origin"])
                .envs(paths::child_env().await.iter().map(|(name, value)| (name, value)))
                .env("GIT_TERMINAL_PROMPT", "0")
                .stdin(Stdio::null())
                .kill_on_drop(true);
            match tokio::time::timeout(FETCH_TIMEOUT, command.output()).await {
                Ok(Ok(output)) if output.status.success() => None,
                Ok(Ok(output)) => Some(format!("{name}: {}", String::from_utf8_lossy(&output.stderr).trim())),
                Ok(Err(error)) => Some(format!("{name}: {error}")),
                Err(_) => Some(format!("{name}: keine Antwort nach {} s", FETCH_TIMEOUT.as_secs())),
            }
        });
    }
    let mut failures: Vec<String> = tasks.join_all().await.into_iter().flatten().collect();
    failures.sort();
    failures
}

/// Finds commits by ticket key or text in the message, or by SHA, and says which env branches contain them.
pub async fn search(workspace: &Path, repos: Vec<String>, term: &str, jira: &Jira) -> AppResult<CommitSearch> {
    let term = term.trim().to_string();
    if term.chars().count() < 3 || term.chars().count() > 100 {
        return Err(AppError::Invalid("Suchbegriff mit 3 bis 100 Zeichen eingeben".into()));
    }
    let mut tasks = JoinSet::new();
    for name in repos {
        let (dir, term) = (workspace.join(&name), term.clone());
        tasks.spawn(async move { search_repo(&dir, &name, &term).await });
    }
    let mut found: Vec<Found> = tasks.join_all().await.into_iter().flatten().collect();
    found.sort_by_key(|found| std::cmp::Reverse(found.entry.date));
    let tickets = ticket_hits(&found, &term, jira);
    let hits = found
        .into_iter()
        .map(|Found { repo, entry, on }| CommitHit {
            tickets: jira.keys(&entry.message).iter().map(|key| jira.ticket(key)).collect(),
            repo,
            sha: entry.sha,
            short_sha: entry.short_sha,
            subject: entry.subject,
            author: entry.author,
            date: entry.date,
            on,
        })
        .collect();
    Ok(CommitSearch { hits, tickets })
}

struct Found {
    repo: String,
    entry: LogEntry,
    on: Vec<String>,
}

async fn search_repo(dir: &Path, name: &str, term: &str) -> Vec<Found> {
    let mut branches = Vec::new();
    for env in ENVS {
        let reference = format!("refs/remotes/origin/{env}");
        if git(dir, &["rev-parse", "--verify", "--quiet", &reference]).await.is_some() {
            branches.push(format!("origin/{env}"));
        }
    }
    if branches.is_empty() {
        return Vec::new();
    }

    let mut entries = Vec::new();
    if is_sha(term) {
        entries.extend(
            git(dir, &["log", "-1", LOG_FORMAT, &format!("{term}^{{commit}}"), "--"])
                .await
                .map(|text| log_entries(&text))
                .unwrap_or_default(),
        );
    }
    // Merges stay in: with merge commits only the PR merge may carry the ticket key.
    let grep = format!("--grep={term}");
    let mut args = vec!["log", "-i", "-F", grep.as_str(), LOG_FORMAT, "-n", MAX_HITS_PER_REPO];
    args.extend(branches.iter().map(String::as_str));
    args.push("--");
    entries.extend(git(dir, &args).await.map(|text| log_entries(&text)).unwrap_or_default());

    let mut found: Vec<Found> = Vec::new();
    for entry in entries {
        if found.iter().any(|known| known.entry.sha == entry.sha) {
            continue;
        }
        let containing = git(dir, &["branch", "-r", "--contains", &entry.sha, "--format=%(refname:short)"])
            .await
            .unwrap_or_default();
        let on = ENVS
            .iter()
            .filter(|env| containing.lines().any(|branch| branch.trim() == format!("origin/{env}")))
            .map(|env| env.to_string())
            .collect();
        found.push(Found { repo: name.to_string(), entry, on });
    }
    found
}

/// `found` is newest first, the order the search shows.
fn ticket_hits(found: &[Found], term: &str, jira: &Jira) -> Vec<TicketHit> {
    let term = term.to_uppercase();
    let oldest_first: Vec<(&Found, Vec<String>)> =
        found.iter().rev().map(|found| (found, jira.keys(&found.entry.message))).collect();
    let mut keys: Vec<String> = Vec::new();
    for key in oldest_first.iter().flat_map(|(_, keys)| keys) {
        if key.contains(&term) && !keys.contains(key) {
            keys.push(key.clone());
        }
    }
    keys.sort_by_key(|key| tickets::order(key));
    keys.into_iter()
        .map(|key| {
            let mentions: Vec<&Found> =
                oldest_first.iter().filter(|(_, keys)| keys.contains(&key)).map(|(found, _)| *found).collect();
            let mut repos: Vec<TicketRepo> = Vec::new();
            for found in &mentions {
                let index = match repos.iter().position(|repo| repo.repo == found.repo) {
                    Some(index) => index,
                    None => {
                        let on = ENVS.iter().map(|env| (env.to_string(), 0)).collect();
                        repos.push(TicketRepo { repo: found.repo.clone(), commits: 0, on });
                        repos.len() - 1
                    }
                };
                let repo = &mut repos[index];
                repo.commits += 1;
                for env in &found.on {
                    *repo.on.entry(env.clone()).or_default() += 1;
                }
            }
            repos.sort_by(|a, b| a.repo.cmp(&b.repo));
            let entries: Vec<&LogEntry> = mentions.iter().map(|found| &found.entry).collect();
            TicketHit { ticket: jira.ticket(&key), summary: summary(&entries, jira), repos }
        })
        .collect()
}

fn log_entries(text: &str) -> Vec<LogEntry> {
    text.split('\u{1e}')
        .filter_map(|record| {
            let fields: Vec<&str> = record.splitn(9, '\u{1f}').collect();
            let [mark, sha, short_sha, author, email, date, parents, subject, message] = fields[..] else {
                return None;
            };
            Some(LogEntry {
                sha: sha.to_string(),
                short_sha: short_sha.to_string(),
                author: author.to_string(),
                email: email.to_string(),
                date: date.parse::<i64>().unwrap_or_default() * 1000,
                parents: parents.split_whitespace().map(str::to_string).collect(),
                copy: mark == "=",
                subject: subject.to_string(),
                message: message.trim_end().to_string(),
            })
        })
        .collect()
}

fn is_sha(term: &str) -> bool {
    (7..=40).contains(&term.len()) && term.chars().all(|c| c.is_ascii_hexdigit())
}

async fn git(dir: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .envs(paths::child_env().await.iter().map(|(name, value)| (name, value)))
        .stdin(Stdio::null())
        .output()
        .await
        .ok()?;
    output.status.success().then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_image_tag_whatever_the_indentation() {
        assert_eq!(
            tag("images:\n- name: registry.example.com/orders-api\n  newTag: build-prod-530\n").as_deref(),
            Some("build-prod-530")
        );
        assert_eq!(
            tag("images:\n  - name: registry.example.com/shop-gui\n    newTag: \"build-prod-148\"\n").as_deref(),
            Some("build-prod-148")
        );
        assert_eq!(tag("resources:\n- ../../base/keycloak\n"), None);
    }

    const INGRESS: &str = r#"spec:
  tls:
  - hosts:
    - "shop.dev.example.org"
    - "shop.dev.example.com"
  rules:
  - host: "shop.dev.example.org"
  - host: "shop.dev.example.com"
  - host: "admin.dev.example.com"
"#;

    #[test]
    fn links_the_first_host_of_the_preferred_domain() {
        assert_eq!(start_page(INGRESS, ".example.com").as_deref(), Some("https://shop.dev.example.com/"));
    }

    #[test]
    fn falls_back_to_the_first_host_without_one_of_the_preferred_domain() {
        let ingress = "rules:\n  - host: dev.example.net\n  - host: 'eu.dev.example.net'\n";
        assert_eq!(start_page(ingress, ".example.com").as_deref(), Some("https://dev.example.net/"));
        assert_eq!(start_page(INGRESS, "").as_deref(), Some("https://shop.dev.example.org/"));
    }

    #[test]
    fn links_the_github_page_whether_cloned_by_ssh_or_https() {
        let page = Some("https://github.com/example-org/orders-api".to_string());
        assert_eq!(github_page("git@github.com:example-org/orders-api.git\n"), page);
        assert_eq!(github_page("ssh://git@github.com/example-org/orders-api.git"), page);
        assert_eq!(github_page("https://github.com/example-org/orders-api"), page);
        assert_eq!(github_page("git@gitlab.com:example-org/orders-api.git"), None);
    }

    #[test]
    fn has_no_start_page_without_a_rule() {
        assert_eq!(start_page("spec:\n  tls:\n  - hosts:\n    - \"x.example.com\"\n", ".example.com"), None);
    }

    #[test]
    fn counts_a_unit_as_active_only_when_it_is_not_commented_out() {
        let cluster =
            "resources:\n  - ../../deploy/overlays/prod/orders-api\n#  - ../../deploy/overlays/prod/shop-gui\n";
        assert!(is_active(cluster, "deploy/overlays/prod/orders-api"));
        assert!(!is_active(cluster, "deploy/overlays/prod/shop-gui"));
        assert!(!is_active(cluster, "deploy/overlays/prod/api"));
        assert!(is_active(cluster, "orders-api"));
        assert!(!is_active(cluster, "api"));
    }

    fn gitops_config(preferred_domain: &str) -> GitopsConfig {
        serde_json::from_value(serde_json::json!({
            "repo": "gitops",
            "mainBranch": "main",
            "branches": { "dev": "main", "test": "main", "prod": "prod" },
            "cluster": "clusters/{env}/kustomization.yaml",
            "unit": "deploy/overlays/{env}/{unit}",
            "ingress": "deploy/overlays/{env}/{unit}/ingress.yaml",
            "preferredDomain": preferred_domain
        }))
        .unwrap()
    }

    #[test]
    fn reads_an_env_without_a_branch_of_its_own_from_the_main_branch() {
        let mut config = gitops_config("");
        config.branches.remove("dev");
        let gitops = Gitops { dir: PathBuf::new(), config };

        assert_eq!(gitops.cluster_ref("dev"), "origin/main");
        assert_eq!(gitops.cluster_ref("prod"), "origin/prod");
        assert_eq!(gitops.main_ref_ahead_of("test"), None);
        assert_eq!(gitops.main_ref_ahead_of("prod").as_deref(), Some("origin/main"));
        assert_eq!(gitops.unit_file("prod", "shop-gui"), "deploy/overlays/prod/shop-gui/kustomization.yaml");
    }

    #[test]
    fn counts_gitops_as_found_only_as_a_git_checkout() {
        let workspace = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(workspace.path().join("gitops")).unwrap();
        let error = gitops_config("").open(workspace.path()).unwrap_err().to_string();
        assert!(error.starts_with("Kein Git-Checkout unter ") && error.contains("git/gitops.json"), "{error}");
        let missing = GitopsConfig::load(workspace.path()).unwrap_err().to_string();
        assert!(missing.starts_with("git/gitops.json fehlt im Datenordner"), "{missing}");
    }

    #[tokio::test]
    async fn reads_tag_state_and_start_page_of_a_unit_by_the_layout_of_gitops_json() {
        let workspace = tempfile::tempdir().unwrap();
        let repo = workspace.path().join("gitops");
        std::fs::create_dir_all(&repo).unwrap();
        let write = |file: &str, text: &str| {
            let path = repo.join(file);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, text).unwrap();
        };
        let kustomization = |tag: &str| format!("images:\n- name: registry.example.com/shop-gui\n  newTag: {tag}\n");
        git_in(&repo, &["init", "-q", "-b", "main"]);
        for env in ENVS {
            let unit = format!("deploy/overlays/{env}/shop-gui");
            write(&format!("clusters/{env}/kustomization.yaml"), &format!("resources:\n  - ../../{unit}\n"));
            write(&format!("{unit}/kustomization.yaml"), &kustomization(&format!("build-{env}-1")));
            let hosts = format!("rules:\n  - host: shop.{env}.example.org\n  - host: shop.{env}.example.com\n");
            write(&format!("{unit}/ingress.yaml"), &hosts);
        }
        git_in(&repo, &["add", "."]);
        git_in(&repo, &["commit", "-q", "-m", "units"]);
        git_in(&repo, &["update-ref", "refs/remotes/origin/prod", "HEAD"]);
        write("deploy/overlays/prod/shop-gui/kustomization.yaml", &kustomization("build-prod-2"));
        git_in(&repo, &["commit", "-q", "-am", "ci: build-prod-2"]);
        git_in(&repo, &["update-ref", "refs/remotes/origin/main", "HEAD"]);

        let gitops = gitops_config(".example.com").open(workspace.path()).unwrap();
        let prod = env_deploy(&gitops, "prod", "shop-gui", true).await;
        let dev = env_deploy(&gitops, "dev", "shop-gui", true).await;

        assert_eq!((prod.tag.as_deref(), prod.next_tag.as_deref()), (Some("build-prod-1"), Some("build-prod-2")));
        assert_eq!((dev.tag.as_deref(), dev.next_tag), (Some("build-dev-1"), None));
        assert!(prod.since.is_some());
        assert!(gitops.is_active(&gitops.cluster("prod").await, "prod", "shop-gui"));
        assert_eq!(gitops.start_page("test", "shop-gui").await.as_deref(), Some("https://shop.test.example.com/"));
    }

    #[test]
    fn puts_the_apps_of_one_repo_into_one_entry_in_manifest_order() {
        let apps: Vec<AppEntry> = serde_json::from_str(
            r#"[
                { "id": "orders-api", "label": "orders-api", "group": "core", "kind": "backend", "repo": "orders-api", "gitops": "orders-api" },
                { "id": "shop", "label": "Shop", "group": "core", "kind": "frontend", "repo": "shop-gui", "gitops": "shop-gui" },
                { "id": "postgres", "label": "Postgres", "group": "infra", "kind": "infra" },
                { "id": "admin", "label": "Admin", "group": "core", "kind": "frontend", "repo": "shop-gui", "gitops": "admin-gui" },
                { "id": "keycloak", "label": "Keycloak", "group": "infra", "kind": "infra", "gitops": "keycloak" }
            ]"#,
        )
        .unwrap();

        let grouped = by_repo(&apps);
        let repos: Vec<(&str, Vec<&str>)> = grouped
            .iter()
            .map(|(name, apps)| (name.as_str(), apps.iter().map(|app| app.id.as_str()).collect()))
            .collect();

        assert_eq!(
            repos,
            vec![
                ("orders-api", vec!["orders-api"]),
                ("shop-gui", vec!["shop", "admin"]),
                ("keycloak", vec!["keycloak"])
            ]
        );
    }

    #[test]
    fn shows_one_tag_per_repo_and_names_only_the_units_that_differ() {
        let deploy = |tag: &str, active: bool| EnvDeploy {
            env: "prod".into(),
            tag: Some(tag.into()),
            since: None,
            active,
            next_tag: None,
            deviations: Vec::new(),
        };

        let combined = combine(vec![
            ("shop-gui".into(), deploy("build-prod-1504", true)),
            ("admin-gui".into(), deploy("build-prod-1504", true)),
            ("preview-gui".into(), deploy("build-prod-1503", true)),
            ("extraction-gui".into(), deploy("build-prod-1504", false)),
        ]);

        assert_eq!(combined.tag.as_deref(), Some("build-prod-1504"));
        assert_eq!(
            combined.deviations,
            vec![
                Deviation { unit: "preview-gui".into(), tag: Some("build-prod-1503".into()), active: true },
                Deviation { unit: "extraction-gui".into(), tag: Some("build-prod-1504".into()), active: false },
            ]
        );
    }

    #[test]
    fn treats_only_hex_strings_of_commit_length_as_sha() {
        assert!(is_sha("37e3ea96"));
        assert!(!is_sha("SHOP-316"));
        assert!(!is_sha("abc"));
    }

    fn jira() -> Jira {
        Jira::new("https://example.atlassian.net", &["SHOP".into(), "OPS".into()])
    }

    fn team() -> Team {
        Team::new(HashMap::from([
            ("Maria".into(), vec!["m.muster@example.com".into()]),
            ("Robert".into(), vec!["r.beispiel@example.com".into()]),
        ]))
    }

    fn entry(sha: &str, message: &str, date: i64) -> LogEntry {
        LogEntry {
            sha: sha.into(),
            short_sha: sha.into(),
            author: "Max".into(),
            email: "max@example.com".into(),
            date,
            parents: Vec::new(),
            copy: false,
            subject: message.lines().next().unwrap_or_default().into(),
            message: message.into(),
        }
    }

    fn git_in(dir: &Path, args: &[&str]) -> String {
        let output = std::process::Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(["-c", "user.name=Max", "-c", "user.email=max@example.com", "-c", "commit.gpgsign=false"])
            .args(args)
            .env("GIT_AUTHOR_DATE", "2026-10-01T10:00:00")
            .env("GIT_COMMITTER_DATE", "2026-10-01T10:00:00")
            .output()
            .unwrap();
        assert!(output.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&output.stderr));
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    #[tokio::test]
    async fn lists_by_ticket_what_the_next_branch_still_lacks() {
        let workspace = std::env::temp_dir().join(format!("base-release-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&workspace);
        let repo = workspace.join("shop-gui");
        std::fs::create_dir_all(&repo).unwrap();
        let commit = |message: &str| git_in(&repo, &["commit", "-q", "--allow-empty", "-m", message]);
        let point = |env: &str| git_in(&repo, &["update-ref", &format!("refs/remotes/origin/{env}"), "HEAD"]);

        git_in(&repo, &["init", "-q", "-b", "main"]);
        commit("init");
        point("prod");
        commit("feat(OPS-2): on test already");
        point("test");
        git_in(&repo, &["checkout", "-q", "-b", "feature"]);
        commit("wip");
        git_in(&repo, &["checkout", "-q", "main"]);
        commit("feat(SHOP-9): checkout\n\nwith a body\nover two lines");
        commit("fix(SHOP-9): fix broken test");
        commit("chore: bump deps");
        git_in(
            &repo,
            &["merge", "-q", "--no-ff", "feature", "-m", "Merge pull request #5 from example-org/feature/SHOP-10-x"],
        );
        point("dev");

        let releases = releases(&workspace, &["shop-gui".into()], &jira(), &team()).await;

        let to_test = &releases[0];
        assert_eq!((to_test.from.as_str(), to_test.to.as_str()), ("dev", "test"));
        let tickets: Vec<(&str, &str)> =
            to_test.tickets.iter().map(|t| (t.ticket.key.as_str(), t.summary.as_str())).collect();
        assert_eq!(
            tickets,
            vec![("SHOP-9", "checkout"), ("SHOP-10", "Merge pull request #5 from example-org/feature/SHOP-10-x")]
        );
        assert_eq!(to_test.tickets[0].repos, vec!["shop-gui"]);
        assert_eq!(to_test.tickets[0].authors, vec!["Max"]);
        let mut untracked: Vec<&str> = to_test.untracked.iter().map(|commit| commit.subject.as_str()).collect();
        untracked.sort();
        assert_eq!(untracked, vec!["chore: bump deps", "wip"]);

        let to_prod = &releases[1];
        assert_eq!(to_prod.tickets.iter().map(|t| t.ticket.key.as_str()).collect::<Vec<_>>(), vec!["OPS-2"]);
        assert!(to_prod.untracked.is_empty());
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[tokio::test]
    async fn leaves_out_a_hotfix_of_prod_that_reached_test_under_another_sha() {
        let workspace = std::env::temp_dir().join(format!("base-hotfix-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&workspace);
        let repo = workspace.join("shop-gui");
        std::fs::create_dir_all(&repo).unwrap();
        let commit = |message: &str| git_in(&repo, &["commit", "-q", "--allow-empty", "-m", message]);
        let change = |file: &str, message: &str| {
            std::fs::write(repo.join(file), message).unwrap();
            git_in(&repo, &["add", file]);
            commit(message);
        };
        let merge = |branch: &str, message: &str| git_in(&repo, &["merge", "-q", "--no-ff", branch, "-m", message]);

        git_in(&repo, &["init", "-q", "-b", "test"]);
        commit("init");
        git_in(&repo, &["branch", "prod"]);
        commit("feat(OPS-2): empty like a build trigger");
        change("a.txt", "feat(OPS-3): still waiting");
        git_in(&repo, &["checkout", "-q", "-b", "hotfix/OPS-1", "prod"]);
        change("b.txt", "fix(OPS-1): cherry-picked down");
        git_in(&repo, &["checkout", "-q", "-b", "hotfix/OPS-5", "prod"]);
        change("c.txt", "fix: merged down by a second pull request");
        git_in(&repo, &["checkout", "-q", "prod"]);
        merge("hotfix/OPS-1", "Merge pull request #7 from example-org/hotfix/OPS-1");
        merge("hotfix/OPS-5", "Merge pull request #8 from example-org/hotfix/OPS-5");
        commit("trigger build #no-check");
        git_in(&repo, &["checkout", "-q", "test"]);
        git_in(&repo, &["cherry-pick", "hotfix/OPS-1"]);
        merge("hotfix/OPS-5", "Merge pull request #9 from example-org/hotfix/OPS-5");
        for (env, branch) in [("dev", "test"), ("test", "test"), ("prod", "prod")] {
            git_in(&repo, &["update-ref", &format!("refs/remotes/origin/{env}"), branch]);
        }

        let releases = releases(&workspace, &["shop-gui".into()], &jira(), &team()).await;

        let to_prod = &releases[1];
        let mut keys: Vec<&str> = to_prod.tickets.iter().map(|t| t.ticket.key.as_str()).collect();
        keys.sort();
        assert_eq!(keys, vec!["OPS-2", "OPS-3"]);
        assert!(to_prod.untracked.is_empty());
        assert_eq!(waiting(&repo, "origin/prod", "origin/test").await, Some(2));
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn folds_the_commits_without_ticket_that_follow_each_other_in_the_list() {
        let newest_first = vec![
            entry("e", "time tracking #no-check", 5),
            entry("d", "wip", 4),
            entry("c", "time tracking #no-check", 3),
            entry("b", "feat(OPS-1): not in the list", 2),
            entry("a", "time tracking #no-check", 1),
        ];

        let release = release("test", "prod", &[("admin-gui".into(), newest_first)], &jira(), &team());

        let lines: Vec<(&str, &str, u32)> =
            release.untracked.iter().map(|c| (c.short_sha.as_str(), c.subject.as_str(), c.count)).collect();
        assert_eq!(
            lines,
            vec![("e", "time tracking #no-check", 1), ("d", "wip", 1), ("a", "time tracking #no-check", 2)]
        );
    }

    #[test]
    fn names_who_wrote_a_ticket_and_who_merged_it_only_when_nothing_else_names_it() {
        let by = |mut entry: LogEntry, email: &str, parents: &[&str]| {
            entry.email = email.into();
            entry.parents = parents.iter().map(|parent| parent.to_string()).collect();
            entry
        };
        let newest_first = vec![
            by(
                entry("e", "Merge pull request #6 from example-org/feature/SHOP-10-x", 5),
                "R.Beispiel@example.com",
                &["d", "x"],
            ),
            by(
                entry("d", "Merge pull request #5 from example-org/feature/SHOP-9", 4),
                "r.beispiel@example.com",
                &["a", "c"],
            ),
            by(entry("c", "fix(SHOP-9): fix broken test", 3), "m.muster@example.com", &["b"]),
            by(entry("b", "feat(SHOP-9): checkout", 2), "max@example.com", &["a"]),
            by(entry("a", "fix(SHOP-9): typo", 1), "m.muster@example.com", &[]),
        ];

        let release = release("dev", "test", &[("shop-gui".into(), newest_first)], &jira(), &team());

        let authors: Vec<(&str, &Vec<String>)> =
            release.tickets.iter().map(|t| (t.ticket.key.as_str(), &t.authors)).collect();
        assert_eq!(
            authors,
            vec![("SHOP-10", &vec!["Robert".to_string()]), ("SHOP-9", &vec!["Maria".to_string(), "Max".into()])]
        );
    }

    #[test]
    fn keeps_every_merge_when_the_log_was_cut_at_its_limit() {
        let log = || {
            let mut merge = entry("m", "Merge pull request #8 from example-org/hotfix/OPS-5", 0);
            merge.parents = vec!["mainline".into(), "beyond-the-limit".into()];
            vec![merge]
        };
        assert!(pending(log(), true).is_empty());
        assert_eq!(pending(log(), false).len(), 1);
    }

    #[test]
    fn groups_the_hits_of_a_searched_ticket_by_repo_and_env() {
        let found = vec![
            Found {
                repo: "shop-gui".into(),
                entry: entry("c", "fix(SHOP-9): broken test", 3000),
                on: vec!["dev".into()],
            },
            Found {
                repo: "orders-api".into(),
                entry: entry("b", "feat(SHOP-9): checkout api", 2000),
                on: vec!["dev".into(), "test".into()],
            },
            Found {
                repo: "shop-gui".into(),
                entry: entry("a", "feat(SHOP-9): checkout\n\nsee OPS-1", 1000),
                on: vec!["dev".into(), "test".into()],
            },
        ];

        let tickets = ticket_hits(&found, "shop-9", &jira());

        assert_eq!(tickets.len(), 1, "OPS-1 was not searched for, so its commits may be incomplete");
        assert_eq!(tickets[0].summary, "checkout");
        let on = |dev, test, prod| BTreeMap::from([("dev".into(), dev), ("test".into(), test), ("prod".into(), prod)]);
        assert_eq!(
            tickets[0].repos,
            vec![
                TicketRepo { repo: "orders-api".into(), commits: 1, on: on(1, 1, 0) },
                TicketRepo { repo: "shop-gui".into(), commits: 2, on: on(2, 1, 0) },
            ]
        );
    }

    fn workspace() -> PathBuf {
        crate::settings::Settings::load(&paths::root()).unwrap().workspace_dir().unwrap().to_path_buf()
    }

    #[tokio::test]
    #[ignore = "needs the gitops checkout in the workspace and the config of the data folder"]
    async fn reads_tags_of_the_real_gitops_checkout() {
        let root = paths::root();
        let manifest = crate::landscape::manifest(&root).unwrap();
        let backends: Vec<String> =
            manifest.apps.iter().filter(|app| app.kind != Kind::Frontend).map(|app| app.id.clone()).collect();
        let gitops = GitopsConfig::load(&root).unwrap().open(&workspace()).unwrap();
        let (jira, team) = (Jira::load(&root).unwrap(), Team::load(&root).unwrap());

        let overview = overview(&workspace(), &gitops, manifest, &jira, &team).await.unwrap();

        let tagged = |deploy: &RepoDeploy| deploy.envs.iter().all(|env| env.tag.is_some());
        assert!(overview.deploys.iter().any(tagged), "{:#?}", overview.deploys);
        assert_eq!(overview.releases.len(), 2);
        assert!(overview.links.iter().all(|link| !backends.contains(&link.id)), "backends have no link");
    }

    #[tokio::test]
    #[ignore = "needs a fetched checkout of the first app repo in the workspace and the config of the data folder"]
    async fn finds_the_newest_commit_of_prod_by_sha() {
        let root = paths::root();
        let repo = app_repos(&crate::landscape::manifest(&root).unwrap().apps).remove(0);
        let sha = git(&workspace().join(&repo), &["rev-parse", "--short=10", "origin/prod"]).await.unwrap();

        let search = search(&workspace(), vec![repo], sha.trim(), &Jira::load(&root).unwrap()).await.unwrap();

        assert!(search.hits[0].on.contains(&"prod".to_string()), "{:?}", search.hits[0].on);
    }
}
