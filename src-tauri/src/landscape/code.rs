use std::collections::{BTreeMap, BTreeSet, HashMap, VecDeque};
use std::path::Path;
use std::process::Command;
use std::sync::LazyLock;

use regex::Regex;
use serde_json::Value;

use super::{Fact, GitStats, LanguageLines, Loc};

const MAX_FILE_BYTES: u64 = 1_000_000;

static ALIAS_IMPORT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"from\s+['"](@[\w-]+/[\w./-]+)['"]|import\(\s*['"](@[\w-]+/[\w./-]+)['"]"#).unwrap());
static ENDPOINT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"@(Get|Post|Put|Delete|Patch)Mapping\b").unwrap());
static ENTITY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^\s*@Entity\b").unwrap());
static TEST_CASE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"@Test\b|\bit\(\s*['`]|\bdef test_").unwrap());
static COMPONENT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"@Component\(").unwrap());
static INJECTABLE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"@Injectable\(").unwrap());
static GRADLE_INCLUDE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"include\(\s*"(:?[\w-]+)""#).unwrap());
static VERSION_ENTRY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?m)^\s*([\w-]+)\s*=\s*"([^"]+)""#).unwrap());
static PYTHON_IMAGE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^FROM\s+python:(\S+)").unwrap());
static ARG_DEFAULT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^ARG\s+(\w+)=(\S+)").unwrap());
static ARG_USE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\$\{(\w+)\}|\$(\w+)").unwrap());
static MAJOR_MINOR: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\d+\.\d+").unwrap());
static NODE_IMAGE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^FROM\s+node:(\d+(?:\.\d+)*)").unwrap());
static JAVA_TARGET: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"JavaVersion\.VERSION_(\d+(?:_\d+)?)|jvmToolchain\(\s*(\d+)|JavaLanguageVersion\.of\(\s*(\d+)").unwrap()
});
static EXPOSE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^EXPOSE\s+(\d+)").unwrap());

/// The tracked files of one repo, so build output and node_modules never count.
pub struct Repo {
    pub dir: std::path::PathBuf,
    pub files: Vec<String>,
}

impl Repo {
    pub fn open(dir: &Path, env: &[(String, String)]) -> Option<Repo> {
        let output = git(dir, env, &["ls-files", "-z"])?;
        let files = output.split('\0').filter(|file| !file.is_empty()).map(String::from).collect();
        Some(Repo { dir: dir.to_path_buf(), files })
    }

    pub fn files_in<'a>(&'a self, scopes: &'a [String]) -> impl Iterator<Item = &'a String> + 'a {
        self.files.iter().filter(move |file| scopes.iter().any(|scope| in_scope(file, scope)))
    }

    pub fn read(&self, file: &str) -> Option<String> {
        let path = self.dir.join(file);
        if std::fs::metadata(&path).ok()?.len() > MAX_FILE_BYTES {
            return None;
        }
        std::fs::read_to_string(path).ok()
    }
}

fn in_scope(file: &str, scope: &str) -> bool {
    scope.is_empty() || file == scope || file.starts_with(&format!("{scope}/"))
}

fn language(file: &str) -> Option<&'static str> {
    let extension = file.rsplit('.').next()?.to_lowercase();
    Some(match extension.as_str() {
        "kt" | "kts" => "Kotlin",
        "java" => "Java",
        "ts" | "tsx" => "TypeScript",
        "js" | "mjs" | "cjs" => "JavaScript",
        "html" => "HTML",
        "css" | "scss" => "CSS",
        "sql" => "SQL",
        "py" => "Python",
        "rs" => "Rust",
        "sh" | "ps1" => "Shell",
        _ => return None,
    })
}

fn is_test(file: &str) -> bool {
    let name = file.rsplit('/').next().unwrap_or(file);
    file.contains("/test/")
        || file.starts_with("test/")
        || file.contains("/tests/")
        || file.contains("/e2e/")
        || name.contains(".spec.")
        || name.contains(".test.")
        || name.starts_with("test_")
}

/// Counts non-blank lines per language and collects the facts that need the file content.
pub fn measure(repo: &Repo, scopes: &[String]) -> (Loc, Counters) {
    let mut by_language: BTreeMap<&str, u64> = BTreeMap::new();
    let mut loc = Loc::default();
    let mut counters = Counters::default();
    for file in repo.files_in(scopes) {
        let Some(language) = language(file) else {
            continue;
        };
        let Some(text) = repo.read(file) else {
            continue;
        };
        let lines = text.lines().filter(|line| !line.trim().is_empty()).count() as u64;
        let test = is_test(file);
        loc.files += 1;
        loc.total += lines;
        if test {
            loc.test += lines;
            counters.tests += TEST_CASE.find_iter(&text).count() as u64;
        } else {
            loc.production += lines;
            counters.endpoints += ENDPOINT.find_iter(&text).count() as u64;
            counters.entities += ENTITY.find_iter(&text).count() as u64;
            counters.components += COMPONENT.find_iter(&text).count() as u64;
            counters.services += INJECTABLE.find_iter(&text).count() as u64;
        }
        if file.contains("db/migration/") && file.ends_with(".sql") {
            counters.migrations += 1;
        }
        *by_language.entry(language).or_default() += lines;
    }
    let mut languages: Vec<LanguageLines> = by_language
        .into_iter()
        .map(|(language, lines)| LanguageLines { language: language.to_string(), lines })
        .collect();
    languages.sort_by_key(|language| std::cmp::Reverse(language.lines));
    loc.by_language = languages;
    (loc, counters)
}

#[derive(Default)]
pub struct Counters {
    pub endpoints: u64,
    pub entities: u64,
    pub migrations: u64,
    pub tests: u64,
    pub components: u64,
    pub services: u64,
}

impl Counters {
    pub fn backend_facts(&self) -> Vec<Fact> {
        vec![
            Fact::new("REST-Endpunkte", self.endpoints),
            Fact::new("Entities", self.entities),
            Fact::new("Flyway-Migrationen", self.migrations),
            Fact::new("Testfälle", self.tests),
        ]
    }

    pub fn frontend_facts(&self) -> Vec<Fact> {
        vec![
            Fact::new("Komponenten", self.components),
            Fact::new("Services", self.services),
            Fact::new("Testfälle", self.tests),
        ]
    }
}

/// Nx apps share libs through tsconfig path aliases - an app is its folder plus every lib it reaches.
pub fn reachable_libs(repo: &Repo, app_path: &str) -> Vec<String> {
    let Some(aliases) = repo.read("tsconfig.base.json").and_then(|text| path_aliases(&text)) else {
        return Vec::new();
    };
    let mut seen: BTreeSet<String> = BTreeSet::new();
    let mut queue: VecDeque<String> = VecDeque::from([app_path.to_string()]);
    while let Some(scope) = queue.pop_front() {
        let scopes = [scope];
        for file in repo.files_in(&scopes).filter(|file| file.ends_with(".ts") && !is_test(file)) {
            let Some(text) = repo.read(file) else {
                continue;
            };
            for import in ALIAS_IMPORT.captures_iter(&text) {
                let alias = import.get(1).or(import.get(2)).map(|m| m.as_str()).unwrap_or_default();
                if let Some(lib) = resolve_alias(&aliases, alias)
                    && lib != app_path
                    && seen.insert(lib.clone())
                {
                    queue.push_back(lib);
                }
            }
        }
    }
    seen.into_iter().collect()
}

fn path_aliases(tsconfig: &str) -> Option<HashMap<String, String>> {
    let value: Value = serde_json::from_str(tsconfig).ok()?;
    let paths = value.get("compilerOptions")?.get("paths")?.as_object()?;
    Some(
        paths
            .iter()
            .filter_map(|(alias, targets)| {
                let target = targets.as_array()?.first()?.as_str()?;
                let root = target.split("/src/").next()?.trim_start_matches("./").to_string();
                Some((alias.trim_end_matches("/*").to_string(), root))
            })
            .collect(),
    )
}

fn resolve_alias(aliases: &HashMap<String, String>, import: &str) -> Option<String> {
    aliases
        .iter()
        .filter(|(alias, _)| import == alias.as_str() || import.starts_with(&format!("{alias}/")))
        .max_by_key(|(alias, _)| alias.len())
        .map(|(_, root)| root.clone())
}

/// A config key counts as used once code outside the config files and type declarations mentions it.
pub fn used_keys(repo: &Repo, scopes: &[String], keys: &BTreeSet<String>) -> BTreeSet<String> {
    let mut used = BTreeSet::new();
    let declaration = |line: &str, key: &str| {
        let rest = line.trim_start().strip_prefix(key).unwrap_or("");
        rest.starts_with(':') || rest.starts_with("?:")
    };
    for file in repo.files_in(scopes) {
        let source = file.ends_with(".ts") && !is_test(file) && !file.contains("/environments/");
        if !source {
            continue;
        }
        let Some(text) = repo.read(file) else {
            continue;
        };
        let mentioned: Vec<String> = keys
            .iter()
            .filter(|key| !used.contains(*key))
            .filter(|key| text.lines().any(|line| contains_word(line, key) && !declaration(line, key)))
            .cloned()
            .collect();
        used.extend(mentioned);
        if used.len() == keys.len() {
            break;
        }
    }
    used
}

fn contains_word(line: &str, word: &str) -> bool {
    let is_word = |c: char| c.is_ascii_alphanumeric() || c == '_';
    line.match_indices(word).any(|(index, _)| {
        let before = line[..index].chars().next_back();
        let after = line[index + word.len()..].chars().next();
        !before.is_some_and(is_word) && !after.is_some_and(is_word)
    })
}

pub fn tech(repo: &Repo) -> Vec<String> {
    let mut tech = Vec::new();
    if let Some(versions) = repo.read("gradle/libs.versions.toml") {
        let entries: HashMap<String, String> =
            VERSION_ENTRY.captures_iter(&versions).map(|c| (c[1].to_string(), c[2].to_string())).collect();
        if let Some(version) = entries.get("spring-boot") {
            tech.push(format!("Spring Boot {version}"));
        }
        if let Some(version) = entries.get("kotlin") {
            tech.push(format!("Kotlin {version}"));
        }
    }
    if let Some(version) = repo.read("build.gradle.kts").as_deref().and_then(java_target) {
        tech.push(format!("Java {version}"));
    }
    if let Some(package) = repo.read("package.json").and_then(|text| serde_json::from_str::<Value>(&text).ok()) {
        let version = |name: &str| {
            ["dependencies", "devDependencies"]
                .iter()
                .find_map(|section| package.get(section)?.get(name)?.as_str())
                .map(|version| version.trim_start_matches(['^', '~']).to_string())
        };
        for (name, label) in [("@angular/core", "Angular"), ("nx", "Nx"), ("puppeteer", "Puppeteer")] {
            if let Some(version) = version(name) {
                tech.push(format!("{label} {version}"));
            }
        }
    }
    let dockerfile = repo.read("Dockerfile").unwrap_or_default();
    // CI builds the GUIs with `node-version-file: .nvmrc`, their Dockerfile only serves the result with nginx
    let node = repo
        .read(".nvmrc")
        .map(|text| text.trim().trim_start_matches('v').to_string())
        .filter(|version| !version.is_empty())
        .or_else(|| NODE_IMAGE.captures(&dockerfile).map(|c| c[1].to_string()));
    if let Some(version) = node {
        tech.push(format!("Node {version}"));
    }
    if let Some(version) = python_version(&dockerfile) {
        tech.push(version);
    }
    tech
}

/// The Python the image builds on, `Python 3.12`; an `ARG` default stands in for `${PYTHON_VERSION}`.
fn python_version(dockerfile: &str) -> Option<String> {
    let tag = &PYTHON_IMAGE.captures(dockerfile)?[1];
    let defaults: HashMap<&str, &str> =
        ARG_DEFAULT.captures_iter(dockerfile).filter_map(|c| Some((c.get(1)?.as_str(), c.get(2)?.as_str()))).collect();
    let tag = ARG_USE.replace_all(tag, |c: &regex::Captures| {
        let name = c.get(1).or(c.get(2)).map_or("", |name| name.as_str());
        defaults.get(name).copied().unwrap_or_default().to_string()
    });
    Some(match MAJOR_MINOR.find(&tag) {
        Some(version) => format!("Python {}", version.as_str()),
        None => "Python".to_string(),
    })
}

/// What the compiler targets, so `VERSION_1_8` reads as `1.8`.
fn java_target(gradle: &str) -> Option<String> {
    let found = JAVA_TARGET.captures(gradle)?;
    let version = found.get(1).or(found.get(2)).or(found.get(3))?.as_str();
    Some(version.replace('_', "."))
}

pub fn gradle_modules(repo: &Repo) -> Vec<String> {
    repo.read("settings.gradle.kts")
        .map(|text| GRADLE_INCLUDE.captures_iter(&text).map(|c| c[1].trim_start_matches(':').to_string()).collect())
        .unwrap_or_default()
}

pub fn exposed_port(repo: &Repo, scope: &str) -> Option<u16> {
    let dockerfile = if scope.is_empty() { "Dockerfile".to_string() } else { format!("{scope}/Dockerfile") };
    EXPOSE.captures(&repo.read(&dockerfile)?)?[1].parse().ok()
}

pub fn git_stats(repo: &Repo, scopes: &[String], env: &[(String, String)]) -> GitStats {
    let log = |extra: &[&str]| -> Vec<String> {
        let mut args = vec!["log", "--no-merges"];
        args.extend_from_slice(extra);
        args.push("--");
        args.extend(scopes.iter().map(|scope| if scope.is_empty() { "." } else { scope.as_str() }));
        git(&repo.dir, env, &args).map(|out| out.lines().map(String::from).collect()).unwrap_or_default()
    };
    let recent = log(&["--since=90.days", "--format=%cs %ae"]);
    let cutoff = days_ago(30);
    GitStats {
        last_commit: log(&["-1", "--format=%cs"]).into_iter().next(),
        commits30: recent.iter().filter(|line| line.as_str() >= cutoff.as_str()).count() as u32,
        commits90: recent.len() as u32,
        contributors90: recent
            .iter()
            .filter_map(|line| line.split_once(' '))
            .map(|(_, mail)| mail)
            .collect::<BTreeSet<_>>()
            .len() as u32,
    }
}

/// `YYYY-MM-DD` of n days ago, comparable as a string with git's `%cs`.
fn days_ago(days: u64) -> String {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
    civil_date((now / 86_400).saturating_sub(days) as i64)
}

/// Days since 1970-01-01 to a calendar date (Howard Hinnant's algorithm), to avoid a date crate for one line.
fn civil_date(days: i64) -> String {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}")
}

fn git(dir: &Path, env: &[(String, String)], args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .envs(env.iter().map(|(name, value)| (name, value)))
        .output()
        .ok()?;
    output.status.success().then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tells_test_files_from_production_code() {
        assert!(is_test("src/test/kotlin/FooTest.kt"));
        assert!(is_test("libs/ui/src/lib/button.spec.ts"));
        assert!(is_test("ct/test_api.py"));
        assert!(!is_test("src/main/kotlin/Foo.kt"));
        assert!(!is_test("apps/dashboard/src/app/latest.ts"));
    }

    #[test]
    fn resolves_the_longest_matching_alias() {
        let aliases = HashMap::from([
            ("@shop/shared".to_string(), "libs/shared".to_string()),
            ("@shop/shared-core".to_string(), "libs/shared/core".to_string()),
        ]);
        assert_eq!(resolve_alias(&aliases, "@shop/shared-core").as_deref(), Some("libs/shared/core"));
        assert_eq!(resolve_alias(&aliases, "@shop/shared/testing").as_deref(), Some("libs/shared"));
        assert_eq!(resolve_alias(&aliases, "@angular/core"), None);
    }

    #[test]
    fn matches_whole_words_only() {
        assert!(contains_word("return this.backendUrls.psServerUrl;", "psServerUrl"));
        assert!(!contains_word("const psServerUrlPrefix = 1", "psServerUrl"));
    }

    #[test]
    fn reads_the_java_target_of_a_gradle_build() {
        assert_eq!(java_target("sourceCompatibility = JavaVersion.VERSION_17").as_deref(), Some("17"));
        assert_eq!(java_target("kotlin { jvmToolchain(21) }").as_deref(), Some("21"));
        assert_eq!(java_target("languageVersion.set(JavaLanguageVersion.of(25))").as_deref(), Some("25"));
        assert_eq!(java_target("JavaVersion.VERSION_1_8").as_deref(), Some("1.8"));
        assert_eq!(java_target("plugins { kotlin(\"jvm\") }"), None);
    }

    #[test]
    fn reads_the_python_of_a_dockerfile_also_through_an_arg() {
        assert_eq!(python_version("FROM python:3.11-slim").as_deref(), Some("Python 3.11"));
        assert_eq!(
            python_version("ARG PYTHON_VERSION=3.12.2\nFROM python:${PYTHON_VERSION}-slim as base").as_deref(),
            Some("Python 3.12")
        );
        assert_eq!(python_version("FROM python:latest").as_deref(), Some("Python"));
        assert_eq!(python_version("FROM node:24-alpine"), None);
    }

    #[test]
    fn converts_days_to_a_calendar_date() {
        assert_eq!(civil_date(0), "1970-01-01");
        assert_eq!(civil_date(20_746), "2026-10-20");
    }
}
