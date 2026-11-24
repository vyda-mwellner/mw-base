import type { ConnectionStatus } from '../model/database';
import { stageView, StageInput } from './house-view';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 22, 12).getTime();

const connection = (id: string, production: boolean, locked: boolean): ConnectionStatus => ({
  id,
  label: id.toUpperCase(),
  host: 'localhost',
  port: 5430,
  database: 'ps',
  user: 'reader',
  production,
  requiresPassword: id !== 'local',
  unlockedUntil: locked ? null : NOW + DAY,
  locked: id !== 'local' && locked,
});

const input: StageInput = {
  tones: {},
  incidents: {},
  targets: [],
  running: [],
  connections: [],
  now: NOW,
};

describe('stageView', () => {
  it('shows every stage dark until it was read, and counts its calm days from the incidents', () => {
    const view = stageView({
      ...input,
      tones: { dev: 'warning' },
      incidents: { prod: { watchedSince: NOW - 64 * DAY, last: null } },
    });

    expect(view.envs.map((env) => [env.name, env.seen, env.tone, env.calm])).toEqual([
      ['DEV', true, 'warning', null],
      ['TEST', false, null, null],
      ['PROD', false, null, 64],
    ]);
    expect(view.prodCalm).toBe(64);
    expect(view.notes.get('serverraum/restarts')?.text).toBe('PROD 64 Tage ohne Restart');
    expect(stageView(input).notes.get('serverraum/restarts')?.text).toBe('Noch keine Stage gelesen');
    expect(view.notes.get('serverraum/cluster')).toEqual({ text: 'DEV Warnung', tone: 'warning' });
  });

  it('marks a restart of today as new on the sign', () => {
    const view = stageView({
      ...input,
      incidents: {
        test: {
          watchedSince: NOW - 9 * DAY,
          last: { at: NOW - 3_600_000, app: 'orders-api', reason: 'OOMKilled' },
        },
      },
    });

    expect(view.notes.get('serverraum/restarts')?.tone).toBe('info');
  });

  it('takes a key off the board for every unlocked password and running forward, and warns for PROD', () => {
    const view = stageView({
      ...input,
      connections: [
        connection('local', false, false),
        connection('dev', false, false),
        connection('prod', true, false),
      ],
      targets: [
        { id: 'db', label: 'Postgres', localPort: 5430, envs: [] },
        { id: 'kc', label: 'Keycloak', localPort: 8180, envs: [] },
      ],
      running: [
        {
          env: 'dev',
          id: 'db',
          label: 'Postgres',
          localPort: 5430,
          startedAt: NOW,
          running: true,
          error: null,
        },
      ],
    });

    expect(view.keys).toEqual([true, true, true]);
    expect(view.databases).toEqual([false, true, true]);
    expect(view.forwards).toEqual([true, false]);
    expect(view.notes.get('empfang/schluessel')).toEqual({
      text: 'Draußen: DEV, PROD, Forward Postgres',
      tone: 'warning',
    });
    expect(view.notes.get('serverraum/daten')?.tone).toBe('warning');
  });

  it('warns about a forward that ended by itself', () => {
    const view = stageView({
      ...input,
      running: [
        {
          env: 'test',
          id: 'db',
          label: 'Postgres',
          localPort: 5430,
          startedAt: NOW,
          running: false,
          error: 'lost connection',
        },
      ],
    });

    expect(view.notes.get('serverraum/forwards')).toEqual({
      text: 'Postgres beendet: lost connection',
      tone: 'warning',
    });
  });
});
