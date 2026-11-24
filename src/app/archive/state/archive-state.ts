import { computed, inject, Injectable, resource } from '@angular/core';

import { errorMessage } from '../../core/ipc';
import { Store } from '../../ui/store';
import { ArchiveApi } from '../data/archive-api';
import type { LastRun } from '../model/backup';

const LAST_RUN_PATH = 'haus/backup-lauf.json';

/** The backup plan of the data folder and how its last run went. */
@Injectable({ providedIn: 'root' })
export class ArchiveState {
  private readonly api = inject(ArchiveApi);
  private readonly store = inject(Store);
  private readonly planResource = resource({ loader: () => this.api.plan() });
  private readonly lastDoc = resource({ loader: () => this.store.read<LastRun>(LAST_RUN_PATH) });

  /** Null while there is no readable plan. */
  readonly plan = computed(() => (this.planResource.hasValue() ? this.planResource.value() : null));
  readonly error = computed(() => errorMessage(this.planResource.error()));
  readonly lastRun = computed(() => (this.lastDoc.hasValue() ? this.lastDoc.value() : null));

  reload(): void {
    this.planResource.reload();
  }

  async run(): Promise<LastRun> {
    const run: LastRun = { ranAt: Date.now(), outcomes: await this.api.run() };
    await this.store.write(LAST_RUN_PATH, run);
    this.lastDoc.set(run);
    return run;
  }
}
