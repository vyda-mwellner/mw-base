export type DevServerPhase = 'off' | 'starting' | 'running' | 'external' | 'ended';

/** A frontend of `apps.json` with a repo and a local port, which the shell can serve from its checkout. */
export interface DevServer {
  readonly id: string;
  readonly label: string;
  readonly repo: string;
  readonly port: number;
  /** `starting` while it builds, `external` when something else holds the port, like a terminal. */
  readonly phase: DevServerPhase;
  /** Epoch millis, only for a server the shell started. */
  readonly startedAt: number | null;
  /** Why it ended on its own: its last line or the exit status. */
  readonly error: string | null;
}

/** What one key or one command asks for, by frontend id. */
export interface ServerChange {
  readonly start: readonly string[];
  readonly stop: readonly string[];
}

/** The shell may start it: an external server holds its port, a starting or running one is already there. */
export const STARTABLE: readonly DevServerPhase[] = ['off', 'ended'];
/** Only what the shell started itself, a server in a terminal stays untouched. */
export const STOPPABLE: readonly DevServerPhase[] = ['starting', 'running'];
