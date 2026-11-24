import { Injectable } from '@angular/core';

import { call } from '../../core/ipc';
import type { UsageDay } from '../model/usage';

@Injectable({ providedIn: 'root' })
export class RoofApi {
  /** `since` like `20261101`. */
  usage(since: string): Promise<UsageDay[]> {
    return call<UsageDay[]>('claude_usage', { since });
  }
}
