import { computed, inject, Injectable, resource } from '@angular/core';

import { errorMessage } from '../../core/ipc';
import { StagesApi } from '../data/stages-api';

/** Where the shell reads the stages from and which config file of the data folder is missing. */
@Injectable({ providedIn: 'root' })
export class StagesInfoState {
  private readonly api = inject(StagesApi);
  private readonly infoResource = resource({ loader: () => this.api.info() });

  readonly info = computed(() => (this.infoResource.hasValue() ? this.infoResource.value() : null));
  readonly error = computed(() => errorMessage(this.infoResource.error()));

  reload(): void {
    this.infoResource.reload();
  }
}
