import { computed, inject, Injectable, resource } from '@angular/core';

import { errorMessage } from '../../core/ipc';
import { ReleasesApi } from '../data/releases-api';
import { MAP_ONLY, npmReleases, PRODUCTS, type Product, type Release } from '../domain/releases';

/** The Stack-Kurier: the releases of the stack, read once when the window opens. They change by the week, not by the minute. */
@Injectable({ providedIn: 'root' })
export class ReleasesState {
  private readonly api = inject(ReleasesApi);
  private readonly issue = resource({
    loader: () =>
      Promise.all(
        [...PRODUCTS, ...MAP_ONLY].map(async (product) => ({
          product,
          releases: await this.releasesOf(product),
        })),
      ),
  });

  /** With the products only the map shows. Undefined until read. */
  readonly allIssues = computed(() => (this.issue.hasValue() ? this.issue.value() : undefined));
  /** Those of the Stack-Kurier. Undefined until read. */
  readonly issues = computed(() => this.allIssues()?.filter(({ product }) => PRODUCTS.includes(product)));
  readonly error = computed(() => errorMessage(this.issue.error()));
  readonly loading = this.issue.isLoading;

  reload(): void {
    this.issue.reload();
  }

  private async releasesOf({ source }: Product): Promise<readonly Release[]> {
    if ('endoflife' in source) return this.api.releases(source.endoflife);
    return npmReleases(await this.api.npmVersions(source.npm), source.supportMonths);
  }
}
