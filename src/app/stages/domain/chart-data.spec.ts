import { describe, expect, it } from 'vitest';
import type { QuerySection } from '../model/database';
import { chartData } from './chart-data';

const section = (patch: Partial<QuerySection>): QuerySection => ({
  title: null,
  chart: 'stacked',
  x: null,
  y: [],
  series: null,
  info: null,
  links: [],
  sql: '',
  ...patch,
});

describe('chartData', () => {
  const longColumns = [
    { name: 'week', typeName: 'text' },
    { name: 'kanal', typeName: 'text' },
    { name: 'anzahl', typeName: 'int8' },
  ];

  it('turns (week, channel, count) rows into one series per channel and folds the smallest into Sonstige', () => {
    const chart = chartData(section({ x: 'week', series: 'kanal', y: ['anzahl'] }), longColumns, [
      ['KW 41', 'EMAIL', 10],
      ['KW 41', 'POST', 6],
      ['KW 41', 'FAX', 1],
      ['KW 41', 'API', 1],
      ['KW 42', 'EMAIL', 12],
      ['KW 42', 'WEB_SHOP', 4],
      ['KW 42', 'WEB_APP', 2],
    ]);

    expect(chart.labels).toEqual(['KW 41', 'KW 42']);
    expect(chart.series).toEqual([
      { name: 'EMAIL', values: [10, 12] },
      { name: 'POST', values: [6, 0] },
      { name: 'WEB_SHOP', values: [0, 4] },
      { name: 'WEB_APP', values: [0, 2] },
      { name: 'Sonstige (2)', values: [2, 0], other: true },
    ]);
  });

  it('keeps an empty week on the axis without inventing a series for it', () => {
    const chart = chartData(section({ x: 'week', series: 'kanal', y: ['anzahl'] }), longColumns, [
      ['KW 41', 'EMAIL', 3],
      ['KW 42', 'OHNE KANAL', 0],
    ]);

    expect(chart.labels).toEqual(['KW 41', 'KW 42']);
    expect(chart.series).toEqual([{ name: 'EMAIL', values: [3, 0] }]);
  });

  it('charts wide rows column by column and reports value columns beyond the palette', () => {
    const columns = ['day', 'a', 'b', 'c', 'd'].map((name, index) => ({
      name,
      typeName: index === 0 ? 'date' : 'int4',
    }));
    const chart = chartData(section({ chart: 'line' }), columns, [['2026-10-01', 1, 2, 3, 4]]);

    expect(chart.series.map((item) => item.name)).toEqual(['a', 'b', 'c']);
    expect(chart.dropped).toBe(1);
  });

  it('gives a bar chart a fourth series, where no lines cross', () => {
    const columns = ['day', 'a', 'b', 'c', 'd', 'e'].map((name, index) => ({
      name,
      typeName: index === 0 ? 'date' : 'int4',
    }));
    const chart = chartData(section({ chart: 'bar' }), columns, [['2026-10-01', 1, 2, 3, 4, 5]]);

    expect(chart.series.map((item) => item.name)).toEqual(['a', 'b', 'c', 'd']);
    expect(chart.dropped).toBe(1);
  });
});
