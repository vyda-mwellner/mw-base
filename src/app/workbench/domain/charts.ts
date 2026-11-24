import { NUMBER } from '../../core/format';
import { escapeHtml } from './report-html';
import { type Logo, readLogo } from './logo';
import { FONT, INK, MUTED, PAPER } from './paper';

export type DrawnChart = 'bar' | 'hbar' | 'stacked' | 'line';

export interface ChartSeries {
  readonly name: string;
  readonly values: (number | null)[];
  /** The folded remainder, drawn in gray instead of a series color. */
  readonly other?: boolean;
}

export interface ChartData {
  readonly labels: string[];
  readonly series: ChartSeries[];
  /** Value columns beyond the colors, which only the table shows. */
  readonly dropped: number;
}

export interface PaperBrand {
  readonly name: string;
  /** What the logo stands on, left to right: one color is a plain band, more a gradient; ink while there is none. */
  readonly colors: readonly string[];
  /** The SVG source of the logo; without one the name goes to the foot instead. */
  readonly logo: string;
}

/** What frames the chart on paper; an empty subtitle is left out. */
export interface PaperText {
  readonly title: string;
  readonly subtitle: string;
  readonly source: string;
  readonly brand: PaperBrand;
}

/** Drawn in this width, the report shows it as wide as it is: one unit of the drawing is about one pixel. */
const WIDTH = 640;
const PLOT_HEIGHT = 200;
const MARGIN = { top: 20, right: 12, bottom: 30, left: 52 };
/** More labels than this under the bars would overlap, so only every n-th one is written. */
const MAX_X_LABELS = 12;
const MAX_TICKS = 8;
/** Thin marks with air around them; a bar that fills its slot reads as a block. */
const MAX_BAR = 29;
/** The surface between touching marks, so neighbours part without a stroke around them. */
const GAP = 2;
/** A segment thinner than the gap still shows, so every stack reaches the sum written on top of it. */
const MIN_SEGMENT = 1.5;
/** Up to this many columns, each carries its value on top; more would crowd. */
const MAX_CAP_LABELS = 12;
const MIN_LABEL_BAND = 30;
const MAX_DOTS = 16;
const DOT = 4;
const END_LABEL_ROOM = 44;
const MIN_END_LABEL_GAP = 13;
const ROW = 26;
/** Below this a row no longer holds its 12 px label; above that one bar floats in too much air. */
const MIN_ROW = 16;
const MAX_ROW = 44;
const MAX_LABEL_WIDTH = 210;
/** On screen the marks stay square like the rest of the house; on paper the data end is rounded. */
const SCREEN_RADIUS = 0;
const PAPER_RADIUS = 4;

/** The categorical order of the Landkarte, validated for color blindness against white. */
const PAPER_SERIES: Readonly<Record<string, string>> = {
  s0: '#2a78d6',
  s1: '#eb6834',
  s2: '#1baf7a',
  s3: '#eda100',
  sx: '#8a9099',
};
const SECONDARY = '#3b4048';
const HAIRLINE = '#e5e7eb';
const PAPER_STYLE = [
  ...Object.entries(PAPER_SERIES).map(
    ([series, color]) => `.wb-${series}{fill:${color}}.wb-line.wb-${series}{stroke:${color}}`,
  ),
  '.wb-line{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}',
  `.wb-dot{stroke:${PAPER};stroke-width:2}`,
  '.wb-grid{stroke:#eceef1;stroke-width:1}',
  '.wb-base{stroke:#b9bec5;stroke-width:1}',
  `.wb-axis{fill:${MUTED};font-size:11px;font-variant-numeric:tabular-nums}`,
  `.wb-label{fill:${SECONDARY};font-size:12px}`,
  `.wb-value{fill:${INK};font-size:11px;font-weight:600}`,
].join('');
const PAPER_PAD = 32;
const CARD_RADIUS = 12;
const BAR = 40;
const LOGO_HEIGHT = 16;
/** Every picture the same size, so they line up side by side on a slide or a page. */
const PAPER_HEIGHT = 440;
const LEGEND_ROW = 20;
const SWATCH = 10;
/** A lone SVG has no layout: 12 px text is measured by an estimate, capitals wider than the rest. */
const CHAR = 6.8;
const CAPITAL = 8.2;
const LEGEND_GAP = 20;

const seriesClass = (series: ChartSeries, index: number): string => (series.other ? 'wb-sx' : `wb-s${index}`);
const short = (text: string, length: number): string =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;
const round = (value: number): number => Math.round(value * 10) / 10;
const textWidth = (text: string): number =>
  [...text].reduce((sum, char) => sum + (/\p{Lu}/u.test(char) ? CAPITAL : CHAR), 0);
const BIG = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, notation: 'compact' });
/** 1, 2 or 5 times a power of ten, so the top line of the axis reads as a round number. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].find((step) => step * power >= value) ?? 10) * power;
}

/** The finest round step that splits the span into at most eight; whole numbers never get a step below 1. */
export function niceStep(span: number, whole: boolean): number {
  if (span <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(span / MAX_TICKS));
  const steps = [1, 2, 2.5, 5, 10]
    .map((factor) => factor * power)
    .filter((step) => !whole || Number.isInteger(step));
  const step = steps.find((each) => Math.ceil(span / each - 1e-9) <= MAX_TICKS) ?? 10 * power;
  return whole ? Math.max(step, 1) : step;
}

interface Drawing {
  readonly height: number;
  readonly body: string;
}

const isEmpty = (data: ChartData): boolean => data.labels.length === 0 || data.series.length === 0;

/** Without `space` the drawing takes the height it needs, as on screen; with it, it fills exactly that much. */
function drawing(kind: DrawnChart, data: ChartData, radius: number, space?: number): Drawing {
  const plot = space === undefined ? PLOT_HEIGHT : space - MARGIN.top - MARGIN.bottom;
  return kind === 'hbar'
    ? horizontal(data, radius, space)
    : kind === 'line'
      ? lines(data, plot)
      : columns(data, kind === 'stacked', radius, plot);
}

/** A bar, stacked bar, horizontal bar or line chart as inline SVG, with a legend once there are several series. */
export function chartSvg(kind: DrawnChart, data: ChartData, title: string): string {
  if (isEmpty(data)) return '';
  const { height, body } = drawing(kind, data, SCREEN_RADIUS);
  const svg = `<svg viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" role="img">${body}</svg>`;
  const legend =
    data.series.length > 1
      ? `<ul class="wb-legend">${data.series
          .map(
            (series, index) =>
              `<li><span class="wb-swatch ${seriesClass(series, index)}"></span>${escapeHtml(series.name)}</li>`,
          )
          .join('')}</ul>`
      : '';
  return `<figure class="wb-chart" aria-label="Diagramm ${escapeHtml(title)}">${legend}${svg}</figure>`;
}

interface LegendEntry {
  readonly x: number;
  readonly row: number;
  readonly name: string;
  readonly kind: string;
}

function legendEntries(series: readonly ChartSeries[]): LegendEntry[] {
  let x = 0;
  let row = 0;
  return series.map((each, index) => {
    const name = short(each.name, 40);
    const span = SWATCH + 8 + textWidth(name);
    if (x > 0 && x + span > WIDTH) {
      x = 0;
      row += 1;
    }
    const entry = { x, row, name, kind: seriesClass(each, index) };
    x += span + LEGEND_GAP;
    return entry;
  });
}

/** Needs nothing around it, unlike `chartSvg`: legend, title and colors are all inside, so it can become a PNG. */
export function chartPaperSvg(kind: DrawnChart, data: ChartData, text: PaperText): string {
  if (isEmpty(data)) return '';
  const width = WIDTH + 2 * PAPER_PAD;
  const logo = readLogo(text.brand.logo);
  const head: string[] = [];
  let y = (logo ? BAR : 0) + 28 + 18;
  head.push(
    `<text x="${PAPER_PAD}" y="${y}" font-size="19" font-weight="650" letter-spacing="-0.2" fill="${INK}">${escapeHtml(short(text.title, 60))}</text>`,
  );
  if (text.subtitle) {
    y += 20;
    head.push(
      `<text x="${PAPER_PAD}" y="${y}" font-size="12.5" fill="${MUTED}">${escapeHtml(short(text.subtitle, 90))}</text>`,
    );
  }
  y += 14;
  const legend = data.series.length > 1 ? legendEntries(data.series) : [];
  for (const entry of legend) {
    const x = PAPER_PAD + entry.x;
    const baseline = y + 14 + entry.row * LEGEND_ROW;
    head.push(
      `<rect class="${entry.kind}" x="${round(x)}" y="${baseline - SWATCH + 1}" width="${SWATCH}" height="${SWATCH}" rx="2"/>` +
        `<text class="wb-label" x="${round(x + SWATCH + 8)}" y="${baseline}">${escapeHtml(entry.name)}</text>`,
    );
  }
  if (legend.length > 0) y += (legend[legend.length - 1].row + 1) * LEGEND_ROW + 4;
  const top = y + 4;
  const bottom = PAPER_HEIGHT - 50;
  const { height, body } = drawing(kind, data, PAPER_RADIUS, bottom - top);
  const frame =
    (logo ? band(width, logo, text.brand.colors) : '') +
    foot(width, bottom, text.source, logo ? '' : text.brand.name);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${PAPER_HEIGHT}" viewBox="0 0 ${width} ${PAPER_HEIGHT}" font-family="${FONT}" role="img" aria-label="Diagramm ${escapeHtml(text.title)}">`,
    `<style>${PAPER_STYLE}</style>`,
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${PAPER_HEIGHT - 1}" rx="${CARD_RADIUS}" fill="${PAPER}" stroke="${HAIRLINE}"/>`,
    frame,
    ...head,
    `<g transform="translate(${PAPER_PAD} ${round(top + (bottom - top - height) / 2)})">${body}</g>`,
    '</svg>',
  ].join('');
}

/** Across the top like the header of the company site: the logo in white on its colors. */
function band(width: number, logo: Logo, colors: readonly string[]): string {
  const r = CARD_RADIUS;
  const logoWidth = round((LOGO_HEIGHT * logo.width) / logo.height);
  const fill = colors.length > 1 ? 'url(#band)' : escapeHtml(colors[0] ?? INK);
  return [
    colors.length > 1 ? gradient(colors) : '',
    `<path d="M0,${BAR}V${r}A${r},${r} 0 0 1 ${r},0H${width - r}A${r},${r} 0 0 1 ${width},${r}V${BAR}Z" fill="${fill}"/>`,
    `<svg x="${PAPER_PAD}" y="${(BAR - LOGO_HEIGHT) / 2}" width="${logoWidth}" height="${LOGO_HEIGHT}" viewBox="${logo.viewBox}" fill="${PAPER}">${logo.body}</svg>`,
  ].join('');
}

function gradient(colors: readonly string[]): string {
  const stops = colors.map(
    (color, index) =>
      `<stop offset="${round(index / (colors.length - 1))}" stop-color="${escapeHtml(color)}"/>`,
  );
  return `<defs><linearGradient id="band">${stops.join('')}</linearGradient></defs>`;
}

function foot(width: number, bottom: number, source: string, name: string): string {
  const rule = bottom + 12;
  const baseline = rule + 20;
  return [
    `<line x1="${PAPER_PAD}" x2="${width - PAPER_PAD}" y1="${rule}" y2="${rule}" stroke="${HAIRLINE}"/>`,
    `<text x="${PAPER_PAD}" y="${baseline}" font-size="11" fill="${MUTED}">${escapeHtml(short(source, 80))}</text>`,
    name
      ? `<text x="${width - PAPER_PAD}" y="${baseline}" font-size="10.5" font-weight="700" letter-spacing="1.6" fill="${MUTED}" text-anchor="end">${escapeHtml(name)}</text>`
      : '',
  ].join('');
}

interface Axis {
  readonly y: (value: number) => number;
  readonly grid: string;
  readonly base: string;
}

function valueAxis(lowest: number, highest: number, whole: boolean, right: number, plot: number): Axis {
  const top = Math.max(highest, 0);
  const bottom = Math.min(lowest, 0);
  const step = niceStep(top - bottom, whole);
  const max = Math.max(step, Math.ceil(top / step - 1e-9) * step);
  const min = Math.floor(bottom / step + 1e-9) * step;
  const y = (value: number) => round(MARGIN.top + plot - ((value - min) / (max - min)) * plot);
  const count = Math.round((max - min) / step);
  const ticks = Array.from({ length: count + 1 }, (_, index) => Number((min + index * step).toPrecision(12)));
  const format = Math.max(max, -min) >= 1_000_000 ? BIG : NUMBER;
  const line = (kind: string, value: number) =>
    `<line class="${kind}" x1="${MARGIN.left}" x2="${WIDTH - right}" y1="${y(value)}" y2="${y(value)}"/>`;
  const grid = ticks
    .map(
      (tick) =>
        (tick === 0 ? '' : line('wb-grid', tick)) +
        `<text class="wb-axis" x="${MARGIN.left - 8}" y="${y(tick) + 4}" text-anchor="end">${escapeHtml(format.format(tick))}</text>`,
    )
    .join('');
  return { y, grid, base: line('wb-base', 0) };
}

function xLabels(labels: readonly string[], center: (index: number) => number, plot: number): string {
  const stride = Math.ceil(labels.length / MAX_X_LABELS);
  return labels
    .map((text, index) =>
      index % stride === 0
        ? `<text class="wb-axis" x="${round(center(index))}" y="${round(MARGIN.top + plot + 19)}" text-anchor="middle">${escapeHtml(short(text, 12))}</text>`
        : '',
    )
    .join('');
}

const isWhole = (values: readonly number[]): boolean => values.every(Number.isInteger);

function columns(data: ChartData, stacked: boolean, radius: number, plot: number): Drawing {
  const count = data.labels.length;
  const values = data.series.flatMap((series) => series.values.map((value) => value ?? 0));
  const sums = data.labels.map((_, index) =>
    data.series.reduce((sum, series) => sum + Math.max(series.values[index] ?? 0, 0), 0),
  );
  const axis = valueAxis(
    Math.min(0, ...values),
    stacked ? Math.max(...sums) : Math.max(...values),
    isWhole(values),
    MARGIN.right,
    plot,
  );
  const band = (WIDTH - MARGIN.left - MARGIN.right) / count;
  const slots = stacked ? 1 : data.series.length;
  const thickness = Math.max(1, Math.min(MAX_BAR, (band * 0.7 - (slots - 1) * GAP) / slots));
  const group = slots * thickness + (slots - 1) * GAP;
  const marks = data.labels.flatMap((_, index) => {
    const left = MARGIN.left + index * band + (band - group) / 2;
    if (stacked) return [stack(data.series, index, left, thickness, axis, radius)];
    return data.series.map((series, at) => {
      const value = series.values[index] ?? 0;
      const [from, to] = [axis.y(Math.max(value, 0)), axis.y(Math.min(value, 0))];
      return bar(
        seriesClass(series, at),
        left + at * (thickness + GAP),
        from,
        thickness,
        to - from,
        radius,
        value < 0 ? 'bottom' : 'top',
      );
    });
  });
  const center = (index: number) => MARGIN.left + index * band + band / 2;
  const labelled = (stacked || data.series.length === 1) && count <= MAX_CAP_LABELS && band >= MIN_LABEL_BAND;
  const caps = labelled
    ? data.labels
        .map((_, index) => {
          const value = stacked ? sums[index] : data.series[0].values[index];
          if (value === null || value === undefined) return '';
          const y = value < 0 ? axis.y(value) + 14 : axis.y(value) - 6;
          return `<text class="wb-value" x="${round(center(index))}" y="${round(y)}" text-anchor="middle">${escapeHtml(NUMBER.format(value))}</text>`;
        })
        .join('')
    : '';
  return {
    height: MARGIN.top + plot + MARGIN.bottom,
    body: axis.grid + marks.join('') + axis.base + caps + xLabels(data.labels, center, plot),
  };
}

function stack(
  series: readonly ChartSeries[],
  index: number,
  left: number,
  thickness: number,
  axis: Axis,
  radius: number,
): string {
  let sum = 0;
  const segments = series.flatMap((each, at) => {
    const value = Math.max(each.values[index] ?? 0, 0);
    if (value === 0) return [];
    const segment = { kind: seriesClass(each, at), from: sum, to: sum + value };
    sum += value;
    return [segment];
  });
  return segments
    .map((segment, at) => {
      const top = axis.y(segment.to);
      const bottom = axis.y(segment.from) - (at === 0 ? 0 : GAP);
      const end = at === segments.length - 1 ? 'top' : 'none';
      return bar(segment.kind, left, top, thickness, Math.max(bottom - top, MIN_SEGMENT), radius, end);
    })
    .join('');
}

function lines(data: ChartData, plot: number): Drawing {
  const count = data.labels.length;
  const values = data.series.flatMap((series) =>
    series.values.filter((value): value is number => value !== null),
  );
  const ends = data.series.map((series) => {
    const index = series.values.reduce<number>((last, value, at) => (value === null ? last : at), -1);
    return index < 0 ? null : { index, value: series.values[index]! };
  });
  const right = MARGIN.right + END_LABEL_ROOM;
  const axis = valueAxis(Math.min(0, ...values), Math.max(...values, 0), isWhole(values), right, plot);
  const step = count > 1 ? (WIDTH - MARGIN.left - right - 16) / (count - 1) : 0;
  const x = (index: number) => round(MARGIN.left + 8 + index * step);
  const drawn = data.series.map((series, at) => {
    // A missing value breaks the line instead of pulling it down to zero.
    const runs: string[][] = [[]];
    series.values.forEach((value, index) => {
      if (value === null) runs.push([]);
      else runs[runs.length - 1].push(`${x(index)},${axis.y(value)}`);
    });
    const kind = seriesClass(series, at);
    const paths = runs
      .filter((run) => run.length > 1)
      .map((run) => `<polyline class="wb-line ${kind}" points="${run.join(' ')}"/>`)
      .join('');
    const last = ends[at]?.index;
    const dots = series.values
      .map((value, index) =>
        value === null || (count > MAX_DOTS && index !== last)
          ? ''
          : `<circle class="wb-dot ${kind}" cx="${x(index)}" cy="${axis.y(value)}" r="${DOT}"/>`,
      )
      .join('');
    return paths + dots;
  });
  const heights = ends.flatMap((end) => (end ? [axis.y(end.value)] : [])).sort((a, b) => a - b);
  const apart = heights.every(
    (height, index) => index === 0 || height - heights[index - 1] >= MIN_END_LABEL_GAP,
  );
  const labels = apart
    ? ends
        .map((end) =>
          end
            ? `<text class="wb-value" x="${round(x(end.index) + DOT + 6)}" y="${round(axis.y(end.value) + 4)}">${escapeHtml(NUMBER.format(end.value))}</text>`
            : '',
        )
        .join('')
    : '';
  return {
    height: MARGIN.top + plot + MARGIN.bottom,
    body: axis.grid + axis.base + drawn.join('') + labels + xLabels(data.labels, x, plot),
  };
}

/** In a fixed `space` the rows stretch or squeeze; what no longer fits even squeezed is counted on a last line. */
function horizontal(data: ChartData, radius: number, space?: number): Drawing {
  const fits = space === undefined ? Infinity : Math.floor((space - 8) / MIN_ROW);
  const cut = data.labels.length > fits;
  const shown = cut ? fits - 1 : data.labels.length;
  const rowCount = shown + (cut ? 1 : 0);
  const row = space === undefined ? ROW : Math.min(MAX_ROW, (space - 8) / rowCount);
  const values = data.series.flatMap((series) =>
    series.values.slice(0, shown).map((value) => Math.max(value ?? 0, 0)),
  );
  const max = niceMax(Math.max(...values));
  const names = data.labels.slice(0, shown).map((text) => short(text, 24));
  const more = cut ? `+ ${data.labels.length - shown} weitere` : '';
  const left = round(Math.min(MAX_LABEL_WIDTH, Math.max(...[...names, more].map(textWidth)) + 10));
  const plot = WIDTH - left - MARGIN.right - 56;
  const thickness = Math.min(MAX_BAR, (row - 10 - (data.series.length - 1) * GAP) / data.series.length);
  const group = data.series.length * thickness + (data.series.length - 1) * GAP;
  const baseline = (index: number) => round(4 + index * row + row / 2 + 4);
  const rows = names.map((name, index) => {
    const top = 4 + index * row;
    const bars = data.series.map((series, at) => {
      const value = Math.max(series.values[index] ?? 0, 0);
      return bar(
        seriesClass(series, at),
        left,
        top + (row - group) / 2 + at * (thickness + GAP),
        (value / max) * plot,
        thickness,
        radius,
        'right',
      );
    });
    const single = data.series.length === 1 ? data.series[0].values[index] : null;
    const figure =
      single === null || single === undefined
        ? ''
        : `<text class="wb-value" x="${round(left + (Math.max(single, 0) / max) * plot + 8)}" y="${baseline(index)}">${escapeHtml(NUMBER.format(single))}</text>`;
    return (
      `<text class="wb-label" x="${left - 10}" y="${baseline(index)}" text-anchor="end">${escapeHtml(name)}</text>` +
      bars.join('') +
      figure
    );
  });
  const rest = more
    ? `<text class="wb-axis" x="${left - 10}" y="${baseline(shown)}" text-anchor="end">${more}</text>`
    : '';
  return { height: 8 + rowCount * row, body: rows.join('') + rest };
}

/** A bar square at its baseline; `end` names the side that carries the value and is rounded by `radius`. */
function bar(
  kind: string,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  end: 'top' | 'bottom' | 'right' | 'none',
): string {
  if (width <= 0 || height <= 0) return '';
  const [l, t, w, h] = [round(x), round(y), round(width), round(height)];
  const r = round(Math.min(radius, w / 2, h / 2));
  if (r <= 0 || end === 'none') {
    return `<rect class="wb-bar ${kind}" x="${l}" y="${t}" width="${w}" height="${h}"/>`;
  }
  const [rt, b] = [round(l + w), round(t + h)];
  const arc = (toX: number, toY: number) => `A${r},${r} 0 0 1 ${round(toX)},${round(toY)}`;
  const d =
    end === 'top'
      ? `M${l},${b}V${round(t + r)}${arc(l + r, t)}H${round(rt - r)}${arc(rt, t + r)}V${b}Z`
      : end === 'bottom'
        ? `M${l},${t}H${rt}V${round(b - r)}${arc(rt - r, b)}H${round(l + r)}${arc(l, b - r)}Z`
        : `M${l},${t}H${round(rt - r)}${arc(rt, t + r)}V${round(b - r)}${arc(rt - r, b)}H${l}Z`;
  return `<path class="wb-bar ${kind}" d="${d}"/>`;
}
