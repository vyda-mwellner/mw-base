import { describe, expect, it } from 'vitest';

import type { DevServer } from '../model/dev-server';
import { serverLogReport, serverRow, serverView } from './server-rows';

const server = (overrides: Partial<DevServer> = {}): DevServer => ({
  id: 'shop-gui',
  label: 'shop-gui',
  repo: 'shop-gui',
  port: 4500,
  phase: 'off',
  startedAt: null,
  error: null,
  ...overrides,
});

describe('serverRow', () => {
  it('lets an off server start and a running one open, stopping only what the shell started', () => {
    expect(serverRow(server(), false, false)).toMatchObject({
      tone: null,
      note: 'localhost:4500',
      startable: true,
      stoppable: false,
      open: false,
    });
    expect(
      serverRow(
        server({ phase: 'running', startedAt: new Date(2026, 10, 23, 9, 15).getTime() }),
        false,
        false,
      ),
    ).toMatchObject({ tone: 'ok', note: 'läuft seit 09:15 · localhost:4500', stoppable: true, open: true });
    expect(serverRow(server({ phase: 'external' }), false, false)).toMatchObject({
      stoppable: false,
      open: true,
    });
  });

  it('shows a server that ended on its own with its last line', () => {
    expect(
      serverRow(server({ phase: 'ended', error: 'Port 4500 is already in use' }), false, false),
    ).toMatchObject({
      tone: 'danger',
      note: 'Port 4500 is already in use',
      startable: true,
    });
  });

  it('blinks while a start or stop is on its way', () => {
    expect(serverRow(server(), true, true)).toMatchObject({ tone: 'busy', favorite: true });
  });
});

describe('serverView', () => {
  it('raises a lever per server that answers or builds, and names them', () => {
    const view = serverView(
      [
        server(),
        server({ id: 'b', label: 'order-gui', phase: 'starting' }),
        server({ id: 'c', label: 'x', phase: 'external' }),
      ],
      null,
    );

    expect(view.servers).toEqual([false, true, true]);
    expect(view.note).toEqual({ text: 'Läuft: order-gui, x', tone: null });
  });

  it('warns about a server that ended on its own', () => {
    expect(serverView([server({ phase: 'ended', error: 'exit 1' })], null).note).toEqual({
      text: 'shop-gui beendet: exit 1',
      tone: 'warning',
    });
  });
});

describe('serverLogReport', () => {
  it('escapes the output and says why there is none', () => {
    expect(serverLogReport('shop-gui', ['<b>ready</b>'])).toContain('&lt;b&gt;ready&lt;/b&gt;');
    expect(serverLogReport('shop-gui', [])).toContain('Keine Ausgabe');
  });
});
