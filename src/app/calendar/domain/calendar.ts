import { addDays, daysBetween, easterSunday, pad, weekday } from '../../engine/days';

/** Days off, both ends included, as `YYYY-MM-DD`. */
export interface Vacation {
  readonly from: string;
  readonly to: string;
}

interface Workdays {
  /** Monday to Friday, like a 40 hour week. */
  readonly full: number;
  /** Monday to Thursday, Friday is off. */
  readonly mine: number;
  /** Mine without the vacation days. */
  readonly left: number;
}

interface Period {
  /** `Q4`, `2026`. */
  readonly label: string;
  readonly first: string;
  readonly last: string;
  /** How much of it has passed before today, 0 to 1. */
  readonly share: number;
  /** From today on, today included. */
  readonly workdays: Workdays;
}

interface Holiday {
  readonly name: string;
  readonly date: string;
  readonly days: number;
}

const FRIDAY = 5;

/** The quarter and the year today lies in. */
export function periods(today: string, vacations: readonly Vacation[]): Period[] {
  const year = Number(today.slice(0, 4));
  const quarter = Math.floor((Number(today.slice(5, 7)) - 1) / 3);
  const quarterStart = `${year}-${pad(quarter * 3 + 1)}-01`;
  const quarterEnd = quarter === 3 ? `${year + 1}-01-01` : `${year}-${pad(quarter * 3 + 4)}-01`;
  const period = (label: string, start: string, end: string): Period => ({
    label,
    first: start,
    last: addDays(end, -1),
    share: daysBetween(start, today) / daysBetween(start, end),
    workdays: workdaysBetween(today, addDays(end, -1), vacations),
  });
  return [
    period(`Q${quarter + 1}`, quarterStart, quarterEnd),
    period(String(year), `${year}-01-01`, `${year + 1}-01-01`),
  ];
}

/** A workday from 8 to 17 in minutes of the day, the hour from 12 to 13 off. */
const WORKDAY = { start: 8 * 60, lunch: 12 * 60, back: 13 * 60, end: 17 * 60 } as const;
export const WORKDAY_HOURS = (WORKDAY.lunch - WORKDAY.start + WORKDAY.end - WORKDAY.back) / 60;
export const WORKDAY_START = `${pad(WORKDAY.start / 60)}:${pad(WORKDAY.start % 60)}`;

/** The whole hours of today's workday that are past at `now`, 0 to 8; the lunch hour does not count. */
export function hoursWorked(now: Date): number {
  const minute = now.getHours() * 60 + now.getMinutes();
  const span = (from: number, to: number): number => Math.min(Math.max(minute - from, 0), to - from);
  return Math.floor((span(WORKDAY.start, WORKDAY.lunch) + span(WORKDAY.back, WORKDAY.end)) / 60);
}

/** A holiday is no workday at all, so a vacation over Christmas only costs the days around it. */
export function workdaysBetween(first: string, last: string, vacations: readonly Vacation[]): Workdays {
  const off = new Set<string>();
  for (let year = Number(first.slice(0, 4)); year <= Number(last.slice(0, 4)); year++)
    holidays(year).forEach(([, date]) => off.add(date));
  const counts = { full: 0, mine: 0, left: 0 };
  for (let day = first; day <= last; day = addDays(day, 1)) {
    const weekdayOf = weekday(day);
    if (weekdayOf === 0 || weekdayOf === 6 || off.has(day)) continue;
    counts.full++;
    if (weekdayOf === FRIDAY) continue;
    counts.mine++;
    if (!vacations.some((vacation) => day >= vacation.from && day <= vacation.to)) counts.left++;
  }
  return counts;
}

/** The workdays of mine a vacation takes: Monday to Thursday, holidays left out. */
export const vacationDays = (vacation: Vacation): number => {
  const { mine } = workdaysBetween(vacation.from, vacation.to, []);
  return mine;
};

export function nextHoliday(today: string): Holiday {
  const year = Number(today.slice(0, 4));
  const [name, date] = [...holidays(year), ...holidays(year + 1)]
    .sort(([, a], [, b]) => a.localeCompare(b))
    .find(([, candidate]) => candidate >= today)!;
  return { name, date, days: daysBetween(today, date) };
}

/** The public holidays of Baden-Württemberg. */
function holidays(year: number): (readonly [string, string])[] {
  const easter = easterSunday(year);
  const fixed = (month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
  return [
    ['Neujahr', fixed(1, 1)],
    ['Heilige Drei Könige', fixed(1, 6)],
    ['Karfreitag', addDays(easter, -2)],
    ['Ostermontag', addDays(easter, 1)],
    ['Tag der Arbeit', fixed(5, 1)],
    ['Christi Himmelfahrt', addDays(easter, 39)],
    ['Pfingstmontag', addDays(easter, 50)],
    ['Fronleichnam', addDays(easter, 60)],
    ['Tag der Deutschen Einheit', fixed(10, 3)],
    ['Allerheiligen', fixed(11, 1)],
    ['1. Weihnachtstag', fixed(12, 25)],
    ['2. Weihnachtstag', fixed(12, 26)],
  ];
}
