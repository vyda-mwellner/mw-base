import { pad, toDate, toIso } from '../../engine/days';
import type { Vacation } from './calendar';

function validDay(year: number, month: number, day: number): string | null {
  const iso = `${year}-${pad(month)}-${pad(day)}`;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return toIso(toDate(iso)) === iso ? iso : null;
}

/**
 * A day as typed: `21.12.2026`, `21.12.26`, `21.12.` or `2026-12-21`. Without a year it is the next such day
 * from `from` on, so `6.1.` typed in November is the coming January.
 */
export function parseDay(text: string, from: string): string | null {
  const typed = text.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typed);
  if (iso) return validDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const german = /^(\d{1,2})\.(\d{1,2})\.?(\d{2}|\d{4})?$/.exec(typed);
  if (!german) return null;
  const [day, month] = [Number(german[1]), Number(german[2])];
  if (german[3]) {
    const year = Number(german[3]);
    return validDay(year < 100 ? 2000 + year : year, month, day);
  }
  const year = Number(from.slice(0, 4));
  const thisYear = validDay(year, month, day);
  if (thisYear && thisYear >= from) return thisYear;
  return validDay(year + 1, month, day);
}

/** `2026-12-21` as `21.12.2026`. */
export const showDay = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** A span as typed, its two days apart: `21.12. - 6.1.`, `21.12.-6.1.`, `21.12. bis 6.1.`; one day alone is a span too. */
function split(text: string): readonly [string, string] {
  const typed = text.trim();
  const apart =
    /^(.+?)\s+(?:-|\u2013|bis)\s+(.+)$/.exec(typed) ??
    /^([\d.]+)\s*[-\u2013]\s*([\d.]+)$/.exec(typed) ??
    /^(.+?)\s*bis\s*(.+)$/.exec(typed);
  return apart ? [apart[1], apart[2]] : [typed, typed];
}

/** From what was typed into the field: a vacation, or why there is none. */
export function readVacation(text: string, today: string): Vacation | string {
  if (!text.trim()) return 'Zeitraum eingeben, etwa 21.12. - 6.1.';
  const [fromText, toText] = split(text);
  const from = parseDay(fromText, today);
  if (!from) return `"${fromText}" ist kein Tag, etwa 21.12. oder 21.12.2026`;
  const to = parseDay(toText, from);
  if (!to) return `"${toText}" ist kein Tag, etwa 6.1. oder 06.01.2027`;
  if (to < from) return 'Das Ende liegt vor dem Anfang';
  return { from, to };
}

/** A vacation as it goes back into the field: `21.12.2026 - 06.01.2027`, a single day alone. */
export const typedVacation = ({ from, to }: Vacation): string =>
  from === to ? showDay(from) : `${showDay(from)} - ${showDay(to)}`;

/** The vacations in the order they begin; the same one twice is kept once. */
export function withVacation(vacations: readonly Vacation[], added: Vacation): Vacation[] {
  const others = vacations.filter((each) => each.from !== added.from || each.to !== added.to);
  return [...others, added].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

export const withoutVacation = (vacations: readonly Vacation[], removed: Vacation): Vacation[] =>
  vacations.filter((each) => each.from !== removed.from || each.to !== removed.to);
