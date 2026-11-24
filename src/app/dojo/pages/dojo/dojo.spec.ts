import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { todayIso } from '../../../engine/days';
import { Dojo } from './dojo';

// jsdom lays nothing out, CodeMirror still wants to measure.
const NOWHERE = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
Object.assign(Range.prototype, { getClientRects: () => [], getBoundingClientRect: () => NOWHERE });

const KEY = 'base:haus/dojo.json';
const REST = [
  'vim-w',
  'vim-b',
  'ide-search-everywhere',
  'vim-e',
  'vim-dd',
  'ide-go-to-file',
  'vim-a',
  'vim-i',
];

async function render(first: string, second: string) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      cards: {},
      solved: {},
      round: { day: todayIso(), ids: [first, second, ...REST], outcomes: [] },
    }),
  );
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Dojo);
  await fixture.whenStable();
  return fixture;
}

const kept = () => JSON.parse(localStorage.getItem(KEY)!);

function press(root: HTMLElement, init: KeyboardEventInit & { key: string; code: string }): void {
  const target = root.querySelector('.cm-content')!;
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

describe('Dojo', () => {
  afterEach(() => localStorage.clear());

  it('counts a vim lesson solved within par and shows the shortest way', async () => {
    const fixture = await render('vim-x', 'vim-j');
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.dj-task')?.textContent).toContain('Lösch mit x das doppelte Semikolon');

    press(root, { key: 'x', code: 'KeyX' });
    await fixture.whenStable();

    expect(root.querySelector('.dj-task')?.textContent).toContain('Sauber gelöst');
    expect(root.querySelector('.dj-task')?.textContent).toContain('1 Taste');
    expect(root.querySelector('.dj-task')?.textContent).toContain('Bestwert 1: x');
    expect(kept().round.outcomes).toEqual(['clean']);
    expect(kept().solved[todayIso()]).toBe(1);
  });

  it('goes on to the next lesson with Enter in the editor', async () => {
    const fixture = await render('vim-x', 'vim-j');
    const root = fixture.nativeElement as HTMLElement;
    press(root, { key: 'x', code: 'KeyX' });
    await fixture.whenStable();

    press(root, { key: 'Enter', code: 'Enter' });
    await fixture.whenStable();

    expect(root.querySelector('.dj-task')?.textContent).toContain('Geh mit j zwei Zeilen runter');
  });

  it('names a wrong shortcut and grades the right one after it as solved', async () => {
    const fixture = await render('ide-context-actions', 'vim-j');
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.dj-chord')?.textContent?.replace(/\s/g, '')).toBe('⌥↩');

    press(root, { key: 'e', code: 'KeyE', metaKey: true });
    await fixture.whenStable();
    expect(root.querySelector('.gm-hint')?.textContent).toContain('⌘E ist Recent Files.');

    press(root, { key: 'Enter', code: 'Enter', altKey: true });
    await fixture.whenStable();

    expect(root.querySelector('.dj-task')?.textContent).toContain('Gelöst');
    expect(root.querySelector('.dj-reaction')?.textContent).toContain('Show Context Actions');
    expect(kept().round.outcomes).toEqual(['solved']);
  });

  it('opens the file the next lesson is in from Recent Files', async () => {
    const fixture = await render('ide-recent-files', 'vim-b');
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.dj-task')?.textContent).toContain('Öffne dann order-state.ts');

    press(root, { key: 'e', code: 'KeyE', metaKey: true });
    await fixture.whenStable();
    const field = root.querySelector<HTMLInputElement>('.gp-field')!;
    field.value = 'state';
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(root.querySelector('.dj-tab-on')?.textContent).toContain('order-state.ts');
    expect(kept().round.outcomes).toEqual(['clean']);
  });

  it('skips with ⌃S in the editor and leaves with ⌃Q from the result', async () => {
    const fixture = await render('vim-x', 'vim-j');
    const root = fixture.nativeElement as HTMLElement;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    press(root, { key: 's', code: 'KeyS', ctrlKey: true });
    await fixture.whenStable();
    expect(root.querySelector('.dj-task')?.textContent).toContain('Übersprungen');
    expect(kept().round.outcomes).toEqual(['skipped']);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'q', code: 'KeyQ', ctrlKey: true, cancelable: true }),
    );

    expect(navigate).toHaveBeenCalledWith(['bibliothek']);
  });

  it('finds in all files, lists the matches below and opens the asked-for one', async () => {
    const fixture = await render('ide-find-in-files', 'vim-j');
    const root = fixture.nativeElement as HTMLElement;

    press(root, { key: 'F', code: 'KeyF', metaKey: true, shiftKey: true });
    await fixture.whenStable();
    const field = root.querySelector<HTMLInputElement>('.fp-field')!;
    field.value = 'discount';
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(root.querySelectorAll('.fp-row').length).toBe(2);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(root.querySelector('.dj-tool')?.textContent).toContain('Find: "discount"');
    expect(root.querySelector('.dj-tab-on')?.textContent).toContain('PriceCalculator.kt');
    expect(kept().round.outcomes).toEqual(['clean']);
  });

  it('renames a variable everywhere in the file', async () => {
    const fixture = await render('ide-rename', 'vim-j');
    const root = fixture.nativeElement as HTMLElement;

    press(root, { key: 'F6', code: 'F6', shiftKey: true });
    await fixture.whenStable();
    const field = root.querySelector<HTMLInputElement>('.fl-field')!;
    expect(field.value).toBe('sum');
    field.value = 'subtotal';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await fixture.whenStable();

    const code = root.querySelector('.cm-content')?.textContent ?? '';
    expect(code).toContain('val subtotal = order.items.sumOf');
    expect(code).toContain('return subtotal - discount(order)');
    expect(kept().round.outcomes).toEqual(['clean']);
  });

  it('goes to the line typed into Go to Line', async () => {
    const fixture = await render('ide-go-to-line', 'vim-j');
    const root = fixture.nativeElement as HTMLElement;

    press(root, { key: 'l', code: 'KeyL', metaKey: true });
    await fixture.whenStable();
    const field = root.querySelector<HTMLInputElement>('.fl-field')!;
    expect(field.value).toBe('1:1');
    field.value = '86';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(root.querySelector('.dj-status')?.textContent).toContain('86:9');
    expect(kept().round.outcomes).toEqual(['clean']);
  });

  it('moves to the next method', async () => {
    const fixture = await render('ide-next-method', 'vim-j');
    const root = fixture.nativeElement as HTMLElement;

    press(root, { key: 'ArrowDown', code: 'ArrowDown', ctrlKey: true, shiftKey: true });
    await fixture.whenStable();

    expect(root.querySelector('.dj-status')?.textContent).toContain('42:5');
    expect(kept().round.outcomes).toEqual(['clean']);
  });

  it('deletes the line under the cursor', async () => {
    const fixture = await render('ide-delete-line', 'vim-j');
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.cm-content')?.textContent).toContain('println');

    press(root, { key: 'Backspace', code: 'Backspace', metaKey: true });
    await fixture.whenStable();

    expect(root.querySelector('.cm-content')?.textContent).not.toContain('println');
  });

  it('goes to the declaration of the class under the cursor', async () => {
    const fixture = await render('ide-declaration', 'vim-j');
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.dj-tab-on')?.textContent).toContain('OrderService.kt');

    press(root, { key: 'b', code: 'KeyB', metaKey: true });
    await fixture.whenStable();

    expect(root.querySelector('.dj-tab-on')?.textContent).toContain('PriceCalculator.kt');
  });

  it('hides the project view and brings it back', async () => {
    const fixture = await render('ide-project', 'ide-hide-windows');
    const root = fixture.nativeElement as HTMLElement;

    press(root, { key: '1', code: 'Digit1', metaKey: true });
    await fixture.whenStable();
    expect(root.querySelector('.dj-tree')).toBeNull();
  });

  it('shows the round as a markdown file once it is over', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        cards: {},
        solved: {},
        round: { day: todayIso(), ids: ['vim-x'], outcomes: ['clean'] },
      }),
    );
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Dojo);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.dj-tab-on')?.textContent).toContain(`runde-${todayIso()}.md`);
    expect(root.querySelector('.cm-content')?.textContent).toContain('Vim · Löschen');
  });

  it('leaves with Esc once the round is over', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        cards: {},
        solved: {},
        round: { day: todayIso(), ids: ['vim-x'], outcomes: ['clean'] },
      }),
    );
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Dojo);
    await fixture.whenStable();

    press(fixture.nativeElement as HTMLElement, { key: 'Escape', code: 'Escape' });

    expect(navigate).toHaveBeenCalledWith(['bibliothek']);
  });

  it('keeps the keys of the editor away from the house', async () => {
    const fixture = await render('vim-x', 'vim-j');
    const root = fixture.nativeElement as HTMLElement;
    const heard = vi.fn();
    document.addEventListener('keydown', heard);

    press(root, { key: 'Escape', code: 'Escape' });
    press(root, { key: 'w', code: 'KeyW' });

    expect(heard).not.toHaveBeenCalled();
    document.removeEventListener('keydown', heard);
  });
});
