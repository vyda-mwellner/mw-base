import { Component, computed, DestroyRef, inject } from '@angular/core';

import { plural } from '../../../core/format';
import { ENV_LABELS } from '../../../stages/model/env';
import { ClusterState } from '../../../stages/state/cluster-state';
import { injectConfirmTwice } from '../../../ui/confirm-twice';
import { injectTask } from '../../../ui/task';
import { STOPPABLE } from '../../../workshop/model/dev-server';
import { DevServerState } from '../../../workshop/state/dev-server-state';
import { DockerState } from '../../../workshop/state/docker-state';
import { HouseStatus } from '../../state/house-status';

const ALL_STACKS = 'all-stacks';

/** At the car: what the day came to, what still runs and can be stopped here, and when the next day is. */
@Component({
  selector: 'app-farewell-sheet',
  templateUrl: './farewell-sheet.html',
  styleUrl: './farewell-sheet.scss',
})
export class FarewellSheet {
  private readonly status = inject(HouseStatus);
  private readonly docker = inject(DockerState);
  private readonly cluster = inject(ClusterState);
  private readonly devServers = inject(DevServerState);
  private readonly task = injectTask();
  private readonly twice = injectConfirmTwice();

  protected readonly day = computed(() => this.status.farewell());
  protected readonly stacks = computed(() =>
    (this.docker.stacks() ?? [])
      .filter((stack) => stack.containers.length > 0)
      .map((stack) => ({ name: stack.name, note: `${stack.containers.length} Container` })),
  );
  protected readonly forwards = computed(() =>
    this.cluster
      .runningForwards()
      .filter((forward) => forward.running)
      .map((forward) => ({
        key: `${forward.env}/${forward.id}`,
        label: forward.label,
        note: `${ENV_LABELS[forward.env]} · localhost:${forward.localPort}`,
      })),
  );
  protected readonly servers = computed(() =>
    (this.devServers.servers() ?? [])
      .filter((server) => STOPPABLE.includes(server.phase))
      .map((server) => ({ id: server.id, label: server.label, note: `localhost:${server.port}` })),
  );
  protected readonly calm = computed(
    () => this.stacks().length === 0 && this.forwards().length === 0 && this.servers().length === 0,
  );
  protected readonly stopping = computed(() => this.docker.busy() !== null);
  protected readonly stopStacksLabel = computed(() => {
    if (this.stopping()) return 'Stacks werden gestoppt';
    return this.twice.armed() === ALL_STACKS ? 'Nochmal Enter: alle Daten sind weg' : 'Alle Stacks stoppen';
  });

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(this.docker.watch());
    destroy.onDestroy(this.devServers.watch());
  }

  protected stopStacks(): Promise<void> {
    if (!this.twice.confirm(ALL_STACKS)) return Promise.resolve();
    return this.task.run(async () => {
      void this.docker.stopAll();
    });
  }

  protected stopServers(): Promise<void> {
    return this.task.run(async () => {
      await this.devServers.stopAll();
      return 'Alle Dev-Server gestoppt';
    });
  }

  protected stopForwards(): Promise<void> {
    return this.task.run(async () => {
      const count = await this.cluster.stopAll();
      return `${plural(count, 'Forward', 'Forwards')} gestoppt`;
    });
  }
}
