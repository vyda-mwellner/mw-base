import type { Release, RepoDeploy, TicketHit } from '../model/deploy';
import { reachOf, releaseHtml, releaseText, searchReport, trackReport } from './deploy-reports';

const release: Release = {
  from: 'test',
  to: 'prod',
  tickets: [
    {
      key: 'SHOP-12',
      url: 'https://jira.example/browse/SHOP-12',
      summary: 'Batch <neu>',
      repos: ['orders-api', 'admin'],
      authors: ['Michael'],
    },
  ],
  untracked: [{ repo: 'shop-gui', shortSha: 'abc1234', subject: 'Typo', count: 2 }],
};

describe('release list', () => {
  it('writes a line per ticket and the commits without a ticket after a blank line', () => {
    expect(releaseText(release)).toBe(
      'SHOP-12 Batch <neu> (orders-api, admin)\n\nOhne Ticket:\nshop-gui: Typo (2x)',
    );
  });

  it('links only the ticket key in the html and escapes the rest', () => {
    expect(releaseHtml(release)).toBe(
      '<p><a href="https://jira.example/browse/SHOP-12">SHOP-12</a> Batch &lt;neu&gt; (orders-api, admin)</p>' +
        '<p>Ohne Ticket:<br>shop-gui: Typo (2x)</p>',
    );
  });
});

describe('trackReport', () => {
  const deploy: RepoDeploy = {
    name: 'orders-api',
    group: 'neu',
    kind: 'backend',
    units: ['orders-api'],
    envs: [
      { env: 'dev', tag: 'build-dev-566', since: null, active: true, nextTag: null, deviations: [] },
      { env: 'test', tag: 'build-test-560', since: null, active: true, nextTag: null, deviations: [] },
      { env: 'prod', tag: 'build-test-530', since: null, active: true, nextTag: null, deviations: [] },
    ],
    waitingForTest: 3,
    waitingForProd: 0,
    github: null,
  };

  it('shows the build number per stage, a build of another branch whole and marked', () => {
    const html = trackReport([deploy], null);

    expect(html).toContain('<td>566</td>');
    expect(html).toContain('<td data-tone="warning">build-test-530</td>');
    expect(html).toContain('<td class="wb-num" data-tone="info">3</td>');
    expect(html).toContain('nie geholt');
  });
});

describe('commit search', () => {
  const ticket: TicketHit = {
    key: 'SHOP-12',
    url: 'https://jira.example/browse/SHOP-12',
    summary: 'Batch',
    repos: [
      { repo: 'orders-api', commits: 2, on: { dev: 2, test: 2, prod: 1 } },
      { repo: 'admin', commits: 1, on: { dev: 1, test: 0, prod: 0 } },
    ],
  };

  it('names the furthest stage a ticket reached and whether all of it got there', () => {
    expect(reachOf(ticket)).toBe('teilweise auf PROD');
    expect(reachOf({ ...ticket, repos: [{ repo: 'x', commits: 1, on: { dev: 1, test: 1, prod: 1 } }] })).toBe(
      'komplett auf PROD',
    );
    expect(reachOf({ ...ticket, repos: [{ repo: 'x', commits: 1, on: { dev: 0, test: 0, prod: 0 } }] })).toBe(
      'auf keiner Umgebung',
    );
  });

  it('lists tickets with their coverage per stage and the single commits', () => {
    const html = searchReport('SHOP-12', {
      tickets: [ticket],
      hits: [
        {
          repo: 'orders-api',
          sha: 'abcdef0',
          shortSha: 'abcdef0',
          subject: 'SHOP-12 Batch',
          author: 'Michael',
          date: 0,
          on: ['dev'],
          tickets: [],
        },
      ],
    });

    expect(html).toContain('<td data-tone="warning">1/2</td>');
    expect(html).toContain('rowspan="2"');
    expect(html).toContain('SHOP-12 Batch');
  });
});
