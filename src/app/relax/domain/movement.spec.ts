import { describe, expect, it } from 'vitest';

import type { Motion } from '../../engine/walk';
import { coveredBetween, distance, lastDays, movementNote, movementOf, shares } from './movement';

const motion = (x: number, level: number): Motion => ({
  x,
  level,
  facing: 1,
  legs: [],
  air: 0,
  rise: 0,
  speed: 0,
  aboard: false,
  depth: 0,
});

describe('coveredBetween', () => {
  it('counts the way walked on a floor', () => {
    expect(coveredBetween(motion(100, 1), motion(90, 1))).toEqual({ px: 10, floors: 0 });
  });

  it('counts the floors ridden, and no way while the lift moves', () => {
    expect(coveredBetween(motion(200, 1), motion(200, 1.25))).toEqual({ px: 0, floors: 0.25 });
    expect(coveredBetween(motion(200, 1.75), motion(200, 1))).toEqual({ px: 0, floors: 0.75 });
  });
});

describe('movementOf', () => {
  it('turns house pixels into steps of the figure and metres of a person 1.75 m tall', () => {
    expect(movementOf({ px: 3800, floors: 2.9 })).toEqual({ steps: 100, metres: 98, floors: 3 });
  });
});

describe('distance', () => {
  it('says metres, and kilometres from one on', () => {
    expect(distance(925)).toBe('925 m');
    expect(distance(1840)).toBe('1,8 km');
  });
});

describe('lastDays', () => {
  it('lists the days up to today, oldest first, a day without a step as nothing', () => {
    const log = { '2026-11-21': { px: 380, floors: 1 }, '2026-11-23': { px: 760, floors: 0 } };
    expect(lastDays(log, '2026-11-23', 3)).toEqual([
      { px: 380, floors: 1 },
      { px: 0, floors: 0 },
      { px: 760, floors: 0 },
    ]);
  });
});

describe('shares', () => {
  it('measures each day against the best one', () => {
    expect(
      shares([
        { px: 380, floors: 0 },
        { px: 0, floors: 0 },
        { px: 760, floors: 0 },
      ]),
    ).toEqual([0.5, 0, 1]);
  });
});

describe('movementNote', () => {
  it('sums up today', () => {
    expect(movementNote({ px: 46_740, floors: 6 }).text).toBe('Heute 1.230 Schritte · 1,2 km · 6 Etagen');
    expect(movementNote(undefined).text).toBe('Heute 0 Schritte · 0 m · 0 Etagen');
  });
});
