import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Store } from '../../../ui/store';
import { WorkshopApi } from '../../data/workshop-api';
import type { DevServer } from '../../model/dev-server';
import { CommandSheet } from './command-sheet';

const server = (id: string): DevServer => ({
  id,
  label: id,
  repo: id,
  port: 4500,
  phase: 'off',
  startedAt: null,
  error: null,
});

describe('CommandSheet', () => {
  let startDevServer: ReturnType<typeof vi.fn>;
  let runSetup: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    startDevServer = vi.fn(async () => undefined);
    runSetup = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: { read: vi.fn(async () => null), write: vi.fn() } },
        {
          provide: WorkshopApi,
          useValue: {
            devServers: vi.fn(async () => [server('shop-gui'), server('order-gui')]),
            docker: vi.fn(async () => ({
              stacks: [{ name: 'mail', defaultStack: false, containers: [] }],
              others: [],
            })),
            startDevServer,
            stopDevServer: vi.fn(),
            runSetup,
          },
        },
      ],
    });
  });

  it('shows what a dictated command would do and does it on Enter', async () => {
    const fixture = TestBed.createComponent(CommandSheet);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const settle = () => TestBed.inject(ApplicationRef).whenStable();

    const field = root.querySelector('input')!;
    field.value = 'Starte bitte shopgui und den Mail Container';
    field.dispatchEvent(new Event('input'));
    await settle();
    const steps = Array.from(root.querySelectorAll('.gm-rows .gm-row'), (row) => [
      row.querySelector('.gm-label')?.textContent?.trim(),
      row.querySelector('.gm-note')?.textContent?.trim(),
    ]);
    expect(steps).toEqual([
      ['Starten', 'shop-gui'],
      ['Container starten', 'mail'],
    ]);

    root.querySelector('form')!.requestSubmit();
    await settle();
    expect(startDevServer).toHaveBeenCalledWith('shop-gui');
    expect(runSetup).toHaveBeenCalledWith({ kind: 'up', stack: 'mail' }, expect.any(Function));
  });
});
