import { CLOCK } from '../../core/format';
import type { Note, Tone } from '../../engine/model';
import { escapeHtml } from '../../workbench/domain/report-html';
import { DevServer, STARTABLE, STOPPABLE } from '../model/dev-server';
import type { LedTone } from './stack-rows';

/** A frontend as a row of the dev server sheet. */
export interface ServerRow {
  readonly id: string;
  readonly label: string;
  readonly tone: LedTone;
  readonly note: string;
  readonly noteTone: Tone | null;
  readonly port: number;
  readonly favorite: boolean;
  readonly startable: boolean;
  readonly stoppable: boolean;
  /** Its port answers: Enter opens it in the browser. */
  readonly open: boolean;
}

const isUp = (server: DevServer): boolean => server.phase === 'running' || server.phase === 'external';

export function serverRow(server: DevServer, favorite: boolean, pending: boolean): ServerRow {
  const address = `localhost:${server.port}`;
  const base = {
    id: server.id,
    label: server.label,
    port: server.port,
    favorite,
    startable: STARTABLE.includes(server.phase),
    stoppable: STOPPABLE.includes(server.phase),
    open: isUp(server),
  };
  if (pending) return { ...base, tone: 'busy', note: 'wird geschaltet ...', noteTone: null };
  switch (server.phase) {
    case 'starting':
      return { ...base, tone: 'busy', note: `baut ... · ${address}`, noteTone: null };
    case 'running': {
      const since = server.startedAt === null ? '' : ` seit ${CLOCK.format(server.startedAt)}`;
      return { ...base, tone: 'ok', note: `läuft${since} · ${address}`, noteTone: null };
    }
    case 'external':
      return {
        ...base,
        tone: 'info',
        note: `läuft außerhalb, etwa im Terminal · ${address}`,
        noteTone: null,
      };
    case 'ended':
      return { ...base, tone: 'danger', note: server.error ?? 'beendet', noteTone: 'danger' };
    case 'off':
      return { ...base, tone: null, note: address, noteTone: null };
  }
}

/** What the breaker cabinet in the workshop shows: a lever per frontend, up while it answers or builds. */
interface ServerView {
  readonly servers: boolean[];
  readonly note: Note;
}

export function serverView(servers: readonly DevServer[] | null, error: string | null): ServerView {
  if (error !== null) return { servers: [], note: { text: error, tone: null } };
  if (servers === null) return { servers: [], note: { text: 'Wird gelesen', tone: null } };
  const ended = servers.find((server) => server.phase === 'ended');
  const up = servers.filter((server) => isUp(server) || server.phase === 'starting');
  return {
    servers: servers.map((server) => isUp(server) || server.phase === 'starting'),
    note: ended
      ? { text: `${ended.label} beendet: ${ended.error ?? 'ohne Meldung'}`, tone: 'warning' }
      : {
          text:
            up.length === 0
              ? 'Kein Dev-Server läuft'
              : `Läuft: ${up.map((server) => server.label).join(', ')}`,
          tone: null,
        },
  };
}

/** The output of a server for the workbench. */
export function serverLogReport(label: string, lines: readonly string[]): string {
  const body =
    lines.length === 0
      ? '<p class="wb-muted">Keine Ausgabe. Nur ein Server, den Base selbst gestartet hat, hat eine.</p>'
      : `<pre class="wb-log">${lines.map((line) => escapeHtml(line)).join('\n')}</pre>`;
  return `<h1>Ausgabe ${escapeHtml(label)}</h1>\n<p class="wb-muted">Die letzten ${lines.length} Zeilen</p>\n${body}`;
}
