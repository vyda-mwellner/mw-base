import { Component, inject, signal } from '@angular/core';

import { HouseStatus } from '../../../house/state/house-status';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { injectTask } from '../../../ui/task';
import { Workbench } from '../../../workbench/workbench';
import { searchReport } from '../../domain/deploy-reports';
import { DeployState } from '../../state/deploy-state';

/** The computer in the office: where a ticket, a text or a hash went, over every repo and stage. */
@Component({
  templateUrl: './search-sheet.html',
})
export class SearchSheet {
  private readonly deploy = inject(DeployState);
  private readonly status = inject(HouseStatus);
  private readonly workbench = inject(Workbench);
  private readonly task = injectTask();

  protected readonly term = signal('');
  protected readonly busy = this.task.busy;

  constructor() {
    injectSheetKeys(() => [{ keys: ['Q'], label: 'Suche' }]);
  }

  protected search(): Promise<void> {
    const term = this.term().trim();
    if (!term) return Promise.resolve();
    return this.task.run(async () => {
      this.status.working.set(`Commits zu ${term} werden gesucht`);
      try {
        await this.workbench.report(`Commits zu ${term}`, searchReport(term, await this.deploy.search(term)));
      } finally {
        this.status.working.set(null);
      }
    });
  }
}
