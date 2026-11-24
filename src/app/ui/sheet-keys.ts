import { computed, DestroyRef, inject, Injectable, Signal, signal } from '@angular/core';

/** Keys that do the same thing, and what that is. */
export interface KeyHint {
  readonly keys: readonly string[];
  readonly label: string;
}

interface Shown {
  readonly hints: Signal<readonly KeyHint[]>;
  readonly own: boolean;
}

@Injectable({ providedIn: 'root' })
export class SheetKeys {
  private readonly source = signal<Shown | null>(null);
  readonly hints = computed(() => this.source()?.hints() ?? []);
  /** The sheet takes every key for itself, so its keys say how to get about: they go into the bar at the bottom. */
  readonly own = computed(() => this.source()?.own ?? false);

  show(hints: Signal<readonly KeyHint[]>, until: DestroyRef, own = false): void {
    const shown = { hints, own };
    this.source.set(shown);
    // The next sheet may be there before this one is gone.
    until.onDestroy(() => this.source.update((current) => (current === shown ? null : current)));
  }
}

/** Call in an injection context - a page's constructor. The keys go when the page does. */
export function injectSheetKeys(hints: () => readonly KeyHint[], own = false): void {
  inject(SheetKeys).show(computed(hints), inject(DestroyRef), own);
}
