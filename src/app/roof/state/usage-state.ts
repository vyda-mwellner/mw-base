import { computed, inject, Injectable, resource, signal } from '@angular/core';

import { errorMessage } from '../../core/ipc';
import { poll } from '../../core/poll';
import { RoofApi } from '../data/roof-api';
import { windowStart } from '../domain/usage';

/** ccusage reads every session log, a few seconds; often enough for a meter that moves while one works. */
const POLL_MS = 10 * 60_000;

/** What Claude Code cost over the last 30 days, per day. */
@Injectable({ providedIn: 'root' })
export class UsageState {
  private readonly api = inject(RoofApi);
  private readonly since = signal(windowStart(new Date()));
  private readonly usageResource = resource({
    params: () => this.since(),
    loader: ({ params }) => this.api.usage(params),
  });

  /** Null until ccusage answered once. */
  readonly days = computed(() => (this.usageResource.hasValue() ? this.usageResource.value() : null));
  readonly error = computed(() => errorMessage(this.usageResource.error()));
  readonly loading = this.usageResource.isLoading;

  constructor() {
    // Through `reload`, so the window moves on past midnight.
    poll({ isLoading: this.usageResource.isLoading, reload: () => this.reload() }, POLL_MS);
  }

  /** Reads anew, with the window moved on should a day have passed. */
  reload(): void {
    const since = windowStart(new Date());
    if (since !== this.since()) this.since.set(since);
    else this.usageResource.reload();
  }
}
