import type { ChartData, ChartSeries } from '../../workbench/domain/charts';
import type { CellValue, ChartKind, Column, QuerySection } from '../model/database';

export const NUMERIC_TYPES = new Set(['int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'oid']);

/** Four colors; crossing lines stop at three, only the first three hold apart there for color blindness. */
const maxSeries = (chart: ChartKind): number => (chart === 'line' ? 3 : 4);

export function chartData(
  section: QuerySection,
  columns: readonly Column[],
  rows: readonly CellValue[][],
): ChartData {
  const xIndex = Math.max(0, columnIndex(columns, section.x));
  const seriesIndex = columnIndex(columns, section.series);
  const yIndexes =
    section.y.length > 0
      ? section.y.map((name) => columnIndex(columns, name)).filter((index) => index >= 0)
      : columns
          .map((column, index) => ({ column, index }))
          .filter(({ column, index }) => index !== xIndex && index !== seriesIndex && isNumeric(column))
          .map(({ index }) => index);

  const limit = maxSeries(section.chart);
  if (seriesIndex >= 0) return pivot(rows, xIndex, seriesIndex, yIndexes[0] ?? -1, limit);
  return {
    labels: rows.map((row) => label(row[xIndex])),
    series: yIndexes.slice(0, limit).map((index) => ({
      name: columns[index].name,
      values: rows.map((row) => toNumber(row[index])),
    })),
    dropped: Math.max(0, yIndexes.length - limit),
  };
}

/** Rows shaped like (x, series, y): one series per value, the smallest ones folded into "Sonstige". */
function pivot(
  rows: readonly CellValue[][],
  xIndex: number,
  seriesIndex: number,
  yIndex: number,
  limit: number,
): ChartData {
  const labels: string[] = [];
  const sums = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const x = label(row[xIndex]);
    if (!labels.includes(x)) labels.push(x);
    const name = label(row[seriesIndex]);
    const values = sums.get(name) ?? new Map<string, number>();
    values.set(x, (values.get(x) ?? 0) + (toNumber(row[yIndex]) ?? 0));
    sums.set(name, values);
  }

  const total = (values: Map<string, number>) => [...values.values()].reduce((sum, value) => sum + value, 0);
  const ranked = [...sums.entries()]
    .filter(([, values]) => total(values) > 0)
    .sort(([, a], [, b]) => total(b) - total(a));
  const named = ranked.length > limit ? ranked.slice(0, limit) : ranked;
  const folded = ranked.slice(named.length);

  const series: ChartSeries[] = named.map(([name, values]) => ({
    name,
    values: labels.map((x) => values.get(x) ?? 0),
  }));
  if (folded.length > 0) {
    series.push({
      name: `Sonstige (${folded.length})`,
      values: labels.map((x) => folded.reduce((sum, [, values]) => sum + (values.get(x) ?? 0), 0)),
      other: true,
    });
  }
  return { labels, series, dropped: 0 };
}

function columnIndex(columns: readonly Column[], name: string | null): number {
  return name ? columns.findIndex((column) => column.name === name) : -1;
}

export const isNumeric = (column: Column): boolean => NUMERIC_TYPES.has(column.typeName);

export function label(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '(null)';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function toNumber(value: CellValue | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
