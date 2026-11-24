import { computed, inject, signal, Signal } from '@angular/core';

import { injectFrameLoop } from '../../ui/frame-loop';
import { Sound, Tune } from '../../ui/sound';
import { keyOf } from '../../ui/key-walk/key-walk';
import {
  burst,
  CALM,
  chunk,
  fixedSteps,
  Impact,
  impact,
  Juice,
  Particle,
  popup,
  PopupTone,
  settle,
  shakeOf,
} from '../domain/juice';
import { Game, verdictOf } from '../domain/round';
import { Highscores } from './highscores';

export type GameState = 'ready' | 'playing' | 'over';

/** What a game answers a change of its state with: on screen and in the ear. */
export interface Fx {
  burst(x: number, y: number, color: string, count?: number, force?: number): void;
  chunk(piece: Pick<Particle, 'x' | 'y' | 'w' | 'h' | 'color'> & { readonly vx?: number }): void;
  popup(x: number, y: number, text: string, tone?: PopupTone): void;
  impact(hit: Impact): void;
  play(tune: Tune): void;
  combo(step: number): void;
}

interface Rules<T> {
  readonly game: Game;
  readonly fresh: () => T;
  /** One step of the simulation, always the same length. */
  readonly step: (sim: T, seconds: number, random: () => number) => T;
  readonly score: (sim: T) => number;
  readonly level: (sim: T) => number;
  readonly over: (sim: T) => boolean;
  /** The key goes down, and comes up again. */
  readonly press?: (sim: T) => T;
  readonly release?: (sim: T) => T;
  /** Keys a game takes besides its one key while a round runs, and what each of them does; null for none. */
  readonly steer?: (key: string) => ((sim: T) => T) | null;
  /** Called for every change, from a step or a key. */
  readonly events?: (before: T, after: T, fx: Fx) => void;
  /** False while there is nothing to play. */
  readonly enabled?: () => boolean;
}

export interface Round<T> {
  readonly sim: Signal<T>;
  readonly phase: Signal<GameState>;
  readonly juice: Signal<Juice>;
  readonly score: Signal<number>;
  readonly best: Signal<number>;
  readonly level: Signal<number>;
  readonly record: Signal<boolean>;
  /** What the game asks of today, and whether a round has met it. */
  readonly target: Signal<number>;
  readonly solved: Signal<boolean>;
  /** The round that just ended against the best one before it. */
  readonly verdict: Signal<string>;
  /** A CSS transform for the playing field. */
  readonly shake: Signal<string>;
  keyDown(event: KeyboardEvent): void;
  keyUp(event: KeyboardEvent): void;
}

const KEYS = new Set([' ', 'Enter', 'w']);
/** The simulation runs in steps of this length whatever the screen does, so a round plays the same everywhere. */
const STEP = 1 / 120;
/** The key that was meant for the round that just ended must not start the next one. */
const RESTART_LOCK = 0.35;

/** One round after the other of a game with a single key. Call in an injection context. */
export function injectRound<T>(rules: Rules<T>): Round<T> {
  const scores = inject(Highscores);
  const sound = inject(Sound);
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sim = signal(rules.fresh());
  const phase = signal<GameState>('ready');
  const juice = signal(CALM);
  const record = signal(false);
  const verdict = signal('');
  let working = CALM;
  let carry = 0;
  let locked = 0;

  const fx: Fx = {
    burst: (x, y, color, count, force) => void (working = burst(working, x, y, color, count, force)),
    chunk: (piece) => void (working = chunk(working, piece)),
    popup: (x, y, text, tone) => void (working = popup(working, x, y, text, tone)),
    impact: (hit) => void (working = impact(working, still ? { freeze: hit.freeze } : hit)),
    play: (tune) => sound.play(tune),
    combo: (step) => sound.combo(step),
  };

  const react = (before: T, after: T): void => {
    if (after === before) return;
    rules.events?.(before, after, fx);
    if (rules.level(after) > rules.level(before)) {
      fx.play('level');
      fx.impact({ flash: 0.3 });
    }
    if (!rules.over(after)) return;
    phase.set('over');
    locked = RESTART_LOCK;
    const score = rules.score(after);
    const best = scores.best(rules.game);
    verdict.set(verdictOf(score, best));
    record.set(score > best);
    void scores.record(rules.game, score).then(({ beaten, solved }) => {
      if (beaten) sound.play('record');
      else if (solved) sound.play('done');
    });
  };

  const act = (move: ((sim: T) => T) | undefined): void => {
    if (!move) return;
    const before = sim();
    const after = move(before);
    sim.set(after);
    react(before, after);
    juice.set(working);
  };

  injectFrameLoop((seconds) => {
    locked = Math.max(0, locked - seconds);
    if (phase() === 'playing' && working.freeze <= 0) {
      const steps = fixedSteps(carry, seconds, STEP);
      carry = steps.carry;
      let state = sim();
      for (let step = 0; step < steps.count && phase() === 'playing' && working.freeze <= 0; step++) {
        const before = state;
        state = rules.step(before, STEP, Math.random);
        react(before, state);
      }
      sim.set(state);
    }
    if (working !== CALM) working = settle(working, seconds);
    juice.set(working);
  });

  return {
    sim: sim.asReadonly(),
    phase: phase.asReadonly(),
    juice: juice.asReadonly(),
    record: record.asReadonly(),
    verdict: verdict.asReadonly(),
    score: computed(() => rules.score(sim())),
    level: computed(() => rules.level(sim())),
    best: computed(() => scores.best(rules.game)),
    target: computed(() => scores.target(rules.game)),
    solved: computed(() => scores.solved(rules.game)),
    shake: computed(() => {
      const [x, y] = shakeOf(juice());
      return `${x.toFixed(2)}px ${y.toFixed(2)}px`;
    }),
    keyDown(event) {
      if (rules.enabled?.() === false) return;
      const key = keyOf(event);
      const steer = phase() === 'playing' ? rules.steer?.(key) : null;
      if (steer) {
        event.preventDefault();
        return act(steer);
      }
      if (!KEYS.has(key)) return;
      event.preventDefault();
      if (event.repeat) return;
      if (phase() === 'playing') return act(rules.press);
      if (locked > 0) return;
      working = CALM;
      carry = 0;
      sim.set(rules.fresh());
      record.set(false);
      verdict.set('');
      phase.set('playing');
      sound.play('blip');
      juice.set(working);
    },
    keyUp(event) {
      const key = keyOf(event);
      if (KEYS.has(key) && phase() === 'playing') act(rules.release);
    },
  };
}
