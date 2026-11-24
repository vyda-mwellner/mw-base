import { KIND_LABELS } from '../model/deploy';
import { Env, ENV_LABELS, RepoDeploy } from '../model/deploy';
import { countCell, tagCell } from './deploy-cells';

/** More wagons than this would push the stations apart, the rest shows as a number. */
const MAX_CARS = 8;

interface Train {
  /** No tag in gitops for the env: an empty platform. */
  empty: boolean;
  text: string;
  title: string;
  foreign: boolean;
  inactive: boolean;
  deviating: boolean;
}

interface Cars {
  keys: number[];
  more: string;
  title: string;
}

interface Track {
  name: string;
  kindLabel: string;
  unitTitle: string;
  dev: Train;
  test: Train;
  prod: Train;
  toTest: Cars;
  toProd: Cars;
  /** The PROD build already on gitops main, waiting in front of the last station for the release merge. */
  incoming: string | null;
}

export function track(deploy: RepoDeploy): Track {
  const trainOn = (env: Env): Train => {
    const found = deploy.envs.find((candidate) => candidate.env === env);
    const cell = found
      ? tagCell(found)
      : {
          text: '-',
          title: `Kein Tag für ${ENV_LABELS[env]} in gitops`,
          foreign: false,
          inactive: false,
          deviating: null,
        };
    return {
      empty: !found?.tag,
      text: cell.text,
      title: cell.title,
      foreign: cell.foreign,
      inactive: cell.inactive,
      deviating: cell.deviating !== null,
    };
  };
  const prod = deploy.envs.find((candidate) => candidate.env === 'prod');
  return {
    name: deploy.name,
    kindLabel: KIND_LABELS[deploy.kind],
    unitTitle: `gitops: ${deploy.units.join(', ')}`,
    dev: trainOn('dev'),
    test: trainOn('test'),
    prod: trainOn('prod'),
    toTest: cars(deploy.waitingForTest, 'dev', 'test', deploy.name),
    toProd: cars(deploy.waitingForProd, 'test', 'prod', deploy.name),
    incoming: prod ? tagCell(prod).next : null,
  };
}

function cars(count: number | null, from: Env, to: Env, repo: string): Cars {
  const shown = Math.min(count ?? 0, MAX_CARS);
  return {
    keys: Array.from({ length: shown }, (_, index) => index),
    more: count !== null && count > MAX_CARS ? `+${count - MAX_CARS}` : '',
    title: countCell(count, from, to, repo).title,
  };
}
