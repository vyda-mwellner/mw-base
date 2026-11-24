import { DAY_MONTH, MONTH_YEAR } from '../../core/format';
import { toDate } from '../../engine/days';
import type { Note, Tone } from '../../engine/model';

/** A release line as endoflife.date lists it, with the fields the Stack-Kurier reads. */
export interface Release {
  readonly name: string;
  /** ISO, as every day here. */
  readonly releaseDate: string;
  readonly isLts: boolean;
  readonly isEol: boolean;
  /** The end of free support; null where a line ends with the release of the next one. */
  readonly eolFrom: string | null;
  readonly latest: { readonly name: string; readonly date: string } | null;
}

export interface Product {
  readonly label: string;
  /**
   * Where its lines come from: endoflife.date by its name there, or for a package it does not list the versions on
   * npm, each major supported `supportMonths` from its first release.
   */
  readonly source: { readonly endoflife: string } | { readonly npm: string; readonly supportMonths: number };
  /** How long before the end of support a line counts as ending. */
  readonly warnMonths: number;
  /** endoflife.date marks no nginx line: its stable lines carry an even minor, the odd ones are mainline. */
  readonly evenMinorStable?: boolean;
  /** How a security advisory names it, where that is not its label as a word in any case. */
  readonly mention?: RegExp;
}

/**
 * What the Stack-Kurier reports on. Spring Boot counts OSS support, Java the Temurin builds the Dockerfiles run on,
 * Nx its own policy on nx.dev: six months as the latest major, twelve more as LTS. In an advisory, Nx is never
 * Siemens NX, and Spring Boot is Spring as a whole: it ships Framework and Security.
 */
export const PRODUCTS: readonly Product[] = [
  { label: 'Angular', source: { endoflife: 'angular' }, warnMonths: 12 },
  { label: 'Nx', source: { npm: 'nx', supportMonths: 18 }, warnMonths: 6, mention: /\bNx\b/ },
  { label: 'Spring Boot', source: { endoflife: 'spring-boot' }, warnMonths: 6, mention: /\bspring\b/i },
  { label: 'Kotlin', source: { endoflife: 'kotlin' }, warnMonths: 0 },
  {
    label: 'Java',
    source: { endoflife: 'eclipse-temurin' },
    warnMonths: 24,
    mention: /\b(?:java|jdk|openjdk|temurin)\b/i,
  },
  { label: 'Node', source: { endoflife: 'nodejs' }, warnMonths: 12, mention: /\bnode\.?js\b/i },
  { label: 'nginx', source: { endoflife: 'nginx' }, warnMonths: 3, evenMinorStable: true },
  { label: 'Keycloak', source: { endoflife: 'keycloak' }, warnMonths: 0 },
];

/** Read only for the lamps on the map of the workshop; the Stack-Kurier does not report on them. */
export const MAP_ONLY: readonly Product[] = [
  { label: 'Python', source: { endoflife: 'python' }, warnMonths: 12 },
];

/** A version of an npm package as deps.dev lists it. */
export interface NpmVersion {
  readonly versionKey: { readonly version: string };
  /** An instant, ISO 8601. */
  readonly publishedAt: string;
}

/** The lines of a product, newest first. */
interface Issue {
  readonly product: Product;
  readonly releases: readonly Release[];
}

/** A row of the Stack-Kurier: the latest version of a line and how long it is supported. */
interface Edition {
  readonly version: string;
  readonly note: string;
  readonly status: string;
  readonly tone: Tone | 'ok';
  /** `LTS` or `stable` on a line meant to be run for long, else null. */
  readonly mark: string | null;
}

const SHOWN = 4;

const DAY = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

const month = (iso: string): string => MONTH_YEAR.format(toDate(iso));
const day = (iso: string): string => DAY.format(toDate(iso));

function addMonths(iso: string, months: number): string {
  const [year, monthIndex, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, monthIndex - 1 + months, day)).toISOString().slice(0, 10);
}

function supportOf(release: Release, warnMonths: number, today: string): Pick<Edition, 'status' | 'tone'> {
  const end = release.eolFrom;
  if (release.isEol || (end !== null && end <= today))
    return { status: end ? `ohne Support seit ${month(end)}` : 'ohne Support', tone: 'danger' };
  if (end === null) return { status: 'Support bis zur nächsten Version', tone: 'ok' };
  if (end < addMonths(today, warnMonths)) return { status: `Support endet ${month(end)}`, tone: 'warning' };
  return { status: `Support bis ${month(end)}`, tone: 'ok' };
}

const STABLE = /^(\d+)\.\d+\.\d+$/;
const byVersion = (a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true });

/** The majors of an npm package as release lines, newest first. Previews and builds of pull requests are no release. */
export function npmReleases(versions: readonly NpmVersion[], supportMonths: number): Release[] {
  const majors = new Map<string, NpmVersion[]>();
  for (const version of versions) {
    const major = STABLE.exec(version.versionKey.version)?.[1];
    if (major) majors.set(major, [...(majors.get(major) ?? []), version]);
  }
  return [...majors.entries()]
    .sort(([a], [b]) => byVersion(b, a))
    .map(([major, line]) => {
      const sorted = line.sort((a, b) => byVersion(a.versionKey.version, b.versionKey.version));
      const first = sorted[0].publishedAt.slice(0, 10);
      const newest = sorted[sorted.length - 1];
      return {
        name: major,
        releaseDate: first,
        isLts: false,
        isEol: false,
        eolFrom: addMonths(first, supportMonths),
        latest: { name: newest.versionKey.version, date: newest.publishedAt.slice(0, 10) },
      };
    });
}

/** The day of the version shown comes first: whether it is fresh matters more than how old its line is. */
function noteOf(release: Release): string {
  const { latest, releaseDate } = release;
  if (!latest || latest.date === releaseDate) return `erschienen ${day(latest?.date ?? releaseDate)}`;
  return `erschienen ${day(latest.date)} · Linie seit ${month(releaseDate)}`;
}

function markOf(release: Release, product: Product): string | null {
  if (release.isLts) return 'LTS';
  if (product.evenMinorStable && Number(release.name.split('.')[1]) % 2 === 0) return 'stable';
  return null;
}

/** The four newest lines of a product on `today` (ISO). */
export function editionsOf({ product, releases }: Issue, today: string): Edition[] {
  return releases.slice(0, SHOWN).map((release) => ({
    version: release.latest?.name ?? release.name,
    note: noteOf(release),
    ...supportOf(release, product.warnMonths, today),
    mark: markOf(release, product),
  }));
}

/** How long a version as a scan names it, `Spring Boot 3.5.2`, is supported; null for a product or line not known. */
export function techSupport(
  tech: string,
  issues: readonly Issue[] | undefined,
  today: string,
): Tone | 'ok' | null {
  const issue = issues?.find(({ product }) => tech.startsWith(`${product.label} `));
  if (!issue) return null;
  const version = tech.slice(issue.product.label.length + 1);
  const release = issue.releases.find(({ name }) => version === name || version.startsWith(`${name}.`));
  return release ? supportOf(release, issue.product.warnMonths, today).tone : null;
}

/** What the news say of the stack in a line: the newest version any of the products got. */
export function releasesNote(issues: readonly Issue[] | undefined, error: string | null): Note {
  if (error !== null) return { text: error, tone: null };
  if (issues === undefined) return { text: 'Wird gelesen', tone: null };
  const newest = issues
    .flatMap(({ product, releases }) =>
      releases
        .slice(0, SHOWN)
        .flatMap((release) => (release.latest ? [{ product, latest: release.latest }] : [])),
    )
    .sort((a, b) => b.latest.date.localeCompare(a.latest.date))[0];
  if (!newest) return { text: 'Keine Versionen', tone: null };
  const { product, latest } = newest;
  return {
    text: `Neu: ${product.label} ${latest.name} vom ${DAY_MONTH.format(toDate(latest.date))}`,
    tone: null,
  };
}
