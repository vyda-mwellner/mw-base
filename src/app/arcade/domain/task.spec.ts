import { targetOf } from './task';

describe('targetOf', () => {
  it('asks for half the record up to seven tenths of it, in a round of five days', () => {
    const days = ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'];

    expect(days.map((day) => targetOf('stapler', 40, day))).toEqual([24, 26, 28, 20, 22, 24]);
  });

  it('asks for the least of a game while the record is small, and in round numbers', () => {
    expect(targetOf('stapler', 3, '2026-11-19')).toBe(8);
    expect(targetOf('laeufer', 0, '2026-11-19')).toBe(100);
    expect(targetOf('laeufer', 437, '2026-11-19')).toBe(260);
  });
});
