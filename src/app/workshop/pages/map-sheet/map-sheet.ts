import { Component, computed, inject } from '@angular/core';

import { DAY_MONTH } from '../../../core/format';
import { HouseStatus } from '../../../house/state/house-status';
import { techSupport } from '../../../news/domain/releases';
import { ReleasesState } from '../../../news/state/releases-state';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { injectTask } from '../../../ui/task';
import { Workbench } from '../../../workbench/workbench';
import { landscapePlan, planSvg } from '../../domain/landscape-plan';
import { appReport, edgesReport, mapGroups } from '../../domain/map-rows';
import { LandscapeState } from '../../state/landscape-state';

/**
 * The map in the workshop: the apps of the workspace by group, as the last scan of their checkouts saw them.
 * Enter lays one app on the workbench, E every connection, R the drawing of them all, Q scans anew.
 */
@Component({
  templateUrl: './map-sheet.html',
  styleUrl: './map-sheet.scss',
})
export class MapSheet {
  private readonly landscape = inject(LandscapeState);
  private readonly status = inject(HouseStatus);
  private readonly releases = inject(ReleasesState);
  private readonly workbench = inject(Workbench);
  private readonly task = injectTask();

  protected readonly busy = this.task.busy;
  protected readonly error = this.landscape.error;
  protected readonly snapshot = this.landscape.snapshot;
  protected readonly unscanned = computed(() => this.snapshot() === null);
  protected readonly groups = computed(() => {
    const snapshot = this.snapshot();
    return snapshot ? mapGroups(snapshot) : [];
  });
  protected readonly stand = computed(() => {
    const snapshot = this.snapshot();
    return snapshot ? `Scan vom ${DAY_MONTH.format(snapshot.generatedAt)}` : '';
  });

  constructor() {
    injectSheetKeys(() => [
      { keys: ['Q'], label: 'Neu scannen' },
      ...(this.snapshot()
        ? [
            { keys: ['E'], label: 'Verbindungen' },
            { keys: ['R'], label: 'Karte zeichnen' },
          ]
        : []),
    ]);
  }

  protected open(id: string): Promise<void> {
    const snapshot = this.snapshot();
    const app = snapshot?.apps.find((each) => each.id === id);
    if (!snapshot || !app) return Promise.resolve();
    return this.workbench.report(app.label, appReport(app, snapshot));
  }

  protected connections(): Promise<void> {
    const snapshot = this.snapshot();
    return snapshot ? this.workbench.report('Verbindungen', edgesReport(snapshot)) : Promise.resolve();
  }

  protected draw(): Promise<void> {
    const snapshot = this.snapshot();
    if (!snapshot) return Promise.resolve();
    const support = (tech: string) => techSupport(tech, this.releases.allIssues(), this.status.today());
    return this.workbench.picture('Landkarte', planSvg(landscapePlan(snapshot, support)));
  }

  protected scan(): Promise<void> {
    return this.task.run(async () => {
      this.status.working.set('Workspace wird gescannt');
      try {
        const snapshot = await this.landscape.scan();
        return `${snapshot.apps.length} Apps gescannt`;
      } finally {
        this.status.working.set(null);
      }
    });
  }
}
