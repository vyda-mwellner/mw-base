import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Store } from '../../ui/store';
import { WorkshopApi } from '../data/workshop-api';
import type { DevServer } from '../model/dev-server';
import { DevServerState } from './dev-server-state';

const server = (id: string, phase: DevServer['phase']): DevServer => ({
  id,
  label: id,
  repo: id,
  port: 4500,
  phase,
  startedAt: null,
  error: null,
});

describe('DevServerState', () => {
  let state: DevServerState;
  let api: {
    devServers: ReturnType<typeof vi.fn>;
    startDevServer: ReturnType<typeof vi.fn>;
    stopDevServer: ReturnType<typeof vi.fn>;
  };
  let written: unknown;

  beforeEach(async () => {
    api = {
      devServers: vi.fn(async () => [server('a', 'off'), server('b', 'running'), server('c', 'external')]),
      startDevServer: vi.fn(async () => undefined),
      stopDevServer: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkshopApi, useValue: api },
        {
          provide: Store,
          useValue: {
            read: vi.fn(async () => ['a']),
            write: vi.fn(async (_: string, value: unknown) => (written = value)),
          },
        },
      ],
    });
    state = TestBed.inject(DevServerState);
    await TestBed.inject(ApplicationRef).whenStable();
  });

  it('starts only what is off and stops only what the shell runs', async () => {
    await state.apply({ start: ['a', 'b'], stop: ['b', 'c'] });

    expect(api.startDevServer.mock.calls).toEqual([['a']]);
    expect(api.stopDevServer.mock.calls).toEqual([['b']]);
  });

  it('starts the others even when one fails, and names the one that failed', async () => {
    api.startDevServer.mockRejectedValueOnce(new Error('a: Port 4500 ist schon belegt'));

    await expect(state.apply({ start: ['a'], stop: ['b'] })).rejects.toThrow('a: Port 4500 ist schon belegt');
    expect(api.stopDevServer).toHaveBeenCalledWith('b');
    expect(state.pending().size).toBe(0);
  });

  it('keeps the favorites in the data folder', async () => {
    expect(state.favorites()).toEqual(['a']);

    await state.toggleFavorite('b');
    expect(written).toEqual(['a', 'b']);
    await state.toggleFavorite('a');
    expect(state.favorites()).toEqual(['b']);
  });
});
