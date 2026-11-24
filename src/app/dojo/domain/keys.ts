/** The keys of a solution in vim notation, one per key press: `ciwtotal<Esc>` is nine. */
export const keysOf = (notation: string): string[] => notation.match(/<[A-Za-z-]+>|[\s\S]/gu) ?? [];

/** Pressed on their own they make no key of a solution. */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'Dead']);

export const isModifier = (event: KeyboardEvent): boolean => MODIFIERS.has(event.key);

const NAMED_CODES: Readonly<Record<string, string>> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Enter: '↩',
  Backspace: '⌫',
  Tab: '⇥',
  Space: '␣',
  Escape: '⎋',
  PageUp: '⇞',
  PageDown: '⇟',
  Home: '↖',
  End: '↘',
};

/** Keys that are a shortcut without ⌃, ⌥ or ⌘: they type nothing. */
const ALONE = /^(?:F\d{1,2}|⇞|⇟|↖|↘)$/u;

/** The key as printed on it: a letter, a digit, F1 to F12, an arrow or a key of the block above them. */
function capOf(event: KeyboardEvent): string | null {
  // With ⌥ the Mac types a special character, so the letter comes from the place of the key; without it from
  // the key itself, which keeps Y and Z right on a German keyboard.
  if (!event.altKey && /^[a-z]$/i.test(event.key)) return event.key.toUpperCase();
  const letter = /^Key([A-Z])$/.exec(event.code);
  if (letter) return letter[1];
  const digit = /^Digit(\d)$/.exec(event.code);
  if (digit) return digit[1];
  if (/^F\d{1,2}$/.test(event.code)) return event.code;
  return NAMED_CODES[event.code] ?? null;
}

/**
 * A shortcut as IntelliJ prints it on the Mac: ⌃ ⌥ ⇧ ⌘ in that order, then the key. Null for what is no
 * shortcut: a key pressed on its own or with Shift alone, which types, unless it is one that types nothing.
 */
export function chordOf(event: KeyboardEvent): string | null {
  if (isModifier(event)) return null;
  const cap = capOf(event);
  if (!cap) return null;
  const held = event.ctrlKey || event.altKey || event.metaKey;
  if (!held && !ALONE.test(cap)) return null;
  return `${event.ctrlKey ? '⌃' : ''}${event.altKey ? '⌥' : ''}${event.shiftKey ? '⇧' : ''}${event.metaKey ? '⌘' : ''}${cap}`;
}

/** What the dojo itself does, besides vim and the lessons. */
export type DojoCommand = 'quit' | 'hint' | 'again' | 'skip' | 'next';

/**
 * The dojo's own keys, in the bar at the bottom. ⌃ with a letter vim leaves alone, or one that is only another
 * name for a key it has twice: ⌃Q is ⌃V, ⌃N is j. No IntelliJ lesson may use one of them.
 */
export const COMMAND_KEYS: Readonly<Record<string, DojoCommand>> = {
  '⌃Q': 'quit',
  '⌃L': 'hint',
  '⌃N': 'again',
  '⌃S': 'skip',
};

/** The keys of a shortcut one by one, to show them as keys: ⌥⌘L is ⌥, ⌘ and L. */
export function capsOf(chord: string): string[] {
  const held = [...(/^[⌃⌥⇧⌘]*/u.exec(chord)?.[0] ?? '')];
  const key = chord.slice(held.length);
  return key ? [...held, key] : held;
}

/** Shift twice in a row, as for Search Everywhere. */
export const DOUBLE_SHIFT = '⇧⇧';
const DOUBLE_SHIFT_MS = 400;

/** Notices Shift pressed twice with nothing in between. */
export class ShiftTwice {
  private last = 0;

  /** True on the second Shift. */
  press(event: KeyboardEvent): boolean {
    if (event.key !== 'Shift' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
      this.last = 0;
      return false;
    }
    const twice = event.timeStamp - this.last < DOUBLE_SHIFT_MS;
    this.last = twice ? 0 : event.timeStamp;
    return twice;
  }
}
