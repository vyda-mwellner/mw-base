import { describe, expect, it } from 'vitest';

import type { DevServer } from '../model/dev-server';
import type { Stack } from '../model/docker';
import { commandSteps } from './command-steps';

const server = (id: string, phase: DevServer['phase']): DevServer => ({
  id,
  label: id,
  repo: id,
  port: 4500,
  phase,
  startedAt: null,
  error: null,
});
const mail: Stack = {
  name: 'mail',
  defaultStack: false,
  containers: [{ id: '1', name: 'greenmail', image: 'g', state: 'running', status: 'Up', ports: '' }],
};

describe('commandSteps', () => {
  it('lists each step with what of it is already so, and leaves out empty steps', () => {
    const steps = commandSteps(
      { servers: { start: ['shop-gui', 'order-gui'], stop: [] }, stacks: { up: ['mail', 'db'], down: [] } },
      [server('shop-gui', 'off'), server('order-gui', 'running')],
      [mail, { name: 'db', defaultStack: true, containers: [] }],
    );

    expect(steps).toEqual([
      { verb: 'Starten', names: 'shop-gui, order-gui (läuft schon)' },
      { verb: 'Container starten', names: 'mail (läuft schon), db' },
    ]);
  });
});
