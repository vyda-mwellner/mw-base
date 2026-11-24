import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { Workbench, type Dial } from '../../workbench';
import { ReportView } from './report-view';

describe('ReportView', () => {
  async function open(body: string, actions = {}, dials: Dial[] = []) {
    const fixture = TestBed.createComponent(ReportView);
    await TestBed.inject(Workbench).report('Bericht', body, actions, dials);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('hands the click on a report button to the action of its data-action, with its data', async () => {
    const link = vi.fn();
    const root = await open('<button data-action="link" data-param="batchId" data-value="B-1">B-1</button>', {
      link,
    });

    root.querySelector('button')!.click();

    expect(link).toHaveBeenCalledWith(expect.objectContaining({ param: 'batchId', value: 'B-1' }));
  });

  it('copies the text block next to a copy button', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const root = await open(
      '<div><pre>DELETE FROM x;</pre><button data-action="copy">Kopieren</button></div>',
    );

    root.querySelector('button')!.click();

    expect(writeText).toHaveBeenCalledWith('DELETE FROM x;');
  });

  describe('with a dial', () => {
    const weeks = (value: string, pick = vi.fn()): Dial => ({
      label: 'Wochen',
      options: ['5', '10', '20'],
      value,
      pick,
    });
    const press = (key: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key }));

    it('shows its options above the report, the chosen one pressed', async () => {
      const root = await open('<p>Tabelle</p>', {}, [weeks('10')]);

      const buttons = [...root.querySelectorAll<HTMLButtonElement>('.rv-dial button')];
      expect(buttons.map((button) => button.textContent?.trim())).toEqual(['5', '10', '20']);
      expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
        'false',
        'true',
        'false',
      ]);
    });

    it('turns with D and A and stops at both ends', async () => {
      const pick = vi.fn();
      await open('<p>Tabelle</p>', {}, [weeks('10', pick)]);
      press('d');
      press('a');

      expect(pick.mock.calls).toEqual([['20'], ['5']]);

      pick.mockClear();
      await TestBed.inject(Workbench).report('Bericht', '<p>Tabelle</p>', {}, [weeks('20', pick)]);
      press('d');

      expect(pick).not.toHaveBeenCalled();
    });

    it('leaves A and D to a field that is being typed in', async () => {
      const pick = vi.fn();
      const root = await open('<p>Tabelle</p>', {}, [weeks('5', pick)]);
      const field = document.createElement('input');
      root.append(field);
      field.focus();

      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));

      expect(pick).not.toHaveBeenCalled();
    });
  });
});
