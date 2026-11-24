import { computed, DestroyRef, inject, Injectable, resource } from '@angular/core';

import { call, errorMessage } from '../../core/ipc';
import { todayIso } from '../../engine/days';
import { Store } from '../../ui/store';
import { parseFeed } from '../domain/advisories';

const VISIT_PATH = 'nachrichten/security.json';
const EVERY = 30 * 60_000;

/** The day of the last visit, and the instant of the newest advisory listed then. */
interface Visit {
  readonly day: string;
  readonly until: string;
}

/** The Security-News: the new advisories of the BSI's WID, read every half hour, and when they were last looked at. */
@Injectable({ providedIn: 'root' })
export class SecurityState {
  private readonly store = inject(Store);
  private readonly feed = resource({ loader: async () => parseFeed(await call<string>('security_feed')) });
  private readonly visit = resource({ loader: () => this.store.read<Visit>(VISIT_PATH) });

  /** Undefined until read. */
  readonly advisories = computed(() => (this.feed.hasValue() ? this.feed.value() : undefined));
  readonly error = computed(() => errorMessage(this.feed.error()));
  readonly loading = this.feed.isLoading;
  /** What came out since the last visit; before the first one, all. Undefined until the feed and the visit are read. */
  readonly fresh = computed(() => {
    const advisories = this.advisories();
    if (advisories === undefined || !this.visit.hasValue()) return undefined;
    const until = this.visit.value()?.until ?? '';
    return advisories.filter((advisory) => advisory.published > until);
  });

  constructor() {
    const timer = setInterval(() => this.feed.reload(), EVERY);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  visitedOn(day: string): boolean {
    return this.visit.hasValue() && this.visit.value()?.day === day;
  }

  reload(): void {
    this.feed.reload();
  }

  async markVisited(): Promise<void> {
    const last = this.visit.hasValue() ? this.visit.value() : null;
    const newest = this.advisories()?.[0]?.published ?? '';
    const visit: Visit = {
      day: todayIso(),
      until: newest > (last?.until ?? '') ? newest : (last?.until ?? ''),
    };
    if (visit.day === last?.day && visit.until === last.until) return;
    this.visit.set(visit);
    await this.store.write(VISIT_PATH, visit);
  }
}
