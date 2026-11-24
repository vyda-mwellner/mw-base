//! Copies a list of files and folders into one target folder such as a cloud drive, only what changed.

use std::fs::{self, File, Metadata};
use std::io;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::config;
use crate::error::{AppError, AppResult};

/// `einstellungen/backup.json`, kept by hand like the rest of the config.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Plan {
    /// The folder everything goes into, `~/` is the home directory.
    pub target_dir: String,
    pub entries: Vec<Entry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Entry {
    /// A file or a folder, `~/` is the home directory.
    pub source: String,
    /// Relative to the target dir.
    pub target: String,
    /// Left out below a folder, like a `.gitignore` line: `cache` or `*.log` at any depth, `certs/*.key` from the
    /// folder down. `*` and `?` stay within one name.
    #[serde(default)]
    pub exclude: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub source: String,
    pub copied: usize,
    pub unchanged: usize,
    pub error: Option<String>,
}

pub fn load(root: &Path) -> AppResult<Plan> {
    config::parse(root, config::BACKUP)
}

pub fn run(plan: &Plan, home: &Path) -> AppResult<Vec<Outcome>> {
    if plan.target_dir.trim().is_empty() {
        return Err(AppError::Invalid(format!("{} braucht einen \"targetDir\"", config::BACKUP)));
    }
    let root = expand(plan.target_dir.trim(), home);
    if !root.is_dir() {
        return Err(AppError::Invalid(format!("Zielordner {} gibt es nicht", root.display())));
    }
    Ok(plan.entries.iter().map(|entry| run_entry(entry, &root, home)).collect())
}

fn run_entry(entry: &Entry, root: &Path, home: &Path) -> Outcome {
    let mut outcome = Outcome { source: entry.source.clone(), copied: 0, unchanged: 0, error: None };
    let source = expand(&entry.source, home);
    let result = check_target(&entry.target).and_then(|()| {
        if source.exists() {
            copy(&source, &root.join(&entry.target), "", &entry.exclude, &mut outcome)
        } else {
            Err(AppError::Invalid("Quelle nicht gefunden".into()))
        }
    });
    outcome.error = result.err().map(|error| error.to_string());
    outcome
}

/// Like `rsync -a -L` without `--delete`: follows symlinks and copies a file only when size or mtime differ.
/// `relative` is the path below the source of the entry, with `/` on every platform, so the patterns can match it.
fn copy(source: &Path, target: &Path, relative: &str, exclude: &[String], outcome: &mut Outcome) -> AppResult<()> {
    let metadata = fs::metadata(source).map_err(at(source))?;
    if metadata.is_dir() {
        fs::create_dir_all(target).map_err(at(target))?;
        for child in fs::read_dir(source).map_err(at(source))? {
            let child = child.map_err(at(source))?;
            let name = child.file_name();
            let below = match relative {
                "" => name.to_string_lossy().into_owned(),
                _ => format!("{relative}/{}", name.to_string_lossy()),
            };
            if !excluded(&below, exclude) {
                copy(&child.path(), &target.join(&name), &below, exclude, outcome)?;
            }
        }
    } else if is_current(&metadata, target) {
        outcome.unchanged += 1;
    } else {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(at(parent))?;
        }
        fs::copy(source, target).map_err(at(source))?;
        File::open(target).and_then(|file| file.set_modified(metadata.modified()?)).map_err(at(target))?;
        outcome.copied += 1;
    }
    Ok(())
}

/// A pattern without a slash is held against the name only, which covers every depth since a left out folder is never
/// entered. One with a slash is held against the whole path below the source.
fn excluded(relative: &str, patterns: &[String]) -> bool {
    let name = relative.rsplit('/').next().unwrap_or(relative);
    patterns.iter().any(|pattern| {
        let text = if pattern.contains('/') { relative } else { name };
        let pattern: Vec<char> = pattern.trim_start_matches('/').chars().collect();
        wildcard(&pattern, &text.chars().collect::<Vec<_>>())
    })
}

fn wildcard(pattern: &[char], text: &[char]) -> bool {
    match (pattern.split_first(), text.split_first()) {
        (None, None) => true,
        (Some(('*', rest)), _) => {
            wildcard(rest, text) || (text.first().is_some_and(|&c| c != '/') && wildcard(pattern, &text[1..]))
        }
        (Some(('?', rest)), Some((&c, tail))) if c != '/' => wildcard(rest, tail),
        (Some((p, rest)), Some((c, tail))) if p == c => wildcard(rest, tail),
        _ => false,
    }
}

fn is_current(source: &Metadata, target: &Path) -> bool {
    fs::metadata(target).is_ok_and(|existing| {
        existing.is_file() && existing.len() == source.len() && existing.modified().ok() == source.modified().ok()
    })
}

fn check_target(target: &str) -> AppResult<()> {
    let inside = !target.is_empty() && Path::new(target).components().all(|part| matches!(part, Component::Normal(_)));
    if inside { Ok(()) } else { Err(AppError::Invalid(format!("Zielpfad '{target}' muss im Zielordner bleiben"))) }
}

fn at(path: &Path) -> impl Fn(io::Error) -> AppError + '_ {
    move |error| AppError::Invalid(format!("{}: {error}", path.display()))
}

fn expand(path: &str, home: &Path) -> PathBuf {
    match path.strip_prefix("~/") {
        Some(rest) => home.join(rest),
        None => PathBuf::from(path),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    fn plan(target_dir: &Path, entries: Vec<Entry>) -> Plan {
        Plan { target_dir: target_dir.display().to_string(), entries }
    }

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    fn entry(source: &str, target: &str) -> Entry {
        Entry { source: source.into(), target: target.into(), exclude: Vec::new() }
    }

    fn excluding(source: &str, target: &str, exclude: &[&str]) -> Entry {
        Entry { exclude: exclude.iter().map(|pattern| pattern.to_string()).collect(), ..entry(source, target) }
    }

    fn files_below(dir: &Path) -> Vec<String> {
        let mut found = Vec::new();
        for child in fs::read_dir(dir).unwrap() {
            let path = child.unwrap().path();
            if path.is_dir() {
                found.extend(files_below(&path));
            } else {
                found.push(path.display().to_string());
            }
        }
        found.sort();
        found
    }

    fn counts(outcomes: &[Outcome]) -> Vec<(usize, usize, Option<&str>)> {
        outcomes.iter().map(|outcome| (outcome.copied, outcome.unchanged, outcome.error.as_deref())).collect()
    }

    #[test]
    fn copies_files_and_folders_and_later_only_what_changed() {
        let dir = scratch();
        let home = dir.path().join("home");
        let drive = dir.path().join("drive");
        fs::create_dir_all(&drive).unwrap();
        write(&home.join(".gitconfig"), "[user]");
        write(&home.join("kube/dev.yaml"), "dev");
        write(&home.join("kube/certs/dev.crt"), "cert");
        let plan = plan(
            &drive,
            vec![entry("~/.gitconfig", "git/.gitconfig"), entry("~/kube", ".kube"), entry("~/gone", "gone")],
        );

        let first = run(&plan, &home).unwrap();
        assert_eq!(counts(&first), vec![(1, 0, None), (2, 0, None), (0, 0, Some("Quelle nicht gefunden"))]);
        assert_eq!(fs::read_to_string(drive.join(".kube/certs/dev.crt")).unwrap(), "cert");
        assert_eq!(
            fs::metadata(drive.join("git/.gitconfig")).unwrap().modified().unwrap(),
            fs::metadata(home.join(".gitconfig")).unwrap().modified().unwrap()
        );

        assert_eq!(counts(&run(&plan, &home).unwrap())[..2], [(0, 1, None), (0, 2, None)]);

        write(&home.join("kube/dev.yaml"), "dev, changed");
        assert_eq!(counts(&run(&plan, &home).unwrap())[1], (1, 1, None));
        assert_eq!(fs::read_to_string(drive.join(".kube/dev.yaml")).unwrap(), "dev, changed");
    }

    #[cfg(unix)]
    #[test]
    fn copies_what_a_symlink_points_to() {
        let dir = scratch();
        let home = dir.path().join("home");
        let drive = dir.path().join("drive");
        fs::create_dir_all(&drive).unwrap();
        write(&home.join("real/config"), "real");
        std::os::unix::fs::symlink(home.join("real"), home.join("link")).unwrap();

        run(&plan(&drive, vec![entry("~/link", "link")]), &home).unwrap();

        let copied = drive.join("link");
        assert!(!fs::symlink_metadata(&copied).unwrap().is_symlink());
        assert_eq!(fs::read_to_string(copied.join("config")).unwrap(), "real");
    }

    #[test]
    fn leaves_out_what_the_patterns_of_an_entry_match() {
        let dir = scratch();
        let home = dir.path().join("home");
        let drive = dir.path().join("drive");
        fs::create_dir_all(&drive).unwrap();
        for file in
            ["dev.yaml", "cache/discovery/api.json", "certs/dev.crt", "certs/dev.log", "old/cache/x", "Über.tmp"]
        {
            write(&home.join("kube").join(file), "x");
        }
        let plan = plan(&drive, vec![excluding("~/kube", ".kube", &["/cache", "certs/*.log", "?ber.*"])]);

        let outcome = run(&plan, &home).unwrap();

        assert_eq!(counts(&outcome), vec![(3, 0, None)]);
        let kube = drive.join(".kube").display().to_string();
        assert_eq!(
            files_below(&drive),
            ["certs/dev.crt", "dev.yaml", "old/cache/x"].map(|file| format!("{kube}/{file}"))
        );
    }

    #[test]
    fn wildcards_stay_within_one_name() {
        let patterns = |list: &[&str]| list.iter().map(|pattern| pattern.to_string()).collect::<Vec<_>>();
        assert!(excluded("a/b/cache", &patterns(&["cache"])));
        assert!(excluded("x.log", &patterns(&["*.log"])));
        assert!(!excluded("x.log", &patterns(&["*.lo"])));
        assert!(!excluded("a/b/x.log", &patterns(&["a/*.log"])));
        assert!(excluded("a/b/x.log", &patterns(&["a/*/x.???"])));
        assert!(!excluded("cache", &patterns(&[])));
    }

    #[test]
    fn refuses_a_missing_target_dir_and_a_target_outside_it() {
        let dir = scratch();
        assert!(run(&Plan::default(), dir.path()).is_err());
        assert!(run(&plan(&dir.path().join("missing"), vec![]), dir.path()).is_err());
        let outside = run(&plan(dir.path(), vec![entry("~/x", "../x")]), dir.path()).unwrap();
        assert_eq!(outside[0].error.as_deref(), Some("Zielpfad '../x' muss im Zielordner bleiben"));
    }
}
