export type AppKind = 'frontend' | 'backend' | 'service' | 'infra';

export interface Group {
  readonly id: string;
  readonly label: string;
  /** The shared infrastructure, shown after the others. */
  readonly side: boolean;
}

interface Loc {
  readonly total: number;
  readonly production: number;
  readonly test: number;
  readonly files: number;
  readonly byLanguage: readonly { readonly language: string; readonly lines: number }[];
}

interface GitStats {
  readonly lastCommit: string | null;
  readonly commits30: number;
  readonly commits90: number;
  readonly contributors90: number;
}

export interface AppInfo {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly kind: AppKind;
  readonly repo: string | null;
  readonly path: string | null;
  /** The repo is not checked out in the workspace. */
  readonly missing: boolean;
  readonly ports: readonly number[];
  readonly tech: readonly string[];
  readonly loc: Loc | null;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  /** Gradle modules or the Nx libs the app reaches. */
  readonly modules: readonly string[];
  readonly git: GitStats | null;
  /** Addresses in the config that belong to no known app. */
  readonly unresolved: readonly string[];
}

export interface Edge {
  readonly from: string;
  readonly to: string;
  /** `link` points at a frontend, `call` at anything else. */
  readonly kind: 'call' | 'link';
  /** Config file and key that point at the target. */
  readonly via: readonly string[];
}

/** One scan of the workspace. */
export interface Snapshot {
  /** Epoch millis. */
  readonly generatedAt: number;
  readonly groups: readonly Group[];
  readonly apps: readonly AppInfo[];
  readonly edges: readonly Edge[];
}
