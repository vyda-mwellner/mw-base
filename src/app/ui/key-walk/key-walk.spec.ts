import { isArmed, KeyWalk, stopsIn } from './key-walk';

function mount(html: string): HTMLElement {
  const scope = document.createElement('main');
  scope.tabIndex = -1;
  scope.innerHTML = html;
  document.body.replaceChildren(scope);
  return scope;
}

function press(walk: KeyWalk, scope: HTMLElement, key: string): { used: boolean; event: KeyboardEvent } {
  const event = new KeyboardEvent('keydown', { key, cancelable: true });
  return { used: walk.handle(event, scope), event };
}

const focused = (): string | null => document.activeElement?.id || null;

/** A sheet 300 high over 2000 of content, with three stops whose top can be moved. */
function scrolling(): { scope: HTMLElement; top: Record<string, number> } {
  const scope = mount('<button id="a"></button><button id="b"></button><button id="c"></button>');
  scope.style.overflowY = 'auto';
  Object.defineProperties(scope, {
    clientHeight: { value: 300 },
    scrollHeight: { value: 2000 },
    scrollBy: { value: vi.fn() },
  });
  const top: Record<string, number> = { a: 20, b: 1500, c: 1600 };
  const box = (from: number) => ({ top: from, bottom: from + 30, height: 30 }) as DOMRect;
  scope.getBoundingClientRect = () => ({ top: 0, bottom: 300, height: 300 }) as DOMRect;
  for (const id of Object.keys(top))
    scope.querySelector<HTMLElement>(`#${id}`)!.getBoundingClientRect = () => box(top[id]!);
  return { scope, top };
}

describe('KeyWalk', () => {
  it('leaves out what Tab would skip, and what is marked to be skipped', () => {
    const scope = mount(`
      <header data-key-walk-skip><button id="close"></button></header>
      <button id="a"></button>
      <button id="off" disabled></button>
      <input id="one" type="radio" name="kind" />
      <input id="two" type="radio" name="kind" checked />
      <a id="link" href="#"></a>
    `);

    expect(stopsIn(scope).map((stop) => stop.id)).toEqual(['a', 'two', 'link']);
  });

  it('goes down from the sheet to the first stop with S, on to the next, and back up with W', () => {
    const scope = mount('<button id="a"></button><button id="b"></button><button id="c"></button>');
    const walk = new KeyWalk();
    scope.focus();

    press(walk, scope, 's');
    expect(focused()).toBe('a');
    press(walk, scope, 'S');
    press(walk, scope, 's');
    expect(focused()).toBe('c');
    expect(press(walk, scope, 'w').event.defaultPrevented).toBe(true);
    expect(focused()).toBe('b');
  });

  it('walks over a shut text field with W and S and lets no key in until Enter opens it', () => {
    const scope = mount('<button id="a"></button><input id="b" /><button id="c"></button>');
    const field = scope.querySelector<HTMLInputElement>('#b')!;
    const walk = new KeyWalk();
    press(walk, scope, 's');
    press(walk, scope, 's');

    for (const key of ['k', '7', ' ', 'Backspace'])
      expect(press(walk, scope, key).event.defaultPrevented).toBe(true);
    press(walk, scope, 's');
    expect(focused()).toBe('c');
    press(walk, scope, 'w');

    expect(press(walk, scope, 'Enter').event.defaultPrevented).toBe(true);
    expect(isArmed(field)).toBe(true);
    const typed = press(walk, scope, 's');
    expect([typed.used, typed.event.defaultPrevented]).toEqual([true, false]);
    expect(focused()).toBe('b');

    press(walk, scope, 'Escape');
    expect(isArmed(field)).toBe(false);
    press(walk, scope, 's');
    expect(focused()).toBe('c');
  });

  it('sends the form with Enter from an open text field, and takes Enter as a new line in a textarea', () => {
    const scope = mount('<form><input id="label" /><textarea id="note"></textarea></form>');
    const walk = new KeyWalk();
    press(walk, scope, 's');
    press(walk, scope, 'Enter');

    const sent = press(walk, scope, 'Enter');
    expect([sent.used, sent.event.defaultPrevented]).toEqual([true, false]);
    expect(isArmed(scope.querySelector('#label'))).toBe(false);

    press(walk, scope, 's');
    press(walk, scope, 'Enter');
    const line = press(walk, scope, 'Enter');
    expect(line.event.defaultPrevented).toBe(false);
    expect(isArmed(scope.querySelector('#note'))).toBe(true);
  });

  it('walks on from a field for digits with S, where letters are no text', () => {
    const scope = mount(
      '<input id="a" type="number" /><input id="b" inputmode="decimal" /><button id="c"></button>',
    );
    const walk = new KeyWalk();
    press(walk, scope, 's');

    press(walk, scope, 's');
    press(walk, scope, 's');

    expect(focused()).toBe('c');
  });

  it('stays on the last stop', () => {
    const scope = mount('<button id="a"></button>');
    const walk = new KeyWalk();
    press(walk, scope, 's');

    press(walk, scope, 's');

    expect(focused()).toBe('a');
  });

  it('leaves W, A, S and D alone where there is no stop, as on the screen of a game', () => {
    const scope = mount('<p>Level 1</p>');
    scope.focus();

    for (const key of ['w', 'a', 's', 'd']) {
      const { used, event } = press(new KeyWalk(), scope, key);
      expect([used, event.defaultPrevented]).toEqual([false, false]);
    }
  });

  it('walks sideways on buttons and over a shut text field with A and D', () => {
    const scope = mount('<button id="a"></button><button id="b"></button><input id="c" />');
    const walk = new KeyWalk();
    press(walk, scope, 's');

    press(walk, scope, 'd');
    expect(focused()).toBe('b');
    press(walk, scope, 'd');
    expect(focused()).toBe('c');
    press(walk, scope, 'a');

    expect(focused()).toBe('b');
  });

  it('turns a select with A and D, past a disabled option, and keeps the arrow keys from opening it', () => {
    const scope = mount(`
      <select id="s">
        <option value="" disabled selected></option>
        <option value="a"></option>
        <option value="b" disabled></option>
        <option value="c"></option>
      </select>
    `);
    const select = scope.querySelector('select')!;
    const changed = vi.fn();
    select.addEventListener('change', changed);
    const walk = new KeyWalk();
    press(walk, scope, 's');

    press(walk, scope, 'd');
    press(walk, scope, 'd');
    expect(select.value).toBe('c');
    expect(press(walk, scope, 'ArrowDown').event.defaultPrevented).toBe(true);
    press(walk, scope, 'a');
    press(walk, scope, 'a');

    expect(select.value).toBe('a');
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('hands the arrow keys to a date field after Enter, and takes them back on Escape', () => {
    const scope = mount('<input id="from" type="date" /><button id="b"></button>');
    const walk = new KeyWalk();
    press(walk, scope, 's');

    const armed = press(walk, scope, 'Enter');
    const inside = press(walk, scope, 'ArrowDown');
    expect(armed.event.defaultPrevented).toBe(true);
    expect(inside.event.defaultPrevented).toBe(false);
    expect(focused()).toBe('from');

    expect(press(walk, scope, 'Escape').used).toBe(true);
    expect(press(walk, scope, 'Escape').used).toBe(false);
    press(walk, scope, 's');
    expect(focused()).toBe('b');
  });

  it('takes the arrow keys back when an armed field loses the focus', () => {
    const scope = mount('<input id="from" type="date" /><button id="b"></button>');
    const walk = new KeyWalk();
    press(walk, scope, 's');
    press(walk, scope, 'Enter');

    scope.querySelector<HTMLElement>('#b')!.focus();

    expect(scope.querySelector('#from')!.hasAttribute('data-armed')).toBe(false);
  });

  it('clicks what names the letter, focuses a field that does, and opens a text field it jumps to', () => {
    const scope = mount(`
      <button id="reload" aria-keyshortcuts="q"></button>
      <input id="from" type="date" aria-keyshortcuts="e" />
      <input id="label" aria-keyshortcuts="r" />
    `);
    const clicked = vi.fn();
    scope.querySelector('#reload')!.addEventListener('click', clicked);
    const walk = new KeyWalk();

    press(walk, scope, 'Q');
    expect(clicked).toHaveBeenCalledTimes(1);
    press(walk, scope, 'e');
    expect(focused()).toBe('from');
    expect(isArmed(scope.querySelector('#from'))).toBe(false);

    press(walk, scope, 'r');
    expect(focused()).toBe('label');
    expect(isArmed(scope.querySelector('#label'))).toBe(true);
    expect(press(walk, scope, 'q').event.defaultPrevented).toBe(false);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('goes through a select with its letter, round the end, and jumps to another one with its own', () => {
    const scope = mount(`
      <select id="kind" aria-keyshortcuts="e"><option>a</option><option>b</option></select>
      <select id="minutes" aria-keyshortcuts="r"><option>5</option><option>10</option></select>
    `);
    const kind = scope.querySelector<HTMLSelectElement>('#kind')!;
    const walk = new KeyWalk();

    press(walk, scope, 'e');
    expect(focused()).toBe('kind');
    expect(kind.value).toBe('a');
    press(walk, scope, 'e');
    expect(kind.value).toBe('b');
    press(walk, scope, 'e');
    expect(kind.value).toBe('a');

    press(walk, scope, 'r');
    expect(focused()).toBe('minutes');
  });

  it('focuses the field inside what names the letter', () => {
    const scope = mount('<span aria-keyshortcuts="e"><input id="amount" /></span>');

    press(new KeyWalk(), scope, 'e');

    expect(focused()).toBe('amount');
  });

  it('takes a letter in a field for digits as a shortcut', () => {
    const scope = mount(
      '<select id="kind" aria-keyshortcuts="q"></select><input id="amount" inputmode="numeric" />',
    );
    scope.querySelector<HTMLElement>('#amount')!.focus();

    press(new KeyWalk(), scope, 'q');

    expect(focused()).toBe('kind');
  });

  it('sends the form with Enter in a select', () => {
    const scope = mount('<form><select id="kind"><option>a</option></select></form>');
    const sent = vi.fn((event: Event) => event.preventDefault());
    scope.querySelector('form')!.addEventListener('submit', sent);
    const walk = new KeyWalk();
    press(walk, scope, 's');

    press(walk, scope, 'Enter');

    expect(sent).toHaveBeenCalledTimes(1);
  });

  it('gives the focus of a removed stop to the one that took its place', () => {
    const scope = mount('<button id="a"></button><button id="b"></button><button id="c"></button>');
    const walk = new KeyWalk();
    press(walk, scope, 's');
    press(walk, scope, 's');

    scope.querySelector('#b')!.remove();
    walk.recover(scope);
    expect(focused()).toBe('c');

    scope.querySelector('#c')!.remove();
    walk.recover(scope);
    expect(focused()).toBe('a');
  });

  it('stops on a box that scrolls by itself only while it overflows, and scrolls it with the arrow keys', () => {
    const scope = mount(`
      <button id="a"></button>
      <pre id="short" data-scroll tabindex="0"></pre>
      <pre id="log" data-scroll tabindex="0" style="overflow-y: auto"></pre>
    `);
    const log = scope.querySelector<HTMLElement>('#log')!;
    const scrollBy = vi.fn();
    let top = 0;
    Object.defineProperties(log, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 500 },
      scrollTop: { get: () => top },
      scrollBy: { value: scrollBy },
    });
    const walk = new KeyWalk();
    press(walk, scope, 's');
    press(walk, scope, 's');
    expect(focused()).toBe('log');

    expect(press(walk, scope, 'ArrowDown').used).toBe(true);
    expect(press(walk, scope, 'ArrowRight').used).toBe(true);
    expect(scrollBy.mock.calls).toEqual([[{ top: 48 }], [{ left: 48 }]]);

    // At its top the box has nothing more above: up goes on with the sheet.
    top = 0;
    press(walk, scope, 'ArrowUp');
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it('goes past the stops it is told to pass, as fields on a desk that opens them on focus', () => {
    const scope = mount(
      '<input id="find" /><button id="a"></button><textarea id="text"></textarea><button id="b"></button>',
    );
    const walk = new KeyWalk(0, 'input, select, textarea');

    press(walk, scope, 's');
    expect(focused()).toBe('a');
    press(walk, scope, 's');
    expect(focused()).toBe('b');
  });

  it('resumes on the stop it held once something over the sheet let go of the focus, or on the sheet', () => {
    const scope = mount('<button id="a"></button><button id="b"></button>');
    const walk = new KeyWalk();
    press(walk, scope, 's');
    press(walk, scope, 's');
    document.body.focus();

    walk.resume(scope);
    expect(focused()).toBe('b');

    scope.querySelector('#b')!.remove();
    walk.resume(scope);
    expect(document.activeElement).toBe(scope);
  });

  it('gives a stop its focus back once it is no longer disabled', () => {
    const scope = mount('<button id="a"></button><button id="b"></button>');
    const button = scope.querySelector<HTMLButtonElement>('#a')!;
    const walk = new KeyWalk();
    press(walk, scope, 's');

    button.disabled = true;
    walk.recover(scope);
    expect(document.activeElement).toBe(scope);

    button.disabled = false;
    walk.recover(scope);
    expect(focused()).toBe('a');
  });

  it('scrolls with the arrow keys and leaves the cursor where it is while the stop stays in view', () => {
    const { scope, top } = scrolling();
    const walk = new KeyWalk();
    press(walk, scope, 's');

    expect(press(walk, scope, 'ArrowDown').event.defaultPrevented).toBe(true);
    expect(scope.scrollBy).toHaveBeenCalledWith({ top: 48 });
    expect(focused()).toBe('a');

    top.a = -100;
    press(walk, scope, 'ArrowDown');
    expect(document.activeElement).toBe(scope);
  });

  it('picks the first stop in view with S and the last one with W once the sheet holds the focus', () => {
    const { scope, top } = scrolling();
    const walk = new KeyWalk();
    top.a = -100;
    top.b = 120;
    top.c = 200;
    scope.focus();

    press(walk, scope, 's');
    expect(focused()).toBe('b');

    scope.focus();
    press(walk, scope, 'w');
    expect(focused()).toBe('c');
  });
});

describe('KeyWalk in a sheet', () => {
  it('acts on the row of the focused stop with its row key, and on no other row', () => {
    const scope = mount(`
      <ul>
        <li><button id="a"></button><button id="drop-a" tabindex="-1" data-row-key="x"></button></li>
        <li><button id="b"></button><button id="drop-b" tabindex="-1" data-row-key="x"></button></li>
      </ul>
      <input id="text" />
    `);
    const dropped: string[] = [];
    scope.addEventListener('click', (event) => dropped.push((event.target as Element).id));
    const walk = new KeyWalk();

    expect(press(walk, scope, 'x').used).toBe(false);
    press(walk, scope, 's');
    press(walk, scope, 's');
    expect(press(walk, scope, 'x').event.defaultPrevented).toBe(true);
    expect(dropped).toEqual(['drop-b']);
    expect(focused()).toBe('b');

    press(walk, scope, 's');
    expect(press(walk, scope, 'x').event.defaultPrevented).toBe(true);
    expect(dropped).toEqual(['drop-b']);
  });

  it('puts the cursor on the first stop of a sheet that just opened, once there is one', () => {
    const scope = mount('');
    const walk = new KeyWalk();
    scope.focus();

    walk.recover(scope);
    expect(document.activeElement).toBe(scope);

    scope.innerHTML = '<button id="a"></button><button id="b"></button>';
    walk.recover(scope);
    expect(focused()).toBe('a');
    expect(walk.position).toBe(0);
  });

  it('comes back to the stop a sheet was left at', () => {
    const scope = mount('<button id="a"></button><button id="b"></button><button id="c"></button>');
    const first = new KeyWalk();
    scope.focus();
    press(first, scope, 's');
    press(first, scope, 's');
    expect(first.position).toBe(1);

    scope.focus();
    new KeyWalk(first.position).recover(scope);

    expect(focused()).toBe('b');
  });

  it('starts on a field to type in, shut, and leaves a cursor that was moved by a key alone', () => {
    const typing = mount('<input id="text" /><button id="a"></button>');
    typing.focus();
    new KeyWalk().recover(typing);
    expect(focused()).toBe('text');
    expect(isArmed(document.activeElement)).toBe(false);

    const scope = mount('<button id="a"></button><button id="b"></button>');
    const walk = new KeyWalk();
    scope.focus();
    press(walk, scope, 's');
    press(walk, scope, 's');
    walk.recover(scope);
    expect(focused()).toBe('b');
  });

  it('walks from where the focus is, with nothing kept between two keys', () => {
    const scope = mount('<button id="a"></button><button id="b"></button>');
    scope.querySelector<HTMLElement>('#a')!.focus();

    new KeyWalk().handle(new KeyboardEvent('keydown', { key: 'd' }), scope);

    expect(focused()).toBe('b');
  });
});
