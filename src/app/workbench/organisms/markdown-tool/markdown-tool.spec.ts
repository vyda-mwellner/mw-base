import { TestBed } from '@angular/core/testing';

import { isArmed } from '../../../ui/key-walk/key-walk';
import { MarkdownTool } from './markdown-tool';

describe('MarkdownTool', () => {
  it('shows the figures of the pasted text as tiles, the tasks only when there are some', async () => {
    const fixture = TestBed.createComponent(MarkdownTool);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector('textarea')!;

    input.value = '## Plan\n\nZwei Wörter.\n\n- [x] fertig\n- [ ] offen\n';
    input.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste' }));
    await fixture.whenStable();

    const tiles = Array.from(root.querySelectorAll('.gm-stat')).map((tile) => [
      tile.querySelector('dt')?.textContent?.trim(),
      tile.querySelector('dd')?.textContent?.trim(),
    ]);
    expect(tiles).toEqual([
      ['Zeilen', '6'],
      ['Abschnitte', '1'],
      ['Wörter', '5'],
      ['Lesezeit', '1 Min'],
      ['Aufgaben erledigt', '1 / 2'],
    ]);
  });

  it('lets the preview wait while typing goes on, and shows it once typing pauses', async () => {
    const fixture = TestBed.createComponent(MarkdownTool);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector('textarea')!;

    input.value = '# Titel';
    input.dispatchEvent(new InputEvent('input', { inputType: 'insertText' }));
    await fixture.whenStable();
    expect(root.querySelector('.wb-prose')).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 200));
    await fixture.whenStable();
    expect(root.querySelector('.wb-prose h1')?.textContent).toBe('Titel');
  });

  it('takes Q from anywhere on the desk back into the field, its text selected for a paste over it', async () => {
    const fixture = TestBed.createComponent(MarkdownTool);
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector('textarea')!;
    input.value = '# Alt';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    input.blur();

    const key = new KeyboardEvent('keydown', { key: 'q', cancelable: true });
    document.dispatchEvent(key);

    expect(key.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(isArmed(input)).toBe(true);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 5]);
  });

  it('leaves a Q typed into a field to the field', async () => {
    const fixture = TestBed.createComponent(MarkdownTool);
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector('textarea')!;
    input.focus();

    const key = new KeyboardEvent('keydown', { key: 'q', cancelable: true });
    document.dispatchEvent(key);

    expect(key.defaultPrevented).toBe(false);
  });
});
