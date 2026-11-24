import { DAY_MONTH } from '../../core/format';
import type { Note, Tone } from '../../engine/model';
import { PRODUCTS, type Product } from './releases';

/** A new advisory of the WID feed. */
export interface Advisory {
  readonly id: string;
  /** What the title names before its colon, `nginx`; null where it names nothing. */
  readonly product: string | null;
  readonly text: string;
  /** As the BSI rates it: niedrig, mittel, hoch, kritisch. */
  readonly severity: string | null;
  /** Only https, as it is opened in the browser; else empty. */
  readonly link: string;
  /** An instant, ISO 8601; empty where the feed gives no date that parses. */
  readonly published: string;
  /** The label of the Stack-Kurier product it concerns. */
  readonly stack: string | null;
}

// `[NEU] [hoch] nginx: Schwachstelle ermöglicht Denial of Service`, the marks in brackets in any order.
const KIND = /\[(NEU|UPDATE)\]/i;
const SEVERITY = /\[(niedrig|mittel|hoch|kritisch)\]/i;
const MARKS = /^(?:\s*\[[^\]]*\])*\s*/;

const mentions = (product: Product, title: string): boolean =>
  (product.mention ?? new RegExp(`\\b${product.label}\\b`, 'i')).test(title);

function advisoryOf(item: Element): Advisory | null {
  // By tag name, so the atom:link some feeds carry is never taken for the link.
  const field = (name: string): string => item.getElementsByTagName(name)[0]?.textContent?.trim() ?? '';
  const title = field('title');
  if (KIND.exec(title)?.[1].toUpperCase() === 'UPDATE') return null;
  const rest = title.replace(MARKS, '');
  const colon = rest.indexOf(': ');
  const link = field('link');
  const date = new Date(field('pubDate'));
  return {
    id: field('guid') || link || title,
    product: colon > 0 ? rest.slice(0, colon) : null,
    text: colon > 0 ? rest.slice(colon + 2) : rest,
    severity: SEVERITY.exec(title)?.[1].toLowerCase() ?? null,
    link: link.startsWith('https://') ? link : '',
    published: Number.isNaN(date.getTime()) ? '' : date.toISOString(),
    stack: PRODUCTS.find((product) => mentions(product, title))?.label ?? null,
  };
}

/** The new advisories of the feed, newest first. An update only revises one listed before, so it is left out. */
export function parseFeed(xml: string): Advisory[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0)
    throw new Error('wid.cert-bund.de liefert kein lesbares RSS');
  return [...doc.getElementsByTagName('item')]
    .map(advisoryOf)
    .filter((advisory) => advisory !== null)
    .sort((a, b) => b.published.localeCompare(a.published));
}

/** The line under Security-News in the menu: what came out since the last visit, lit until the first visit of the day. */
export function securityNote(
  fresh: readonly Advisory[] | undefined,
  visitedToday: boolean,
  error: string | null,
): Note {
  if (error !== null) return { text: error, tone: null };
  if (fresh === undefined) return { text: 'Wird gelesen', tone: null };
  const stack = fresh.filter((advisory) => advisory.stack !== null).length;
  const text =
    fresh.length > 0
      ? `${fresh.length} neu${stack > 0 ? `, ${stack} zum Stack` : ''}`
      : visitedToday
        ? 'Nichts Neues'
        : 'Heute noch nicht gelesen';
  return { text, tone: visitedToday ? null : 'info' };
}

/** What the news in the entrance say in a line: the Security-News while unread today, else the newest version of the stack. */
export function newsNote(security: Note, releases: Note): Note {
  return security.tone === 'info' ? { ...security, text: `Security: ${security.text}` } : releases;
}

/** The LED of an advisory: red for kritisch, yellow for hoch, unlit below or without a rating. */
export function severityTone(severity: string | null): Tone | null {
  if (severity === 'kritisch') return 'danger';
  if (severity === 'hoch') return 'warning';
  return null;
}

export interface Section {
  readonly title: string;
  readonly advisories: readonly Advisory[];
  readonly folded: boolean;
}

/** Those of the stack first, then the rest by severity, each in the order of the feed. */
export function sectionsOf(advisories: readonly Advisory[]): Section[] {
  const others = advisories.filter((advisory) => advisory.stack === null);
  return [
    {
      title: 'Dein Stack',
      advisories: advisories.filter((advisory) => advisory.stack !== null),
      folded: false,
    },
    {
      title: 'Kritisch und hoch',
      advisories: others.filter((advisory) => severityTone(advisory.severity) !== null),
      folded: false,
    },
    {
      title: 'Mittel und niedrig',
      advisories: others.filter((advisory) => severityTone(advisory.severity) === null),
      folded: true,
    },
  ];
}

export function advisoryDay({ published }: Advisory): string {
  return published ? DAY_MONTH.format(new Date(published)) : '';
}
