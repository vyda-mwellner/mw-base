import { Injectable } from '@angular/core';

import { call } from '../../core/ipc';
import type { CommitSearch, DeployStatus } from '../model/deploy';

@Injectable({ providedIn: 'root' })
export class DeployApi {
  overview(): Promise<DeployStatus> {
    return call<DeployStatus>('deploy_overview');
  }

  /** Resolves with one line per repo that could not be fetched. */
  fetch(): Promise<string[]> {
    return call<string[]>('fetch_repos');
  }

  search(term: string): Promise<CommitSearch> {
    return call<CommitSearch>('search_commits', { term });
  }
}
