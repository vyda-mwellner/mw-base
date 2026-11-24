import type { Env } from '../../stages/model/env';

export type { Env } from '../../stages/model/env';
export { ENV_LABELS, ENVS } from '../../stages/model/env';

export type AppKind = 'frontend' | 'backend' | 'service' | 'infra';

export const KIND_LABELS: Readonly<Record<AppKind, string>> = {
  frontend: 'GUI',
  backend: 'Backend',
  service: 'Dienst',
  infra: 'Infrastruktur',
};

interface RepoFetch {
  name: string;
  /** Epoch millis of the last git fetch, null when the repo was never fetched or is missing. */
  fetchedAt: number | null;
}

export interface EnvDeploy {
  env: Env;
  tag: string | null;
  /** Epoch millis of the gitops commit that set the tag on the branch the cluster reads. */
  since: number | null;
  /** Listed, and not commented out, in the cluster kustomization of the env. */
  active: boolean;
  /** PROD only: a tag CI already wrote to gitops main that the release merge has not brought to prod yet. */
  nextTag: string | null;
  /** The units of the repo whose tag or state differs from the first unit, which the other fields describe. */
  deviations: Deviation[];
}

interface Deviation {
  unit: string;
  tag: string | null;
  active: boolean;
}

export interface RepoDeploy {
  /** The repo, or the app id for an app without one. */
  name: string;
  group: string;
  kind: AppKind;
  /** Folder names in gitops of the apps built from the repo. */
  units: string[];
  envs: EnvDeploy[];
  /** Commits on dev not on test, and on test not on prod, merges left out; null when a branch is missing. */
  waitingForTest: number | null;
  waitingForProd: number | null;
  /** The page of the repo, from its origin remote; null for a remote elsewhere. */
  github: string | null;
}

export interface DeployStatus {
  repos: RepoFetch[];
  deploys: RepoDeploy[];
  /** dev to test, then test to prod. */
  releases: Release[];
  links: GuiLink[];
}

interface GuiLink {
  id: string;
  label: string;
  group: string;
  /** The start page per env, from the ingress in gitops; missing where the GUI does not run. */
  urls: Partial<Record<Env, string>>;
}

export interface Ticket {
  key: string;
  /** The browse page in Jira. */
  url: string;
}

export interface ReleaseTicket extends Ticket {
  summary: string;
  repos: string[];
  /** Name from config/team.json, else the git author name; oldest commit first. */
  authors: string[];
}

export interface Untracked {
  repo: string;
  /** The oldest of the folded commits. */
  shortSha: string;
  subject: string;
  /** Commits of the repo in a row with this subject, folded into one line. */
  count: number;
}

/** What `from` has and `to` still lacks, by ticket over all repos. */
export interface Release {
  from: Env;
  to: Env;
  tickets: ReleaseTicket[];
  /** Commits without a ticket key, merges left out. */
  untracked: Untracked[];
}

interface CommitHit {
  repo: string;
  sha: string;
  shortSha: string;
  subject: string;
  author: string;
  /** Epoch millis. */
  date: number;
  /** The envs whose branch contains the commit. */
  on: Env[];
  tickets: Ticket[];
}

interface TicketRepo {
  repo: string;
  commits: number;
  /** Per env: how many of those commits its branch contains. */
  on: Record<Env, number>;
}

export interface TicketHit extends Ticket {
  summary: string;
  repos: TicketRepo[];
}

export interface CommitSearch {
  hits: CommitHit[];
  /** Only tickets whose key holds the search term: for them the search found every commit. */
  tickets: TicketHit[];
}
