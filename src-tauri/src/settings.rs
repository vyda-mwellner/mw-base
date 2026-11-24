//! `einstellungen/pfade.json`, read on every call that needs it, so an edit takes effect without a restart.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::deploy::GitopsConfig;
use crate::error::{AppError, AppResult};
use crate::kube::Kubeconfigs;
use crate::team::Team;
use crate::tickets::Jira;
use crate::{cluster, config, connections, landscape, queries};

const DEFAULT_KUBECONFIG_FILE: &str = "{env}.yaml";

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct SettingsFile {
    workspace_dir: String,
    kubeconfig_dir: String,
    kubeconfig_file: String,
    local_setup_dir: String,
    greenmail_url: String,
    vault_dir: String,
}

pub struct Settings {
    workspace_dir: Option<PathBuf>,
    local_setup_dir: Option<PathBuf>,
    greenmail_url: Option<String>,
    vault_dir: Option<PathBuf>,
    kubeconfigs: Kubeconfigs,
    file: PathBuf,
}

impl Settings {
    /// Without the file the kubeconfigs are still looked for in `~/.kube`, only the workspace is unknown.
    pub fn load(root: &Path) -> AppResult<Settings> {
        let file = root.join(config::SETTINGS);
        let values: SettingsFile =
            if file.exists() { config::parse(root, config::SETTINGS)? } else { Default::default() };
        let kubeconfig_file = match values.kubeconfig_file.trim() {
            "" => DEFAULT_KUBECONFIG_FILE.to_string(),
            named if named.contains("{env}") => named.to_string(),
            _ => {
                return Err(AppError::Invalid(format!(
                    "{} im Datenordner: \"kubeconfigFile\" braucht {{env}}, etwa \"{DEFAULT_KUBECONFIG_FILE}\"",
                    config::SETTINGS
                )));
            }
        };
        Ok(Settings {
            workspace_dir: configured_dir(&values.workspace_dir),
            local_setup_dir: configured_dir(&values.local_setup_dir),
            greenmail_url: Some(values.greenmail_url.trim().trim_end_matches('/').to_string())
                .filter(|url| !url.is_empty()),
            vault_dir: configured_dir(&values.vault_dir),
            kubeconfigs: Kubeconfigs {
                dir: configured_dir(&values.kubeconfig_dir).or_else(|| configured_dir("~/.kube")).unwrap_or_default(),
                file: kubeconfig_file,
            },
            file,
        })
    }

    pub fn workspace_dir(&self) -> AppResult<&Path> {
        self.workspace_dir.as_deref().ok_or_else(|| {
            AppError::Invalid(format!(
                "Kein Workspace eingetragen - in {} \"workspaceDir\" auf den Ordner mit gitops und den App-Repos setzen",
                self.file.display()
            ))
        })
    }

    pub fn kubeconfigs(&self) -> &Kubeconfigs {
        &self.kubeconfigs
    }

    /// The API of the local Greenmail, where the apps send their mail.
    pub fn greenmail_url(&self) -> AppResult<&str> {
        self.greenmail_url.as_deref().ok_or_else(|| {
            AppError::Invalid(format!(
                "Kein Greenmail eingetragen - in {} \"greenmailUrl\" setzen, etwa \"http://localhost:8080\"",
                self.file.display()
            ))
        })
    }

    /// The knowledge vault, found once it has the `INDEX.md` the vault skill keeps.
    pub fn vault_dir(&self) -> AppResult<PathBuf> {
        match &self.vault_dir {
            Some(dir) if crate::notes::is_vault(dir) => Ok(dir.clone()),
            Some(dir) => Err(AppError::Invalid(format!("Kein Vault unter {} - dort fehlt INDEX.md", dir.display()))),
            None => Err(AppError::Invalid(format!(
                "Kein Vault eingetragen - in {} \"vaultDir\" auf den Ordner mit INDEX.md setzen",
                self.file.display()
            ))),
        }
    }

    /// `localSetupDir`, or `local-setup` in the workspace; found once it has a `setup.sh` or `setup.ps1`.
    pub fn local_setup_dir(&self) -> AppResult<PathBuf> {
        let dir = match &self.local_setup_dir {
            Some(dir) => dir.clone(),
            None => self.workspace_dir()?.join("local-setup"),
        };
        if ["setup.sh", "setup.ps1"].iter().any(|script| dir.join(script).is_file()) {
            return Ok(dir);
        }
        Err(AppError::Invalid(format!(
            "Kein local-setup unter {} - in {} \"localSetupDir\" auf den Ordner mit setup.sh setzen",
            dir.display(),
            self.file.display()
        )))
    }
}

fn configured_dir(value: &str) -> Option<PathBuf> {
    let configured = value.trim();
    if configured.is_empty() {
        return None;
    }
    Some(match (configured.strip_prefix("~/"), std::env::var_os("HOME")) {
        (Some(rest), Some(home)) => PathBuf::from(home).join(rest),
        _ => PathBuf::from(configured),
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagesInfo {
    /// Empty while `workspaceDir` is not set.
    pub workspace_dir: String,
    /// The gitops checkout or a repo of `apps.json` is there.
    pub workspace_found: bool,
    pub gitops_found: bool,
    pub kubeconfig_dir: String,
    /// The envs with a kubeconfig in `kubeconfig_dir`.
    pub kubeconfig_envs: Vec<String>,
    /// Empty while there is no local-setup with a `setup.sh`.
    pub local_setup_dir: String,
    /// Empty while `greenmailUrl` is not set.
    pub greenmail_url: String,
    /// Empty while there is no vault with an `INDEX.md`.
    pub vault_dir: String,
    /// One line per config file of the data folder that is missing or cannot be read.
    pub config_errors: Vec<String>,
}

pub fn stages_info(root: &Path) -> StagesInfo {
    let mut errors = Vec::new();
    let settings = noted(Settings::load(root), &mut errors);
    let workspace =
        settings.as_ref().and_then(|settings| noted(settings.workspace_dir().map(Path::to_path_buf), &mut errors));
    noted(connections::load_all(root), &mut errors);
    noted(cluster::forward_targets(root), &mut errors);
    noted(queries::load_all(root), &mut errors);
    noted(Jira::load(root), &mut errors);
    noted(Team::load(root), &mut errors);
    let gitops = noted(GitopsConfig::load(root), &mut errors);
    let apps = noted(landscape::manifest(root), &mut errors).map(|manifest| manifest.apps).unwrap_or_default();

    let gitops_found = workspace.as_deref().zip(gitops).is_some_and(|(dir, gitops)| gitops.open(dir).is_ok());
    let has_app_repo = |dir: &Path| apps.iter().filter_map(|app| app.repo.as_ref()).any(|repo| dir.join(repo).is_dir());
    let local_setup_dir = settings.as_ref().and_then(|settings| settings.local_setup_dir().ok());
    let greenmail_url = settings.as_ref().and_then(|settings| settings.greenmail_url.clone()).unwrap_or_default();
    let vault_dir = settings.as_ref().and_then(|settings| settings.vault_dir().ok());
    let kubeconfigs = settings.map(|settings| settings.kubeconfigs);
    StagesInfo {
        workspace_found: gitops_found || workspace.as_deref().is_some_and(has_app_repo),
        gitops_found,
        workspace_dir: workspace.map(|dir| dir.display().to_string()).unwrap_or_default(),
        kubeconfig_envs: kubeconfigs
            .as_ref()
            .map(|kubeconfigs| kubeconfigs.envs().into_iter().map(String::from).collect())
            .unwrap_or_default(),
        kubeconfig_dir: kubeconfigs.map(|kubeconfigs| kubeconfigs.dir.display().to_string()).unwrap_or_default(),
        local_setup_dir: local_setup_dir.map(|dir| dir.display().to_string()).unwrap_or_default(),
        greenmail_url,
        vault_dir: vault_dir.map(|dir| dir.display().to_string()).unwrap_or_default(),
        config_errors: errors,
    }
}

fn noted<T>(result: AppResult<T>, errors: &mut Vec<String>) -> Option<T> {
    result.map_err(|error| errors.push(error.to_string())).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(root: &Path, relative: &str, content: &str) {
        let file = root.join(relative);
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(file, content).unwrap();
    }

    #[test]
    fn expands_the_home_directory_and_falls_back_to_the_kube_folder() {
        let dir = tempfile::tempdir().unwrap();
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        write(dir.path(), config::SETTINGS, r#"{ "workspaceDir": "~/Dev/workspace", "kubeconfigDir": " " }"#);

        let settings = Settings::load(dir.path()).unwrap();
        assert_eq!(settings.workspace_dir().unwrap(), home.join("Dev/workspace"));
        assert_eq!(settings.kubeconfigs().of("dev"), home.join(".kube/dev.yaml"));
    }

    #[test]
    fn names_the_kubeconfigs_by_the_configured_file() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), config::SETTINGS, r#"{ "kubeconfigDir": "/k", "kubeconfigFile": "cluster-{env}.yaml" }"#);
        let settings = Settings::load(dir.path()).unwrap();
        assert_eq!(settings.kubeconfigs().of("prod"), PathBuf::from("/k/cluster-prod.yaml"));

        write(dir.path(), config::SETTINGS, r#"{ "kubeconfigFile": "cluster.yaml" }"#);
        let error = Settings::load(dir.path()).err().unwrap().to_string();
        assert!(error.contains("\"kubeconfigFile\" braucht {env}"), "{error}");
    }

    #[test]
    fn asks_for_the_workspace_in_the_settings_file() {
        let dir = tempfile::tempdir().unwrap();
        let error = Settings::load(dir.path()).unwrap().workspace_dir().unwrap_err().to_string();
        assert!(error.starts_with("Kein Workspace eingetragen"), "{error}");
        assert!(error.contains(&dir.path().join("einstellungen/pfade.json").display().to_string()), "{error}");
    }

    #[test]
    fn lists_every_missing_config_file() {
        let dir = tempfile::tempdir().unwrap();
        let info = stages_info(dir.path());

        assert!(!info.workspace_found && !info.gitops_found && info.workspace_dir.is_empty());
        let named = |relative: &str| info.config_errors.iter().any(|error| error.contains(relative));
        for relative in [
            "einstellungen/pfade.json",
            "stages/verbindungen.json",
            "stages/forwards.json",
            "stages/abfragen",
            "git/jira.json",
            "git/team.json",
            "git/gitops.json",
            "landschaft/apps.json",
        ] {
            assert!(named(relative), "{relative} missing in {:?}", info.config_errors);
        }
        assert_eq!(info.config_errors.len(), 8);
    }

    #[test]
    fn finds_the_workspace_and_its_kubeconfigs_once_everything_is_in_place() {
        let dir = tempfile::tempdir().unwrap();
        let (root, workspace, kube) = (dir.path().join("daten"), dir.path().join("ws"), dir.path().join("kube"));
        std::fs::create_dir_all(workspace.join("deployments/.git")).unwrap();
        write(&kube, "dev.yaml", "");
        write(&kube, "prod.yaml", "");
        let settings =
            format!(r#"{{ "workspaceDir": "{}", "kubeconfigDir": "{}" }}"#, workspace.display(), kube.display());
        write(&root, config::SETTINGS, &settings);
        write(&root, config::CONNECTIONS, r#"{ "connections": [] }"#);
        write(&root, config::FORWARDS, r#"{ "forwards": [] }"#);
        std::fs::create_dir_all(root.join(config::QUERIES)).unwrap();
        write(&root, config::JIRA, r#"{ "baseUrl": "https://example.atlassian.net", "projects": ["SHOP"] }"#);
        write(&root, config::TEAM, "{}");
        write(
            &root,
            config::GITOPS,
            r#"{ "repo": "deployments", "mainBranch": "main", "branches": { "prod": "prod" },
                 "cluster": "clusters/{env}.yaml", "unit": "apps/{env}/{unit}", "ingress": "apps/{env}/{unit}/ingress.yaml" }"#,
        );
        write(&root, config::APPS, r#"{ "groups": [], "apps": [] }"#);

        let info = stages_info(&root);

        assert!(info.config_errors.is_empty(), "{:?}", info.config_errors);
        assert!(info.workspace_found && info.gitops_found);
        assert_eq!(info.workspace_dir, workspace.display().to_string());
        assert_eq!(info.kubeconfig_envs, ["dev", "prod"]);
    }

    #[test]
    fn reports_a_broken_settings_file_instead_of_guessing() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), config::SETTINGS, "{ kaputt");
        assert!(Settings::load(dir.path()).is_err());
        let info = stages_info(dir.path());
        assert!(info.config_errors[0].starts_with("einstellungen/pfade.json im Datenordner ist fehlerhaft"));
    }
}
