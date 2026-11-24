import { Injectable } from '@angular/core';

import { call } from '../../core/ipc';
import type { Connection, ParamValues, QueryDefinition, SectionResult } from '../model/database';

@Injectable({ providedIn: 'root' })
export class DatabaseApi {
  connections(): Promise<Connection[]> {
    return call<Connection[]>('list_connections');
  }

  unlock(id: string, password: string): Promise<Connection> {
    return call<Connection>('unlock_connection', { id, password });
  }

  lock(id: string): Promise<void> {
    return call<void>('lock_connection', { id });
  }

  queries(): Promise<QueryDefinition[]> {
    return call<QueryDefinition[]>('list_queries');
  }

  run(queryId: string, connectionId: string, params: ParamValues): Promise<SectionResult[]> {
    return call<SectionResult[]>('run_query', { queryId, connectionId, params });
  }
}
