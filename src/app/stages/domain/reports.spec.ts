import type { LogReport } from '../model/cluster';
import type { QueryDefinition, SectionResult } from '../model/database';
import { chartPicture, logsReport, type PictureRun, queryReport } from './reports';

const AT = new Date(2026, 10, 22, 9, 30).getTime();

describe('logsReport', () => {
  const report: LogReport = {
    entries: 2,
    errors: 1,
    warnings: 0,
    from: AT,
    to: AT,
    pods: ['orders-api-7d9-abcde'],
    problems: [
      {
        level: 'error',
        exception: 'java.lang.IllegalStateException',
        cause: 'Kein <Batch>',
        frame: 'com.example.batch.BatchService.load',
        logger: null,
        message: 'Kein <Batch>',
        trace: ['at com.example.batch.BatchService.load'],
        count: 3,
        first: AT,
        last: AT,
        pods: ['orders-api-7d9-abcde'],
      },
    ],
    recent: [
      { at: AT, pod: 'orders-api-7d9-abcde', level: 'info', logger: null, message: 'Started', trace: [] },
    ],
    timeline: [],
    cutTo: null,
  };

  it('lists the problems with their cause and the newest entries, escaped', () => {
    const html = logsReport('orders-api', 'PROD', report);

    expect(html).toContain('<h1>orders-api auf PROD</h1>');
    expect(html).toContain('java.lang.IllegalStateException');
    expect(html).toContain('Kein &lt;Batch&gt;');
    expect(html).not.toContain('<Batch>');
    expect(html).toContain('data-tone="danger"');
    expect(html).toContain('abcde');
  });

  it('says so when the time asked for had no problems', () => {
    expect(logsReport('orders-api', 'DEV', { ...report, problems: [] })).toContain(
      'Keine Fehler und Warnungen',
    );
  });
});

describe('queryReport', () => {
  const query: QueryDefinition = {
    id: 'q',
    area: 'CT',
    title: 'Batches',
    description: null,
    connections: [],
    params: [],
    sections: [
      { title: 'Offen', chart: 'table', x: null, y: [], series: null, info: null, links: [], sql: '' },
      { title: 'Kaputt', chart: 'table', x: null, y: [], series: null, info: null, links: [], sql: '' },
    ],
  };
  const results: SectionResult[] = [
    {
      result: {
        columns: [
          { name: 'batch', typeName: 'text' },
          { name: 'anzahl', typeName: 'int8' },
        ],
        rows: [
          ['B-1', 1234],
          ['B-2', null],
        ],
        truncated: false,
        durationMs: 12,
      },
      error: null,
    },
    { result: null, error: 'relation "ct.batch" does not exist' },
  ];

  it('makes a table of every section and keeps the error of one that failed', () => {
    const html = queryReport(query, 'DEV', results, AT, { wochen: '4' });

    expect(html).toContain('<h1>Batches</h1>');
    expect(html).toContain('wochen 4');
    expect(html).toContain('<td class="wb-num">1.234</td>');
    expect(html).toContain('<td class="wb-muted wb-num">-</td>');
    expect(html).toContain('relation &quot;ct.batch&quot; does not exist');
  });

  const one = (
    chart: QueryDefinition['sections'][number]['chart'],
    extra: Partial<QueryDefinition['sections'][number]> = {},
  ) => ({
    ...query,
    sections: [{ ...query.sections[0], chart, ...extra }],
  });

  it('draws a chart above a folded table and says how to read it', () => {
    const html = queryReport(one('bar', { info: 'Pro Batch.' }), 'DEV', results, AT, {});

    expect(html).toContain('<p>Pro Batch.</p>');
    expect(html).toContain('<figure class="wb-chart"');
    expect(html).toContain('<details class="wb-details"><summary>Tabelle</summary>');
  });

  it('offers every drawn chart as a picture, by the index of its section, and nothing else', () => {
    expect(queryReport(one('bar'), 'DEV', results, AT, {})).toContain('data-action="png" data-section="0"');
    expect(queryReport(one('table'), 'DEV', results, AT, {})).not.toContain('data-action="png"');
    expect(queryReport(one('stat'), 'DEV', results, AT, {})).not.toContain('data-action="png"');
  });
  it('hands out the first column of a text section as a block to copy', () => {
    const html = queryReport(one('text'), 'DEV', results, AT, {});

    expect(html).toContain('<pre class="wb-log">B-1\nB-2</pre>');
    expect(html).toContain('data-action="copy"');
    expect(html).not.toContain('<table');
  });

  it('shows one big number for a stat and the first row as a list for a record', () => {
    expect(queryReport(one('stat'), 'DEV', results, AT, {})).toContain(
      '<span class="wb-stat-value">1.234</span>',
    );
    expect(queryReport(one('record'), 'DEV', results, AT, {})).toContain('<dt>batch</dt><dd>B-1</dd>');
  });

  it('makes a linked cell open the query of its param, and leaves it plain without one', () => {
    const linked = one('table', { links: [{ column: 'batch', param: 'batchId' }] });

    expect(queryReport(linked, 'DEV', results, AT, {}, { batchId: 'Batch-Details' })).toContain(
      '<button type="button" class="wb-link" data-action="link" data-param="batchId" data-value="B-1" title="Öffnet Batch-Details">B-1</button>',
    );
    expect(queryReport(linked, 'DEV', results, AT, {}, {})).toContain('<td>B-1</td>');
  });
});

describe('chartPicture', () => {
  const query: QueryDefinition = {
    id: 'q',
    area: 'CT',
    title: 'Batches',
    description: null,
    connections: [],
    params: [],
    sections: [
      { title: 'Offen', chart: 'hbar', x: null, y: [], series: null, info: null, links: [], sql: '' },
      { title: null, chart: 'line', x: null, y: [], series: null, info: null, links: [], sql: '' },
      { title: null, chart: 'table', x: null, y: [], series: null, info: null, links: [], sql: '' },
    ],
  };
  const result = {
    columns: [
      { name: 'batch', typeName: 'text' },
      { name: 'anzahl', typeName: 'int8' },
    ],
    rows: [['B-1', 3]],
    truncated: false,
    durationMs: 1,
  };
  const ok: SectionResult = { result, error: null };
  const run = (over: Partial<PictureRun> = {}): PictureRun => ({
    results: [ok, ok, ok],
    connection: 'PROD',
    ranAt: AT,
    params: {},
    brand: { name: 'ACME', colors: [], logo: '' },
    ...over,
  });

  it('titles the picture by its section, under it the query and its params, at its foot where and when', () => {
    const svg = chartPicture(query, 0, run({ params: { wochen: '4', leer: ' ' } }));

    expect(svg).toContain('>Offen</text>');
    expect(svg).toContain('>Batches · wochen 4</text>');
    expect(svg).toMatch(/>PROD · Stand [^<]+<\/text>/);
    expect(svg).toContain('>ACME</text>');
  });

  it('names the query only once when the section has no title of its own', () => {
    const svg = chartPicture(query, 1, run());

    expect(svg).toContain('>Batches</text>');
    expect(svg).not.toContain('>Batches ·');
  });

  it('has none for a table, a failed section or one that is not there', () => {
    expect(chartPicture(query, 2, run())).toBeNull();
    expect(chartPicture(query, 0, run({ results: [{ result: null, error: 'kaputt' }] }))).toBeNull();
    expect(chartPicture(query, 7, run())).toBeNull();
  });
});
