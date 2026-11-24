import { inject, Signal, signal } from '@angular/core';

import { Toasts } from './toasts';

export interface Task {
  readonly busy: Signal<boolean>;
  /** A returned text becomes a success toast, a thrown error an error toast. A second call while one runs is dropped. */
  run(task: () => Promise<string | void>): Promise<void>;
}

export const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);

/** How a sheet saves. Call in an injection context - a page's field initializer. */
export function injectTask(): Task {
  const toasts = inject(Toasts);
  const busy = signal(false);
  return {
    busy: busy.asReadonly(),
    run: async (task) => {
      if (busy()) return;
      busy.set(true);
      try {
        const message = await task();
        if (message) toasts.success(message);
      } catch (error) {
        toasts.error(errorText(error));
      } finally {
        busy.set(false);
      }
    },
  };
}
