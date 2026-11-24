import { MOMENT, NUMBER } from '../../core/format';
import { escapeHtml, section, table } from '../../workbench/domain/report-html';
import type { LogReport } from '../model/cluster';
import type {
  CellValue,
  ChartKind,
  Column,
  LinkTargets,
  QueryDefinition,
  QueryResult,
  QuerySection,
  SectionResult,
} from '../model/database';
import { chartData, isNumeric, NUMERIC_TYPES } from './chart-data';
import { chartPaperSvg, chartSvg, type DrawnChart, type PaperBrand } from '../../workbench/domain/charts';
import { entryRows, problemRow, summary } from './log-view';

const DRAWN: ReadonlySet<string> = new Set(['bar', 'hbar', 'stacked', 'line']);
const isDrawn = (chart: ChartKind): chart is DrawnChart => DRAWN.has(chart);
/** More entries than this make the workbench slow to scroll; the problems above say what matters. */
const MAX_ENTRIES = 200;

const LEVEL_TONE: Readonly<Record<string, string>> = { error: 'danger', warn: 'warning' };

const tone = (level: string): string => (LEVEL_TONE[level] ? ` data-tone="${LEVEL_TONE[level]}"` : '');

/** The logs of one app as a report: what went wrong grouped by cause, then the newest entries. */
export function logsReport(app: string, stage: string, report: LogReport): string {
  const problems = report.problems.map((problem, index) => {
    const row = problemRow(problem, index);
    const where = row.frameFull ? `<br><span class="wb-muted">${escapeHtml(row.frameFull)}</span>` : '';
    return (
      `<tr><td${tone(row.level)}>${escapeHtml(row.levelLabel)}</td><td class="wb-num">${escapeHtml(row.count)}</td>` +
      `<th scope="row">${escapeHtml(row.titleFull)}${where}</th>` +
      `<td>${escapeHtml(row.detail)}<pre class="wb-trace">${escapeHtml(row.trace)}</pre></td>` +
      `<td class="wb-muted">${escapeHtml(row.when)}<br>${escapeHtml(row.whenTitle)}</td></tr>`
    );
  });
  const entries = entryRows(report.recent, 'all')
    .slice(0, MAX_ENTRIES)
    .map(
      (entry) =>
        `<tr><td class="wb-num">${escapeHtml(entry.time)}</td><td class="wb-muted">${escapeHtml(entry.pod)}</td>` +
        `<td${tone(entry.level)}>${escapeHtml(entry.levelLabel)}</td>` +
        `<td>${escapeHtml(entry.message)}${entry.trace ? `<pre class="wb-trace">${escapeHtml(entry.trace)}</pre>` : ''}</td></tr>`,
    );
  return [
    `<h1>${escapeHtml(app)} auf ${escapeHtml(stage)}</h1>`,
    `<p class="wb-muted">${escapeHtml(summary(report))}</p>`,
    problems.length > 0
      ? section('Probleme', table(['Level', 'Anzahl', 'Ursache', 'Meldung', 'Wann'], problems, [false, true]))
      : section('Probleme', '<p class="wb-muted">Keine Fehler und Warnungen im Zeitraum.</p>'),
    entries.length > 0
      ? section('Neueste Einträge', table(['Zeit', 'Pod', 'Level', 'Meldung'], entries, [true]))
      : '',
  ].join('\n');
}

function shown(value: CellValue, column: Column): string {
  if (value === null) return '-';
  if (typeof value === 'number' && NUMERIC_TYPES.has(column.typeName)) return NUMBER.format(value);
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** A cell of a linked column opens the query that declares the param, with the value of the cell. */
function cell(value: CellValue, column: Column, param: string | null, links: LinkTargets): string {
  const numeric = NUMERIC_TYPES.has(column.typeName);
  if (value === null) return `<td class="wb-muted${numeric ? ' wb-num' : ''}">-</td>`;
  const text = escapeHtml(shown(value, column));
  const target = param ? links[param] : undefined;
  const content = target
    ? `<button type="button" class="wb-link" data-action="link" data-param="${escapeHtml(param!)}" data-value="${escapeHtml(String(value))}" title="Öffnet ${escapeHtml(target)}">${text}</button>`
    : text;
  return `<td${numeric ? ' class="wb-num"' : ''}>${content}</td>`;
}

function resultTable(definition: QuerySection, result: QueryResult, links: LinkTargets): string {
  const { columns, rows } = result;
  const params = columns.map(
    (column) => definition.links.find((link) => link.column === column.name)?.param ?? null,
  );
  const body = rows.map(
    (row) => `<tr>${row.map((value, at) => cell(value, columns[at], params[at], links)).join('')}</tr>`,
  );
  return table(
    columns.map((column) => column.name),
    body,
    columns.map((column) => NUMERIC_TYPES.has(column.typeName)),
  );
}

/** What `-- chart:` asks for above the table; the table is folded away under anything that is not one. */
function sectionBody(
  definition: QuerySection,
  index: number,
  result: QueryResult,
  links: LinkTargets,
  title: string,
): string {
  const { columns, rows } = result;
  const folded = (lead: string) =>
    `${lead}<details class="wb-details"><summary>Tabelle</summary>${resultTable(definition, result, links)}</details>`;
  switch (definition.chart) {
    case 'text': {
      const text = rows.map((row) => shown(row[0] ?? null, columns[0])).join('\n');
      return `<div class="wb-copy"><pre class="wb-log">${escapeHtml(text)}</pre><button type="button" class="gm-btn gm-btn-sm" data-action="copy">Kopieren</button></div>`;
    }
    case 'stat': {
      const at = Math.max(columns.findIndex(isNumeric), 0);
      return folded(
        `<p class="wb-stat"><span class="wb-stat-value">${escapeHtml(shown(rows[0][at], columns[at]))}</span><span class="wb-muted">${escapeHtml(columns[at].name)}</span></p>`,
      );
    }
    case 'record':
      return folded(
        `<dl class="wb-record">${columns.map((column, at) => `<dt>${escapeHtml(column.name)}</dt><dd>${escapeHtml(shown(rows[0][at], column))}</dd>`).join('')}</dl>`,
      );
    case 'table':
      return resultTable(definition, result, links);
    default: {
      if (!isDrawn(definition.chart)) return resultTable(definition, result, links);
      const data = chartData(definition, columns, rows);
      const dropped =
        data.dropped > 0
          ? `<p class="wb-muted">${data.dropped} weitere Wertespalten nur in der Tabelle.</p>`
          : '';
      const chart = chartSvg(definition.chart, data, title);
      const png = chart
        ? `<button type="button" class="gm-btn gm-btn-sm" data-action="png" data-section="${index}">PNG kopieren</button>`
        : '';
      return folded(chart + dropped + png);
    }
  }
}

const givenParams = (params: Readonly<Record<string, string>>): string[] =>
  Object.entries(params)
    .filter(([, value]) => value.trim() !== '')
    .map(([name, value]) => `${name} ${value}`);

export interface PictureRun {
  readonly results: readonly SectionResult[];
  readonly connection: string;
  readonly ranAt: number;
  readonly params: Readonly<Record<string, string>>;
  readonly brand: PaperBrand;
}

/** Null for a section that draws no chart or has no result. */
export function chartPicture(query: QueryDefinition, index: number, run: PictureRun): string | null {
  const definition = query.sections[index];
  const result = run.results[index]?.result;
  if (!definition || !result || !isDrawn(definition.chart)) return null;
  const title = definition.title ?? query.title;
  const subtitle = [title === query.title ? '' : query.title, ...givenParams(run.params)].filter(Boolean);
  const svg = chartPaperSvg(definition.chart, chartData(definition, result.columns, result.rows), {
    title,
    subtitle: subtitle.join(' · '),
    source: `${run.connection} · Stand ${MOMENT.format(run.ranAt)}`,
    brand: run.brand,
  });
  return svg || null;
}

/** A query run as a report: a table per section, or the error of a section that failed while the others ran. */
export function queryReport(
  query: QueryDefinition,
  connection: string,
  results: readonly SectionResult[],
  ranAt: number,
  params: Readonly<Record<string, string>>,
  links: LinkTargets = {},
): string {
  const given = givenParams(params);
  const sections = query.sections.map((definition, index) => {
    const title = definition.title ?? query.title;
    const outcome = results[index];
    if (!outcome || outcome.error || !outcome.result) {
      return section(title, `<p data-tone="danger">${escapeHtml(outcome?.error ?? 'Kein Ergebnis')}</p>`);
    }
    const { rows, truncated, durationMs } = outcome.result;
    const note = [
      `${NUMBER.format(rows.length)} Zeilen`,
      truncated ? 'gekürzt' : '',
      `${NUMBER.format(durationMs)} ms`,
    ]
      .filter(Boolean)
      .join(' · ');
    const info = definition.info ? `<p>${escapeHtml(definition.info)}</p>` : '';
    return section(
      title,
      info +
        `<p class="wb-muted">${escapeHtml(note)}</p>` +
        (rows.length === 0
          ? '<p class="wb-muted">Keine Zeilen.</p>'
          : sectionBody(definition, index, outcome.result, links, title)),
    );
  });
  return [
    `<h1>${escapeHtml(query.title)}</h1>`,
    `<p class="wb-muted">${escapeHtml([connection, MOMENT.format(ranAt), ...given].join(' · '))}</p>`,
    query.description ? `<p>${escapeHtml(query.description)}</p>` : '',
    ...sections,
  ].join('\n');
}
