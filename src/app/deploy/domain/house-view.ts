import { plural } from '../../core/format';
import type { Note } from '../../engine/model';
import { ENV_LABELS, Release, RepoDeploy } from '../model/deploy';

/** What the model railway and the release board in the office show. */
interface DeployView {
  /** The three repos with the most commits on their way, a wagon per commit. */
  readonly trains: number[];
  readonly notes: ReadonlyMap<string, Note>;
}

const waiting = (deploy: RepoDeploy): number => (deploy.waitingForTest ?? 0) + (deploy.waitingForProd ?? 0);

export function deployView(deploys: readonly RepoDeploy[], releases: readonly Release[]): DeployView {
  const toTest = deploys.reduce((sum, deploy) => sum + (deploy.waitingForTest ?? 0), 0);
  const toProd = deploys.reduce((sum, deploy) => sum + (deploy.waitingForProd ?? 0), 0);
  const notes = new Map<string, Note>();
  if (deploys.length > 0)
    notes.set('buero/gleisplan', {
      text: `${toTest} Commits warten auf TEST, ${toProd} auf PROD`,
      tone: null,
    });
  if (releases.length > 0)
    notes.set('buero/releases', {
      text: releases
        .map(
          (release) =>
            `${ENV_LABELS[release.from]} nach ${ENV_LABELS[release.to]}: ${plural(release.tickets.length, 'Ticket', 'Tickets')}`,
        )
        .join(' · '),
      tone: null,
    });
  return {
    trains: [...deploys]
      .sort((a, b) => waiting(b) - waiting(a))
      .slice(0, 3)
      .map(waiting),
    notes,
  };
}
