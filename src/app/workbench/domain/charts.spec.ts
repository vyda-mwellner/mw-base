import { describe, expect, it } from 'vitest';

import { type ChartData, chartPaperSvg, chartSvg, niceMax, niceStep, type PaperText } from './charts';

const data: ChartData = {
  labels: ['KW 41', 'KW 42'],
  series: [
    { name: 'EMAIL', values: [10, 12] },
    { name: 'Sonstige (2)', values: [2, null], other: true },
  ],
  dropped: 0,
};

const single = (values: number[]): ChartData => ({
  labels: values.map((_, index) => `KW ${index + 1}`),
  series: [{ name: 'anzahl', values }],
  dropped: 0,
});

const count = (svg: string, pattern: RegExp): number => svg.match(pattern)?.length ?? 0;

describe('niceMax', () => {
  it('rounds the top of the axis up to 1, 2 or 5 times a power of ten', () => {
    expect([0, 3, 12, 180, 1_234].map(niceMax)).toEqual([1, 5, 20, 200, 2_000]);
  });
});

describe('niceStep', () => {
  it('splits the axis into at most eight round steps', () => {
    expect([100, 171, 318, 1_234].map((span) => niceStep(span, true))).toEqual([20, 25, 50, 200]);
  });

  it('never steps below 1 for whole numbers, but does for fractions', () => {
    expect(niceStep(3, true)).toBe(1);
    expect(niceStep(0.8, false)).toBe(0.1);
  });
});

describe('chartSvg', () => {
  it('draws a bar per value and series, with a legend for several series and gray for the folded rest', () => {
    const html = chartSvg('bar', data, 'Eingänge');

    expect(count(html, /class="wb-bar wb-s0"/g)).toBe(2);
    expect(count(html, /class="wb-bar wb-sx"/g)).toBe(1);
    expect(html).toContain('<li><span class="wb-swatch wb-s0"></span>EMAIL</li>');
    expect(html).toContain('>KW 41</text>');
  });

  it('keeps the marks square, like the rest of the house', () => {
    expect(chartSvg('bar', data, 'x')).not.toContain('<path');
  });

  it('draws a line for every round step of the axis and a stronger one at zero', () => {
    const html = chartSvg('bar', single([40, 100]), 'x');

    expect(count(html, /class="wb-grid"/g)).toBe(5);
    expect(count(html, /class="wb-base"/g)).toBe(1);
    expect(html).toContain('text-anchor="end">60</text>');
  });

  it('writes the value on top of each of a few columns, and the sum on top of a stack', () => {
    expect(chartSvg('bar', single([10, 12]), 'x')).toContain('class="wb-value"');
    expect(count(chartSvg('stacked', data, 'x'), /class="wb-value"[^>]*>12</g)).toBe(2);
    expect(chartSvg('bar', data, 'x')).not.toContain('class="wb-value"');
  });

  it('leaves a gap between the segments of a stack', () => {
    const html = chartSvg('stacked', data, 'x');
    const box = (kind: string) => {
      const [, y, height] = new RegExp(
        `class="wb-bar ${kind}" x="[\\d.]+" y="([\\d.]+)" width="[\\d.]+" height="([\\d.]+)"`,
      ).exec(html)!;
      return { y: Number(y), height: Number(height) };
    };

    expect(box('wb-sx').y + box('wb-sx').height).toBeCloseTo(box('wb-s0').y - 2, 0);
  });

  it('keeps a segment thinner than the gap, so the stack still reaches its sum', () => {
    const html = chartSvg(
      'stacked',
      {
        labels: ['KW 1'],
        series: [
          { name: 'groß', values: [1000] },
          { name: 'klein', values: [1] },
        ],
        dropped: 0,
      },
      'x',
    );

    expect(count(html, /class="wb-bar wb-s1"/g)).toBe(1);
  });

  it('breaks a line where a value is missing instead of dropping it to zero', () => {
    const html = chartSvg('line', data, 'Eingänge');

    expect(count(html, /<polyline class="wb-line wb-s0"/g)).toBe(1);
    expect(html).not.toContain('<polyline class="wb-line wb-sx"');
    expect(count(html, /<circle class="wb-dot wb-s0"/g)).toBe(2);
  });

  it('writes the last value at the end of each line, unless the ends crowd each other', () => {
    expect(chartSvg('line', data, 'x')).toMatch(/class="wb-value"[^>]*>12</);
    const close: ChartData = {
      labels: ['a', 'b'],
      series: [
        { name: 'eins', values: [10, 50] },
        { name: 'zwei', values: [10, 51] },
      ],
      dropped: 0,
    };
    expect(chartSvg('line', close, 'x')).not.toContain('class="wb-value"');
  });

  it('writes the value next to a single horizontal bar and leaves out the legend', () => {
    const html = chartSvg(
      'hbar',
      { labels: ['offen'], series: [{ name: 'anzahl', values: [1234] }], dropped: 0 },
      'x',
    );

    expect(html).toContain('>1.234</text>');
    expect(html).not.toContain('wb-legend');
  });

  it('makes the label column of horizontal bars as wide as its longest label', () => {
    const barStart = (labels: string[]): number => {
      const html = chartSvg(
        'hbar',
        { labels, series: [{ name: 'n', values: labels.map(() => 1) }], dropped: 0 },
        'x',
      );
      return Number(/<rect class="wb-bar wb-s0" x="([\d.]+)"/.exec(html)?.[1]);
    };

    expect(barStart(['offen', 'zu'])).toBeLessThan(barStart(['offen', 'in Bearbeitung beim Gutachter']));
  });

  it('escapes what comes from the database', () => {
    expect(
      chartSvg('bar', { labels: ['<b>'], series: [{ name: '<i>', values: [1] }], dropped: 0 }, 'x'),
    ).toContain('&lt;b&gt;');
  });
});

describe('chartPaperSvg', () => {
  const text = (over: Partial<PaperText> = {}): PaperText => ({
    title: 'Eingänge',
    subtitle: 'Wochenübersicht · wochen 8',
    source: 'PROD · Stand 24.11.2026, 09:30',
    brand: { name: 'ACME', colors: [], logo: '' },
    ...over,
  });
  const heightOf = (svg: string): number => Number(/^<svg [^>]*height="(\d+)"/.exec(svg)?.[1]);
  const chartTop = (svg: string): number => Number(/<g transform="translate\(32 ([\d.]+)\)">/.exec(svg)?.[1]);

  it('stands alone on a white card, with its own light colors, rounded bars, legend, and source and name at its foot', () => {
    const svg = chartPaperSvg('bar', data, text());

    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="704"/);
    expect(svg).toContain('rx="12" fill="#ffffff"');
    expect(svg).toContain('.wb-s0{fill:#2a78d6}');
    expect(svg).not.toContain('var(--');
    expect(svg).toContain('<path class="wb-bar wb-s0"');
    for (const part of [
      'Eingänge',
      'Wochenübersicht · wochen 8',
      'EMAIL',
      'PROD · Stand 24.11.2026, 09:30',
      'ACME',
    ]) {
      expect(svg).toContain(`>${part}</text>`);
    }
  });

  it('leaves out an empty subtitle and name, and gives their room to the chart', () => {
    const bare = chartPaperSvg(
      'bar',
      data,
      text({ subtitle: '', brand: { name: '', colors: [], logo: '' } }),
    );
    const full = chartPaperSvg('bar', data, text());

    expect(bare).not.toContain('ACME');
    expect(heightOf(bare)).toBe(heightOf(full));
    expect(chartTop(bare)).toBeLessThan(chartTop(full));
  });

  it('has the same size for every kind of chart, however many categories it has', () => {
    const many = single(Array.from({ length: 40 }, (_, index) => index + 1));
    const kinds = ['bar', 'stacked', 'line', 'hbar'] as const;
    const sizes = kinds.flatMap((kind) =>
      [single([3, 1, 2]), many].map((each) =>
        /^<svg [^>]*width="(\d+)" height="(\d+)"/.exec(chartPaperSvg(kind, each, text()))?.slice(1),
      ),
    );

    expect(new Set(sizes.map(String))).toEqual(new Set(['704,440']));
  });

  it('squeezes the rows of a long horizontal chart and counts what no longer fits', () => {
    const svg = chartPaperSvg('hbar', single(Array.from({ length: 40 }, (_, index) => index + 1)), text());

    expect(count(svg, /class="wb-label"/g)).toBe(17);
    expect(svg).toContain('>+ 23 weitere</text>');
    expect(chartPaperSvg('hbar', single([3, 1, 2]), text())).not.toContain('weitere');
  });

  it('puts the logo in white on a band of the brand color across the top, and only the source at the foot', () => {
    const logo =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"><path class="st0" d="M0 0h40v10z"/></svg>';
    const svg = chartPaperSvg('bar', data, text({ brand: { name: 'ACME', colors: ['#123456'], logo } }));

    expect(svg).toContain('V40Z" fill="#123456"/>');
    expect(svg).toContain('viewBox="0 0 40 10" fill="#ffffff"><path d="M0 0h40v10z"/></svg>');
    expect(svg).toContain('fill="#5f6672">PROD · Stand 24.11.2026, 09:30</text>');
    expect(svg).not.toContain('>ACME</text>');
  });

  it('runs the band from left to right through several brand colors', () => {
    const logo = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"><path d="M0 0h40v10z"/></svg>';
    const svg = chartPaperSvg(
      'bar',
      data,
      text({ brand: { name: '', colors: ['#111111', '#222222', '#333333'], logo } }),
    );

    expect(svg).toContain(
      '<linearGradient id="band"><stop offset="0" stop-color="#111111"/><stop offset="0.5" stop-color="#222222"/>' +
        '<stop offset="1" stop-color="#333333"/></linearGradient>',
    );
    expect(svg).toContain('V40Z" fill="url(#band)"/>');
  });

  it('lays the logo on ink while no brand color is set, and ignores a logo it cannot read', () => {
    const logo = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"><path d="M0 0h40v10z"/></svg>';

    expect(chartPaperSvg('bar', data, text({ brand: { name: '', colors: [], logo } }))).toContain(
      'V40Z" fill="#1f2328"/>',
    );
    expect(
      chartPaperSvg('bar', data, text({ brand: { name: 'ACME', colors: ['#123456'], logo: '<svg' } })),
    ).toContain('>ACME</text>');
  });

  it('wraps a long legend into more rows and takes the room for them from the chart', () => {
    const named = (name: string) => ({ name, values: [1, 2] });
    const short = chartPaperSvg('bar', { ...data, series: [named('a'), named('b')] }, text());
    const long = chartPaperSvg(
      'bar',
      {
        ...data,
        series: ['Erste', 'Zweite', 'Dritte', 'Vierte'].map((word) => named(`${word} sehr lange Reihe`)),
      },
      text(),
    );

    expect(heightOf(long)).toBe(heightOf(short));
    expect(chartTop(long)).toBeGreaterThan(chartTop(short));
  });

  it('gives a legend entry in capitals more room than one in small letters', () => {
    const secondSwatch = (first: string): number => {
      const svg = chartPaperSvg(
        'bar',
        {
          ...data,
          series: [
            { name: first, values: [1, 2] },
            { name: 'b', values: [1, 2] },
          ],
        },
        text(),
      );
      return Number(/<rect class="wb-s1" x="([\d.]+)"/.exec(svg)?.[1]);
    };

    expect(secondSwatch('NACHREICHUNG')).toBeGreaterThan(secondSwatch('nachreichung'));
  });

  it('leaves out the legend for a single series and draws nothing without data', () => {
    const one = chartPaperSvg(
      'hbar',
      { labels: ['offen'], series: [{ name: 'anzahl', values: [3] }], dropped: 0 },
      text(),
    );

    expect(one).not.toContain('>anzahl</text>');
    expect(chartPaperSvg('bar', { labels: [], series: [], dropped: 0 }, text())).toBe('');
  });

  it('escapes the texts around the chart', () => {
    const svg = chartPaperSvg('bar', data, text({ title: '<b>', source: 'a & b' }));

    expect(svg).toContain('>&lt;b&gt;</text>');
    expect(svg).toContain('>a &amp; b</text>');
  });
});
