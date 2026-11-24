import { DAY_MONTH, NUMBER, plural } from '../../core/format';
import type { Note } from '../../engine/model';
import { escapeHtml, section, table } from '../../workbench/domain/report-html';
import type { AppInfo, Edge, Snapshot } from '../model/landscape';

/** A scan older than this asks to be run again: repos move faster than that. */
export const STALE_DAYS = 30;
const DAY_MS = 86_400_000;
const KIND_LABELS: Readonly<Record<AppInfo['kind'], string>> = {
  frontend: 'Frontend',
  backend: 'Backend',
  service: 'Dienst',
  infra: 'Infrastruktur',
};

interface MapRow {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  /** Lines of code, empty without a checkout. */
  readonly value: string;
  readonly missing: boolean;
}

interface MapGroup {
  readonly id: string;
  readonly label: string;
  readonly rows: MapRow[];
}

const portsOf = (app: AppInfo): string => app.ports.map((port) => `:${port}`).join(' ');

/** The groups of the scan, the shared infrastructure last, each app with its stack and ports. */
export function mapGroups(snapshot: Snapshot): MapGroup[] {
  return [...snapshot.groups]
    .sort((a, b) => Number(a.side) - Number(b.side))
    .map((group) => ({
      id: group.id,
      label: group.label,
      rows: snapshot.apps
        .filter((app) => app.group === group.id)
        .map((app) => ({
          id: app.id,
          label: app.label,
          note:
            [app.tech.slice(0, 2).join(', '), portsOf(app)].filter(Boolean).join(' · ') ||
            KIND_LABELS[app.kind],
          value: app.loc ? `${NUMBER.format(app.loc.total)} Z.` : '',
          missing: app.missing,
        })),
    }))
    .filter((group) => group.rows.length > 0);
}

function edgeRows(edges: readonly Edge[], labelOf: (id: string) => string, side: 'from' | 'to'): string[] {
  return edges.map(
    (edge) =>
      `<tr><th scope="row">${escapeHtml(labelOf(edge[side]))}</th><td>${edge.kind === 'link' ? 'Link' : 'Aufruf'}</td><td class="wb-muted">${edge.via.map(escapeHtml).join('<br>')}</td></tr>`,
  );
}

/** Everything the scan knows of one app, for the workbench. */
export function appReport(app: AppInfo, snapshot: Snapshot): string {
  const labelOf = (id: string) => snapshot.apps.find((each) => each.id === id)?.label ?? id;
  const calls = snapshot.edges.filter((edge) => edge.from === app.id);
  const callers = snapshot.edges.filter((edge) => edge.to === app.id);
  const where = [KIND_LABELS[app.kind], app.repo, app.path, portsOf(app)].filter(Boolean).join(' · ');
  const parts = [`<h1>${escapeHtml(app.label)}</h1>`, `<p class="wb-muted">${escapeHtml(where)}</p>`];
  if (app.missing)
    parts.push(
      `<p data-tone="warning">${escapeHtml(app.repo ?? '')} ist nicht im Workspace ausgecheckt.</p>`,
    );
  if (app.tech.length > 0) parts.push(section('Technik', `<p>${app.tech.map(escapeHtml).join(' · ')}</p>`));
  if (app.loc) {
    const { loc } = app;
    const languages = loc.byLanguage.map(
      (entry) =>
        `<tr><th scope="row">${escapeHtml(entry.language)}</th><td class="wb-num">${NUMBER.format(entry.lines)}</td></tr>`,
    );
    parts.push(
      section(
        'Code',
        `<p>${NUMBER.format(loc.total)} Zeilen in ${plural(loc.files, 'Datei', 'Dateien')}, davon ${NUMBER.format(loc.test)} Test.</p>` +
          table(['Sprache', 'Zeilen'], languages, [false, true]),
      ),
    );
  }
  if (app.facts.length > 0) {
    const facts = app.facts.map(
      (fact) =>
        `<tr><th scope="row">${escapeHtml(fact.label)}</th><td class="wb-num">${escapeHtml(fact.value)}</td></tr>`,
    );
    parts.push(section('Kennzahlen', table(['', 'Anzahl'], facts, [false, true])));
  }
  if (app.git) {
    const { git } = app;
    parts.push(
      section(
        'Git',
        `<p>Letzter Commit ${escapeHtml(git.lastCommit ?? 'unbekannt')} · ${git.commits30} Commits in 30 Tagen, ${git.commits90} in 90 · ${plural(git.contributors90, 'Person', 'Personen')} in 90 Tagen</p>`,
      ),
    );
  }
  parts.push(
    section(
      'Ruft auf',
      calls.length > 0
        ? table(['Nach', 'Art', 'über'], edgeRows(calls, labelOf, 'to'))
        : '<p class="wb-muted">Nichts gefunden.</p>',
    ),
    section(
      'Wird aufgerufen von',
      callers.length > 0
        ? table(['Von', 'Art', 'über'], edgeRows(callers, labelOf, 'from'))
        : '<p class="wb-muted">Von keiner App im Workspace.</p>',
    ),
  );
  if (app.modules.length > 0)
    parts.push(section('Module', `<p>${app.modules.map(escapeHtml).join(' · ')}</p>`));
  if (app.unresolved.length > 0)
    parts.push(
      section(
        'Adressen ohne App',
        `<ul>${app.unresolved.map((each) => `<li>${escapeHtml(each)}</li>`).join('')}</ul>`,
      ),
    );
  return parts.join('\n');
}

/** Every connection of the scan as one table: who calls whom, and where it is configured. */
export function edgesReport(snapshot: Snapshot): string {
  const labelOf = (id: string) => snapshot.apps.find((each) => each.id === id)?.label ?? id;
  const rows = snapshot.edges.map(
    (edge) =>
      `<tr><th scope="row">${escapeHtml(labelOf(edge.from))}</th><td>${escapeHtml(labelOf(edge.to))}</td><td>${edge.kind === 'link' ? 'Link' : 'Aufruf'}</td><td class="wb-muted">${edge.via.map(escapeHtml).join('<br>')}</td></tr>`,
  );
  return [
    '<h1>Verbindungen</h1>',
    `<p class="wb-muted">${plural(snapshot.edges.length, 'Verbindung', 'Verbindungen')} zwischen ${plural(snapshot.apps.length, 'App', 'Apps')}, Scan vom ${escapeHtml(DAY_MONTH.format(snapshot.generatedAt))}</p>`,
    section('Wer ruft wen', table(['Von', 'Nach', 'Art', 'über'], rows)),
  ].join('\n');
}

export function mapNote(snapshot: Snapshot | null | undefined, error: string | null, now: number): Note {
  if (error !== null) return { text: error, tone: null };
  if (snapshot === undefined) return { text: 'Wird gelesen', tone: null };
  if (snapshot === null) return { text: 'Noch kein Scan: Q im Blatt', tone: null };
  const days = Math.floor((now - snapshot.generatedAt) / DAY_MS);
  return {
    text: `Scan vom ${DAY_MONTH.format(snapshot.generatedAt)}, ${plural(snapshot.apps.length, 'App', 'Apps')}, ${plural(snapshot.edges.length, 'Verbindung', 'Verbindungen')}`,
    tone: days >= STALE_DAYS ? 'warning' : null,
  };
}
