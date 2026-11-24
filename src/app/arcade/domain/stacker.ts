import { GRACE } from './round';

/** A block of the tower: where it starts along the sliding axis and how wide it is. */
interface Slab {
  readonly x: number;
  readonly width: number;
}

export interface Stack {
  /** From the ground up; the first one is the base and does not count. */
  readonly slabs: readonly Slab[];
  readonly moving: Slab;
  /** 1 to the right, -1 to the left. */
  readonly direction: 1 | -1;
  readonly over: boolean;
  /** Drops in a row that sat exactly on the block below. */
  readonly streak: number;
  readonly bestStreak: number;
  readonly time: number;
  /** Misses in the first seconds, which cost nothing. */
  readonly spared: number;
}

/** How far the sliding block travels to either side of the middle. */
export const REACH = 110;
export const BASE_WIDTH = 90;
/** A drop this close to the edge of the block below counts as exact and loses nothing. */
const EXACT = 3;
/** From the second exact drop in a row on, the tower gets this much of its width back. */
export const REGROW = 8;
/** A sliver narrower than this does not hold the next block: the drop counts as a miss. */
const NARROWEST = 4;
const SPEED = { start: 95, perLevel: 20, max: 235 } as const;
const LEVEL_BLOCKS = 5;

export const scoreOf = (stack: Stack): number => stack.slabs.length - 1;
export const levelOf = (stack: Stack): number => 1 + Math.floor(scoreOf(stack) / LEVEL_BLOCKS);
export const speedOf = (stack: Stack): number =>
  Math.min(SPEED.max, SPEED.start + (levelOf(stack) - 1) * SPEED.perLevel);

const entering = (width: number, direction: 1 | -1): Slab => ({
  x: direction > 0 ? -REACH : REACH - width,
  width,
});

export function newStack(): Stack {
  return {
    slabs: [{ x: -BASE_WIDTH / 2, width: BASE_WIDTH }],
    moving: entering(BASE_WIDTH, 1),
    direction: 1,
    over: false,
    streak: 0,
    bestStreak: 0,
    time: 0,
    spared: 0,
  };
}

/** The sliding block moves on and turns round at either end. */
export function slide(stack: Stack, seconds: number): Stack {
  if (stack.over) return stack;
  const { moving, direction } = stack;
  const time = stack.time + seconds;
  const x = moving.x + direction * speedOf(stack) * seconds;
  const max = REACH - moving.width;
  if (x > max) return { ...stack, time, moving: { ...moving, x: max }, direction: -1 };
  if (x < -REACH) return { ...stack, time, moving: { ...moving, x: -REACH }, direction: 1 };
  return { ...stack, time, moving: { ...moving, x } };
}

/**
 * The sliding block falls: what hangs over the block below is cut off, and the next one is that much narrower.
 * A drop that sits exactly loses nothing, and the second one in a row widens the tower again.
 */
export function drop(stack: Stack): Stack {
  if (stack.over) return stack;
  const top = stack.slabs[stack.slabs.length - 1];
  const exact = Math.abs(stack.moving.x - top.x) <= EXACT;
  const left = exact ? top.x : Math.max(stack.moving.x, top.x);
  const right = exact ? top.x + top.width : Math.min(stack.moving.x + stack.moving.width, top.x + top.width);
  if (right - left < NARROWEST) {
    if (stack.time >= GRACE) return { ...stack, over: true };
    return {
      ...stack,
      moving: entering(stack.moving.width, stack.direction),
      streak: 0,
      spared: stack.spared + 1,
    };
  }
  const streak = exact ? stack.streak + 1 : 0;
  const width = streak >= 2 ? Math.min(BASE_WIDTH, right - left + REGROW) : right - left;
  const landed = { x: left - (width - (right - left)) / 2, width };
  const direction = stack.direction > 0 ? -1 : 1;
  return {
    ...stack,
    slabs: [...stack.slabs, landed],
    moving: entering(landed.width, direction),
    direction,
    streak,
    bestStreak: Math.max(stack.bestStreak, streak),
  };
}
