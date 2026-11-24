import { DAY_MONTH, NUMBER } from '../../core/format';
import { localIso } from '../../engine/days';
import type { Note } from '../../engine/model';
import type { ChartData } from '../../workbench/domain/charts';
import type { UsageDay } from '../model/usage';

/** How far back the sheet and the meter look. */
export const WINDOW_DAYS = 30;
const DOLLARS = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});
const TOKENS = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });

/** The first day of the window, as ccusage takes it: `YYYYMMDD`. */
export function windowStart(today: Date): string {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (WINDOW_DAYS - 1));
  return localIso(start).replaceAll('-', '');
}

export const dollars = (amount: number): string => DOLLARS.format(amount);

interface UsageFigures {
  readonly today: string;
  readonly month: string;
  readonly window: string;
  /** Per day with any use, so a day off does not pull it down. */
  readonly perDay: string;
  readonly peak: string;
  /** The day of `peak`, empty while nothing was used. */
  readonly peakDay: string;
  readonly used: string;
  readonly tokens: string;
}

export function usageFigures(days: readonly UsageDay[], today: Date): UsageFigures {
  const todayIso = localIso(today);
  const monthIso = todayIso.slice(0, 7);
  const sum = (picked: readonly UsageDay[]) => picked.reduce((total, day) => total + day.totalCost, 0);
  const used = days.filter((day) => day.totalCost > 0);
  const peak = used.reduce<UsageDay | null>(
    (top, day) => (top && top.totalCost >= day.totalCost ? top : day),
    null,
  );
  return {
    today: dollars(sum(days.filter((day) => day.period === todayIso))),
    month: dollars(sum(days.filter((day) => day.period.startsWith(monthIso)))),
    window: dollars(sum(days)),
    perDay: dollars(used.length === 0 ? 0 : sum(used) / used.length),
    peak: dollars(peak?.totalCost ?? 0),
    peakDay: peak ? DAY_MONTH.format(new Date(`${peak.period}T00:00`)) : '',
    used: `${used.length} von ${WINDOW_DAYS}`,
    tokens: TOKENS.format(days.reduce((total, day) => total + day.totalTokens, 0)),
  };
}

/** Every day of the window as a bar, a day without use too, so the gaps show. */
export function costChart(days: readonly UsageDay[], today: Date): ChartData {
  const byDay = new Map(days.map((day) => [day.period, day.totalCost]));
  const dates = Array.from(
    { length: WINDOW_DAYS },
    (_, index) =>
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - (WINDOW_DAYS - 1 - index)),
  );
  return {
    labels: dates.map((date) => DAY_MONTH.format(date)),
    series: [
      { name: 'USD', values: dates.map((date) => Math.round((byDay.get(localIso(date)) ?? 0) * 100) / 100) },
    ],
    dropped: 0,
  };
}

/** The models of the window, the most expensive first, with their share of the cost. */
export function modelRows(days: readonly UsageDay[]): { model: string; cost: string; share: string }[] {
  const costs = new Map<string, number>();
  for (const day of days)
    for (const model of day.modelBreakdowns)
      costs.set(model.modelName, (costs.get(model.modelName) ?? 0) + model.cost);
  const total = [...costs.values()].reduce((sum, cost) => sum + cost, 0);
  return [...costs.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([model, cost]) => ({
      model,
      cost: dollars(cost),
      share: total === 0 ? '' : `${NUMBER.format(Math.round((cost / total) * 100))} %`,
    }));
}

/** The meter in the attic: today against the most expensive day of the window, full and gold on that day. */
interface UsageView {
  readonly share: number;
  readonly note: Note;
}

export function usageView(days: readonly UsageDay[] | null, error: string | null, today: Date): UsageView {
  if (error !== null) return { share: 0, note: { text: error, tone: null } };
  if (days === null) return { share: 0, note: { text: 'Wird gelesen', tone: null } };
  const todayIso = localIso(today);
  const cost = days.find((day) => day.period === todayIso)?.totalCost ?? 0;
  const peak = Math.max(0, ...days.map((day) => day.totalCost));
  const figures = usageFigures(days, today);
  return {
    share: peak === 0 ? 0 : Math.min(cost / peak, 1),
    note: { text: `Heute ${figures.today}, Monat ${figures.month}`, tone: null },
  };
}
