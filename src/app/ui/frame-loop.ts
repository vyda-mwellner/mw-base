import { DestroyRef, inject } from '@angular/core';

/** A tab in the background delivers no frames; whatever moves must not jump afterwards. */
const LONGEST_STEP = 0.05;

/** Calls `step` with the seconds since the last frame, for as long as the caller lives. Call in an injection context. */
export function injectFrameLoop(step: (seconds: number) => void): void {
  let last = performance.now();
  let frame = requestAnimationFrame(function tick(now) {
    step(Math.min(LONGEST_STEP, (now - last) / 1000));
    last = now;
    frame = requestAnimationFrame(tick);
  });
  inject(DestroyRef).onDestroy(() => cancelAnimationFrame(frame));
}
