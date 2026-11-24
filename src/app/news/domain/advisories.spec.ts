import { describe, expect, it } from 'vitest';

import {
  type Advisory,
  advisoryDay,
  newsNote,
  parseFeed,
  sectionsOf,
  securityNote,
  severityTone,
} from './advisories';

const item = (
  title: string,
  pubDate = 'Wed, 25 Nov 2026 10:00:00 +0100',
  link = 'https://wid.cert-bund.de/x',
) =>
  `<item><title>${title}</title><link>${link}</link><guid>${title}</guid><pubDate>${pubDate}</pubDate></item>`;

const feed = (...items: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>` +
  `<title>WID</title><atom:link href="https://wid.cert-bund.de/feed" rel="self"/>${items.join('')}</channel></rss>`;

const advisory = (overrides: Partial<Advisory>): Advisory => ({
  id: 'a',
  product: 'nginx',
  text: 'Schwachstelle',
  severity: 'hoch',
  link: 'https://wid.cert-bund.de/x',
  published: '2026-11-25T09:00:00.000Z',
  stack: null,
  ...overrides,
});

describe('parseFeed', () => {
  it('reads product, text, severity, link and instant from an advisory', () => {
    const [nginx] = parseFeed(feed(item('[NEU] [hoch] nginx: Schwachstelle ermöglicht Denial of Service')));

    expect(nginx).toEqual({
      id: '[NEU] [hoch] nginx: Schwachstelle ermöglicht Denial of Service',
      product: 'nginx',
      text: 'Schwachstelle ermöglicht Denial of Service',
      severity: 'hoch',
      link: 'https://wid.cert-bund.de/x',
      published: '2026-11-25T09:00:00.000Z',
      stack: 'nginx',
    });
  });

  it('leaves out updates and lists the newest first', () => {
    const advisories = parseFeed(
      feed(
        item('[NEU] [mittel] Mozilla Firefox: Mehrere Schwachstellen', 'Mon, 23 Nov 2026 08:00:00 +0100'),
        item('[UPDATE] [hoch] Linux Kernel: Mehrere Schwachstellen', 'Wed, 25 Nov 2026 08:00:00 +0100'),
        item('[NEU] [kritisch] Microsoft Exchange: Schwachstelle', 'Tue, 24 Nov 2026 08:00:00 +0100'),
      ),
    );

    expect(advisories.map((each) => each.product)).toEqual(['Microsoft Exchange', 'Mozilla Firefox']);
  });

  it('marks what concerns a product of the Stack-Kurier, by the names advisories use for it', () => {
    const stack = (title: string) => parseFeed(feed(item(title)))[0].stack;

    expect(stack('[NEU] [hoch] VMware Tanzu Spring Framework: Schwachstelle')).toBe('Spring Boot');
    expect(stack('[NEU] [mittel] Oracle Java SE: Mehrere Schwachstellen')).toBe('Java');
    expect(stack('[NEU] [hoch] Node.js: Mehrere Schwachstellen')).toBe('Node');
    expect(stack('[NEU] [mittel] Red Hat Build of Keycloak: Schwachstelle')).toBe('Keycloak');
    expect(stack('[NEU] [hoch] Siemens NX: Schwachstelle')).toBeNull();
    expect(stack('[NEU] [mittel] Chrome: Schwachstelle in JavaScript-Engine')).toBeNull();
  });

  it('reads the marks in brackets in any order', () => {
    const [advisory] = parseFeed(feed(item('[kritisch] [NEU] Ivanti Connect Secure: Schwachstelle')));

    expect(advisory).toMatchObject({ product: 'Ivanti Connect Secure', severity: 'kritisch' });
  });

  it('keeps a title without the usual parts whole', () => {
    const [plain] = parseFeed(feed(item('Wartungsarbeiten am Portal')));

    expect(plain).toMatchObject({ product: null, text: 'Wartungsarbeiten am Portal', severity: null });
  });

  it('drops a link that is not https', () => {
    const [advisory] = parseFeed(feed(item('[NEU] [hoch] nginx: x', undefined, 'javascript:alert(1)')));

    expect(advisory.link).toBe('');
  });

  it('refuses what is not XML', () => {
    expect(() => parseFeed('<html><body>Wartung')).toThrow('kein lesbares RSS');
  });
});

describe('securityNote', () => {
  it('counts what came out since the last visit and what of it concerns the stack', () => {
    const fresh = [advisory({ stack: 'nginx' }), advisory({ id: 'b' })];

    expect(securityNote(fresh, true, null)).toEqual({ text: '2 neu, 1 zum Stack', tone: null });
  });

  it('is lit until the first visit of the day, even with nothing new', () => {
    expect(securityNote([], false, null)).toEqual({ text: 'Heute noch nicht gelesen', tone: 'info' });
    expect(securityNote([advisory({})], false, null)).toEqual({ text: '1 neu', tone: 'info' });
    expect(securityNote([], true, null)).toEqual({ text: 'Nichts Neues', tone: null });
  });

  it('is quiet while reading and on an error', () => {
    expect(securityNote(undefined, false, null)).toEqual({ text: 'Wird gelesen', tone: null });
    expect(securityNote(undefined, false, 'wid.cert-bund.de antwortet mit 503')).toEqual({
      text: 'wid.cert-bund.de antwortet mit 503',
      tone: null,
    });
  });
});

describe('newsNote', () => {
  const releases = { text: 'Neu: Angular 22.3.0 vom 18.11.', tone: null };

  it('puts unread advisories before the releases', () => {
    expect(newsNote({ text: '2 neu', tone: 'info' }, releases)).toEqual({
      text: 'Security: 2 neu',
      tone: 'info',
    });
  });

  it('tells the newest release while there is no news of security', () => {
    expect(newsNote({ text: 'Nichts Neues', tone: null }, releases)).toBe(releases);
  });
});

describe('sectionsOf', () => {
  it('puts the stack first, then the rest by severity, the bulk shut', () => {
    const nginx = advisory({ id: 'nginx', severity: 'mittel', stack: 'nginx' });
    const exchange = advisory({ id: 'exchange', severity: 'kritisch' });
    const firefox = advisory({ id: 'firefox', severity: 'hoch' });
    const kernel = advisory({ id: 'kernel', severity: 'mittel' });
    const plain = advisory({ id: 'plain', severity: null });

    const sections = sectionsOf([nginx, exchange, kernel, firefox, plain]);

    expect(
      sections.map(({ title, advisories, folded }) => [title, advisories.map(({ id }) => id), folded]),
    ).toEqual([
      ['Dein Stack', ['nginx'], false],
      ['Kritisch und hoch', ['exchange', 'firefox'], false],
      ['Mittel und niedrig', ['kernel', 'plain'], true],
    ]);
  });
});

describe('severityTone', () => {
  it('lights red for kritisch, yellow for hoch and nothing below', () => {
    expect(['kritisch', 'hoch', 'mittel', 'niedrig', null].map(severityTone)).toEqual([
      'danger',
      'warning',
      null,
      null,
      null,
    ]);
  });
});

describe('advisoryDay', () => {
  it('names the day it came out', () => {
    expect(advisoryDay(advisory({}))).toBe('25.11.');
    expect(advisoryDay(advisory({ published: '' }))).toBe('');
  });
});
