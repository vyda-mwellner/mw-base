use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;

pub type StoreResult<T> = Result<T, String>;

#[derive(Debug, Serialize)]
pub struct Doc {
    pub name: String,
    pub content: String,
}

/// What the shell reads as config or keeps for itself: the webview may read it, but a write could redefine
/// what a stage or a connection id points at, or which process group a dev server is.
const CONFIG_FOLDERS: [&str; 5] = ["stages", "git", "landschaft", "einstellungen", "werkstatt"];

/// JSON documents under one data folder. The frontend only ever names paths relative to it.
pub struct Store {
    root: PathBuf,
}

impl Store {
    pub fn at(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// Besides JSON an `.svg`, such as the logo in `einstellungen/`, put there by hand: it is never written.
    pub fn read(&self, path: &str) -> StoreResult<Option<String>> {
        let file = if path.ends_with(".svg") { self.dir(path)? } else { self.file(path)? };
        match fs::read_to_string(&file) {
            Ok(content) => Ok(Some(content)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(format!("{path} nicht lesbar: {error}")),
        }
    }

    /// Every `.json` file directly in `dir`, sorted by name. A missing folder is an empty one.
    pub fn read_dir(&self, dir: &str) -> StoreResult<Vec<Doc>> {
        let folder = self.dir(dir)?;
        let entries = match fs::read_dir(&folder) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(format!("{dir} nicht lesbar: {error}")),
        };
        let mut docs = Vec::new();
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || !name.ends_with(".json") || !entry.path().is_file() {
                continue;
            }
            let content = fs::read_to_string(entry.path()).map_err(|e| format!("{dir}/{name} nicht lesbar: {e}"))?;
            docs.push(Doc { name, content });
        }
        docs.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(docs)
    }

    /// Rejects anything that is not JSON, so a bug in the frontend cannot leave a broken file behind.
    /// Written beside the target and renamed over it - a crash mid-write keeps the old version.
    /// The version it replaces stays as hidden `.name.json.bak`, one step back after a wrong save.
    pub fn write(&self, path: &str, content: &str) -> StoreResult<()> {
        serde_json::from_str::<serde::de::IgnoredAny>(content)
            .map_err(|e| format!("{path}: kein gültiges JSON ({e})"))?;
        let file = self.writable(path)?;
        let parent = file.parent().ok_or_else(|| format!("{path}: kein Ordner"))?;
        fs::create_dir_all(parent).map_err(|e| format!("{path}: Ordner nicht anlegbar ({e})"))?;
        let name = file.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let temp = parent.join(format!(".{name}.tmp"));
        fs::write(&temp, content).map_err(|e| format!("{path} nicht schreibbar: {e}"))?;
        if file.is_file() {
            fs::copy(&file, parent.join(format!(".{name}.bak")))
                .map_err(|e| format!("{path}: keine Sicherung ({e})"))?;
        }
        fs::rename(&temp, &file).map_err(|e| format!("{path} nicht schreibbar: {e}"))
    }

    pub fn remove(&self, path: &str) -> StoreResult<()> {
        let file = self.writable(path)?;
        match fs::remove_file(&file) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("{path} nicht löschbar: {error}")),
        }
    }

    fn writable(&self, path: &str) -> StoreResult<PathBuf> {
        let file = self.file(path)?;
        let top = path.split('/').next().unwrap_or_default();
        if CONFIG_FOLDERS.contains(&top) {
            return Err(format!("{path}: Konfiguration, nur von Hand im Datenordner zu ändern"));
        }
        Ok(file)
    }

    fn file(&self, path: &str) -> StoreResult<PathBuf> {
        if !path.ends_with(".json") {
            return Err(format!("{path}: nur .json-Dateien"));
        }
        self.dir(path)
    }

    fn dir(&self, path: &str) -> StoreResult<PathBuf> {
        let relative = Path::new(path);
        let safe = !path.is_empty()
            && relative.components().all(|part| match part {
                Component::Normal(name) => !name.to_string_lossy().starts_with('.'),
                _ => false,
            });
        if !safe {
            return Err(format!("{path}: Pfad außerhalb des Datenordners"));
        }
        Ok(self.root.join(relative))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::at(dir.path());
        (dir, store)
    }

    #[test]
    fn writes_and_reads_a_document_in_a_new_folder() {
        let (_dir, store) = store();
        store.write("privat/buchungen/2026.json", "{\"year\":2026}").unwrap();
        assert_eq!(store.read("privat/buchungen/2026.json").unwrap().as_deref(), Some("{\"year\":2026}"));
    }

    #[test]
    fn a_missing_document_is_none_not_an_error() {
        let (_dir, store) = store();
        assert_eq!(store.read("privat/kategorien.json").unwrap(), None);
        assert!(store.read_dir("privat/buchungen").unwrap().is_empty());
    }

    #[test]
    fn refuses_invalid_json_and_keeps_the_old_file() {
        let (_dir, store) = store();
        store.write("a.json", "[1]").unwrap();
        assert!(store.write("a.json", "[1,").is_err());
        assert_eq!(store.read("a.json").unwrap().as_deref(), Some("[1]"));
    }

    #[test]
    fn keeps_the_replaced_version_as_hidden_backup() {
        let (dir, store) = store();
        store.write("privat/kategorien.json", "[1]").unwrap();
        store.write("privat/kategorien.json", "[2]").unwrap();
        assert_eq!(fs::read_to_string(dir.path().join("privat/.kategorien.json.bak")).unwrap(), "[1]");
        assert!(store.read_dir("privat").unwrap().iter().all(|d| d.name == "kategorien.json"));
    }

    #[test]
    fn reads_an_svg_but_never_writes_one() {
        let (dir, store) = store();
        fs::create_dir_all(dir.path().join("einstellungen")).unwrap();
        fs::write(dir.path().join("einstellungen/marke.svg"), "<svg/>").unwrap();
        assert_eq!(store.read("einstellungen/marke.svg").unwrap().as_deref(), Some("<svg/>"));
        assert!(store.write("a.svg", "{}").is_err());
        assert!(store.read("x.txt").is_err());
        assert!(store.read("../marke.svg").is_err());
    }

    #[test]
    fn refuses_paths_outside_the_data_folder() {
        let (_dir, store) = store();
        for path in ["../x.json", "/etc/x.json", "a/../../x.json", ".hidden.json", "a/.b/c.json", "", "x.txt"] {
            assert!(store.write(path, "{}").is_err(), "{path} should be refused");
        }
    }

    #[test]
    fn leaves_the_config_of_the_shell_to_the_user() {
        let (dir, store) = store();
        fs::create_dir_all(dir.path().join("stages")).unwrap();
        fs::write(dir.path().join("stages/verbindungen.json"), "{\"connections\":[]}").unwrap();
        for path in [
            "stages/verbindungen.json",
            "git/jira.json",
            "landschaft/apps.json",
            "einstellungen/pfade.json",
            "werkstatt/dev-server.json",
        ] {
            assert!(store.write(path, "{}").is_err(), "{path} should be refused");
            assert!(store.remove(path).is_err(), "{path} should not be removable");
        }
        assert_eq!(store.read("stages/verbindungen.json").unwrap().as_deref(), Some("{\"connections\":[]}"));
        store.write("kalender/urlaub.json", "{}").unwrap();
    }

    #[test]
    fn lists_only_json_files_sorted_and_skips_leftover_temp_files() {
        let (dir, store) = store();
        store.write("sim/b.json", "{}").unwrap();
        store.write("sim/a.json", "{}").unwrap();
        fs::write(dir.path().join("sim/.c.json.tmp"), "{").unwrap();
        fs::write(dir.path().join("sim/notes.txt"), "x").unwrap();
        let names: Vec<String> = store.read_dir("sim").unwrap().into_iter().map(|d| d.name).collect();
        assert_eq!(names, ["a.json", "b.json"]);
    }

    #[test]
    fn removing_a_missing_document_is_fine() {
        let (_dir, store) = store();
        store.write("sim/a.json", "{}").unwrap();
        store.remove("sim/a.json").unwrap();
        store.remove("sim/a.json").unwrap();
        assert_eq!(store.read("sim/a.json").unwrap(), None);
    }
}
