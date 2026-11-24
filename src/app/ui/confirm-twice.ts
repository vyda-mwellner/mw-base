import { DestroyRef, inject, Signal, signal } from '@angular/core';

/** How long a first press waits for the second one. */
const ARMED_MS = 4_000;

interface ConfirmTwice {
  /** What the first press asked for, until the second one or the time runs out. */
  readonly armed: Signal<string | null>;
  /** True on the second press for the same thing in time; the first one only arms it. */
  confirm(key: string): boolean;
  disarm(): void;
}

/**
 * What loses data needs its key twice instead of a dialog, which a keyboard would have to walk into first.
 * Call in an injection context - a page's field initializer.
 */
export function injectConfirmTwice(): ConfirmTwice {
  const armed = signal<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const disarm = () => {
    clearTimeout(timer);
    armed.set(null);
  };
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  return {
    armed: armed.asReadonly(),
    confirm: (key) => {
      if (armed() === key) {
        disarm();
        return true;
      }
      clearTimeout(timer);
      armed.set(key);
      timer = setTimeout(() => armed.set(null), ARMED_MS);
      return false;
    },
    disarm,
  };
}
