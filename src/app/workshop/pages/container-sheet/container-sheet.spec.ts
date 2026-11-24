import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkshopApi } from '../../data/workshop-api';
import type { DockerOverview } from '../../model/docker';
import { ContainerSheet } from './container-sheet';

const OVERVIEW: DockerOverview = {
  stacks: [
    {
      name: 'db',
      defaultStack: true,
      containers: [
        { id: '1', name: 'local-postgres', image: 'postgres', state: 'running', status: 'Up', ports: '' },
      ],
    },
    { name: 'mail', defaultStack: false, containers: [] },
  ],
  others: [],
};

describe('ContainerSheet', () => {
  let runSetup: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    runSetup = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: WorkshopApi,
          useValue: { docker: vi.fn(async () => OVERVIEW), health: vi.fn(async () => []), runSetup },
        },
      ],
    });
  });

  async function open() {
    const fixture = TestBed.createComponent(ContainerSheet);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const settle = () => TestBed.inject(ApplicationRef).whenStable();
    return { root, settle };
  }

  it('shows the stacks with what of them runs, and a stop key only on a running one', async () => {
    const { root } = await open();

    const rows = Array.from(root.querySelectorAll('.gm-rows .gm-row'));
    expect(rows.map((row) => row.querySelector('.gm-label')?.textContent?.trim())).toEqual(['db', 'mail']);
    expect(rows.map((row) => row.querySelector('.gm-note')?.textContent?.trim())).toEqual([
      'läuft',
      'nicht gestartet',
    ]);
    expect(rows.map((row) => row.querySelector('[data-row-key="x"]') !== null)).toEqual([true, false]);
  });

  it('stops a stack only on the second X and warns about its data after the first', async () => {
    const { root, settle } = await open();
    const stop = root.querySelector<HTMLButtonElement>('[data-row-key="x"]')!;

    stop.click();
    await settle();
    expect(runSetup).not.toHaveBeenCalled();
    expect(root.querySelector('.gm-note')?.textContent).toContain(
      'Nochmal X: stoppt db, seine Daten sind weg',
    );

    stop.click();
    await settle();
    expect(runSetup).toHaveBeenCalledWith({ kind: 'down', stack: 'db' }, expect.any(Function));
  });

  it('starts a stopped stack and starts a running one anew on Enter', async () => {
    const { root, settle } = await open();
    const [db, mail] = Array.from(root.querySelectorAll<HTMLButtonElement>('.gm-row-main'));

    mail.click();
    await settle();
    db.click();
    await settle();

    expect(runSetup.mock.calls.map(([command]) => command)).toEqual([
      { kind: 'up', stack: 'mail' },
      { kind: 'restart', stack: 'db' },
    ]);
  });
});
