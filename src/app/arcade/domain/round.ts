import { plural } from '../../core/format';

export type Game = 'stapler' | 'laeufer' | 'bugjagd';
export const GAMES: readonly Game[] = ['stapler', 'laeufer', 'bugjagd'];
/** What a game counts, one of it and more. */
export interface Unit {
  readonly one: string;
  readonly many: string;
}

export const UNITS: Readonly<Record<Game, Unit>> = {
  stapler: { one: 'Block', many: 'Blöcke' },
  laeufer: { one: 'Meter', many: 'Meter' },
  bugjagd: { one: 'Welle', many: 'Wellen' },
};

/** "1 Block", "3 Blöcke". */
export const counted = (count: number, unit: Unit): string => plural(count, unit.one, unit.many);

/** Seconds before a round can be lost, and how long a level of a game against the clock lasts. */
export const GRACE = 5;
const LEVEL_SECONDS = 10;

export const levelAt = (seconds: number): number => 1 + Math.floor(seconds / LEVEL_SECONDS);

/** What a round that just ended is worth against the best one before it. */
export function verdictOf(score: number, best: number): string {
  if (score > best) return 'Neuer Rekord';
  if (score === best) return best > 0 ? 'Rekord eingestellt' : '';
  return `${best - score} unter Rekord`;
}

/** The line under a game in the menu of the break room: its record and what today asks of it. */
export function scoreNote(game: Game, best: number, target: number, solved: boolean): string {
  const unit = UNITS[game];
  const record = best > 0 ? `Rekord ${counted(best, unit)}` : 'Noch kein Rekord';
  if (solved) return `${record} · Tagesaufgabe geschafft`;
  return target > 0 ? `${record} · heute ${counted(target, unit)}` : record;
}
