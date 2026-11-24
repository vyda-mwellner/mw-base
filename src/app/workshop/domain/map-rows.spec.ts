import { describe, expect, it } from 'vitest';

import type { AppInfo, Snapshot } from '../model/landscape';
import { appReport, edgesReport, mapGroups, mapNote } from './map-rows';

const app = (id: string, group: string, overrides: Partial<AppInfo> = {}): AppInfo => ({
  id,
  label: id,
  group,
  kind: 'backend',
  repo: id,
  path: null,
  missing: false,
  ports: [],
  tech: [],
  loc: null,
  facts: [],
  modules: [],
  git: null,
  unresolved: [],
  ...overrides,
});
const NOW = new Date(2026, 10, 23).getTime();
const SNAPSHOT: Snapshot = {
  generatedAt: new Date(2026, 10, 3).getTime(),
  groups: [
    { id: 'infra', label: 'Infrastruktur', side: true },
    { id: 'neu', label: 'Neusystem', side: false },
  ],
  apps: [
    app('postgres', 'infra', { kind: 'infra', repo: null, ports: [5438], tech: ['postgres:17'] }),
    app('shop-server', 'neu', {
      ports: [9090],
      tech: ['Spring Boot 3.5', 'Kotlin 2.0', 'Java 17'],
      loc: {
        total: 62_518,
        production: 30_295,
        test: 32_223,
        files: 1024,
        byLanguage: [{ language: 'Kotlin', lines: 58_561 }],
      },
    }),
    app('shop-gui', 'neu', { kind: 'frontend', missing: true }),
  ],
  edges: [
    { from: 'shop-server', to: 'postgres', kind: 'call', via: ['application.yml · spring.datasource.url'] },
  ],
};

describe('mapGroups', () => {
  it('puts the shared infrastructure last and shows stack, ports and size of every app', () => {
    const groups = mapGroups(SNAPSHOT);

    expect(groups.map((group) => group.label)).toEqual(['Neusystem', 'Infrastruktur']);
    expect(groups[0].rows[0]).toMatchObject({
      label: 'shop-server',
      note: 'Spring Boot 3.5, Kotlin 2.0 · :9090',
      value: '62.518 Z.',
    });
    expect(groups[0].rows[1]).toMatchObject({ note: 'Frontend', missing: true });
  });
});

describe('appReport', () => {
  it('lists what an app calls and who calls it, with where it is configured', () => {
    expect(appReport(SNAPSHOT.apps[1], SNAPSHOT)).toContain('application.yml · spring.datasource.url');
    expect(appReport(SNAPSHOT.apps[0], SNAPSHOT)).toContain('<th scope="row">shop-server</th>');
    expect(appReport(SNAPSHOT.apps[2], SNAPSHOT)).toContain('nicht im Workspace ausgecheckt');
  });
});

describe('edgesReport', () => {
  it('makes one table of every connection', () => {
    expect(edgesReport(SNAPSHOT)).toContain('1 Verbindung zwischen 3 Apps');
  });
});

describe('mapNote', () => {
  it('says how old the scan is and asks for a new one after a month', () => {
    expect(mapNote(SNAPSHOT, null, NOW)).toEqual({
      text: 'Scan vom 03.11., 3 Apps, 1 Verbindung',
      tone: null,
    });
    expect(mapNote(SNAPSHOT, null, NOW + 30 * 86_400_000).tone).toBe('warning');
    expect(mapNote(null, null, NOW).text).toBe('Noch kein Scan: Q im Blatt');
  });
});
