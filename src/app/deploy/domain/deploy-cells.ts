import { DAY_MONTH, MOMENT } from '../../core/format';
import { AppKind, KIND_LABELS } from '../model/deploy';
import { Env, ENV_LABELS, EnvDeploy, RepoDeploy } from '../model/deploy';

const BUILD_TAG = /^build-(.+)-(\d+)$/;

export interface TagCell {
  text: string;
  /** A build of another branch, like a TEST build on PROD. */
  foreign: boolean;
  inactive: boolean;
  since: string;
  next: string | null;
  /** How many units of the repo run something else, null when all run the same. */
  deviating: string | null;
  title: string;
}

interface CountCell {
  text: string;
  pending: boolean;
  title: string;
}

interface Row {
  name: string;
  kind: AppKind;
  kindLabel: string;
  unitTitle: string;
  envs: TagCell[];
  toTest: CountCell;
  toProd: CountCell;
  github: string | null;
  githubLabel: string;
}

/** `build-prod-530` on PROD shows as 530; a tag of another branch stays whole, so it stands out. */
export function tagCell(deploy: EnvDeploy): TagCell {
  const label = ENV_LABELS[deploy.env];
  const deviating = deploy.deviations.length > 0 ? `${deploy.deviations.length} abweichend` : null;
  const deviations = deploy.deviations.map(
    (deviation) =>
      `${deviation.unit}: ${deviation.tag ?? 'kein Tag'}${deviation.active ? '' : ', auskommentiert'}`,
  );
  if (!deploy.tag) {
    const lines = [`Kein Tag für ${label} in gitops`, ...deviations];
    return {
      text: '-',
      foreign: false,
      inactive: !deploy.active,
      since: '',
      next: null,
      deviating,
      title: lines.join('\n'),
    };
  }
  const match = BUILD_TAG.exec(deploy.tag);
  const foreign = !!match && match[1] !== deploy.env;
  const lines = [deploy.tag];
  if (deploy.since !== null) {
    lines.push(`gesetzt am ${MOMENT.format(deploy.since)}`);
  }
  if (!deploy.active) {
    lines.push(`in clusters/${deploy.env} auskommentiert, läuft also nicht`);
  }
  if (deploy.nextTag) {
    lines.push(`${deploy.nextTag} steht schon auf gitops main, der Merge nach prod fehlt noch`);
  }
  if (deviations.length > 0) {
    lines.push('Andere Apps des Repos weichen ab:', ...deviations);
  }
  return {
    text: match && !foreign ? match[2] : deploy.tag,
    foreign,
    inactive: !deploy.active,
    since: deploy.since === null ? '' : DAY_MONTH.format(deploy.since),
    next: deploy.nextTag ? (BUILD_TAG.exec(deploy.nextTag)?.[2] ?? deploy.nextTag) : null,
    deviating,
    title: lines.join('\n'),
  };
}

export function countCell(count: number | null, from: Env, to: Env, repo: string): CountCell {
  if (count === null) {
    return { text: '-', pending: false, title: `origin/${from} oder origin/${to} fehlt im Repo ${repo}` };
  }
  return {
    text: String(count),
    pending: count > 0,
    title: `${count} Commits auf ${from}, die noch nicht auf ${to} sind (ohne Merges)`,
  };
}

export function row(deploy: RepoDeploy): Row {
  return {
    name: deploy.name,
    kind: deploy.kind,
    kindLabel: KIND_LABELS[deploy.kind],
    unitTitle: `gitops: ${deploy.units.join(', ')}`,
    envs: deploy.envs.map(tagCell),
    toTest: countCell(deploy.waitingForTest, 'dev', 'test', deploy.name),
    toProd: countCell(deploy.waitingForProd, 'test', 'prod', deploy.name),
    github: deploy.github,
    githubLabel: `${deploy.name} auf GitHub öffnen`,
  };
}
