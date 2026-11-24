import {
  parseDay,
  readVacation,
  showDay,
  typedVacation,
  withoutVacation,
  withVacation,
} from './vacation-input';

describe('parseDay', () => {
  it('reads a German date with a long or a short year, and an ISO date', () => {
    expect(parseDay('21.12.2026', '2026-11-22')).toBe('2026-12-21');
    expect(parseDay('1.2.27', '2026-11-22')).toBe('2027-02-01');
    expect(parseDay(' 2026-12-21 ', '2026-11-22')).toBe('2026-12-21');
  });

  it('takes the next such day from the reference on when the year is left out', () => {
    expect(parseDay('21.12.', '2026-11-22')).toBe('2026-12-21');
    expect(parseDay('6.1', '2026-11-22')).toBe('2027-01-06');
    expect(parseDay('22.11.', '2026-11-22')).toBe('2026-11-22');
  });

  it('refuses what is no day of the calendar', () => {
    expect(parseDay('31.2.2027', '2026-11-22')).toBeNull();
    expect(parseDay('29.2.', '2026-11-22')).toBeNull();
    expect(parseDay('29.2.28', '2026-11-22')).toBe('2028-02-29');
    expect(parseDay('13.13.', '2026-11-22')).toBeNull();
    expect(parseDay('morgen', '2026-11-22')).toBeNull();
    expect(parseDay('', '2026-11-22')).toBeNull();
  });
});

describe('readVacation', () => {
  const christmas = { from: '2026-12-21', to: '2027-01-06' };

  it('makes a single day of a day alone', () => {
    expect(readVacation('24.12.', '2026-11-22')).toEqual({ from: '2026-12-24', to: '2026-12-24' });
  });

  it('reads an end without a year from the start on, over the turn of the year', () => {
    expect(readVacation('21.12. - 6.1.', '2026-11-22')).toEqual(christmas);
  });

  it('takes a dash with or without spaces, an en dash and "bis" between the two days', () => {
    expect(readVacation('21.12.-6.1.', '2026-11-22')).toEqual(christmas);
    expect(readVacation('21.12. \u2013 6.1.', '2026-11-22')).toEqual(christmas);
    expect(readVacation('21.12. bis 6.1.', '2026-11-22')).toEqual(christmas);
    expect(readVacation('2026-12-21 - 2027-01-06', '2026-11-22')).toEqual(christmas);
  });

  it('says in German why there is no vacation', () => {
    expect(readVacation('bald', '2026-11-22')).toBe('"bald" ist kein Tag, etwa 21.12. oder 21.12.2026');
    expect(readVacation('21.12. - 32.1.', '2026-11-22')).toBe(
      '"32.1." ist kein Tag, etwa 6.1. oder 06.01.2027',
    );
    expect(readVacation('  ', '2026-11-22')).toBe('Zeitraum eingeben, etwa 21.12. - 6.1.');
    expect(readVacation('21.12.2026 - 20.12.2026', '2026-11-22')).toBe('Das Ende liegt vor dem Anfang');
  });

  it('writes a vacation back the way it is read', () => {
    expect(typedVacation(christmas)).toBe('21.12.2026 - 06.01.2027');
    expect(typedVacation({ from: '2026-12-24', to: '2026-12-24' })).toBe('24.12.2026');
    expect(readVacation(typedVacation(christmas), '2026-11-22')).toEqual(christmas);
  });
});

describe('vacation list', () => {
  const summer = { from: '2027-08-02', to: '2027-08-13' };
  const christmas = { from: '2026-12-21', to: '2027-01-01' };

  it('keeps the vacations in the order they begin, each once', () => {
    expect(withVacation([summer], christmas)).toEqual([christmas, summer]);
    expect(withVacation([christmas, summer], christmas)).toEqual([christmas, summer]);
  });

  it('removes exactly the vacation asked for', () => {
    expect(withoutVacation([christmas, summer], christmas)).toEqual([summer]);
  });

  it('shows a day the German way', () => {
    expect(showDay('2027-01-06')).toBe('06.01.2027');
  });
});
