import { describe, expect, it } from 'vitest';

import {
  editionsOf,
  npmReleases,
  PRODUCTS,
  releasesNote,
  techSupport,
  type NpmVersion,
  type Release,
} from './releases';

const product = (label: string) => PRODUCTS.find((each) => each.label === label)!;
const [ANGULAR, KOTLIN, JAVA, NGINX] = ['Angular', 'Kotlin', 'Java', 'nginx'].map(product);
const TODAY = '2026-11-23';

const release = (name: string, overrides: Partial<Release>): Release => ({
  name,
  releaseDate: '2026-01-01',
  isLts: false,
  isEol: false,
  eolFrom: null,
  latest: null,
  ...overrides,
});

describe('editionsOf', () => {
  it('shows the latest version of each of the four newest lines with how long it is supported', () => {
    const releases = [
      release('22', {
        releaseDate: '2026-06-03',
        eolFrom: '2028-06-30',
        latest: { name: '22.3.0', date: '2026-11-18' },
      }),
      release('21', {
        releaseDate: '2025-11-19',
        eolFrom: '2027-06-30',
        latest: { name: '21.2.26', date: '2026-11-10' },
      }),
      release('20', {
        releaseDate: '2025-05-28',
        eolFrom: '2026-11-28',
        latest: { name: '20.3.35', date: '2026-10-01' },
      }),
      release('19', {
        releaseDate: '2024-11-19',
        isEol: true,
        eolFrom: '2026-05-19',
        latest: { name: '19.2.18', date: '2026-01-14' },
      }),
      release('18', { isEol: true, eolFrom: '2025-11-21' }),
    ];
    expect(editionsOf({ product: ANGULAR, releases }, TODAY)).toEqual([
      {
        version: '22.3.0',
        note: 'erschienen 18.11.2026 · Linie seit Juni 2026',
        status: 'Support bis Juni 2028',
        tone: 'ok',
        mark: null,
      },
      {
        version: '21.2.26',
        note: 'erschienen 10.11.2026 · Linie seit November 2025',
        status: 'Support endet Juni 2027',
        tone: 'warning',
        mark: null,
      },
      {
        version: '20.3.35',
        note: 'erschienen 01.10.2026 · Linie seit Mai 2025',
        status: 'Support endet November 2026',
        tone: 'warning',
        mark: null,
      },
      {
        version: '19.2.18',
        note: 'erschienen 14.01.2026 · Linie seit November 2024',
        status: 'ohne Support seit Mai 2026',
        tone: 'danger',
        mark: null,
      },
    ]);
  });

  it('gives only the day when there is no newer version than the line itself', () => {
    const releases = [
      release('2.4', { releaseDate: '2026-11-02' }),
      release('2.3', { releaseDate: '2026-06-10', latest: { name: '2.3.0', date: '2026-06-10' } }),
    ];
    expect(editionsOf({ product: KOTLIN, releases }, TODAY).map(({ note }) => note)).toEqual([
      'erschienen 02.11.2026',
      'erschienen 10.06.2026',
    ]);
  });

  it('takes a line whose end has passed as out of support, even before endoflife.date says so', () => {
    const releases = [
      release('20', { eolFrom: '2026-11-20', latest: { name: '20.3.35', date: '2026-10-01' } }),
    ];
    expect(editionsOf({ product: ANGULAR, releases }, TODAY)[0]).toMatchObject({
      status: 'ohne Support seit November 2026',
      tone: 'danger',
    });
  });

  it('keeps the newest Kotlin line supported until the next one comes', () => {
    const releases = [
      release('2.4', { latest: { name: '2.4.21', date: '2026-11-01' } }),
      release('2.3', { isEol: true, eolFrom: '2026-06-03' }),
    ];
    expect(
      editionsOf({ product: KOTLIN, releases }, TODAY).map(({ version, status }) => [version, status]),
    ).toEqual([
      ['2.4.21', 'Support bis zur nächsten Version'],
      ['2.3', 'ohne Support seit Juni 2026'],
    ]);
  });

  it('marks the lines endoflife.date calls LTS', () => {
    const releases = [
      release('27', { releaseDate: '2026-09-22', eolFrom: '2027-03-23' }),
      release('25', { isLts: true, releaseDate: '2025-09-22', eolFrom: '2031-09-30' }),
    ];
    expect(
      editionsOf({ product: JAVA, releases }, TODAY).map(({ version, mark }) => [version, mark]),
    ).toEqual([
      ['27', null],
      ['25', 'LTS'],
    ]);
  });

  it('marks the nginx lines with an even minor as stable, the mainline ones not', () => {
    const releases = [release('1.31', {}), release('1.30', {}), release('1.29', { isEol: true })];
    expect(editionsOf({ product: NGINX, releases }, TODAY).map(({ mark }) => mark)).toEqual([
      null,
      'stable',
      null,
    ]);
  });

  it('marks nothing as stable by its number where the product does not count that way', () => {
    expect(editionsOf({ product: KOTLIN, releases: [release('2.4', {})] }, TODAY)[0].mark).toBeNull();
  });
});

describe('releasesNote', () => {
  it('names the newest version any product got', () => {
    const issues = [
      { product: ANGULAR, releases: [release('22', { latest: { name: '22.3.0', date: '2026-11-18' } })] },
      { product: KOTLIN, releases: [release('2.4', { latest: { name: '2.4.21', date: '2026-11-20' } })] },
    ];
    expect(releasesNote(issues, null)).toEqual({ text: 'Neu: Kotlin 2.4.21 vom 20.11.', tone: null });
  });

  it('passes on which source is out of reach', () => {
    expect(releasesNote(undefined, 'endoflife.date nicht erreichbar').text).toBe(
      'endoflife.date nicht erreichbar',
    );
  });
});

describe('npmReleases', () => {
  const version = (name: string, publishedAt: string): NpmVersion => ({
    versionKey: { version: name },
    publishedAt,
  });
  const versions = [
    version('22.0.0', '2025-10-22T12:00:00Z'),
    version('23.0.0', '2026-06-16T12:00:00Z'),
    version('22.10.2', '2026-05-02T09:00:00Z'),
    version('23.3.3', '2026-09-30T08:00:00Z'),
    version('24.0.6', '2026-11-12T10:00:00Z'),
    version('24.0.0', '2026-10-21T10:00:00Z'),
    version('24.1.0-beta.2', '2026-11-18T10:00:00Z'),
    version('0.0.0-pr-31234-abc', '2026-11-19T10:00:00Z'),
  ];

  it('makes a line of each major, newest first, its newest stable version as the latest', () => {
    expect(npmReleases(versions, 18).map(({ name, latest }) => [name, latest?.name])).toEqual([
      ['24', '24.0.6'],
      ['23', '23.3.3'],
      ['22', '22.10.2'],
    ]);
  });

  it('supports a major for the given months from its first release', () => {
    expect(npmReleases(versions, 18)[2]).toMatchObject({ releaseDate: '2025-10-22', eolFrom: '2027-04-22' });
  });

  it('reads like a product of endoflife.date for the courier', () => {
    const issue = { product: product('Nx'), releases: npmReleases(versions, 18) };
    expect(editionsOf(issue, TODAY).map(({ version, status }) => [version, status])).toEqual([
      ['24.0.6', 'Support bis April 2028'],
      ['23.3.3', 'Support bis Dezember 2027'],
      ['22.10.2', 'Support endet April 2027'],
    ]);
  });
});

describe('techSupport', () => {
  const issues = [
    {
      product: product('Spring Boot'),
      releases: [
        release('3.5', { eolFrom: '2026-06-30' }),
        release('4.0', { eolFrom: '2026-12-31' }),
        release('4.1', { eolFrom: '2027-06-30' }),
      ],
    },
    {
      product: JAVA,
      releases: [release('17', { eolFrom: '2027-10-31' }), release('25', { eolFrom: '2031-09-30' })],
    },
  ];

  it('tells by the line of the version how long it is supported', () => {
    expect(techSupport('Spring Boot 4.1.0', issues, TODAY)).toBe('ok');
    expect(techSupport('Spring Boot 4.0.3', issues, TODAY)).toBe('warning');
    expect(techSupport('Spring Boot 3.5.2', issues, TODAY)).toBe('danger');
    expect(techSupport('Java 25', issues, TODAY)).toBe('ok');
  });

  it('knows nothing of a product or line it has not read', () => {
    expect(techSupport('Puppeteer 23.7.1', issues, TODAY)).toBeNull();
    expect(techSupport('Java 11', issues, TODAY)).toBeNull();
    expect(techSupport('Spring Boot 3.5.2', undefined, TODAY)).toBeNull();
  });
});
