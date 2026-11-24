import { computed, inject, Injectable, resource } from '@angular/core';

import { errorMessage } from '../../core/ipc';
import { WorkshopApi } from '../data/workshop-api';
import type { Snapshot } from '../model/landscape';

/** The last scan of the workspace. A scan reads every checkout, so it only runs when asked for. */
@Injectable({ providedIn: 'root' })
export class LandscapeState {
  private readonly api = inject(WorkshopApi);
  private readonly scanResource = resource({ loader: () => this.api.landscape() });

  /** Undefined until read, null before the first scan. */
  readonly snapshot = computed(() => (this.scanResource.hasValue() ? this.scanResource.value() : undefined));
  readonly error = computed(() => errorMessage(this.scanResource.error()));

  async scan(): Promise<Snapshot> {
    const snapshot = await this.api.scanLandscape();
    this.scanResource.set(snapshot);
    return snapshot;
  }
}
