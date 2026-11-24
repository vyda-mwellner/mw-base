import { Component, computed, effect, inject, signal, untracked } from '@angular/core';

import { openExternal } from '../../../core/ipc';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { advisoryDay, sectionsOf, severityTone } from '../../domain/advisories';
import { SecurityState } from '../../state/security-state';

/** The new advisories of the BSI by section, newest first; Enter opens one in the browser. Opening the sheet is a visit. */
@Component({
  templateUrl: './security-sheet.html',
  styleUrl: './security-sheet.scss',
})
export class SecuritySheet {
  private readonly state = inject(SecurityState);
  /** What came out since the last visit, or while the sheet is open: marked until it closes. */
  private readonly fresh = signal<ReadonlySet<string>>(new Set());

  protected readonly error = this.state.error;
  protected readonly busy = this.state.loading;
  protected readonly pending = computed(() => this.state.advisories() === undefined && this.error() === null);
  protected readonly sections = computed(() =>
    sectionsOf(this.state.advisories() ?? []).map((section) => ({
      ...section,
      rows: section.advisories.map((advisory) => ({
        ...advisory,
        tone: severityTone(advisory.severity),
        day: advisoryDay(advisory),
        fresh: this.fresh().has(advisory.id),
      })),
    })),
  );

  constructor() {
    injectSheetKeys(() => [{ keys: ['Q'], label: 'Neu laden' }]);
    effect(() => {
      const fresh = this.state.fresh();
      if (fresh === undefined) return;
      untracked(() => {
        if (fresh.length > 0)
          this.fresh.update((ids) => new Set([...ids, ...fresh.map((advisory) => advisory.id)]));
        void this.state.markVisited();
      });
    });
  }

  protected open(link: string): void {
    void openExternal(link);
  }

  protected reload(): void {
    this.state.reload();
  }
}
