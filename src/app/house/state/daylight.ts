import { DestroyRef, inject, Injectable, signal } from '@angular/core';

import { skyAt } from '../../engine/sky';

/** The sky over the house, read from the clock once a minute. */
@Injectable({ providedIn: 'root' })
export class Daylight {
  private readonly now = signal(skyAt(new Date()));
  readonly sky = this.now.asReadonly();

  constructor() {
    const timer = setInterval(() => this.now.set(skyAt(new Date())), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
