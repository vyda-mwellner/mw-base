import type { Tone } from '../../engine/model';
import type { Container, SetupCommand, Stack, StackAction } from '../model/docker';
import type { ServiceHealth } from '../model/health';

export type LedTone = Tone | 'ok' | 'busy' | null;

/** A stack of local-setup as a row of the container sheet. */
export interface StackRow {
  readonly name: string;
  readonly isDefault: boolean;
  /** Something of it runs: Enter restarts it and X stops it, otherwise Enter starts it. */
  readonly running: boolean;
  readonly tone: LedTone;
  readonly note: string;
  readonly noteTone: Tone | null;
  /** Containers that are fine of all containers, empty while it has none. */
  readonly value: string;
}

export const DOING: Readonly<Record<StackAction, string>> = {
  up: 'wird gestartet',
  down: 'wird gestoppt',
  restart: 'wird neu gestartet',
};

export const isRunning = (container: Container): boolean => container.state === 'running';
/** An init container like minio-init that did its job. */
const isDone = (container: Container): boolean =>
  container.state === 'exited' && container.status.startsWith('Exited (0)');
/** Neither runs nor did its job: crashed, restarting, stuck. */
export const isBroken = (container: Container): boolean => !isRunning(container) && !isDone(container);

export function stackRow(
  stack: Stack,
  services: readonly ServiceHealth[],
  busy: SetupCommand | null,
): StackRow {
  const containers = stack.containers;
  const running = containers.some(isRunning);
  const fine = containers.filter((container) => isRunning(container) || isDone(container));
  const base = {
    name: stack.name,
    isDefault: stack.defaultStack,
    running,
    value: containers.length > 0 ? `${fine.length}/${containers.length}` : '',
  };
  if (busy?.stack === stack.name) return { ...base, tone: 'busy', note: DOING[busy.kind], noteTone: null };
  if (containers.length === 0) return { ...base, tone: null, note: 'nicht gestartet', noteTone: null };

  const broken = containers.find(isBroken);
  if (broken)
    return { ...base, tone: 'warning', note: `${broken.name}: ${broken.status}`, noteTone: 'warning' };

  const own = services.filter((service) => service.stack === stack.name);
  const down = own.find((service) => service.health === 'down');
  if (down) return { ...base, tone: 'danger', note: `${down.label}: ${down.detail}`, noteTone: 'danger' };
  // A Keycloak needs half a minute before its port opens.
  const waiting = own.find((service) => service.health === 'off');
  if (waiting)
    return { ...base, tone: 'warning', note: `${waiting.label} antwortet noch nicht`, noteTone: null };

  const answering = own.map((service) => service.label);
  const note =
    answering.length === 0
      ? 'läuft'
      : `läuft · ${answering.join(', ')} ${answering.length === 1 ? 'antwortet' : 'antworten'}`;
  return { ...base, tone: 'ok', note, noteTone: null };
}

/** Services with a health check that neither a stack runs nor are an app of the workspace, like a sidecar. */
export const looseServices = (services: readonly ServiceHealth[]): ServiceHealth[] =>
  services.filter(
    (service) => service.stack === null && (service.kind === 'infra' || service.kind === 'service'),
  );

export const HEALTH_TONE: Readonly<Record<ServiceHealth['health'], LedTone>> = {
  up: 'ok',
  down: 'danger',
  off: null,
};
