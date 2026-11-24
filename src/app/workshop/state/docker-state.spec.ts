import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkshopApi } from '../data/workshop-api';
import type { Container, DockerOverview, LogLine, SetupCommand } from '../model/docker';
import { DockerState } from './docker-state';

const container = (name: string): Container => ({
  id: name,
  name,
  image: 'image',
  state: 'running',
  status: 'Up 2 hours',
  ports: '',
});
const OVERVIEW: DockerOverview = {
  stacks: [
    { name: 'db', defaultStack: true, containers: [container('local-postgres')] },
    { name: 'mail', defaultStack: false, containers: [] },
    { name: 'storage', defaultStack: true, containers: [container('local-minio')] },
  ],
  others: [],
};

describe('DockerState', () => {
  let state: DockerState;
  let runSetup: ReturnType<
    typeof vi.fn<(command: SetupCommand, onLine: (line: LogLine) => void) => Promise<void>>
  >;
  const settle = () => TestBed.inject(ApplicationRef).whenStable();

  beforeEach(async () => {
    runSetup = vi.fn(async (command: SetupCommand, onLine: (line: LogLine) => void) => {
      onLine({ stream: 'command', text: `$ setup ${command.kind} -x ${command.stack}` });
    });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: WorkshopApi,
          useValue: { docker: vi.fn(async () => OVERVIEW), runSetup, health: vi.fn() },
        },
      ],
    });
    state = TestBed.inject(DockerState);
    await settle();
  });

  it('stops stack by stack and leaves out the stacks without containers', async () => {
    await state.stopAll();

    expect(runSetup.mock.calls.map(([command]) => command)).toEqual([
      { kind: 'down', stack: 'db' },
      { kind: 'down', stack: 'storage' },
    ]);
    expect(state.log().map((line) => line.text)).toEqual(['$ setup down -x db', '$ setup down -x storage']);
  });

  it('starts the default stacks one by one', async () => {
    await state.startDefaults();

    expect(runSetup.mock.calls.map(([command]) => command)).toEqual([
      { kind: 'up', stack: 'db' },
      { kind: 'up', stack: 'storage' },
    ]);
  });

  it('ends the run at the first step that fails and keeps its error', async () => {
    runSetup.mockRejectedValueOnce(new Error('setup down -x db fehlgeschlagen'));

    await state.stopAll();

    expect(runSetup).toHaveBeenCalledTimes(1);
    expect(state.runError()).toBe('setup down -x db fehlgeschlagen');
    expect(state.busy()).toBeNull();
  });

  it('refuses a second run while one goes on and keeps the output until it is closed', async () => {
    let finish!: () => void;
    runSetup.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));

    const first = state.change('mail', 'up');
    expect(state.busy()).toEqual({ kind: 'up', stack: 'mail' });
    await state.change('db', 'restart');
    finish();
    await first;

    expect(runSetup).toHaveBeenCalledTimes(1);
    state.closeLog();
    expect(state.log()).toEqual([]);
  });
});
