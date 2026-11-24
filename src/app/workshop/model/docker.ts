export interface Container {
  readonly id: string;
  readonly name: string;
  readonly image: string;
  /** As docker says it: running, exited, restarting, created, paused, dead. */
  readonly state: string;
  /** Docker's own words, like "Up 2 hours" or "Exited (1) 3 minutes ago". */
  readonly status: string;
  readonly ports: string;
}

/** A folder of local-setup with a docker-compose.yml. */
export interface Stack {
  readonly name: string;
  /** Started by `setup up` without a folder. */
  readonly defaultStack: boolean;
  readonly containers: readonly Container[];
}

export interface DockerOverview {
  readonly stacks: readonly Stack[];
  /** Running containers of other projects. */
  readonly others: readonly Container[];
}

export type StackAction = 'up' | 'down' | 'restart';

export interface SetupCommand {
  readonly kind: StackAction;
  readonly stack: string;
}

export interface LogLine {
  readonly stream: 'command' | 'stdout' | 'stderr';
  readonly text: string;
}

/** A line as the log shows it: numbered, so the oldest can drop out without every other line being drawn anew. */
export interface ShownLine extends LogLine {
  readonly seq: number;
}

/** What one command asks for, by stack name. */
export interface StackChange {
  readonly up: readonly string[];
  readonly down: readonly string[];
}
