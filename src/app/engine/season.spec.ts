import { seasonOf } from './season';

describe('seasonOf', () => {
  it('decorates for advent up to Boxing Day, then for the turn of the year', () => {
    expect(seasonOf('2026-11-30')).toBeNull();
    expect(seasonOf('2026-12-01')).toBe('advent');
    expect(seasonOf('2026-12-26')).toBe('advent');
    expect(seasonOf('2026-12-27')).toBeNull();
    expect(seasonOf('2026-12-31')).toBe('silvester');
    expect(seasonOf('2027-01-01')).toBe('silvester');
    expect(seasonOf('2027-01-02')).toBeNull();
  });

  it('hides eggs from Thursday before Easter to Easter Monday', () => {
    expect(seasonOf('2027-03-24')).toBeNull();
    expect(seasonOf('2027-03-25')).toBe('ostern');
    expect(seasonOf('2027-03-29')).toBe('ostern');
    expect(seasonOf('2027-03-30')).toBeNull();
  });

  it('puts pumpkins out in the last days of October', () => {
    expect(seasonOf('2026-10-28')).toBe('halloween');
    expect(seasonOf('2026-11-01')).toBeNull();
  });
});
