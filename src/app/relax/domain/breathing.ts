import type { Note } from '../../engine/model';

/** 4-0-7-8: four seconds in, no pause, seven out, eight held with the lungs empty. */
export const BREATH = { inMs: 4000, outMs: 7000, holdMs: 8000, rounds: 8 } as const;

export type BreathPhase = 'in' | 'out' | 'hold';

interface BreathMoment {
  readonly phase: BreathPhase;
  /** From 1. */
  readonly round: number;
  /** Whole seconds left in the phase, counting down to 1. */
  readonly left: number;
  readonly done: boolean;
}

export const BREATHING_NOTE: Note = {
  text: 'Vier Sekunden ein, sieben aus, acht halten, acht Runden',
  tone: null,
};

/** Where an exercise stands `elapsedMs` after its start. */
export function breathAt(elapsedMs: number): BreathMoment {
  const exhaled = BREATH.inMs + BREATH.outMs;
  const cycle = exhaled + BREATH.holdMs;
  if (elapsedMs >= cycle * BREATH.rounds) return { phase: 'hold', round: BREATH.rounds, left: 0, done: true };
  const round = Math.floor(elapsedMs / cycle) + 1;
  const within = elapsedMs % cycle;
  const until = (end: number): number => Math.ceil((end - within) / 1000);
  if (within < BREATH.inMs) return { phase: 'in', round, left: until(BREATH.inMs), done: false };
  if (within < exhaled) return { phase: 'out', round, left: until(exhaled), done: false };
  return { phase: 'hold', round, left: until(cycle), done: false };
}
