import { Component, computed, inject } from '@angular/core';

import { HouseStatus } from '../../../house/state/house-status';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { injectTask } from '../../../ui/task';
import { incidentSigns, SignTone } from '../../domain/signs';
import { ClusterState } from '../../state/cluster-state';

const LIGHTS: Readonly<Record<SignTone, string | null>> = { fresh: 'danger', calm: 'ok', unread: null };

/** The restart sign in the server room as a sheet: per stage the days since a container last restarted. */
@Component({
  templateUrl: './restarts-sheet.html',
  styleUrl: './restarts-sheet.scss',
})
export class RestartsSheet {
  private readonly cluster = inject(ClusterState);
  private readonly status = inject(HouseStatus);
  private readonly task = injectTask();

  protected readonly signs = computed(() =>
    incidentSigns(this.cluster.incidents(), Date.now()).map((sign) => ({
      ...sign,
      light: LIGHTS[sign.tone],
    })),
  );
  protected readonly error = this.cluster.incidentsError;

  constructor() {
    injectSheetKeys(() => [{ keys: ['Q'], label: 'Alle Stages lesen' }]);
  }

  protected readAll(): Promise<void> {
    return this.task.run(async () => {
      this.status.working.set('DEV, TEST und PROD werden gelesen');
      try {
        const failures = await this.cluster.readAll();
        if (failures.length > 0) throw new Error(failures.join(' · '));
        return 'Alle Stages gelesen';
      } finally {
        this.status.working.set(null);
      }
    });
  }
}
