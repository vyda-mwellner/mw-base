import type { Env } from './env';

export type Since = '1h' | '6h' | '24h' | '72h';

export const SINCE_CHOICES: { id: Since; label: string }[] = [
  { id: '1h', label: '1 Std' },
  { id: '6h', label: '6 Std' },
  { id: '24h', label: '24 Std' },
  { id: '72h', label: '72 Std' },
];

interface Termination {
  /** OOMKilled, Error, Completed. */
  reason: string;
  exitCode: number | null;
  finishedAt: number | null;
}

export interface Pod {
  name: string;
  phase: string;
  ready: boolean;
  restarts: number;
  startedAt: number | null;
  /** Why a container does not run, like CrashLoopBackOff. */
  waiting: string | null;
  lastTermination: Termination | null;
  /** From the metrics-server, null when it has no figure for the pod. */
  memoryMib: number | null;
  cpuMillis: number | null;
}

export interface Workload {
  id: string;
  label: string;
  group: string;
  namespace: string;
  /** Null when the namespace has no deployment of the app. */
  desired: number | null;
  ready: number;
  tag: string | null;
  /** The tag gitops gives the unit for this env. */
  gitopsTag: string | null;
  /** Null when the deployment sets no memory limit. */
  memoryLimitMib: number | null;
  pods: Pod[];
  /** Why the namespace could not be read. */
  error: string | null;
}

export type Level = 'error' | 'warn' | 'info' | 'debug' | 'other';

export interface LogEntry {
  at: number;
  pod: string;
  level: Level;
  logger: string | null;
  message: string;
  trace: string[];
}

/** Entries of one kind: one exception at one place, or one message with other numbers. */
export interface Problem {
  level: Level;
  /** The root cause, the last Caused by. */
  exception: string | null;
  cause: string | null;
  /** The first frame in our own code. */
  frame: string | null;
  logger: string | null;
  /** Message and trace of the newest entry. */
  message: string;
  trace: string[];
  count: number;
  first: number;
  last: number;
  pods: string[];
}

export interface LogReport {
  entries: number;
  errors: number;
  warnings: number;
  from: number | null;
  to: number | null;
  pods: string[];
  problems: Problem[];
  /** The newest entries, oldest first. */
  recent: LogEntry[];
  /** 24 slices of the time asked for, from where every pod is complete. */
  timeline: Bucket[];
  /** The line limit per pod when a pod reached it and lost its oldest lines. */
  cutTo: number | null;
}

export interface Bucket {
  start: number;
  end: number;
  errors: number;
  warnings: number;
}

/** ERROR and WARN entries of the last hour. */
export interface ErrorCount {
  id: string;
  errors: number | null;
  warnings: number | null;
  /** Why the logs could not be read. */
  error: string | null;
}

export interface LogRequest {
  env: Env;
  appId: string;
  since: Since;
}

export interface ForwardTarget {
  id: string;
  label: string;
  localPort: number;
  /** The envs that have it, all when empty. */
  envs: Env[];
}

export interface ForwardStatus {
  env: Env;
  id: string;
  label: string;
  localPort: number;
  startedAt: number;
  running: boolean;
  /** The last line of kubectl, once it ended. */
  error: string | null;
}

export interface Forwards {
  targets: ForwardTarget[];
  running: ForwardStatus[];
}

/** A container restart: `OOMKilled`, `Error` or any other last state a pod still shows. */
interface Incident {
  at: number;
  app: string;
  reason: string;
}

/** Since when the app watches an env and the newest restart it saw there, kept in `incidents.json`. */
interface IncidentRecord {
  watchedSince: number;
  last: Incident | null;
}

export type Incidents = Partial<Record<Env, IncidentRecord>>;
