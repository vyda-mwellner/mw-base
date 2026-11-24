import { Injectable } from '@angular/core';

import { call } from '../../core/ipc';
import type { Outcome, Plan } from '../model/backup';

@Injectable({ providedIn: 'root' })
export class ArchiveApi {
  plan(): Promise<Plan> {
    return call<Plan>('backup_plan');
  }

  run(): Promise<Outcome[]> {
    return call<Outcome[]>('run_backup');
  }
}
