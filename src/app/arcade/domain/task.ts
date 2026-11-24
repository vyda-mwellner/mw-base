import { daysBetween } from '../../engine/days';
import type { Game } from './round';

/** The least a game asks of a day, and the steps its tasks go in, so that one reads as a round number. */
const START: Readonly<Record<Game, { readonly least: number; readonly step: number }>> = {
  stapler: { least: 8, step: 1 },
  laeufer: { least: 100, step: 10 },
  bugjagd: { least: 3, step: 1 },
};

/**
 * The task of a game on a day: from half the record to seven tenths of it, a little more each day of a round of
 * five, so that it stays within reach as the record grows.
 */
export function targetOf(game: Game, best: number, day: string): number {
  const share = 0.5 + 0.05 * (((daysBetween('2026-01-01', day) % 5) + 5) % 5);
  const { least, step } = START[game];
  return Math.max(least, Math.round((best * share) / step) * step);
}
