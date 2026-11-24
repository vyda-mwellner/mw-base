/** `einstellungen/backup.json`, kept by hand. */
export interface Plan {
  /** The folder everything goes into, like a cloud drive. */
  readonly targetDir: string;
  readonly entries: readonly Entry[];
}

export interface Entry {
  /** A file or a folder, `~/` is the home directory. */
  readonly source: string;
  /** Relative to the target dir. */
  readonly target: string;
  readonly exclude: readonly string[];
}

export interface Outcome {
  readonly source: string;
  readonly copied: number;
  readonly unchanged: number;
  readonly error: string | null;
}

/** What the window keeps of the last run, so the chest still knows after a restart. */
export interface LastRun {
  /** Epoch millis. */
  readonly ranAt: number;
  readonly outcomes: readonly Outcome[];
}
