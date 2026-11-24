import { DestroyRef, inject, Resource } from '@angular/core';

type Reloadable = Pick<Resource<unknown>, 'isLoading'> & { reload(): unknown };

/**
 * Skips a tick while the last load still runs or the window is hidden, so slow kubectl calls never pile up.
 * Shown again, it reloads only what is older than its interval.
 */
export function poll(resource: Reloadable, intervalMs: number, active: () => boolean = () => true): void {
  let loaded = performance.now();
  const load = (): void => {
    if (document.visibilityState === 'hidden' || !active() || resource.isLoading()) return;
    loaded = performance.now();
    resource.reload();
  };
  const shown = (): void => {
    if (performance.now() - loaded >= intervalMs) load();
  };
  const timer = setInterval(load, intervalMs);
  document.addEventListener('visibilitychange', shown);
  inject(DestroyRef).onDestroy(() => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', shown);
  });
}
