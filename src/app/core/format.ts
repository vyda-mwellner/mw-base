export const MOMENT = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
export const CLOCK = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
export const DAY_MONTH = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
/** For a day as `toDate` reads it: midnight in UTC. */
export const MONTH_YEAR = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
export const NUMBER = new Intl.NumberFormat('de-DE');

export function plural(count: number, one: string, many: string): string {
  return `${NUMBER.format(count)} ${count === 1 ? one : many}`;
}
