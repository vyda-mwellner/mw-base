/** A box that scrolls by itself, a log or a wide table: a stop while it holds more than it shows. */
const SCROLLER = '[data-scroll]';
const STOPS = `a[href], button, input, select, textarea, summary, ${SCROLLER}`;
// Of a radio group only the checked one is a stop, as with Tab.
const OFF =
  ':disabled, [tabindex="-1"], input[type="hidden"], input[type="radio"]:not(:checked), [data-key-walk-skip] *';
const FIELDS = 'input, select, textarea';
/** Fields that step their value with the arrow keys: Enter, or Space, hands the keys over to them. */
const PICKERS = 'input[type="date"], input[type="time"], input[type="number"]';
const TYPING =
  'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], input[type="password"], input[type="number"]';
/** Fields that are shut until Enter opens them: nothing but their own keys gets in. */
const ARMABLE = `${PICKERS}, ${TYPING}`;
const ARMED = 'data-armed';
/** What a letter does to the row the focus is in, where it does nothing to the sheet as a whole. */
const ROW_KEY = 'data-row-key';
const VERTICAL: Readonly<Record<string, 1 | -1>> = { w: -1, s: 1 };
const SIDEWAYS: Readonly<Record<string, 1 | -1>> = { a: -1, d: 1 };
const SCROLLS: Readonly<Record<string, 1 | -1>> = { ArrowUp: -1, ArrowDown: 1 };
const ACROSS: Readonly<Record<string, 1 | -1>> = { ArrowLeft: -1, ArrowRight: 1 };
const SCROLL = 48;

/** A field that takes text, once Enter has opened it. */
export const writes = (element: Element | null): boolean => element?.matches(TYPING) ?? false;

export const isArmed = (element: Element | null): boolean => element?.hasAttribute(ARMED) ?? false;

/** Opens a field for its own keys until it loses the focus; a text field with the caret at its end. */
export function arm(field: HTMLElement): void {
  field.setAttribute(ARMED, '');
  field.addEventListener('blur', () => field.removeAttribute(ARMED), { once: true });
  if (
    field instanceof HTMLTextAreaElement ||
    (field instanceof HTMLInputElement && field.selectionStart !== null)
  )
    field.setSelectionRange(field.value.length, field.value.length);
}

/** What Enter does at an element, for the hint: open a shut field, send a form, close an open picker. */
export function enterAt(element: Element | null): 'open' | 'send' | 'close' | null {
  if (!element) return null;
  const form = element.closest('form') !== null;
  if (isArmed(element)) {
    if (element.matches('textarea')) return null;
    return writes(element) && form ? 'send' : 'close';
  }
  if (element.matches(ARMABLE)) return 'open';
  return form ? 'send' : null;
}

/** A letter in lower case, with Shift or Caps Lock alike; any other key as it is. */
export const keyOf = (event: KeyboardEvent): string =>
  event.key.length === 1 ? event.key.toLowerCase() : event.key;

const overflows = (box: HTMLElement): boolean =>
  box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1;

export function stopsIn(scope: Element): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(STOPS)).filter(
    (stop) => !stop.matches(OFF) && (!stop.matches(SCROLLER) || overflows(stop)),
  );
}

const scrolls = (scope: HTMLElement): boolean => /auto|scroll/.test(getComputedStyle(scope).overflowY);

/** In view, or half a view further: that close, stepping onto a stop beats scrolling to it. */
function inReach(stop: HTMLElement, scope: HTMLElement): boolean {
  if (!scrolls(scope)) return true;
  const view = scope.getBoundingClientRect();
  const box = stop.getBoundingClientRect();
  const reach = view.height / 2;
  return box.top >= view.top - reach && box.bottom <= view.bottom + reach;
}

function inView(stop: HTMLElement, scope: HTMLElement): boolean {
  if (!scrolls(scope)) return true;
  const view = scope.getBoundingClientRect();
  const box = stop.getBoundingClientRect();
  return box.top >= view.top && box.bottom <= view.bottom;
}

/** With nothing focused: going down, the first stop not above the view; going up, the last one not below it. */
function fromView(stops: readonly HTMLElement[], scope: HTMLElement, step: 1 | -1): number {
  if (!scrolls(scope)) return step > 0 ? 0 : stops.length - 1;
  const view = scope.getBoundingClientRect();
  const boxes = stops.map((stop) => stop.getBoundingClientRect());
  if (step > 0) return boxes.findIndex((box) => box.bottom > view.top);
  let index = boxes.length - 1;
  while (index >= 0 && boxes[index].top >= view.bottom) index--;
  return index;
}

function canScroll(scope: HTMLElement, step: 1 | -1): boolean {
  if (!scrolls(scope)) return false;
  return step > 0 ? scope.scrollTop + scope.clientHeight < scope.scrollHeight - 1 : scope.scrollTop > 0;
}

function turn(select: HTMLSelectElement, step: 1 | -1, round = false): void {
  const count = select.options.length;
  let index = select.selectedIndex;
  do {
    index += step;
    if (round) index = (index + count) % count;
  } while (select.options[index]?.disabled && index !== select.selectedIndex);
  if (!select.options[index] || select.options[index].disabled) return;
  select.selectedIndex = index;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * WASD instead of Tab, in a sheet that scrolls or a menu that does not. W and S go from stop to stop, A and D
 * step sideways on buttons and turn a select. The arrow keys up and down only scroll, so reading never moves
 * the cursor; on a box marked `data-scroll` they scroll that box, left and right with it. A field to type in,
 * or one that steps with the arrow keys, is shut until Enter opens it: then it has all keys to itself until
 * Escape, Enter (which sends the form of a text field) or the focus moves on. Any other letter hits the
 * element that names it in `aria-keyshortcuts`: a field, or what holds one, takes the focus and a text field
 * opens, a select that has it already goes on to its next option, anything else is clicked. Enter in a select
 * sends its form.
 */
export class KeyWalk {
  /** The stop that had the focus last, to notice when it vanishes or stops working. */
  private held: HTMLElement | null = null;
  /** With no stop focused: the first one below where the cursor was. */
  private next = 0;
  private parked = false;
  private arriving = true;

  /** `start` is the stop the sheet was left at the last time; W and S go past the stops `passing` names. */
  constructor(
    private readonly start = 0,
    private readonly passing: string | null = null,
  ) {}

  private stopsOf(scope: Element): HTMLElement[] {
    const stops = stopsIn(scope);
    return this.passing ? stops.filter((stop) => !stop.matches(this.passing!)) : stops;
  }

  /** Where the cursor is, to come back to. */
  get position(): number {
    return this.held ? this.next : 0;
  }

  /** True once the key is dealt with and means nothing else to the caller. */
  handle(event: KeyboardEvent, scope: HTMLElement): boolean {
    this.arriving = false;
    const stops = this.stopsOf(scope);
    const active = document.activeElement as HTMLElement | null;
    const at = active ? stops.indexOf(active) : -1;
    if (active && at >= 0) {
      this.held = active;
      this.next = at;
      this.parked = false;
    }
    const field = active && at >= 0 && active.matches(FIELDS) ? active : null;

    if (field?.hasAttribute(ARMED)) {
      // Enter in a textarea is a new line; in a text field it picks a suggestion or sends the form.
      if (event.key === 'Escape' || (event.key === 'Enter' && !field.matches('textarea'))) {
        field.removeAttribute(ARMED);
        if (event.key === 'Enter' && !writes(field)) event.preventDefault();
      }
      return true;
    }
    if (field?.matches(ARMABLE) && (event.key === 'Enter' || (event.key === ' ' && field.matches(PICKERS)))) {
      arm(field);
      // Space stays with the browser: where it opens a calendar, the arrow keys then walk in that.
      if (event.key === 'Enter') event.preventDefault();
      return true;
    }

    const key = keyOf(event);
    if (VERTICAL[key]) return this.walk(event, scope, stops, at, VERTICAL[key]);
    if (SIDEWAYS[key]) {
      const step = SIDEWAYS[key];
      if (field instanceof HTMLSelectElement) turn(field, step);
      else if (at < 0) return false;
      else if (stops[at + step] && inReach(stops[at + step], scope)) stops[at + step].focus();
      event.preventDefault();
      return true;
    }

    if (/^[a-z]$/i.test(event.key)) {
      const own =
        at >= 0 &&
        active?.parentElement?.querySelector<HTMLElement>(
          `:scope > [${ROW_KEY}="${event.key.toLowerCase()}"]`,
        );
      if (own) {
        if (!event.repeat) own.click();
        event.preventDefault();
        return true;
      }
      const hot = scope.querySelector<HTMLElement>(`[aria-keyshortcuts="${key}"]`);
      const target = hot && (hot.matches(FIELDS) ? hot : hot.querySelector<HTMLElement>(FIELDS));
      if (target === active && target instanceof HTMLSelectElement) turn(target, 1, true);
      else if (target) {
        target.focus();
        if (writes(target)) arm(target);
      } else if (hot && !event.repeat) hot.click();
      if (hot) {
        event.preventDefault();
        return true;
      }
    }

    if (event.key === 'Enter' && field instanceof HTMLSelectElement && field.form) {
      field.form.requestSubmit();
      event.preventDefault();
      return true;
    }

    const scroll = SCROLLS[event.key];
    const across = ACROSS[event.key];
    // On a box that scrolls, the arrow keys move what is in it; at its end, up and down go on with the sheet.
    const box = at >= 0 && active?.matches(SCROLLER) ? active : null;
    const inBox = across
      ? { left: across * SCROLL }
      : scroll && box && canScroll(box, scroll)
        ? { top: scroll * SCROLL }
        : null;
    if (box && inBox) {
      box.scrollBy(inBox);
      event.preventDefault();
      return true;
    }
    if (!scroll) {
      const text = event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete';
      if (!text || !field?.matches(ARMABLE)) return false;
      event.preventDefault();
      return true;
    }
    event.preventDefault();
    if (!canScroll(scope, scroll)) return true;
    scope.scrollBy({ top: scroll * SCROLL });
    // A stop scrolled out of the view would still take Enter, so the sheet holds the focus until W or S picks one.
    if (active && at >= 0 && !inView(active, scope)) scope.focus({ preventScroll: true });
    return true;
  }

  /** From stop to stop; with nothing focused, from the edge of the view. */
  private walk(
    event: KeyboardEvent,
    scope: HTMLElement,
    stops: HTMLElement[],
    at: number,
    step: 1 | -1,
  ): boolean {
    const target = at >= 0 ? at + step : fromView(stops, scope, step);
    const stop = stops[target];
    if (stop) {
      stop.focus();
      this.held = stop;
      this.next = target;
    } else if (at < 0) {
      return false;
    }
    event.preventDefault();
    return true;
  }

  /** Back to the stop that had the focus last, once something over the sheet let go of it; the sheet without one. */
  resume(scope: HTMLElement): void {
    const held = this.held?.isConnected && !this.held.matches(':disabled') ? this.held : null;
    (held ?? scope).focus({ preventScroll: true });
  }

  /**
   * To be called after a render. A stop removed under the focus hands it to the one that took its place; a
   * stop disabled under the focus gets it back once it works again.
   */
  recover(scope: HTMLElement): void {
    if (this.arriving) this.arrive(scope);
    const held = this.held;
    if (!held) return;
    const active = document.activeElement;
    if (!held.isConnected) {
      this.held = null;
      if (active !== document.body) return;
      const stops = this.stopsOf(scope);
      this.held = stops[Math.min(this.next, stops.length - 1)] ?? null;
      (this.held ?? scope).focus();
    } else if (held.matches(':disabled')) {
      // Not every browser sends key events to a disabled element that still has the focus.
      if (active === held || active === document.body) {
        this.parked = true;
        scope.focus({ preventScroll: true });
      }
    } else if (this.parked) {
      this.parked = false;
      if (active === scope) held.focus();
    }
  }

  private arrive(scope: HTMLElement): void {
    const active = document.activeElement;
    if (active !== scope && active !== document.body) {
      this.arriving = false;
      return;
    }
    const stops = this.stopsOf(scope);
    if (stops.length === 0) return;
    this.arriving = false;
    const at = this.start > 0 && this.start < stops.length ? this.start : 0;
    const stop = stops[at];
    if (at === 0 && !inView(stop, scope)) return;
    stop.focus({ preventScroll: at === 0 });
    this.held = stop;
    this.next = at;
  }
}
