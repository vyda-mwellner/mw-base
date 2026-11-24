import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { HouseStatus } from '../../../house/state/house-status';
import { Workbench } from '../../../workbench/workbench';
import { DatabaseApi } from '../../data/database-api';
import type { QueryDefinition, QueryParam, SectionResult } from '../../model/database';
import { DataSheet } from './data-sheet';

const WEEKS: QueryParam = { name: 'wochen', kind: 'choice', options: ['5', '10', '20'] };

function query(
  id: string,
  title: string,
  params: QueryParam[],
  chart: QueryDefinition['sections'][number]['chart'] = 'table',
): QueryDefinition {
  return {
    id,
    area: 'Auswertungen',
    title,
    description: null,
    connections: [],
    params,
    sections: [{ title: null, chart, x: null, y: [], series: null, info: null, links: [], sql: 'SELECT 1' }],
  };
}

/** Stands in for the browser's ClipboardItem, which jsdom lacks, and keeps what it was given. */
class FakeClipboardItem {
  constructor(readonly items: Record<string, Promise<Blob>>) {}
}

describe('DataSheet', () => {
  const run = vi.fn(async (): Promise<SectionResult[]> => [
    {
      result: { columns: [{ name: 'n', typeName: 'int4' }], rows: [[1]], truncated: false, durationMs: 3 },
      error: null,
    },
  ]);

  async function open(): Promise<{ root: HTMLElement; workbench: Workbench }> {
    run.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: HouseStatus, useValue: { working: signal<string | null>(null) } },
        {
          provide: DatabaseApi,
          useValue: {
            connections: vi.fn(async () => [
              {
                id: 'local',
                label: 'LOCAL',
                host: 'localhost',
                port: 5432,
                database: 'app',
                user: 'app',
                production: false,
                requiresPassword: false,
                unlockedUntil: null,
              },
            ]),
            queries: vi.fn(async () => [
              query('weekly', 'Wochenübersicht', [WEEKS]),
              query('stock', 'Bestand', [WEEKS]),
              query('batch', 'Batch', [{ name: 'batchId', kind: 'uuid', options: [] }]),
              query('inflow', 'Eingänge', [], 'bar'),
            ]),
            run,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(DataSheet);
    await fixture.whenStable();
    return { root: fixture.nativeElement as HTMLElement, workbench: TestBed.inject(Workbench) };
  }

  const rowOf = (root: HTMLElement, title: string): HTMLButtonElement =>
    [...root.querySelectorAll<HTMLButtonElement>('.gm-row-main')].find(
      (button) => button.querySelector('.gm-label')?.textContent?.trim() === title,
    )!;

  const dialOf = (workbench: Workbench) => {
    const page = workbench.desk();
    return page?.kind === 'report' ? page.dials[0] : undefined;
  };

  it('runs a query with a choice at once, with its first option, and lays a dial for it on the desk', async () => {
    const { root, workbench } = await open();

    rowOf(root, 'Wochenübersicht').click();
    await vi.waitFor(() => expect(dialOf(workbench)).toBeDefined());

    expect(run).toHaveBeenCalledWith('weekly', 'local', { wochen: '5' });
    expect(dialOf(workbench)).toMatchObject({ label: 'Wochen', options: ['5', '10', '20'], value: '5' });
  });

  it('runs the query again when the dial on the desk turns, the dial moving at once', async () => {
    const { root, workbench } = await open();
    rowOf(root, 'Wochenübersicht').click();
    await vi.waitFor(() => expect(dialOf(workbench)).toBeDefined());

    dialOf(workbench)!.pick('10');

    expect(dialOf(workbench)?.value).toBe('10');
    await vi.waitFor(() => expect(run).toHaveBeenCalledWith('weekly', 'local', { wochen: '10' }));
  });

  it('starts another query from the first option again', async () => {
    const { root, workbench } = await open();
    rowOf(root, 'Wochenübersicht').click();
    await vi.waitFor(() => expect(dialOf(workbench)).toBeDefined());
    dialOf(workbench)!.pick('20');
    // the next query only once the result of this one lies on the desk
    await vi.waitFor(() => {
      const page = workbench.desk();
      expect(page?.kind === 'report' && page.body).toContain('wochen 20');
    });

    rowOf(root, 'Bestand').click();

    await vi.waitFor(() => expect(run).toHaveBeenLastCalledWith('stock', 'local', { wochen: '5' }));
  });

  it('opens the field of a query that needs typing right under its row, and runs it from there', async () => {
    const { root } = await open();

    rowOf(root, 'Batch').click();
    await vi.waitFor(() => expect(root.querySelector('.ds-inputs input')).not.toBeNull());

    expect(run).not.toHaveBeenCalled();
    expect(rowOf(root, 'Batch').closest('li')?.nextElementSibling?.classList).toContain('ds-inputs');
    await vi.waitFor(() => expect(document.activeElement).toBe(root.querySelector('.ds-inputs input')));

    const field = root.querySelector<HTMLInputElement>('.ds-inputs input')!;
    field.value = '7fe8cf3b-64b4-408d-bfe1-2cff3db66764';
    field.dispatchEvent(new Event('input'));
    root.querySelector<HTMLButtonElement>('.ds-inputs button[type="submit"]')!.click();

    await vi.waitFor(() =>
      expect(run).toHaveBeenCalledWith('batch', 'local', { batchId: '7fe8cf3b-64b4-408d-bfe1-2cff3db66764' }),
    );
    await vi.waitFor(() => expect(root.querySelector('.ds-inputs')).toBeNull());
  });

  it('copies a chart of the result as a picture from the button under it', async () => {
    const write = vi.fn(async (items: FakeClipboardItem[]) => {
      for (const item of items)
        for (const blob of Object.values(item.items)) await blob.catch(() => undefined);
    });
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true });
    const { root, workbench } = await open();
    run.mockResolvedValueOnce([
      {
        result: {
          columns: [
            { name: 'kanal', typeName: 'text' },
            { name: 'anzahl', typeName: 'int8' },
          ],
          rows: [['EMAIL', 4]],
          truncated: false,
          durationMs: 3,
        },
        error: null,
      },
    ]);

    rowOf(root, 'Eingänge').click();
    await vi.waitFor(() => {
      const page = workbench.desk();
      expect(page?.kind === 'report' && page.body).toContain('data-action="png" data-section="0"');
    });
    const page = workbench.desk();
    if (page?.kind === 'report') page.actions['png']({ section: '0' });

    expect(write).toHaveBeenCalledWith([new FakeClipboardItem({ 'image/png': expect.any(Promise) })]);
    vi.unstubAllGlobals();
  });
});
