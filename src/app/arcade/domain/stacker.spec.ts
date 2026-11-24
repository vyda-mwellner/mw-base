import {
  BASE_WIDTH,
  drop,
  levelOf,
  newStack,
  REACH,
  REGROW,
  scoreOf,
  slide,
  speedOf,
  Stack,
} from './stacker';

const over = (stack: Stack, x: number): Stack => ({ ...stack, moving: { ...stack.moving, x } });
const late = (stack: Stack): Stack => ({ ...stack, time: 6 });
/** Drops block after block exactly onto the one below. */
const exact = (stack: Stack, times: number): Stack =>
  Array.from({ length: times }).reduce<Stack>(
    (state) => drop(over(state, state.slabs[state.slabs.length - 1].x)),
    stack,
  );

describe('stacker', () => {
  it('slides the block and turns it round at either end', () => {
    const start = newStack();
    const moved = slide(start, 0.5);
    const far = slide(start, 60);

    expect(moved.moving.x).toBeGreaterThan(start.moving.x);
    expect(moved.time).toBe(0.5);
    expect(far.moving.x + far.moving.width).toBe(REACH);
    expect(far.direction).toBe(-1);
  });

  it('cuts off what hangs over and makes the next block that narrow', () => {
    const stack = drop(over(newStack(), -25));

    expect(stack.slabs[1]).toEqual({ x: -25, width: 70 });
    expect(stack.moving.width).toBe(70);
    expect(scoreOf(stack)).toBe(1);
  });

  it('keeps the whole width for a drop that sits exactly', () => {
    const stack = drop(over(newStack(), -43));

    expect(stack.slabs[1]).toEqual({ x: -45, width: 90 });
    expect(stack.streak).toBe(1);
    expect(drop(over(stack, -20)).streak).toBe(0);
  });

  it('gives a narrowed tower width back from the second exact drop in a row', () => {
    const narrow = drop(over(newStack(), -25));
    const once = exact(narrow, 1);
    const twice = exact(once, 1);

    expect(once.slabs.at(-1)).toEqual({ x: -25, width: 70 });
    expect(twice.slabs.at(-1)).toEqual({ x: -25 - REGROW / 2, width: 70 + REGROW });
    expect(twice.moving.width).toBe(70 + REGROW);
    expect(twice).toMatchObject({ streak: 2, bestStreak: 2 });
  });

  it('never grows wider than it started', () => {
    expect(exact(newStack(), 6).slabs.at(-1)!.width).toBe(BASE_WIDTH);
  });

  it('remembers the longest row of exact drops after it broke', () => {
    const broken = drop(over(exact(newStack(), 3), -20));

    expect(broken).toMatchObject({ streak: 0, bestStreak: 3 });
  });

  it('counts a sliver that would hold nothing as a miss', () => {
    expect(drop(over(late(newStack()), 43)).over).toBe(true);
    expect(drop(over(late(newStack()), 40)).over).toBe(false);
  });

  it('is over once a block misses the tower', () => {
    const missed = drop(over(late(newStack()), 60));

    expect(missed.over).toBe(true);
    expect(scoreOf(missed)).toBe(0);
    expect(drop(missed)).toBe(missed);
    expect(slide(missed, 1)).toBe(missed);
  });

  it('forgives a miss in the first five seconds and sends the block in again', () => {
    const start = { ...newStack(), time: 4.9 };
    const spared = drop(over(start, 60));

    expect(spared).toMatchObject({ over: false, spared: 1, streak: 0 });
    expect(scoreOf(spared)).toBe(0);
    expect(spared.moving).toEqual({ x: -REACH, width: BASE_WIDTH });
    expect(drop(over(slide(spared, 0.2), 60)).over).toBe(true);
  });

  it('sends the next block in from the other side', () => {
    const second = drop(over(newStack(), -45));

    expect(second.direction).toBe(-1);
    expect(second.moving.x + second.moving.width).toBe(REACH);
  });

  it('gets faster level by level, every five blocks, up to a limit', () => {
    const four = exact(newStack(), 4);
    const five = exact(four, 1);

    expect(levelOf(four)).toBe(1);
    expect(speedOf(four)).toBe(speedOf(newStack()));
    expect(levelOf(five)).toBe(2);
    expect(speedOf(five)).toBeGreaterThan(speedOf(four));
    expect(speedOf(exact(newStack(), 200))).toBe(235);
  });

  it('does not let a tower grow from drops at random', () => {
    let state = newStack();
    for (let drops = 0; drops < 60 && !state.over; drops++) state = drop(slide(state, 0.23));

    expect(state.over).toBe(true);
    expect(scoreOf(state)).toBeLessThan(15);
  });
});
