import { computed, inject, Injectable, signal } from '@angular/core';

import { GROUND_FLOOR, roomAt } from '../../engine/plan';
import { advance, halt, isMoving, jump, legsTo, Motion, rideBy, stride } from '../../engine/walk';
import type { Spot } from '../../engine/model';
import { MovementState } from '../../relax/state/movement-state';

const START: Motion = {
  x: 62,
  level: GROUND_FLOOR,
  facing: 1,
  legs: [],
  air: 0,
  rise: 0,
  speed: 0,
  aboard: false,
  depth: 0,
};
/** A tab in the background delivers no frames; the figure must not jump through the house afterwards. */
const LONGEST_STEP = 0.05;

@Injectable({ providedIn: 'root' })
export class Figure {
  private readonly movement = inject(MovementState);
  private readonly motion = signal(START);
  readonly pose = this.motion.asReadonly();
  /** The room the figure stands in; none in the lift, on the way outside, or between two floors. */
  readonly room = computed(() => {
    const { level, x } = this.motion();
    return Number.isInteger(level) ? roomAt(level, x) : null;
  });

  private frame: number | null = null;
  private last = 0;
  private readonly still = matchMedia('(prefers-reduced-motion: reduce)');

  goTo(spot: Spot): void {
    this.move((motion) => ({ ...motion, legs: legsTo(motion, spot) }));
  }

  stride(direction: 1 | -1, max: number): void {
    this.move((motion) => stride(motion, direction, max));
  }

  /** There at once, without walking. */
  put(spot: Spot): void {
    this.motion.update((motion) => ({
      ...motion,
      x: spot.x,
      level: spot.floor,
      legs: [],
      aboard: false,
      depth: 0,
    }));
  }

  halt(): void {
    this.motion.update(halt);
  }

  ride(step: 1 | -1): void {
    this.move((motion) => rideBy(motion, step));
  }

  jump(): void {
    this.move(jump);
  }

  private move(change: (motion: Motion) => Motion): void {
    this.motion.update(change);
    if (this.still.matches) {
      this.step((motion) => advance(motion, Infinity));
    } else if (this.frame === null && isMoving(this.motion())) {
      this.last = performance.now();
      this.frame = requestAnimationFrame((now) => this.tick(now));
    }
  }

  private tick(now: number): void {
    const seconds = Math.min(LONGEST_STEP, (now - this.last) / 1000);
    this.last = now;
    this.step((motion) => advance(motion, seconds));
    this.frame = isMoving(this.motion()) ? requestAnimationFrame((next) => this.tick(next)) : null;
  }

  /** A move the figure makes itself, counted; being put somewhere is not. */
  private step(advanced: (motion: Motion) => Motion): void {
    const before = this.motion();
    const after = advanced(before);
    this.motion.set(after);
    this.movement.record(before, after);
  }
}
