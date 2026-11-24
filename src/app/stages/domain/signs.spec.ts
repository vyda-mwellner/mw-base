import { describe, expect, it } from 'vitest';
import { incidentSigns } from './signs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 4, 20);

describe('incidentSigns', () => {
  it('counts the days from the newest restart, from the first look without one, and waits for an unread env', () => {
    const signs = incidentSigns(
      {
        dev: {
          watchedSince: NOW - 40 * DAY,
          last: { at: NOW - 23 * DAY - 1, app: 'orders-api', reason: 'OOMKilled' },
        },
        test: { watchedSince: NOW - DAY, last: null },
      },
      NOW,
    );

    expect(signs.map((sign) => [sign.label, sign.days, sign.text, sign.tone])).toEqual([
      ['DEV', '23', 'Tage ohne Vorfall', 'calm'],
      ['TEST', '1', 'Tag ohne Vorfall', 'calm'],
      ['PROD', '-', 'noch nicht gelesen', 'unread'],
    ]);
    expect(signs[0].title).toMatch(/^Zuletzt OOMKilled in orders-api am /);
    expect(signs[1].title).toMatch(/^Kein Neustart gesehen, seit TEST am /);
  });

  it('turns a sign with a restart from today red, a first look from today stays calm', () => {
    const signs = incidentSigns(
      {
        dev: { watchedSince: NOW - 9 * DAY, last: { at: NOW - 60_000, app: 'keycloak', reason: 'Error' } },
        prod: { watchedSince: NOW - 60_000, last: null },
      },
      NOW,
    );

    expect(signs.map((sign) => [sign.days, sign.tone])).toEqual([
      ['0', 'fresh'],
      ['-', 'unread'],
      ['0', 'calm'],
    ]);
  });
});
