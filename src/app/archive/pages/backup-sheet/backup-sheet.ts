import { Component, computed, inject } from '@angular/core';

import { MOMENT } from '../../../core/format';
import { HouseStatus } from '../../../house/state/house-status';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { injectTask } from '../../../ui/task';
import { entryRow, runSummary } from '../../domain/backup-rows';
import { ArchiveState } from '../../state/archive-state';

/** The chest in the archive: what the backup plan copies where, how its last run went, and Q to run it now. */
@Component({
  templateUrl: './backup-sheet.html',
  styleUrl: './backup-sheet.scss',
})
export class BackupSheet {
  private readonly archive = inject(ArchiveState);
  private readonly status = inject(HouseStatus);
  private readonly task = injectTask();

  protected readonly busy = this.task.busy;
  protected readonly error = this.archive.error;
  protected readonly plan = this.archive.plan;
  protected readonly rows = computed(() =>
    (this.plan()?.entries ?? []).map((entry) => entryRow(entry, this.archive.lastRun())),
  );
  protected readonly last = computed(() => {
    const run = this.archive.lastRun();
    return run ? `zuletzt ${MOMENT.format(run.ranAt)}` : 'noch nie';
  });

  constructor() {
    this.archive.reload();
    injectSheetKeys(() => (this.plan() ? [{ keys: ['Q'], label: 'Jetzt sichern' }] : []));
  }

  protected run(): Promise<void> {
    return this.task.run(async () => {
      this.status.working.set('Backup läuft');
      try {
        return runSummary((await this.archive.run()).outcomes);
      } finally {
        this.status.working.set(null);
      }
    });
  }
}
