use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;
use serde::Serialize;

use crate::kube::{LOG_TAIL_LINES, epoch_millis};

const RECENT_ENTRIES: usize = 500;
const MAX_TRACE_LINES: usize = 60;
const MAX_KEY_CHARS: usize = 160;
const BUCKETS: i64 = 24;

/// `kubectl logs --prefix --timestamps`: pod and container, the time of the container runtime, then the line.
static KUBE_LINE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\[pod/([^/\]]+)/[^\]]*\] (\S+) ?(.*)$").unwrap());
/// Spring Boot console: `2026-11-03T14:03:11.284+01:00  INFO 7 --- [app] [thread] logger : message`.
static SPRING: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}[+-]\d\d:\d\d\s+([A-Z]+)\s+\d+\s+---\s+(?:\[[^\]]*\]\s*)+(\S+)\s*:\s?(.*)$")
        .unwrap()
});
/// Keycloak (Quarkus): `2026-11-02 15:52:07,785 WARN  [logger] (thread) message`.
static QUARKUS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,\d{3}\s+([A-Z]+)\s+\[([^\]]+)\]\s+\([^)]*\)\s?(.*)$").unwrap()
});
/// gunicorn: `[2026-10-14 11:15:31 +0000] [6] [WARNING] message`.
static GUNICORN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\[\d{4}-\d\d-\d\d \d\d:\d\d:\d\d [+-]\d{4}\]\s+\[\d+\]\s+\[([A-Z]+)\]\s?(.*)$").unwrap()
});
static EXCEPTION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:Caused by: |Suppressed: )?((?:[A-Za-z_$][\w$]*\.)*[A-Z][\w$]*(?:Exception|Error|Throwable))(?::\s*(.*))?$")
        .unwrap()
});
static VOLATILE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|\b[0-9a-fA-F]{12,}\b|\d+")
        .unwrap()
});

/// Declared from the worst down, so sorting by level puts errors first.
#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Error,
    Warn,
    Info,
    Debug,
    Other,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    /// Epoch millis, from the container runtime, the same clock for every format.
    pub at: i64,
    pub pod: String,
    pub level: Level,
    pub logger: Option<String>,
    pub message: String,
    /// The lines that belong to the entry, like a stack trace.
    pub trace: Vec<String>,
}

/// Entries of one kind: the same exception thrown at the same place, or the same message with other numbers.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Problem {
    pub level: Level,
    /// The root cause, the last `Caused by`.
    pub exception: Option<String>,
    pub cause: Option<String>,
    /// The first frame in our own code.
    pub frame: Option<String>,
    pub logger: Option<String>,
    /// Message and trace of the newest entry.
    pub message: String,
    pub trace: Vec<String>,
    pub count: usize,
    pub first: i64,
    pub last: i64,
    pub pods: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogReport {
    pub entries: usize,
    pub errors: usize,
    pub warnings: usize,
    pub from: Option<i64>,
    pub to: Option<i64>,
    pub pods: Vec<String>,
    pub problems: Vec<Problem>,
    /// The newest entries, oldest first.
    pub recent: Vec<Entry>,
    pub timeline: Vec<Bucket>,
    /// The line limit per pod when a pod reached it and lost its oldest lines.
    pub cut_to: Option<usize>,
}

/// The lines kubectl handed out for one pod, and the time of the first one.
struct Span {
    lines: usize,
    first: i64,
}

/// Errors and warnings in one slice of the time asked for.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Bucket {
    pub start: i64,
    pub end: i64,
    pub errors: usize,
    pub warnings: usize,
}

pub struct Counts {
    pub errors: usize,
    pub warnings: usize,
}

pub fn counts(text: &str) -> Counts {
    tally(&parse(text).0)
}

fn tally(entries: &[Entry]) -> Counts {
    let count = |level: Level| entries.iter().filter(|entry| entry.level == level).count();
    Counts { errors: count(Level::Error), warnings: count(Level::Warn) }
}

/// `window` is the time asked for, from and to in epoch millis. `own_code` are the package prefixes of own frames.
pub fn report(text: &str, window: (i64, i64), own_code: &[String]) -> LogReport {
    let (mut entries, spans) = parse(text);
    entries.sort_by_key(|entry| entry.at);
    let mut pods: Vec<String> = Vec::new();
    for entry in &entries {
        if !pods.contains(&entry.pod) {
            pods.push(entry.pod.clone());
        }
    }
    let Counts { errors, warnings } = tally(&entries);
    let (from, to) = (entries.first().map(|entry| entry.at), entries.last().map(|entry| entry.at));
    let problems = problems(&entries, own_code);
    let (start, cut) = complete_from(&spans, window.0, LOG_TAIL_LINES);
    let timeline = timeline(&entries, (start, window.1));
    let total = entries.len();
    let recent = entries
        .into_iter()
        .skip(total.saturating_sub(RECENT_ENTRIES))
        .map(|entry| Entry { trace: capped(entry.trace), ..entry })
        .collect();
    let cut_to = cut.then_some(LOG_TAIL_LINES);
    LogReport { entries: total, errors, warnings, from, to, pods, problems, recent, timeline, cut_to }
}

/// A pod at the limit lost its oldest lines, so the timeline only starts where every pod is complete.
fn complete_from(spans: &HashMap<String, Span>, start: i64, limit: usize) -> (i64, bool) {
    let cut: Vec<i64> = spans.values().filter(|span| span.lines >= limit).map(|span| span.first).collect();
    (cut.iter().copied().fold(start, i64::max), !cut.is_empty())
}

/// Kubectl interleaves the pods, so a trace line belongs to the open entry of its own pod.
fn parse(text: &str) -> (Vec<Entry>, HashMap<String, Span>) {
    let mut entries: Vec<Entry> = Vec::new();
    let mut open: HashMap<String, usize> = HashMap::new();
    let mut spans: HashMap<String, Span> = HashMap::new();
    for line in text.lines() {
        let Some(captures) = KUBE_LINE.captures(line) else { continue };
        let pod = &captures[1];
        let at = epoch_millis(&captures[2]).unwrap_or_default();
        spans.entry(pod.to_string()).or_insert(Span { lines: 0, first: at }).lines += 1;
        let raw = captures.get(3).map_or("", |raw| raw.as_str()).trim_end();
        let started = start(raw);
        if let (None, Some(&index)) = (&started, open.get(pod))
            && continues(raw)
        {
            entries[index].trace.push(raw.to_string());
            continue;
        }
        let (level, logger, message) = started.unwrap_or_else(|| (leading_level(raw), None, raw.to_string()));
        open.insert(pod.to_string(), entries.len());
        entries.push(Entry { at, pod: pod.to_string(), level, logger, message, trace: Vec::new() });
    }
    for entry in &mut entries {
        while entry.trace.last().is_some_and(|line| line.trim().is_empty()) {
            entry.trace.pop();
        }
    }
    (entries, spans)
}

fn start(raw: &str) -> Option<(Level, Option<String>, String)> {
    if let Some(captures) = SPRING.captures(raw).or_else(|| QUARKUS.captures(raw)) {
        return Some((level(&captures[1]), Some(captures[2].to_string()), captures[3].to_string()));
    }
    GUNICORN.captures(raw).map(|captures| (level(&captures[1]), None, captures[2].to_string()))
}

fn continues(raw: &str) -> bool {
    raw.is_empty()
        || raw.starts_with(char::is_whitespace)
        || ["Caused by:", "Suppressed:", "Traceback", "..."].iter().any(|prefix| raw.starts_with(prefix))
        || EXCEPTION.is_match(raw)
}

fn level(word: &str) -> Level {
    match word {
        "ERROR" | "FATAL" | "SEVERE" | "CRITICAL" => Level::Error,
        "WARN" | "WARNING" => Level::Warn,
        "INFO" => Level::Info,
        "DEBUG" | "TRACE" | "FINE" | "FINER" | "FINEST" => Level::Debug,
        _ => Level::Other,
    }
}

/// A line without a known format only has a level when it starts with one, like `Error: ...` of Node.
fn leading_level(raw: &str) -> Level {
    let word = raw.split_whitespace().next().unwrap_or_default();
    level(&word.trim_matches(|c: char| !c.is_ascii_alphabetic()).to_ascii_uppercase())
}

/// The root cause of the entry: the first exception named, or the last `Caused by` after it.
fn exception(entry: &Entry) -> Option<(String, Option<String>)> {
    let mut found = None;
    for line in std::iter::once(entry.message.as_str()).chain(entry.trace.iter().map(String::as_str)) {
        let line = line.trim_start();
        let Some(captures) = EXCEPTION.captures(line) else { continue };
        if found.is_none() || line.starts_with("Caused by:") {
            let cause = captures.get(2).map(|cause| cause.as_str().to_string()).filter(|cause| !cause.is_empty());
            found = Some((captures[1].to_string(), cause));
        }
    }
    found
}

fn own_frame(entry: &Entry, own_code: &[String]) -> Option<String> {
    entry.trace.iter().find_map(|line| {
        let (method, _) = line.trim_start().strip_prefix("at ")?.split_once('(')?;
        own_code
            .iter()
            .any(|prefix| !prefix.is_empty() && method.starts_with(prefix.as_str()))
            .then(|| method.to_string())
    })
}

/// `entries` in the order they were written, so the last one of a group is its newest.
fn problems(entries: &[Entry], own_code: &[String]) -> Vec<Problem> {
    let mut problems: Vec<Problem> = Vec::new();
    let mut groups: HashMap<String, usize> = HashMap::new();
    for entry in entries {
        let exception = exception(entry);
        if exception.is_none() && entry.level > Level::Warn {
            continue;
        }
        let frame = exception.as_ref().and_then(|_| own_frame(entry, own_code));
        let key = match &exception {
            Some((kind, _)) => format!("{kind}|{}", frame.as_deref().unwrap_or_default()),
            None => format!(
                "{:?}|{}|{}",
                entry.level,
                entry.logger.as_deref().unwrap_or_default(),
                normalized(&entry.message)
            ),
        };
        let (kind, cause) = exception.unzip();
        match groups.get(&key) {
            Some(&index) => {
                let problem = &mut problems[index];
                problem.count += 1;
                problem.last = entry.at;
                problem.level = problem.level.min(entry.level);
                problem.cause = cause.flatten();
                problem.message.clone_from(&entry.message);
                problem.trace = capped(entry.trace.clone());
                if !problem.pods.contains(&entry.pod) {
                    problem.pods.push(entry.pod.clone());
                }
            }
            None => {
                groups.insert(key, problems.len());
                problems.push(Problem {
                    level: entry.level,
                    exception: kind,
                    cause: cause.flatten(),
                    frame,
                    logger: entry.logger.clone(),
                    message: entry.message.clone(),
                    trace: capped(entry.trace.clone()),
                    count: 1,
                    first: entry.at,
                    last: entry.at,
                    pods: vec![entry.pod.clone()],
                });
            }
        }
    }
    problems.sort_by(|a, b| a.level.cmp(&b.level).then(b.count.cmp(&a.count)).then(b.last.cmp(&a.last)));
    problems
}

fn timeline(entries: &[Entry], (start, end): (i64, i64)) -> Vec<Bucket> {
    if end <= start {
        return Vec::new();
    }
    let width = (end - start + BUCKETS - 1) / BUCKETS;
    let mut buckets: Vec<Bucket> = (0..BUCKETS)
        .map(|index| Bucket { start: start + index * width, end: start + (index + 1) * width, errors: 0, warnings: 0 })
        .collect();
    for entry in entries {
        let bucket = &mut buckets[((entry.at - start) / width).clamp(0, BUCKETS - 1) as usize];
        match entry.level {
            Level::Error => bucket.errors += 1,
            Level::Warn => bucket.warnings += 1,
            _ => {}
        }
    }
    buckets
}

fn normalized(message: &str) -> String {
    VOLATILE.replace_all(message, "#").chars().take(MAX_KEY_CHARS).collect()
}

fn capped(mut trace: Vec<String>) -> Vec<String> {
    if trace.len() > MAX_TRACE_LINES {
        let more = trace.len() - MAX_TRACE_LINES;
        trace.truncate(MAX_TRACE_LINES);
        trace.push(format!("… {more} weitere Zeilen"));
    }
    trace
}

#[cfg(test)]
mod tests {
    use super::*;

    const SERVER: &str = "[pod/orders-api-7d4b96c6b8-mk29f/orders-api]";
    const WINDOW: (i64, i64) = (0, 86_400_000);
    const OTHER: &str = "[pod/orders-api-7d4b96c6b8-x9z2k/orders-api]";

    fn own_code() -> Vec<String> {
        vec!["com.example.".to_string()]
    }

    fn report(text: &str, window: (i64, i64)) -> LogReport {
        super::report(text, window, &own_code())
    }

    fn line(pod: &str, second: u32, raw: &str) -> String {
        format!("{pod} 2026-11-03T20:57:{second:02}.000000000Z {raw}\n")
    }

    fn mail_failure(pod: &str, second: u32, id: u32) -> String {
        [
            line(pod, second, &format!("2026-11-03T21:57:{second:02}.706+01:00 ERROR 7 --- [orders-api] [   scheduling-1] c.e.orders.mail.MailSender               : Versand {id} fehlgeschlagen")),
            line(pod, second, "org.springframework.mail.MailSendException: Mail server connection failed"),
            line(pod, second, "\tat org.springframework.mail.javamail.JavaMailSenderImpl.doSend(JavaMailSenderImpl.java:439)"),
            line(pod, second, "\tat com.example.orders.mail.MailSender.send(MailSender.kt:42)"),
            line(pod, second, "Caused by: org.eclipse.angus.mail.util.MailConnectException: Couldn't connect to host, port: mail, 587"),
            line(pod, second, "\t... 25 common frames omitted"),
            line(pod, second, ""),
        ]
        .concat()
    }

    #[test]
    fn groups_one_exception_at_one_place_over_pods_and_numbers() {
        let text = [mail_failure(SERVER, 1, 17), mail_failure(OTHER, 2, 18), mail_failure(SERVER, 3, 19)].concat();
        let report = report(&text, WINDOW);

        assert_eq!((report.entries, report.errors), (3, 3));
        assert_eq!(report.problems.len(), 1);
        let problem = &report.problems[0];
        assert_eq!(problem.exception.as_deref(), Some("org.eclipse.angus.mail.util.MailConnectException"));
        assert_eq!(problem.cause.as_deref(), Some("Couldn't connect to host, port: mail, 587"));
        assert_eq!(problem.frame.as_deref(), Some("com.example.orders.mail.MailSender.send"));
        assert_eq!(problem.logger.as_deref(), Some("c.e.orders.mail.MailSender"));
        assert_eq!(problem.message, "Versand 19 fehlgeschlagen");
        assert_eq!((problem.count, problem.pods.len()), (3, 2));
        assert_eq!(problem.trace.len(), 5, "the blank line after the trace is dropped");
    }

    #[test]
    fn groups_by_the_root_cause_only_without_own_code() {
        let failure = |second: u32, frame: &str| {
            [
                line(SERVER, second, "2026-11-03T21:57:01.000+01:00 ERROR 7 --- [main] c.e.o.Foo : kaputt"),
                line(SERVER, second, "java.lang.IllegalStateException: kaputt"),
                line(SERVER, second, &format!("\tat {frame}(Foo.kt:1)")),
            ]
            .concat()
        };
        let text = [failure(1, "com.example.orders.Foo.a"), failure(2, "com.example.orders.Foo.b")].concat();

        assert_eq!(report(&text, WINDOW).problems.len(), 2);
        let plain = super::report(&text, WINDOW, &[]);
        assert_eq!(plain.problems.len(), 1);
        assert_eq!(plain.problems[0].frame, None);
    }

    #[test]
    fn keeps_the_trace_with_its_own_pod_when_kubectl_interleaves_them() {
        let text = [
            line(SERVER, 1, "2026-11-03T21:57:01.000+01:00 ERROR 7 --- [main] c.e.o.Foo : kaputt"),
            line(OTHER, 1, "2026-11-03T21:57:01.000+01:00  INFO 7 --- [main] c.e.o.Bar : läuft"),
            line(SERVER, 1, "java.lang.IllegalStateException: kaputt"),
        ]
        .concat();
        let report = report(&text, WINDOW);
        let error = report.recent.iter().find(|entry| entry.level == Level::Error).unwrap();
        assert_eq!(error.trace, ["java.lang.IllegalStateException: kaputt"]);
    }

    #[test]
    fn reads_the_level_of_keycloak_gunicorn_and_plain_lines() {
        let text = [
            line("[pod/keycloak-79bc9cc68d-rrw24/keycloak]", 1, "2026-11-02 15:52:07,785 WARN  [org.keycloak.events] (executor-thread-9) type=LOGIN_ERROR, error=invalid_user_credentials"),
            line("[pod/report-api-6469fdff59-sxbdt/report-api]", 2, "[2026-10-14 11:15:31 +0000] [6] [WARNING] Invalid request from ip=192.0.2.10"),
            line("[pod/pdf-renderer-55f-abc/pdf-renderer]", 3, "converted page to pdf. buffer size: 23 kB"),
            line("[pod/pdf-renderer-55f-abc/pdf-renderer]", 4, "Error: Navigation timeout of 30000 ms exceeded"),
        ]
        .concat();
        let report = report(&text, WINDOW);

        let levels: Vec<Level> = report.recent.iter().map(|entry| entry.level).collect();
        assert_eq!(levels, [Level::Warn, Level::Warn, Level::Other, Level::Error]);
        assert_eq!(report.recent[0].logger.as_deref(), Some("org.keycloak.events"));
        assert_eq!(report.recent[1].message, "Invalid request from ip=192.0.2.10");
        assert_eq!(report.problems[0].level, Level::Error);
    }

    #[test]
    fn groups_a_message_without_exception_by_its_text_without_numbers() {
        let text = [
            line(SERVER, 1, "2026-11-03T21:57:01.000+01:00  WARN 7 --- [main] c.e.o.Foo : Eingang 4711 hängt seit 3 h"),
            line(SERVER, 2, "2026-11-03T21:57:02.000+01:00  WARN 7 --- [main] c.e.o.Foo : Eingang 4712 hängt seit 5 h"),
            line(SERVER, 3, "2026-11-03T21:57:03.000+01:00  INFO 7 --- [main] c.e.o.Foo : Eingang 4713 erledigt"),
        ]
        .concat();
        let report = report(&text, WINDOW);
        assert_eq!(report.problems.len(), 1, "INFO without exception is no problem");
        assert_eq!((report.problems[0].count, report.warnings), (2, 2));
    }

    #[test]
    fn puts_errors_and_warnings_into_the_slices_of_the_window() {
        let text = [
            mail_failure(SERVER, 1, 17),
            line(SERVER, 50, "2026-11-03T21:57:50.000+01:00  WARN 7 --- [main] c.e.o.Foo : langsam"),
        ]
        .concat();
        let start = epoch_millis("2026-11-03T20:57:00Z").unwrap();
        let report = report(&text, (start, start + 24_000));

        assert_eq!(report.timeline.len(), 24);
        assert_eq!(report.timeline[1], Bucket { start: start + 1000, end: start + 2000, errors: 1, warnings: 0 });
        assert_eq!(report.timeline[23].warnings, 1, "an entry after the window goes into the last slice");
        assert_eq!(counts(&text).errors, 1);
    }

    #[test]
    fn starts_the_timeline_where_every_pod_still_has_its_lines() {
        let spans = HashMap::from([
            ("a".to_string(), Span { lines: 3, first: 500 }),
            ("b".to_string(), Span { lines: 1, first: 200 }),
        ]);
        assert_eq!(complete_from(&spans, 100, 3), (500, true));
        assert_eq!(complete_from(&spans, 100, 4), (100, false));
        assert_eq!(report(&mail_failure(SERVER, 1, 17), WINDOW).cut_to, None);
    }

    #[test]
    fn has_no_timeline_for_an_empty_window() {
        assert!(report(&mail_failure(SERVER, 1, 17), (5, 5)).timeline.is_empty());
    }

    #[test]
    fn skips_what_kubectl_writes_itself_and_caps_long_traces() {
        let mut text = String::from("error: a container name must be specified\n");
        text.push_str(&line(SERVER, 1, "2026-11-03T21:57:01.000+01:00 ERROR 7 --- [main] c.e.o.Foo : tief"));
        for depth in 0..100 {
            text.push_str(&line(SERVER, 1, &format!("\tat com.example.orders.Deep.call{depth}(Deep.kt:1)")));
        }
        let report = report(&text, WINDOW);
        assert_eq!(report.entries, 1);
        assert_eq!(report.recent[0].trace.len(), MAX_TRACE_LINES + 1);
        assert_eq!(report.recent[0].trace.last().unwrap(), "… 40 weitere Zeilen");
    }
}
