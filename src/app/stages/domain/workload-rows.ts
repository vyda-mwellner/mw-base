import { MOMENT, plural } from '../../core/format';
import { Group, inGroups } from '../../core/groups';
import { ErrorCount, Pod, Workload } from '../model/cluster';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type Health = 'ok' | 'warning' | 'danger' | 'off';
type Load = 'ok' | 'warning' | 'danger';

export interface WorkloadRow {
  id: string;
  label: string;
  namespace: string;
  health: Health;
  state: string;
  stateTitle: string;
  pods: string;
  restarts: number;
  /** The newest crash, like `OOMKilled vor 2 Std`. */
  restartNote: string;
  restartTitle: string;
  runningFor: string;
  /** The pod that uses the most, against the limit when there is one. */
  memory: string;
  memoryLoad: Load;
  memoryTitle: string;
  noLimit: boolean;
  cpu: string;
  errors: string;
  hasErrors: boolean;
  errorsTitle: string;
  tag: string;
  /** Names the gitops tag when it differs, only in the tooltip: the local refs are as old as the last fetch. */
  tagTitle: string;
  logsLabel: string;
}

export function workloadGroups(
  workloads: Workload[],
  now: number,
  counts: ErrorCount[] = [],
): Group<WorkloadRow>[] {
  return inGroups(
    workloads,
    (workload) => workload.group,
    (workload) =>
      workloadRow(
        workload,
        now,
        counts.find((count) => count.id === workload.id),
      ),
  );
}

export function workloadRow(workload: Workload, now: number, count?: ErrorCount): WorkloadRow {
  const [health, state, stateTitle] = healthOf(workload, now);
  const crashes = workload.pods.filter((pod) => pod.lastTermination).sort(byLastCrash);
  const newest = crashes[0]?.lastTermination;
  const started = workload.pods.map((pod) => pod.startedAt).filter((at) => at !== null);
  const drift =
    workload.tag && workload.gitopsTag && workload.tag !== workload.gitopsTag ? workload.gitopsTag : null;
  return {
    id: workload.id,
    label: workload.label,
    namespace: workload.namespace,
    health,
    state,
    stateTitle,
    pods: workload.desired === null ? '-' : `${workload.ready}/${workload.desired}`,
    restarts: workload.pods.reduce((sum, pod) => sum + pod.restarts, 0),
    restartNote: newest?.finishedAt
      ? `${newest.reason} vor ${duration(now - newest.finishedAt)}`
      : (newest?.reason ?? ''),
    restartTitle: workload.pods.map(restartLine).join('\n'),
    runningFor: started.length > 0 ? `seit ${duration(now - Math.max(...started))}` : '',
    ...memoryOf(workload),
    ...errorsOf(count),
    tag: workload.tag ?? '-',
    tagTitle: [
      workload.tag ?? 'kein Tag',
      drift
        ? `gitops nach dem letzten Fetch: ${drift}, "Alle fetchen" am Gleisplan im Büro holt den neuen Stand`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    logsLabel: `Logs von ${workload.label} öffnen`,
  };
}

function memoryOf(
  workload: Workload,
): Pick<WorkloadRow, 'memory' | 'memoryLoad' | 'memoryTitle' | 'noLimit' | 'cpu'> {
  const limit = workload.memoryLimitMib;
  const noLimit = limit === null && workload.desired !== null;
  const memories = workload.pods.map((pod) => pod.memoryMib).filter((mib) => mib !== null);
  const cpus = workload.pods.map((pod) => pod.cpuMillis).filter((millis) => millis !== null);
  const limitLine = noLimit
    ? 'Kein Memory-Limit gesetzt: die JVM richtet ihren Heap dann nach dem RAM des Nodes aus'
    : limit === null
      ? ''
      : `Limit ${limit} MiB je Container`;
  if (memories.length === 0) {
    const title = ['Der metrics-server liefert für die Pods keine Werte', limitLine]
      .filter(Boolean)
      .join('\n');
    return { memory: '-', memoryLoad: 'ok', memoryTitle: title, noLimit, cpu: '' };
  }
  const highest = Math.max(...memories);
  const share = limit ? highest / limit : 0;
  const pods = workload.pods.map(
    (pod) => `${pod.name}: ${pod.memoryMib ?? '?'} MiB, ${pod.cpuMillis ?? '?'}m CPU`,
  );
  return {
    memory: limit ? `${highest} / ${limit} MiB` : `${highest} MiB`,
    memoryLoad: share >= 0.95 ? 'danger' : share >= 0.8 ? 'warning' : 'ok',
    memoryTitle: [...pods, limitLine].filter(Boolean).join('\n'),
    noLimit,
    cpu: cpus.length > 0 ? `${Math.max(...cpus)}m CPU` : '',
  };
}

function errorsOf(count: ErrorCount | undefined): Pick<WorkloadRow, 'errors' | 'hasErrors' | 'errorsTitle'> {
  if (!count) {
    return { errors: '…', hasErrors: false, errorsTitle: 'Wird gezählt, alle 5 Minuten neu' };
  }
  if (count.errors === null) {
    return { errors: '?', hasErrors: false, errorsTitle: count.error ?? 'Logs nicht lesbar' };
  }
  return {
    errors: `${count.errors}`,
    hasErrors: count.errors > 0,
    errorsTitle: `${count.errors} ERROR und ${count.warnings ?? 0} WARN in den letzten 3 Stunden, alle 5 Minuten neu gezählt`,
  };
}

function healthOf(workload: Workload, now: number): [Health, string, string] {
  if (workload.error) {
    return ['danger', 'nicht lesbar', workload.error];
  }
  if (workload.desired === null) {
    return ['off', 'nicht deployt', `Kein Deployment der App im Namespace ${workload.namespace}`];
  }
  if (workload.desired === 0) {
    return ['off', 'auf 0 skaliert', 'Das Deployment fordert keinen Pod an'];
  }
  const waiting = workload.pods.find((pod) => pod.waiting)?.waiting;
  if (waiting) {
    return ['danger', waiting, `Ein Container wartet: ${waiting}`];
  }
  if (workload.ready === 0) {
    return ['danger', 'nicht bereit', 'Kein Pod ist bereit'];
  }
  if (workload.ready < workload.desired) {
    return ['warning', `${workload.ready} von ${workload.desired} bereit`, 'Nicht alle Pods sind bereit'];
  }
  const crashedToday = workload.pods.some((pod) => (pod.lastTermination?.finishedAt ?? 0) > now - DAY);
  if (crashedToday) {
    return ['warning', 'neu gestartet', 'Ein Container ist in den letzten 24 Stunden neu gestartet'];
  }
  return ['ok', 'läuft', 'Alle Pods bereit'];
}

function byLastCrash(a: Pod, b: Pod): number {
  return (b.lastTermination?.finishedAt ?? 0) - (a.lastTermination?.finishedAt ?? 0);
}

function restartLine(pod: Pod): string {
  const crash = pod.lastTermination;
  if (!crash) {
    return `${pod.name}: ${plural(pod.restarts, 'Neustart', 'Neustarts')}`;
  }
  const exit = crash.exitCode === null ? '' : `, Exit ${crash.exitCode}`;
  const when = crash.finishedAt === null ? '' : ` am ${MOMENT.format(crash.finishedAt)}`;
  return `${pod.name}: ${plural(pod.restarts, 'Neustart', 'Neustarts')}, zuletzt ${crash.reason}${exit}${when}`;
}

export function duration(ms: number): string {
  if (ms < MINUTE) {
    return '< 1 Min';
  }
  if (ms < HOUR) {
    return `${Math.floor(ms / MINUTE)} Min`;
  }
  if (ms < DAY) {
    return `${Math.floor(ms / HOUR)} Std`;
  }
  return `${Math.floor(ms / DAY)} T`;
}

/** The row in one line for a sheet: state, pods, restarts with the newest crash, errors and memory. */
export function reportOf(row: WorkloadRow): string {
  const restarts = row.restarts === 0 ? '' : plural(row.restarts, 'Neustart', 'Neustarts');
  return [
    row.state,
    row.pods === '-' ? '' : `${row.pods} Pods`,
    [restarts, row.restartNote].filter(Boolean).join(', '),
    row.errors === '…' ? '' : `${row.errors} Fehler`,
    row.memory === '-' ? '' : row.memory,
  ]
    .filter(Boolean)
    .join(' · ');
}
