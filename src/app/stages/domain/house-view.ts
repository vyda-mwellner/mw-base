import type { EnvFact } from '../../building/facts';
import type { Note, Tone } from '../../engine/model';
import type { ForwardStatus, ForwardTarget, Incidents } from '../model/cluster';
import type { ConnectionStatus } from '../model/database';
import { Env, ENV_LABELS, ENVS } from '../model/env';
import { incidentSigns } from './signs';

export interface StageInput {
  /** The worst state of every stage read so far. */
  readonly tones: Partial<Record<Env, Tone | null>>;
  readonly incidents: Incidents;
  readonly targets: readonly ForwardTarget[];
  readonly running: readonly ForwardStatus[];
  readonly connections: readonly ConnectionStatus[];
  readonly now: number;
}

/** What the server room and the key board in the entrance show of the stages. */
interface StageView {
  readonly envs: EnvFact[];
  /** A port per forward of the config, lit while it runs on any stage. */
  readonly forwards: boolean[];
  /** A drive per connection, true while its password is unlocked. */
  readonly databases: boolean[];
  /** A hook per password and per running forward, true while that access is open. */
  readonly keys: boolean[];
  /** Days PROD has gone without a restart, null while nobody knows. */
  readonly prodCalm: number | null;
  readonly notes: ReadonlyMap<string, Note>;
}

const SEVERITY: readonly Tone[] = ['danger', 'warning', 'info'];
const worst = (tones: readonly (Tone | null)[]): Tone | null =>
  SEVERITY.find((tone) => tones.includes(tone)) ?? null;
const STATE: Readonly<Record<Tone, string>> = { danger: 'Störung', warning: 'Warnung', info: 'neu' };

export function stageView(input: StageInput): StageView {
  const signs = incidentSigns(input.incidents, input.now);
  const read = signs.filter((sign) => sign.tone !== 'unread');
  const calmOf = (env: Env): number | null => {
    const days = Number(signs.find((sign) => sign.env === env)?.days);
    return Number.isFinite(days) ? days : null;
  };
  const envs = ENVS.map((env): EnvFact => ({
    name: ENV_LABELS[env],
    tone: input.tones[env] ?? null,
    seen: env in input.tones,
    calm: calmOf(env),
  }));
  const locked = input.connections.filter((connection) => connection.requiresPassword);
  const open = locked.filter((connection) => !connection.locked);
  const running = input.running.filter((forward) => forward.running);
  const ended = input.running.filter((forward) => !forward.running);
  const productionOpen = open.some((connection) => connection.production);

  const seenEnvs = ENVS.filter((env) => env in input.tones);
  const notes = new Map<string, Note>([
    [
      'serverraum/cluster',
      seenEnvs.length === 0
        ? { text: 'Noch keine Stage gelesen', tone: null }
        : {
            text: seenEnvs
              .map((env) => `${ENV_LABELS[env]} ${input.tones[env] ? STATE[input.tones[env]!] : 'läuft'}`)
              .join(' · '),
            tone: worst(seenEnvs.map((env) => input.tones[env] ?? null)),
          },
    ],
    [
      'serverraum/restarts',
      {
        text:
          read.length === 0
            ? 'Noch keine Stage gelesen'
            : `${read.map((sign) => `${sign.label} ${sign.days}`).join(' · ')} Tage ohne Restart`,
        tone: signs.some((sign) => sign.tone === 'fresh') ? 'info' : null,
      },
    ],
    [
      'serverraum/daten',
      {
        text:
          open.length === 0
            ? 'Alle Passwörter gesperrt'
            : `Offen: ${open.map((each) => each.label).join(', ')}`,
        tone: productionOpen ? 'warning' : null,
      },
    ],
    [
      'serverraum/forwards',
      ended.length > 0
        ? { text: `${ended[0].label} beendet: ${ended[0].error ?? 'ohne Meldung'}`, tone: 'warning' }
        : {
            text:
              running.length === 0
                ? 'Kein Forward läuft'
                : `Läuft: ${running.map((forward) => `${ENV_LABELS[forward.env]} ${forward.label}`).join(', ')}`,
            tone: null,
          },
    ],
    [
      'empfang/schluessel',
      {
        text:
          open.length + running.length === 0
            ? 'Alle Schlüssel hängen am Brett'
            : `Draußen: ${[...open.map((each) => each.label), ...running.map((forward) => `Forward ${forward.label}`)].join(', ')}`,
        tone: productionOpen ? 'warning' : null,
      },
    ],
  ]);
  return {
    envs,
    forwards: input.targets.map((target) => running.some((forward) => forward.id === target.id)),
    databases: input.connections.map((connection) => connection.requiresPassword && !connection.locked),
    keys: [...locked.map((connection) => !connection.locked), ...running.map(() => true)],
    prodCalm: calmOf('prod'),
    notes,
  };
}
