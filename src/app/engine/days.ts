const DAY = 86_400_000;

export const pad = (value: number): string => String(value).padStart(2, '0');

export const toDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

export const toIso = (date: Date): string => date.toISOString().slice(0, 10);

export const addDays = (iso: string, days: number): string =>
  toIso(new Date(toDate(iso).getTime() + days * DAY));

export const weekday = (iso: string): number => toDate(iso).getUTCDay();

export const daysBetween = (from: string, to: string): number =>
  Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY);

export const localIso = (moment: Date): string =>
  toIso(new Date(Date.UTC(moment.getFullYear(), moment.getMonth(), moment.getDate())));

export const todayIso = (): string => localIso(new Date());

const mondayOf = (iso: string): string => addDays(iso, -((weekday(iso) + 6) % 7));

/** The number of the ISO week a day falls in. */
export function isoWeek(iso: string): number {
  const monday = mondayOf(iso);
  const year = toDate(addDays(monday, 3)).getUTCFullYear();
  const week1Monday = mondayOf(`${year}-01-04`);
  return daysBetween(week1Monday, monday) / 7 + 1;
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}
