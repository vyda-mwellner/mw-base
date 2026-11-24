import { describe, expect, it } from 'vitest';

import { breathAt } from './breathing';

describe('breathAt', () => {
  it('starts breathing in for four seconds', () => {
    expect(breathAt(0)).toEqual({ phase: 'in', round: 1, left: 4, done: false });
    expect(breathAt(3_999)).toMatchObject({ phase: 'in', left: 1 });
  });

  it('then breathes out for seven, without a pause', () => {
    expect(breathAt(4_000)).toEqual({ phase: 'out', round: 1, left: 7, done: false });
    expect(breathAt(10_999)).toMatchObject({ phase: 'out', left: 1 });
  });

  it('then holds for eight', () => {
    expect(breathAt(11_000)).toEqual({ phase: 'hold', round: 1, left: 8, done: false });
    expect(breathAt(18_999)).toMatchObject({ phase: 'hold', left: 1 });
  });

  it('goes on with the next round', () => {
    expect(breathAt(19_000)).toEqual({ phase: 'in', round: 2, left: 4, done: false });
    expect(breathAt(151_999)).toMatchObject({ phase: 'hold', round: 8, left: 1, done: false });
  });

  it('is done after eight rounds', () => {
    expect(breathAt(152_000).done).toBe(true);
  });
});
