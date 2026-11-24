import { describe, expect, it } from 'vitest';

import type { Entry, LastRun } from '../model/backup';
import { archiveView, entryRow, runSummary } from './backup-rows';

const NOW = new Date(2026, 10, 23, 12, 0).getTime();
const DAY = 86_400_000;
const entries: Entry[] = [
  { source: '~/.kube', target: '.kube', exclude: ['cache'] },
  { source: '~/.ssh/config', target: '.ssh/config', exclude: [] },
];
const run = (ranAt: number, error: string | null = null): LastRun => ({
  ranAt,
  outcomes: [
    { source: '~/.kube', copied: 2, unchanged: 5, error: null },
    { source: '~/.ssh/config', copied: 0, unchanged: 0, error },
  ],
});

describe('entryRow', () => {
  it('says where an entry goes and how its last run went', () => {
    expect(entryRow(entries[0], null).note).toBe('nach .kube · noch nicht gesichert');
    expect(entryRow(entries[0], run(NOW))).toMatchObject({
      tone: 'ok',
      note: 'nach .kube · 2 kopiert, 5 unverändert',
    });
    expect(entryRow(entries[1], run(NOW, 'Quelle nicht gefunden'))).toMatchObject({
      tone: 'danger',
      note: 'Quelle nicht gefunden',
    });
  });
});

describe('runSummary', () => {
  it('counts the copied files and the entries that failed', () => {
    expect(runSummary(run(NOW, 'kaputt').outcomes)).toBe('2 Dateien kopiert, 1 mit Fehler');
  });
});

describe('archiveView', () => {
  it('locks the chest after a clean run of this week and keeps every lamp green', () => {
    expect(archiveView(entries, run(NOW - DAY), NOW)).toEqual({
      backedUp: true,
      flows: [null, null],
      note: { text: 'Gesichert gestern, 2 Einträge', tone: null },
    });
  });

  it('opens the lock once the last run is a week old or had an error, the failed lamps first', () => {
    expect(archiveView(entries, run(NOW - 8 * 86_400_000), NOW)).toMatchObject({
      backedUp: false,
      note: { tone: 'warning' },
    });
    expect(archiveView(entries, run(NOW, 'kaputt'), NOW)).toMatchObject({
      backedUp: false,
      flows: ['danger', null],
      note: { tone: 'danger' },
    });
  });

  it('asks for a first run', () => {
    expect(archiveView(entries, null, NOW).note).toEqual({ text: 'Noch nie gesichert', tone: 'warning' });
  });
});
