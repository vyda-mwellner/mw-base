import { computed, inject, Injectable, resource, signal } from '@angular/core';

import { errorMessage } from '../../core/ipc';
import { poll } from '../../core/poll';
import { WorkshopApi } from '../data/workshop-api';

const POLL_MS = 5_000;

/** Whether the local services answer. Probed only while a sheet of the workshop shows them (`watch`). */
@Injectable({ providedIn: 'root' })
export class HealthState {
  private readonly api = inject(WorkshopApi);

  private readonly watchers = signal(0);
  private readonly healthResource = resource({
    params: () => (this.watchers() > 0 ? 'watched' : undefined),
    loader: () => this.api.health(),
  });

  readonly services = computed(() => (this.healthResource.hasValue() ? this.healthResource.value() : []));
  readonly error = computed(() => errorMessage(this.healthResource.error()));

  constructor() {
    poll(this.healthResource, POLL_MS, () => this.watchers() > 0);
  }

  /** Returns the call that ends it. */
  watch(): () => void {
    this.watchers.update((count) => count + 1);
    return () => this.watchers.update((count) => count - 1);
  }
}
