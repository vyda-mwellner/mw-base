import { describe, expect, it } from 'vitest';

import type { UsageDay } from '../model/usage';
import { costChart, modelRows, usageFigures, usageView, windowStart } from './usage';

const TODAY = new Date(2026, 10, 23, 15, 0);
const day = (period: string, totalCost: number, models: Record<string, number> = {}): UsageDay => ({
  period,
  totalCost,
  totalTokens: 1_000_000,
  modelBreakdowns: Object.entries(models).map(([modelName, cost]) => ({ modelName, cost })),
});
const DAYS = [
  day('2026-10-30', 30, { 'claude-sonnet-5-5': 30 }),
  day('2026-11-22', 49, { 'claude-opus-5-5': 49 }),
  day('2026-11-23', 21, { 'claude-opus-5-5': 21 }),
];

describe('windowStart', () => {
  it('goes back 29 days, so today is the 30th', () => {
    expect(windowStart(TODAY)).toBe('20261025');
  });
});

describe('usageFigures', () => {
  it('sums today, the month and the window, and averages over the days with any use', () => {
    const figures = usageFigures(DAYS, TODAY);

    expect(figures.today).toBe('21,00\u00a0$');
    expect(figures.month).toBe('70,00\u00a0$');
    expect(figures.window).toBe('100,00\u00a0$');
    expect(figures.perDay).toBe('33,33\u00a0$');
  });

  it('names the most expensive day and counts the days with any use', () => {
    const figures = usageFigures([...DAYS, day('2026-11-20', 0)], TODAY);

    expect(figures.peak).toBe('49,00\u00a0$');
    expect(figures.peakDay).toBe('22.11.');
    expect(figures.used).toBe('3 von 30');
  });

  it('has no peak day while nothing was used', () => {
    const figures = usageFigures([], TODAY);

    expect(figures.peak).toBe('0,00\u00a0$');
    expect(figures.peakDay).toBe('');
    expect(figures.used).toBe('0 von 30');
  });
});

describe('costChart', () => {
  it('has a bar for every day of the window, an empty one for a day off', () => {
    const chart = costChart(DAYS, TODAY);

    expect(chart.labels).toHaveLength(30);
    expect(chart.labels.at(-1)).toBe('23.11.');
    expect(chart.series[0].values.at(-1)).toBe(21);
    expect(chart.series[0].values.at(-3)).toBe(0);
  });
});

describe('modelRows', () => {
  it('puts the most expensive model first with its share', () => {
    expect(modelRows(DAYS)).toEqual([
      { model: 'claude-opus-5-5', cost: '70,00\u00a0$', share: '70 %' },
      { model: 'claude-sonnet-5-5', cost: '30,00\u00a0$', share: '30 %' },
    ]);
  });
});

describe('usageView', () => {
  it('fills the meter as far as today comes to the most expensive day', () => {
    expect(usageView(DAYS, null, TODAY)).toEqual({
      share: 21 / 49,
      note: { text: 'Heute 21,00\u00a0$, Monat 70,00\u00a0$', tone: null },
    });
    expect(usageView(null, 'ccusage antwortet nicht', TODAY).share).toBe(0);
  });
});
