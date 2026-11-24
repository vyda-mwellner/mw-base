import { Component, computed, inject } from '@angular/core';

import { HouseStatus } from '../../../house/state/house-status';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { editionsOf } from '../../domain/releases';
import { ReleasesState } from '../../state/releases-state';

/** The Stack-Kurier: the newest lines of the stack. */
@Component({
  templateUrl: './stack-sheet.html',
  styleUrl: './stack-sheet.scss',
})
export class StackSheet {
  private readonly releases = inject(ReleasesState);
  private readonly status = inject(HouseStatus);

  protected readonly error = this.releases.error;
  protected readonly busy = this.releases.loading;
  protected readonly unread = computed(() => this.releases.issues() === undefined && this.error() === null);
  protected readonly products = computed(() =>
    (this.releases.issues() ?? []).map((issue) => ({
      label: issue.product.label,
      editions: editionsOf(issue, this.status.today()),
    })),
  );

  constructor() {
    injectSheetKeys(() => [{ keys: ['Q'], label: 'Neu laden' }]);
  }

  protected reload(): void {
    this.releases.reload();
  }
}
