import { MOMENT } from '../../core/format';
import { escapeHtml, section, table } from '../../workbench/domain/report-html';
import { ENV_LABELS, ENVS, Release, ReleaseTicket, RepoDeploy, TicketHit, Untracked } from '../model/deploy';
import type { CommitSearch } from '../model/deploy';
import { row, TagCell } from './deploy-cells';

function tagTd(cell: TagCell): string {
  const tone = cell.foreign ? ' data-tone="warning"' : cell.inactive ? ' class="wb-muted"' : '';
  const extra = [
    cell.since,
    cell.next ? `nächster ${cell.next}` : '',
    cell.deviating ?? '',
    cell.inactive ? 'aus' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return `<td${tone}>${escapeHtml(cell.text)}${extra ? `<br><span class="wb-muted">${escapeHtml(extra)}</span>` : ''}</td>`;
}

/** The track plan as a table: per repo the build on every stage and the commits waiting for the next one. */
export function trackReport(deploys: readonly RepoDeploy[], fetchedAt: number | null): string {
  const rows = deploys.map((deploy) => {
    const cells = row(deploy);
    const waiting = (count: { text: string; pending: boolean }) =>
      `<td class="wb-num"${count.pending ? ' data-tone="info"' : ''}>${escapeHtml(count.text)}</td>`;
    return (
      `<tr><th scope="row">${escapeHtml(cells.name)}<br><span class="wb-muted">${escapeHtml(cells.kindLabel)}</span></th>` +
      cells.envs.map(tagTd).join('') +
      waiting(cells.toTest) +
      waiting(cells.toProd) +
      '</tr>'
    );
  });
  const stand = fetchedAt === null ? 'nie geholt' : `zuletzt geholt ${MOMENT.format(fetchedAt)}`;
  return [
    '<h1>Gleisplan</h1>',
    `<p class="wb-muted">Laut gitops, Stand der lokalen Checkouts: ${escapeHtml(stand)}</p>`,
    section('Builds', table(['Repo', 'DEV', 'TEST', 'PROD', 'nach TEST', 'nach PROD'], rows)),
  ].join('\n');
}

export const subjectLine = (commit: Untracked): string =>
  commit.count > 1 ? `${commit.subject} (${commit.count}x)` : commit.subject;

function releaseBlocks(
  release: Release,
  keyOf: (ticket: ReleaseTicket) => string,
  escape: (text: string) => string,
): string[][] {
  const blocks: string[][] = [];
  if (release.tickets.length > 0)
    blocks.push(
      release.tickets.map(
        (ticket) => `${keyOf(ticket)} ${escape(`${ticket.summary} (${ticket.repos.join(', ')})`)}`,
      ),
    );
  if (release.untracked.length > 0)
    blocks.push([
      'Ohne Ticket:',
      ...release.untracked.map((commit) => escape(`${commit.repo}: ${subjectLine(commit)}`)),
    ]);
  return blocks;
}

/** Plain lines for a mail or a chat, one per ticket, the commits without a ticket after a blank line. */
export function releaseText(release: Release): string {
  return releaseBlocks(
    release,
    (ticket) => ticket.key,
    (text) => text,
  )
    .map((lines) => lines.join('\n'))
    .join('\n\n');
}

/** The same lines for Teams or Outlook, which paste the html: only the ticket key is a link. */
export function releaseHtml(release: Release): string {
  return releaseBlocks(
    release,
    (ticket) => `<a href="${escapeHtml(ticket.url)}">${escapeHtml(ticket.key)}</a>`,
    escapeHtml,
  )
    .map((lines) => `<p>${lines.join('<br>')}</p>`)
    .join('');
}

function coverage(count: number, total: number): string {
  if (count >= total) return '<td data-tone="info">alle</td>';
  if (count === 0) return '<td class="wb-muted">-</td>';
  return `<td data-tone="warning">${count}/${total}</td>`;
}

/** The furthest stage the ticket got to, and whether every commit of every repo got there. */
export function reachOf(ticket: TicketHit): string {
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const total = sum(ticket.repos.map((repo) => repo.commits));
  for (const env of [...ENVS].reverse()) {
    const on = sum(ticket.repos.map((repo) => repo.on[env]));
    if (on > 0) return `${on < total ? 'teilweise' : 'komplett'} auf ${ENV_LABELS[env]}`;
  }
  return 'auf keiner Umgebung';
}

/** What the commit search found: the tickets whose key matched, with every commit, then the single commits. */
export function searchReport(term: string, search: CommitSearch): string {
  const tickets = search.tickets.flatMap((ticket) =>
    ticket.repos.map(
      (repo, index) =>
        `<tr>${index === 0 ? `<th scope="row" rowspan="${ticket.repos.length}">${escapeHtml(ticket.key)}<br><span class="wb-muted">${escapeHtml(ticket.summary)}</span><br>${escapeHtml(reachOf(ticket))}</th>` : ''}` +
        `<td>${escapeHtml(repo.repo)}</td><td class="wb-num">${repo.commits}</td>` +
        ENVS.map((env) => coverage(repo.on[env], repo.commits)).join('') +
        '</tr>',
    ),
  );
  const hits = search.hits.map(
    (hit) =>
      `<tr><td class="wb-num">${escapeHtml(MOMENT.format(hit.date))}</td><td>${escapeHtml(hit.repo)}<br><span class="wb-muted">${escapeHtml(hit.shortSha)}</span></td>` +
      `<td>${escapeHtml(hit.subject)}<br><span class="wb-muted">${escapeHtml(hit.author)}</span></td>` +
      ENVS.map((env) =>
        hit.on.includes(env) ? '<td data-tone="info">ja</td>' : '<td class="wb-muted">-</td>',
      ).join('') +
      '</tr>',
  );
  return [
    `<h1>Commits zu ${escapeHtml(term)}</h1>`,
    `<p class="wb-muted">${search.hits.length} Commits, ${search.tickets.length} Tickets</p>`,
    tickets.length > 0
      ? section('Tickets', table(['Ticket', 'Repo', 'Commits', 'DEV', 'TEST', 'PROD'], tickets))
      : '',
    hits.length > 0
      ? section('Commits', table(['Datum', 'Repo', 'Commit', 'DEV', 'TEST', 'PROD'], hits))
      : '<p class="wb-muted">Kein Commit gefunden.</p>',
  ].join('\n');
}
