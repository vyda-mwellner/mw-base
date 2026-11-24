import { Component, computed, DestroyRef, inject } from '@angular/core';

import { HouseStatus } from '../../../house/state/house-status';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { injectTask } from '../../../ui/task';
import { Workbench } from '../../../workbench/workbench';
import { reportOf, workloadGroups, WorkloadRow } from '../../domain/workload-rows';
import { logsReport } from '../../domain/reports';
import { SINCE_CHOICES, Since } from '../../model/cluster';
import { Env, ENV_LABELS, ENVS } from '../../model/env';
import { ClusterState } from '../../state/cluster-state';

/** The backends of a stage as rows; Enter lays the logs of one on the workbench. */
@Component({
  templateUrl: './cluster-sheet.html',
  styleUrl: './cluster-sheet.scss',
})
export class ClusterSheet {
  private readonly cluster = inject(ClusterState);
  private readonly status = inject(HouseStatus);
  private readonly workbench = inject(Workbench);
  private readonly task = injectTask();

  protected readonly envs = ENVS.map((id) => ({ id, label: ENV_LABELS[id] }));
  protected readonly sinces = SINCE_CHOICES;
  protected readonly env = this.cluster.env;
  protected readonly since = this.cluster.since;
  protected readonly loading = this.cluster.isLoading;
  protected readonly error = this.cluster.error;
  protected readonly groups = computed(() =>
    workloadGroups(this.cluster.workloads(), Date.now(), this.cluster.errorCounts()).map((group) => ({
      name: group.name,
      rows: group.rows.map((row) => ({ ...row, line: reportOf(row) })),
    })),
  );

  constructor() {
    inject(DestroyRef).onDestroy(this.cluster.watch());
    injectSheetKeys(() => [
      { keys: ['Q'], label: 'Stage' },
      { keys: ['E'], label: 'Zeitraum' },
      { keys: ['R'], label: 'Neu lesen' },
    ]);
  }

  protected selectEnv(env: string): void {
    this.cluster.selectEnv(env as Env);
  }

  protected changeSince(since: string): void {
    this.cluster.changeSince(since as Since);
  }

  protected reload(): void {
    this.cluster.reload();
  }

  protected openLogs(row: WorkloadRow): Promise<void> {
    const stage = ENV_LABELS[this.env()];
    return this.task.run(async () => {
      this.status.working.set(`Logs von ${row.label} auf ${stage}`);
      try {
        const report = await this.cluster.logs(row.id);
        await this.workbench.report(`Logs ${row.label} ${stage}`, logsReport(row.label, stage, report));
      } finally {
        this.status.working.set(null);
      }
    });
  }
}
