import { CLOCK, NUMBER, plural } from '../../core/format';
import { Bucket, Level, LogEntry, LogReport, Problem } from '../model/cluster';

const TIME = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const MOMENT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
/** A slice with a single entry stays visible next to one with hundreds. */
const MIN_BAR_PERCENT = 8;

type LevelFilter = 'all' | 'error' | 'warn';

const LEVEL_LABELS: Record<Level, string> = {
  error: 'ERROR',
  warn: 'WARN',
  info: 'INFO',
  debug: 'DEBUG',
  other: '-',
};

interface ProblemRow {
  key: string;
  level: Level;
  levelLabel: string;
  count: string;
  /** The exception without its package, or the logger for a plain message. */
  title: string;
  titleFull: string;
  detail: string;
  /** `SenderService.send` of the first frame in our own code. */
  frame: string | null;
  frameFull: string | null;
  when: string;
  whenTitle: string;
  trace: string;
}

export interface EntryRow {
  key: string;
  time: string;
  /** The random suffix of the pod name tells the replicas apart. */
  pod: string;
  podFull: string;
  level: Level;
  levelLabel: string;
  logger: string | null;
  message: string;
  trace: string | null;
}

interface TimelineLane {
  level: 'error' | 'warn';
  label: string;
  bars: { key: number; height: number; title: string }[];
}

interface Timeline {
  label: string;
  from: string;
  to: string;
  lanes: TimelineLane[];
}

/** One lane per level, each on its own scale: red and amber stacked are too close to tell apart. */
export function timeline(buckets: Bucket[]): Timeline | null {
  const errors = buckets.reduce((sum, bucket) => sum + bucket.errors, 0);
  const warnings = buckets.reduce((sum, bucket) => sum + bucket.warnings, 0);
  if (buckets.length === 0 || errors + warnings === 0) {
    return null;
  }
  const lane = (level: TimelineLane['level'], [one, many]: [string, string], total: number): TimelineLane => {
    const count = (bucket: Bucket) => (level === 'error' ? bucket.errors : bucket.warnings);
    const max = Math.max(...buckets.map(count));
    return {
      level,
      label: `${many} ${NUMBER.format(total)}`,
      bars: buckets.map((bucket) => ({
        key: bucket.start,
        height: count(bucket) === 0 ? 0 : Math.max(MIN_BAR_PERCENT, (count(bucket) / max) * 100),
        title: `${CLOCK.format(bucket.start)} bis ${CLOCK.format(bucket.end)}: ${plural(count(bucket), one, many)}`,
      })),
    };
  };
  const from = MOMENT.format(buckets[0].start);
  const to = MOMENT.format(buckets[buckets.length - 1].end);
  return {
    label: `${NUMBER.format(errors)} Fehler und ${plural(warnings, 'Warnung', 'Warnungen')} von ${from} bis ${to}`,
    from,
    to,
    lanes: [lane('error', ['Fehler', 'Fehler'], errors), lane('warn', ['Warnung', 'Warnungen'], warnings)],
  };
}

export function summary(report: LogReport): string {
  if (report.entries === 0 || report.from === null || report.to === null) {
    return 'Keine Einträge im Zeitraum.';
  }
  return [
    `${plural(report.entries, 'Eintrag', 'Einträge')} von ${plural(report.pods.length, 'Pod', 'Pods')}`,
    `${MOMENT.format(report.from)} bis ${MOMENT.format(report.to)}`,
    `${NUMBER.format(report.errors)} Fehler`,
    plural(report.warnings, 'Warnung', 'Warnungen'),
    report.cutTo === null ? '' : `gekürzt auf die neuesten ${NUMBER.format(report.cutTo)} Zeilen je Pod`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function problemRow(problem: Problem, index: number): ProblemRow {
  const title = problem.exception ?? problem.logger ?? 'Meldung';
  const pods = plural(problem.pods.length, 'Pod', 'Pods');
  const since = problem.first === problem.last ? '' : `, zuerst ${MOMENT.format(problem.first)}`;
  return {
    key: `${index}-${title}`,
    level: problem.level,
    levelLabel: LEVEL_LABELS[problem.level],
    count: `${NUMBER.format(problem.count)}×`,
    title: lastSegments(title, 1),
    titleFull: title,
    detail: problem.cause ?? problem.message,
    frame: problem.frame && lastSegments(problem.frame, 2),
    frameFull: problem.frame,
    when: `zuletzt ${MOMENT.format(problem.last)}`,
    whenTitle: `${pods}${since}`,
    trace: [problem.message, ...problem.trace].join('\n'),
  };
}

/** Newest first, the way a log is read when something just broke. */
export function entryRows(entries: LogEntry[], filter: LevelFilter): EntryRow[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => filter === 'all' || entry.level === filter)
    .reverse()
    .map(({ entry, index }) => ({
      key: `${index}`,
      time: TIME.format(entry.at),
      pod: entry.pod.slice(entry.pod.lastIndexOf('-') + 1),
      podFull: entry.pod,
      level: entry.level,
      levelLabel: LEVEL_LABELS[entry.level],
      logger: entry.logger,
      message: entry.message,
      trace: entry.trace.length > 0 ? entry.trace.join('\n') : null,
    }));
}

function lastSegments(name: string, count: number): string {
  return name.split('.').slice(-count).join('.');
}
