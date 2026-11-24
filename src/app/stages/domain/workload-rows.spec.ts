import { describe, expect, it } from 'vitest';
import { Pod, Workload } from '../model/cluster';
import { duration, reportOf, workloadGroups, workloadRow } from './workload-rows';

const NOW = Date.UTC(2026, 10, 3, 14);
const HOUR = 3_600_000;

const pod = (overrides: Partial<Pod> = {}): Pod => ({
  name: 'orders-api-deployment-7d4b-mk29f',
  phase: 'Running',
  ready: true,
  restarts: 0,
  startedAt: NOW - 3 * 24 * HOUR,
  waiting: null,
  lastTermination: null,
  memoryMib: 657,
  cpuMillis: 2,
  ...overrides,
});

const workload = (overrides: Partial<Workload> = {}): Workload => ({
  id: 'orders-api',
  label: 'orders-api',
  group: 'Neusystem',
  namespace: 'admin',
  desired: 1,
  ready: 1,
  tag: 'build-dev-565',
  gitopsTag: 'build-dev-565',
  memoryLimitMib: null,
  pods: [pod()],
  error: null,
  ...overrides,
});

describe('workloadRow', () => {
  it('shows a healthy backend with its runtime and no drift', () => {
    expect(workloadRow(workload(), NOW)).toMatchObject({
      health: 'ok',
      state: 'läuft',
      pods: '1/1',
      restarts: 0,
      runningFor: 'seit 3 T',
      tagTitle: 'build-dev-565',
    });
  });

  it('puts a crash loop above a missing replica and names the last crash', () => {
    const crashing = pod({
      ready: false,
      restarts: 4,
      waiting: 'CrashLoopBackOff',
      lastTermination: { reason: 'OOMKilled', exitCode: 137, finishedAt: NOW - 2 * HOUR },
    });
    const row = workloadRow(workload({ desired: 2, ready: 1, pods: [pod(), crashing] }), NOW);

    expect(row).toMatchObject({ health: 'danger', state: 'CrashLoopBackOff', restarts: 4 });
    expect(row.restartNote).toBe('OOMKilled vor 2 Std');
    expect(row.restartTitle).toContain('4 Neustarts, zuletzt OOMKilled, Exit 137');
  });

  it('warns about a restart within a day once all pods are ready again', () => {
    const restarted = pod({
      restarts: 1,
      lastTermination: { reason: 'Error', exitCode: 1, finishedAt: NOW - HOUR },
    });
    expect(workloadRow(workload({ pods: [restarted] }), NOW)).toMatchObject({
      health: 'warning',
      state: 'neu gestartet',
    });
  });

  it('names a tag that differs from gitops in the tooltip only, as of the last fetch', () => {
    const row = workloadRow(workload({ gitopsTag: 'build-dev-566' }), NOW);
    expect(row.tagTitle).toBe(
      'build-dev-565\ngitops nach dem letzten Fetch: build-dev-566, "Alle fetchen" am Gleisplan im Büro holt den neuen Stand',
    );
  });

  it('tells a missing deployment from an unreadable namespace', () => {
    expect(workloadRow(workload({ desired: null, ready: 0, pods: [] }), NOW)).toMatchObject({
      health: 'off',
      state: 'nicht deployt',
      pods: '-',
    });
    expect(workloadRow(workload({ error: 'DEV: Forbidden' }), NOW)).toMatchObject({
      health: 'danger',
      stateTitle: 'DEV: Forbidden',
    });
  });
});

describe('memory and errors', () => {
  it('shows the pod that uses the most and flags a missing limit', () => {
    const row = workloadRow(
      workload({ desired: 2, ready: 2, pods: [pod(), pod({ name: 'b', memoryMib: 900 })] }),
      NOW,
    );
    expect(row).toMatchObject({ memory: '900 MiB', memoryLoad: 'ok', noLimit: true, cpu: '2m CPU' });
    expect(row.memoryTitle).toContain('Kein Memory-Limit gesetzt');
  });

  it('rates the memory against the limit', () => {
    expect(workloadRow(workload({ memoryLimitMib: 800 }), NOW)).toMatchObject({
      memory: '657 / 800 MiB',
      memoryLoad: 'warning',
      noLimit: false,
    });
    expect(workloadRow(workload({ memoryLimitMib: 680 }), NOW).memoryLoad).toBe('danger');
  });

  it('says when the metrics-server has no figures', () => {
    const row = workloadRow(workload({ pods: [pod({ memoryMib: null, cpuMillis: null })] }), NOW);
    expect(row).toMatchObject({ memory: '-', cpu: '' });
    expect(row.memoryTitle).toContain('metrics-server');
  });

  it('counts errors of the last hour and tells a failed count from one still running', () => {
    const counted = { id: 'orders-api', errors: 32, warnings: 4, error: null };
    expect(workloadRow(workload(), NOW, counted)).toMatchObject({ errors: '32', hasErrors: true });
    expect(workloadRow(workload(), NOW).errors).toBe('…');
    const failed = { id: 'orders-api', errors: null, warnings: null, error: 'PROD: Tunnel fehlt' };
    expect(workloadRow(workload(), NOW, failed)).toMatchObject({
      errors: '?',
      errorsTitle: 'PROD: Tunnel fehlt',
    });
  });
});

describe('workloadGroups', () => {
  it('keeps the order of apps.json within and across groups', () => {
    const groups = workloadGroups(
      [
        workload(),
        workload({ id: 'keycloak', group: 'Infrastruktur' }),
        workload({ id: 'billing-api', group: 'Neusystem' }),
      ],
      NOW,
    );
    expect(groups.map((group) => [group.name, group.rows.map((row) => row.id)])).toEqual([
      ['Neusystem', ['orders-api', 'billing-api']],
      ['Infrastruktur', ['keycloak']],
    ]);
  });
});

describe('duration', () => {
  it('rounds down to the largest unit', () => {
    expect([duration(30_000), duration(5 * 60_000), duration(3 * HOUR), duration(50 * HOUR)]).toEqual([
      '< 1 Min',
      '5 Min',
      '3 Std',
      '2 T',
    ]);
  });
});

describe('reportOf', () => {
  it('puts state, pods, restarts, errors and memory of a row in one line', () => {
    const row = workloadRow(
      {
        id: 'orders-api',
        label: 'orders-api',
        group: 'neu',
        namespace: 'ps',
        desired: 2,
        ready: 2,
        tag: 'build-dev-1',
        gitopsTag: 'build-dev-1',
        memoryLimitMib: 1024,
        pods: [],
        error: null,
      },
      0,
      { id: 'orders-api', errors: 3, warnings: 1, error: null },
    );

    expect(reportOf(row)).toBe('läuft · 2/2 Pods · 3 Fehler');
  });
});
