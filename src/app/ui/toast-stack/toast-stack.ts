import { Component, computed, effect, inject, untracked } from '@angular/core';

import { Sound, Tune } from '../sound';
import { Toasts } from '../toasts';

const TITLES = { success: 'Erledigt', info: 'Hinweis', warning: 'Achtung', error: 'Fehler' } as const;
const VOICES: Readonly<Record<keyof typeof TITLES, Tune>> = {
  success: 'saved',
  info: 'chime',
  warning: 'chime',
  error: 'denied',
};
/** Sounds that already speak for the toast that follows them: right after one of these it keeps quiet. */
const COVERED_BY: ReadonlySet<Tune> = new Set<Tune>(['chime', 'done', 'level', 'record', 'perfect', 'fail']);
const COVER_MS = 400;

/** The toasts of `Toasts`, drawn like the menus: a block with a stripe in its tone and a plaque for a title. */
@Component({
  selector: 'app-toast-stack',
  templateUrl: './toast-stack.html',
  styleUrl: './toast-stack.scss',
  host: { role: 'status', 'aria-live': 'polite' },
})
export class ToastStack {
  protected readonly toasts = inject(Toasts);
  private readonly sound = inject(Sound);

  protected readonly rows = computed(() =>
    this.toasts.list().map((toast) => ({ ...toast, title: toast.title ?? TITLES[toast.tone] })),
  );

  constructor() {
    // Only a new toast sounds: the same text once more just restarts its time,
    // and toasts that come together sound once.
    let heard = -1;
    effect(() => {
      const newest = this.toasts.list()[0];
      untracked(() => {
        if (!newest || newest.id <= heard) return;
        heard = newest.id;
        const before = this.sound.lately(COVER_MS);
        if (!before || !COVERED_BY.has(before)) this.sound.play(VOICES[newest.tone]);
      });
    });
  }
}
