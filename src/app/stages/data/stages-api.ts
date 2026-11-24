import { Injectable } from '@angular/core';

import { call } from '../../core/ipc';
import type { StagesInfo } from '../model/stages';

@Injectable({ providedIn: 'root' })
export class StagesApi {
  info(): Promise<StagesInfo> {
    return call<StagesInfo>('stages_info');
  }
}
