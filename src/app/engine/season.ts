import { addDays, easterSunday } from './days';

/** Days on which the house is decorated without anybody asking for it. */
export type Season = 'advent' | 'silvester' | 'ostern' | 'halloween';

export function seasonOf(day: string): Season | null {
  const date = day.slice(5);
  if (date >= '12-01' && date <= '12-26') return 'advent';
  if (date >= '12-31' || date === '01-01') return 'silvester';
  if (date >= '10-28' && date <= '10-31') return 'halloween';
  const easter = easterSunday(Number(day.slice(0, 4)));
  return day >= addDays(easter, -3) && day <= addDays(easter, 1) ? 'ostern' : null;
}
