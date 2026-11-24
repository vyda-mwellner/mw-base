import { Component, computed, DestroyRef, inject } from '@angular/core';

import { openExternal } from '../../../core/ipc';
import { HouseStatus } from '../../../house/state/house-status';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { injectTask } from '../../../ui/task';
import { Workbench } from '../../../workbench/workbench';
import { serverLogReport, serverRow, type ServerRow } from '../../domain/server-rows';
import { HEALTH_TONE } from '../../domain/stack-rows';
import { DevServerState } from '../../state/dev-server-state';
import { HealthState } from '../../state/health-state';

/**
 * The frontends as rows: Enter starts one or opens it in the browser, X stops it, F makes it a favorite and L
 * lays its output on the workbench. Below them the backends, which run in the IDE, with whether they answer.
 */
@Component({
  templateUrl: './devserver-sheet.html',
  styleUrl: './devserver-sheet.scss',
})
export class DevserverSheet {
  private readonly state = inject(DevServerState);
  private readonly health = inject(HealthState);
  private readonly status = inject(HouseStatus);
  private readonly workbench = inject(Workbench);
  private readonly task = injectTask();

  protected readonly error = this.state.error;
  protected readonly loading = computed(() => this.state.servers() === null && this.error() === null);
  protected readonly rows = computed(() =>
    (this.state.servers() ?? []).map((server) => {
      const row = serverRow(
        server,
        this.state.favorites().includes(server.id),
        this.state.pending().has(server.id),
      );
      return {
        ...row,
        action: row.open ? `${row.label} im Browser öffnen` : `${row.label} starten`,
        stop: `${row.label} stoppen`,
        favoriteAction: row.favorite ? `${row.label} kein Favorit mehr` : `${row.label} als Favorit`,
        logAction: `Ausgabe von ${row.label} auf den Schreibtisch`,
      };
    }),
  );
  protected readonly upCount = computed(() => this.rows().filter((row) => row.open).length);
  protected readonly backends = computed(() =>
    this.health
      .services()
      .filter((service) => service.kind === 'backend')
      .map((service) => ({
        id: service.id,
        label: service.label,
        note: `${service.target} · ${service.detail}`,
        tone: HEALTH_TONE[service.health],
      })),
  );

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(this.state.watch());
    destroy.onDestroy(this.health.watch());
    injectSheetKeys(() => [
      { keys: ['Q'], label: 'Favoriten starten' },
      { keys: ['E'], label: 'Alle stoppen' },
      { keys: ['X'], label: 'stoppen' },
      { keys: ['F'], label: 'Favorit' },
      { keys: ['L'], label: 'Ausgabe' },
    ]);
  }

  protected primary(row: ServerRow): Promise<void> {
    if (row.open) return openExternal(`http://localhost:${row.port}`);
    return this.task.run(async () => {
      if (!row.startable) return;
      await this.state.apply({ start: [row.id], stop: [] });
      return `${row.label} startet`;
    });
  }

  protected stop(row: ServerRow): Promise<void> {
    return this.task.run(async () => {
      await this.state.apply({ start: [], stop: [row.id] });
      return `${row.label} gestoppt`;
    });
  }

  protected toggleFavorite(row: ServerRow): Promise<void> {
    return this.task.run(() => this.state.toggleFavorite(row.id));
  }

  protected showLog(row: ServerRow): Promise<void> {
    return this.task.run(async () => {
      this.status.working.set(`Ausgabe von ${row.label}`);
      try {
        await this.workbench.report(
          `Ausgabe ${row.label}`,
          serverLogReport(row.label, await this.state.log(row.id)),
        );
      } finally {
        this.status.working.set(null);
      }
    });
  }

  protected startFavorites(): Promise<void> {
    return this.task.run(async () => {
      if (this.state.favorites().length === 0) throw new Error('Noch keine Favoriten: F auf einem Frontend');
      await this.state.startFavorites();
      return 'Favoriten starten';
    });
  }

  protected stopAll(): Promise<void> {
    return this.task.run(async () => {
      await this.state.stopAll();
      return 'Alle Dev-Server gestoppt';
    });
  }
}
