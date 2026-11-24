import { MOMENT, plural } from '../../core/format';
import type { Note, Tone } from '../../engine/model';
import type { Entry, LastRun, Outcome } from '../model/backup';

/** Older than this, the lock of the chest turns red and the line asks for a run. */
export const STALE_DAYS = 7;
const DAY_MS = 86_400_000;

export interface EntryRow {
  readonly source: string;
  readonly note: string;
  readonly tone: Tone | 'ok' | null;
  readonly noteTone: Tone | null;
}

const outcomeOf = (run: LastRun | null, source: string): Outcome | undefined =>
  run?.outcomes.find((outcome) => outcome.source === source);

export function entryRow(entry: Entry, run: LastRun | null): EntryRow {
  const target = `nach ${entry.target}`;
  const outcome = outcomeOf(run, entry.source);
  if (!outcome)
    return { source: entry.source, note: `${target} · noch nicht gesichert`, tone: null, noteTone: null };
  if (outcome.error) return { source: entry.source, note: outcome.error, tone: 'danger', noteTone: 'danger' };
  return {
    source: entry.source,
    note: `${target} · ${outcome.copied} kopiert, ${outcome.unchanged} unverändert`,
    tone: 'ok',
    noteTone: null,
  };
}

/** For the toast after a run. */
export function runSummary(outcomes: readonly Outcome[]): string {
  const copied = outcomes.reduce((sum, outcome) => sum + outcome.copied, 0);
  const failed = outcomes.filter((outcome) => outcome.error).length;
  return `${plural(copied, 'Datei', 'Dateien')} kopiert${failed > 0 ? `, ${failed} mit Fehler` : ''}`;
}

/** The chest in the archive: its lock, a lamp per entry with the problems first, and its line. */
interface ArchiveView {
  readonly backedUp: boolean;
  readonly flows: (Tone | null)[];
  readonly note: Note;
}

export function archiveView(entries: readonly Entry[] | null, run: LastRun | null, now: number): ArchiveView {
  if (entries === null)
    return { backedUp: run !== null, flows: [], note: { text: 'Kein Backup-Plan', tone: null } };
  const failed = run?.outcomes.filter((outcome) => outcome.error).length ?? 0;
  const days = run ? Math.floor((now - run.ranAt) / DAY_MS) : null;
  const stale = days === null || days >= STALE_DAYS;
  const flows = entries
    .map((entry): Tone | null => {
      const outcome = outcomeOf(run, entry.source);
      return !outcome ? 'warning' : outcome.error ? 'danger' : null;
    })
    .sort((a, b) => Number(b === 'danger') - Number(a === 'danger'));
  const note: Note =
    run === null
      ? { text: 'Noch nie gesichert', tone: 'warning' }
      : failed > 0
        ? { text: `Letzter Lauf ${MOMENT.format(run.ranAt)}: ${failed} mit Fehler`, tone: 'danger' }
        : {
            text: `Gesichert ${days === 0 ? 'heute' : days === 1 ? 'gestern' : `vor ${days} Tagen`}, ${plural(entries.length, 'Eintrag', 'Einträge')}`,
            tone: stale ? 'warning' : null,
          };
  return { backedUp: run !== null && failed === 0 && !stale, flows, note };
}
