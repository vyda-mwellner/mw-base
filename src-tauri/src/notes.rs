//! The notes of the knowledge vault, a folder of Markdown files kept by the vault skill.

use std::path::{Component, Path};

use serde::Serialize;

use crate::error::{AppError, AppResult};

/// A top-level folder of the knowledge vault, a shelf in the library. Not to be confused with `vault.rs`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    /// The folder name, like `systems`.
    pub id: String,
    pub notes: Vec<Note>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    /// Relative to the vault and `/` separated, what `read` takes.
    pub path: String,
    /// The folders between category and file, like `shop-backend` in `systems/shop-backend/notizen.md`.
    pub folder: String,
    pub title: String,
    pub date: Option<String>,
    pub status: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteContent {
    #[serde(flatten)]
    pub note: Note,
    /// The frontmatter besides date, status and tags, like `repo` and `stand` of a system overview.
    pub fields: Vec<Field>,
    pub body: String,
}

#[derive(Debug, Serialize)]
pub struct Field {
    pub key: String,
    pub value: String,
}

/// The vault skill keeps `INDEX.md`, so a folder without one is not the vault.
pub fn is_vault(dir: &Path) -> bool {
    dir.join("INDEX.md").is_file()
}

/// Every top-level folder is a category, empty ones too; `_templates`, hidden folders and the files at the top
/// (INDEX, CLAUDE.md) are left out.
pub fn list(dir: &Path) -> AppResult<Vec<Category>> {
    let mut categories = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.path().is_dir() && is_shown(&name) {
            let mut notes = Vec::new();
            collect(dir, &entry.path(), &mut notes)?;
            notes.sort_by(order);
            categories.push(Category { id: name, notes });
        }
    }
    categories.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(categories)
}

pub fn read(dir: &Path, path: &str) -> AppResult<NoteContent> {
    let relative = Path::new(path);
    let is_note = relative.extension().is_some_and(|extension| extension == "md")
        && relative.components().all(|component| matches!(component, Component::Normal(_)));
    let file = dir.join(relative);
    if !is_note || !file.canonicalize()?.starts_with(dir.canonicalize()?) {
        return Err(AppError::Invalid(format!("Keine Notiz im Vault: {path}")));
    }
    Ok(parse(path, &std::fs::read_to_string(file)?))
}

fn is_shown(name: &str) -> bool {
    !name.starts_with('.') && !name.starts_with('_')
}

fn collect(root: &Path, dir: &Path, notes: &mut Vec<Note>) -> AppResult<()> {
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if !is_shown(&name) {
            continue;
        }
        if path.is_dir() {
            collect(root, &path, notes)?;
        } else if path.extension().is_some_and(|extension| extension == "md") {
            let relative = path.strip_prefix(root).unwrap_or(&path);
            let relative: Vec<String> =
                relative.components().map(|part| part.as_os_str().to_string_lossy().into_owned()).collect();
            notes.push(parse(&relative.join("/"), &std::fs::read_to_string(&path)?).note);
        }
    }
    Ok(())
}

/// Folder by folder; the dated notes (`2026-10-30.md`, `2026-W44.md`) newest first, the others by title.
fn order(a: &Note, b: &Note) -> std::cmp::Ordering {
    let dated =
        |note: &Note| note.path.rsplit('/').next().is_some_and(|name| name.starts_with(|c: char| c.is_ascii_digit()));
    a.folder.cmp(&b.folder).then_with(|| match (dated(a), dated(b)) {
        (true, true) => b.path.cmp(&a.path),
        (x, y) => x.cmp(&y).then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase())),
    })
}

fn parse(path: &str, text: &str) -> NoteContent {
    let (front, body) = frontmatter(text);
    let mut parts: Vec<&str> = path.split('/').collect();
    let file = parts.pop().unwrap_or(path);
    let title = body
        .lines()
        .find_map(|line| line.strip_prefix("# "))
        .map(|title| title.trim().to_string())
        .unwrap_or_else(|| file.trim_end_matches(".md").to_string());
    let mut note = Note {
        path: path.to_string(),
        folder: parts.get(1..).unwrap_or_default().join("/"),
        title,
        date: None,
        status: None,
        tags: Vec::new(),
    };
    let mut fields = Vec::new();
    for (key, value) in front {
        match key.as_str() {
            "datum" => note.date = Some(value),
            "status" => note.status = Some(value),
            "tags" => {
                note.tags = value
                    .trim_matches(|c| c == '[' || c == ']')
                    .split(',')
                    .map(|tag| tag.trim().to_string())
                    .filter(|tag| !tag.is_empty())
                    .collect()
            }
            _ => fields.push(Field { key, value }),
        }
    }
    NoteContent { note, fields, body: body.trim_start().to_string() }
}

/// The flat `key: value` lines the vault skill writes between two `---`, no YAML crate for that.
fn frontmatter(text: &str) -> (Vec<(String, String)>, &str) {
    let mut fields = Vec::new();
    let mut offset = 0;
    for (index, line) in text.split_inclusive('\n').enumerate() {
        offset += line.len();
        let line = line.trim_end();
        if index == 0 {
            if line != "---" {
                break;
            }
        } else if line == "---" {
            return (fields, &text[offset..]);
        } else if let Some((key, value)) = line.split_once(':') {
            fields.push((key.trim().to_string(), value.trim().to_string()));
        }
    }
    (Vec::new(), text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault(files: &[(&str, &str)]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        for (path, text) in files {
            let file = dir.path().join(path);
            std::fs::create_dir_all(file.parent().unwrap()).unwrap();
            std::fs::write(file, text).unwrap();
        }
        dir
    }

    const OVERVIEW: &str = "---\ndatum: 2026-10-30\ntags: [system, shop-backend]\nstatus: bestätigt\nrepo: /Users/x/shop-backend\nstand: abc1234\n---\n# shop-backend\n\n## Zweck\n";

    #[test]
    fn reads_title_and_frontmatter_and_keeps_the_rest_as_fields() {
        let content = parse("systems/shop-backend/uebersicht.md", OVERVIEW);

        assert_eq!(content.note.title, "shop-backend");
        assert_eq!(content.note.folder, "shop-backend");
        assert_eq!(content.note.date.as_deref(), Some("2026-10-30"));
        assert_eq!(content.note.status.as_deref(), Some("bestätigt"));
        assert_eq!(content.note.tags, vec!["system", "shop-backend"]);
        let fields: Vec<(&str, &str)> = content.fields.iter().map(|f| (f.key.as_str(), f.value.as_str())).collect();
        assert_eq!(fields, vec![("repo", "/Users/x/shop-backend"), ("stand", "abc1234")]);
        assert_eq!(content.body, "# shop-backend\n\n## Zweck\n");
    }

    #[test]
    fn takes_a_file_without_frontmatter_as_it_is() {
        let content = parse("debugging/notiz.md", "Text\n---\nmehr");

        assert_eq!(content.note.title, "notiz");
        assert_eq!(content.note.folder, "");
        assert_eq!(content.body, "Text\n---\nmehr");
        assert!(content.note.status.is_none());
    }

    #[test]
    fn lists_every_category_with_its_notes_and_leaves_out_templates_and_the_top_files() {
        let dir = vault(&[
            ("INDEX.md", "# Index"),
            ("_templates/system.md", "# Vorlage"),
            ("systems/shop-backend/uebersicht.md", OVERVIEW),
            ("systems/shop-backend/notizen.md", "# shop-backend - wo passiert was"),
            ("systems/landkarte.md", "# Landkarte der Backends"),
            ("changes/2026-10-23.md", "# Änderungen bis 2026-10-23"),
            ("changes/2026-10-30.md", "# Änderungen bis 2026-10-30"),
            ("changes/.DS_Store", ""),
        ]);
        std::fs::create_dir_all(dir.path().join("career")).unwrap();

        let categories = list(dir.path()).unwrap();

        let shelf: Vec<(&str, Vec<&str>)> = categories
            .iter()
            .map(|category| (category.id.as_str(), category.notes.iter().map(|note| note.path.as_str()).collect()))
            .collect();
        assert_eq!(
            shelf,
            vec![
                ("career", vec![]),
                ("changes", vec!["changes/2026-10-30.md", "changes/2026-10-23.md"]),
                (
                    "systems",
                    vec![
                        "systems/landkarte.md",
                        "systems/shop-backend/uebersicht.md",
                        "systems/shop-backend/notizen.md"
                    ]
                ),
            ]
        );
    }

    #[test]
    fn reads_a_note_but_nothing_outside_the_vault() {
        let dir = vault(&[("INDEX.md", "# Index"), ("domain/glossar.md", "# Glossar")]);

        assert_eq!(read(dir.path(), "domain/glossar.md").unwrap().note.title, "Glossar");
        assert!(read(dir.path(), "domain/../../outside.md").is_err());
        assert!(read(dir.path(), "/etc/hosts").is_err());
        assert!(read(dir.path(), "INDEX").is_err());
    }
}
