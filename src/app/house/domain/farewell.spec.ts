import { describe, expect, it } from 'vitest';

import { farewell, nextWorkday } from './farewell';

const WEDNESDAY_AFTERNOON = new Date(2026, 10, 25, 15, 0);

describe('nextWorkday', () => {
  it('is the next day while that is Monday to Thursday', () => {
    expect(nextWorkday('2026-11-25', [])).toBe('2026-11-26');
  });

  it('skips Friday and the weekend', () => {
    expect(nextWorkday('2026-11-26', [])).toBe('2026-11-30');
  });

  it('skips a holiday and a vacation', () => {
    expect(nextWorkday('2027-01-05', [])).toBe('2027-01-07');
    expect(nextWorkday('2026-11-26', [{ from: '2026-11-30', to: '2026-12-03' }])).toBe('2026-12-07');
  });
});

describe('farewell', () => {
  it('sums up the day and names the next one', () => {
    const page = farewell({
      now: WEDNESDAY_AFTERNOON,
      movement: { px: 0, floors: 3 },
      usage: [{ period: '2026-11-25', totalCost: 21, totalTokens: 0, modelBreakdowns: [] }],
      vacations: [],
    });

    expect(page.facts).toEqual([
      { label: 'Arbeitszeit ab 08:00 Uhr', value: '6 von 8 Stunden' },
      { label: 'Claude heute', value: '21,00\u00a0$' },
      { label: 'Schritte', value: '0' },
      { label: 'Etagen', value: '3' },
    ]);
    expect(page.nextWorkday).toBe('Donnerstag, 26.11.');
    expect(page.quarter).toBe('Q4 hat danach noch 21 Tage netto.');
  });

  it('says so while ccusage has not answered', () => {
    const page = farewell({ now: WEDNESDAY_AFTERNOON, movement: undefined, usage: null, vacations: [] });

    expect(page.facts[1]).toEqual({ label: 'Claude heute', value: 'nicht gelesen' });
  });
});
