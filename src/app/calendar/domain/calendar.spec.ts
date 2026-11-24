import {
  hoursWorked,
  nextHoliday,
  periods,
  vacationDays,
  Vacation,
  WORKDAY_HOURS,
  workdaysBetween,
} from './calendar';

describe('periods', () => {
  const shares = (today: string) =>
    periods(today, []).map(({ label, share }) => [label, Number(share.toFixed(3))]);
  const workdays = (today: string, vacations: Vacation[] = []) =>
    periods(today, vacations).map((period) => period.workdays);

  it('tells how much of quarter and year has passed before today', () => {
    expect(shares('2026-11-04')).toEqual([
      ['Q4', 0.37],
      ['2026', 0.841],
    ]);
    expect(shares('2026-01-01')).toEqual([
      ['Q1', 0],
      ['2026', 0],
    ]);
  });

  it('runs the quarters from January, April, July and October to the day before the next', () => {
    const bounds = (today: string) => {
      const { label, first, last } = periods(today, [])[0];
      return { label, first, last };
    };

    expect(bounds('2026-02-14')).toEqual({ label: 'Q1', first: '2026-01-01', last: '2026-03-31' });
    expect(bounds('2026-06-30')).toEqual({ label: 'Q2', first: '2026-04-01', last: '2026-06-30' });
    expect(bounds('2026-07-01')).toEqual({ label: 'Q3', first: '2026-07-01', last: '2026-09-30' });
    expect(bounds('2026-12-31')).toEqual({ label: 'Q4', first: '2026-10-01', last: '2026-12-31' });
  });

  it('counts the workdays left in quarter and year, today included', () => {
    expect(workdays('2026-11-04')).toEqual([
      { full: 41, mine: 34, left: 34 },
      { full: 41, mine: 34, left: 34 },
    ]);
  });

  it('takes a vacation over the turn of the year off the days of mine', () => {
    const christmas = [{ from: '2026-12-21', to: '2027-01-01' }];

    expect(workdays('2026-11-04', christmas).map((counts) => counts.left)).toEqual([26, 26]);
  });
});

describe('hoursWorked', () => {
  const at = (time: string) => hoursWorked(new Date(`2026-11-24T${time}:00`));

  it('counts the whole hours past since 8', () => {
    expect(at('07:59')).toBe(0);
    expect(at('08:59')).toBe(0);
    expect(at('09:00')).toBe(1);
    expect(at('11:59')).toBe(3);
  });

  it('leaves out the lunch hour from 12 to 13', () => {
    expect(at('12:00')).toBe(4);
    expect(at('12:59')).toBe(4);
    expect(at('13:59')).toBe(4);
    expect(at('14:00')).toBe(5);
  });

  it('stops at the eight hours of the day from 17 on', () => {
    expect(at('16:59')).toBe(7);
    expect(at('17:00')).toBe(WORKDAY_HOURS);
    expect(at('23:30')).toBe(WORKDAY_HOURS);
  });
});

describe('workdaysBetween', () => {
  it('counts Monday to Friday and Monday to Thursday, both ends included', () => {
    expect(workdaysBetween('2026-11-04', '2026-11-17', [])).toEqual({ full: 10, mine: 8, left: 8 });
    expect(workdaysBetween('2026-11-04', '2026-11-30', [])).toEqual({ full: 19, mine: 15, left: 15 });
    expect(workdaysBetween('2026-11-06', '2026-11-30', [])).toEqual({ full: 17, mine: 13, left: 13 });
    expect(workdaysBetween('2026-11-09', '2026-11-30', [])).toEqual({ full: 16, mine: 13, left: 13 });
  });

  it('leaves the holidays out', () => {
    expect(workdaysBetween('2026-05-01', '2026-05-31', [])).toEqual({ full: 18, mine: 14, left: 14 });
  });

  it('spends no vacation day on a holiday inside the vacation', () => {
    const ascension = [{ from: '2026-05-11', to: '2026-05-15' }];

    expect(workdaysBetween('2026-05-01', '2026-05-31', ascension)).toEqual({ full: 18, mine: 14, left: 11 });
  });

  it('is empty when the end lies before the start', () => {
    expect(workdaysBetween('2026-05-02', '2026-05-01', [])).toEqual({ full: 0, mine: 0, left: 0 });
  });
});

describe('vacationDays', () => {
  it('counts the days of mine a vacation takes, without Fridays and holidays', () => {
    expect(vacationDays({ from: '2026-05-11', to: '2026-05-15' })).toBe(3);
    expect(vacationDays({ from: '2026-12-21', to: '2027-01-01' })).toBe(8);
    expect(vacationDays({ from: '2026-12-25', to: '2026-12-25' })).toBe(0);
  });
});

describe('nextHoliday', () => {
  it('finds the next holiday with its distance in days', () => {
    expect(nextHoliday('2026-11-04')).toEqual({ name: '1. Weihnachtstag', date: '2026-12-25', days: 51 });
  });

  it('knows the holidays of Baden-Württemberg on top of the national ones', () => {
    expect(nextHoliday('2026-01-02').name).toBe('Heilige Drei Könige');
    expect(nextHoliday('2026-06-01')).toEqual({ name: 'Fronleichnam', date: '2026-06-04', days: 3 });
    expect(nextHoliday('2026-10-04').name).toBe('Allerheiligen');
  });

  it('follows Easter for the movable ones', () => {
    expect(nextHoliday('2026-04-04')).toEqual({ name: 'Ostermontag', date: '2026-04-06', days: 2 });
    expect(nextHoliday('2027-05-02').date).toBe('2027-05-06');
    expect(nextHoliday('2027-05-07').name).toBe('Pfingstmontag');
  });

  it('counts today as zero days and looks into the next year after Christmas', () => {
    expect(nextHoliday('2026-12-25').days).toBe(0);
    expect(nextHoliday('2026-12-27')).toEqual({ name: 'Neujahr', date: '2027-01-01', days: 5 });
  });
});
