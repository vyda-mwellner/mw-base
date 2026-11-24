import { computed, inject, Injectable, resource } from '@angular/core';

import { errorMessage } from '../../core/ipc';
import { DeployApi } from '../data/deploy-api';
import type { CommitSearch } from '../model/deploy';

/**
 * Which build runs on DEV, TEST and PROD according to gitops, what waits for the next stage, by ticket. Read from
 * the local checkouts only, never from the network but for "Alle fetchen"; every reload reads the refs again, a
 * fetch in the IDE included.
 */
@Injectable({ providedIn: 'root' })
export class DeployState {
  private readonly api = inject(DeployApi);

  private readonly overviewResource = resource({ loader: () => this.api.overview() });
  private readonly overview = computed(() =>
    this.overviewResource.hasValue() ? this.overviewResource.value() : null,
  );

  readonly deploys = computed(() => this.overview()?.deploys ?? []);
  readonly releases = computed(() => this.overview()?.releases ?? []);
  readonly links = computed(() => this.overview()?.links ?? []);
  /** The table is only as fresh as the repo fetched longest ago, a never fetched one counts as oldest. */
  readonly stalestRepo = computed(
    () =>
      [...(this.overview()?.repos ?? [])].sort((a, b) => (a.fetchedAt ?? 0) - (b.fetchedAt ?? 0))[0] ?? null,
  );
  readonly isLoading = this.overviewResource.isLoading;
  readonly error = computed(() => errorMessage(this.overviewResource.error()));

  reload(): void {
    this.overviewResource.reload();
  }

  search(term: string): Promise<CommitSearch> {
    return this.api.search(term.trim());
  }

  /** Fetches gitops and every app repo; what could not be fetched comes back line by line, the rest is updated. */
  async fetchAll(): Promise<string[]> {
    try {
      return await this.api.fetch();
    } finally {
      this.overviewResource.reload();
    }
  }
}
