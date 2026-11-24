import { counted, levelAt, scoreNote, UNITS, verdictOf } from './round';

describe('round', () => {
  it('goes up a level every ten seconds', () => {
    expect([0, 9.99, 10, 25, 61].map((seconds) => levelAt(seconds))).toEqual([1, 1, 2, 3, 7]);
  });

  it('says how far a round ended under the record, or that it beat it', () => {
    expect(verdictOf(9, 12)).toBe('3 unter Rekord');
    expect(verdictOf(13, 12)).toBe('Neuer Rekord');
    expect(verdictOf(12, 12)).toBe('Rekord eingestellt');
    expect(verdictOf(1, 0)).toBe('Neuer Rekord');
    expect(verdictOf(0, 0)).toBe('');
  });

  it('names the record and the task of the day under a game in the menu', () => {
    expect(scoreNote('stapler', 23, 25, false)).toBe('Rekord 23 Blöcke · heute 25 Blöcke');
    expect(scoreNote('laeufer', 340, 300, true)).toBe('Rekord 340 Meter · Tagesaufgabe geschafft');
    expect(scoreNote('bugjagd', 0, 3, false)).toBe('Noch kein Rekord · heute 3 Wellen');
    expect(scoreNote('bugjagd', 4, 0, false)).toBe('Rekord 4 Wellen');
  });

  it('counts one block as a block', () => {
    expect([0, 1, 2].map((count) => counted(count, UNITS.stapler))).toEqual([
      '0 Blöcke',
      '1 Block',
      '2 Blöcke',
    ]);
    expect(counted(1, UNITS.bugjagd)).toBe('1 Welle');
  });
});
