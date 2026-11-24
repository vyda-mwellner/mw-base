import { Injectable } from '@angular/core';

import { call } from '../../core/ipc';
import type { ErrorCount, Forwards, Incidents, LogReport, LogRequest, Workload } from '../model/cluster';
import type { Env } from '../model/env';

@Injectable({ providedIn: 'root' })
export class ClusterApi {
  overview(env: Env): Promise<Workload[]> {
    return call<Workload[]>('cluster_overview', { env });
  }

  incidents(): Promise<Incidents> {
    return call<Incidents>('cluster_incidents');
  }

  errors(env: Env): Promise<ErrorCount[]> {
    return call<ErrorCount[]>('cluster_errors', { env });
  }

  logs(request: LogRequest): Promise<LogReport> {
    return call<LogReport>('cluster_logs', { ...request });
  }

  forwards(): Promise<Forwards> {
    return call<Forwards>('list_forwards');
  }

  startForward(env: Env, id: string): Promise<Forwards> {
    return call<Forwards>('start_forward', { env, id });
  }

  stopForward(env: Env, id: string): Promise<Forwards> {
    return call<Forwards>('stop_forward', { env, id });
  }
}
