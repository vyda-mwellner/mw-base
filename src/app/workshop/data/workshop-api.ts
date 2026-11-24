import { Injectable } from '@angular/core';
import { Channel, isTauri } from '@tauri-apps/api/core';

import { call } from '../../core/ipc';
import type { DevServer } from '../model/dev-server';
import type { DockerOverview, LogLine, SetupCommand } from '../model/docker';
import type { ServiceHealth } from '../model/health';
import type { Snapshot } from '../model/landscape';
import type { Mail } from '../model/mail';

@Injectable({ providedIn: 'root' })
export class WorkshopApi {
  docker(): Promise<DockerOverview> {
    return call<DockerOverview>('docker_overview');
  }

  health(): Promise<ServiceHealth[]> {
    return call<ServiceHealth[]>('service_health');
  }

  devServers(): Promise<DevServer[]> {
    return call<DevServer[]>('list_dev_servers');
  }

  startDevServer(id: string): Promise<void> {
    return call<void>('start_dev_server', { id });
  }

  stopDevServer(id: string): Promise<void> {
    return call<void>('stop_dev_server', { id });
  }

  /** The last lines of a server the shell started, empty for any other. */
  devServerLog(id: string): Promise<string[]> {
    return call<string[]>('dev_server_log', { id });
  }

  /** The last scan, null before the first one. */
  landscape(): Promise<Snapshot | null> {
    return call<Snapshot | null>('landscape_scan');
  }

  scanLandscape(): Promise<Snapshot> {
    return call<Snapshot>('run_landscape_scan');
  }

  mails(): Promise<Mail[]> {
    return call<Mail[]>('mail_inbox');
  }

  purgeMails(): Promise<void> {
    return call<void>('purge_mail');
  }

  /** Resolves when the run is through; every line of its output arrives on the way. */
  runSetup(command: SetupCommand, onLine: (line: LogLine) => void): Promise<void> {
    // A channel needs the Tauri internals; outside the window `call` refuses anyway.
    const onLog = isTauri() ? new Channel<LogLine>(onLine) : undefined;
    return call<void>('run_setup', { command, onLog });
  }
}
