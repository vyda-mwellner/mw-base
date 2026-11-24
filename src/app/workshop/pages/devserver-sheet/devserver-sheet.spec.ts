import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Store } from '../../../ui/store';
import { WorkshopApi } from '../../data/workshop-api';
import type { DevServer } from '../../model/dev-server';
import { DevserverSheet } from './devserver-sheet';

const server = (id: string, phase: DevServer['phase']): DevServer => ({
  id,
  label: id,
  repo: id,
  port: 4500,
  phase,
  startedAt: null,
  error: null,
});

describe('DevserverSheet', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    api = {
      devServers: vi.fn(async () => [server('shop-gui', 'off'), server('order-gui', 'running')]),
      health: vi.fn(async () => []),
      startDevServer: vi.fn(async () => undefined),
      stopDevServer: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkshopApi, useValue: api },
        { provide: Store, useValue: { read: vi.fn(async () => null), write: vi.fn() } },
      ],
    });
  });

  async function open() {
    const fixture = TestBed.createComponent(DevserverSheet);
    await fixture.whenStable();
    return {
      root: fixture.nativeElement as HTMLElement,
      settle: () => TestBed.inject(ApplicationRef).whenStable(),
    };
  }

  it('starts an off frontend on Enter and stops a running one on X', async () => {
    const { root, settle } = await open();
    const [shop, order] = Array.from(root.querySelectorAll<HTMLElement>('.gm-rows .gm-row'));

    shop.querySelector<HTMLButtonElement>('.gm-row-main')!.click();
    await settle();
    order.querySelector<HTMLButtonElement>('[data-row-key="x"]')!.click();
    await settle();

    expect(api['startDevServer']).toHaveBeenCalledWith('shop-gui');
    expect(api['stopDevServer']).toHaveBeenCalledWith('order-gui');
    expect(shop.querySelector('[data-row-key="x"]')).toBeNull();
  });
});
