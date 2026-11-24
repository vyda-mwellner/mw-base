import { Component, computed, inject } from '@angular/core';

import { CLOCK } from '../../../core/format';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { injectTask } from '../../../ui/task';
import type { ForwardStatus } from '../../model/cluster';
import { Env, ENV_LABELS, ENVS } from '../../model/env';
import { ClusterState } from '../../state/cluster-state';

/** The port-forwards of `stages/forwards.json`: Enter starts one on the chosen stage, or stops it again. */
@Component({
  templateUrl: './forwards-sheet.html',
  styleUrl: './forwards-sheet.scss',
})
export class ForwardsSheet {
  private readonly cluster = inject(ClusterState);
  private readonly task = injectTask();

  protected readonly envs = ENVS.map((id) => ({ id, label: ENV_LABELS[id] }));
  protected readonly env = this.cluster.env;
  protected readonly error = this.cluster.forwardError;
  protected readonly busy = this.cluster.forwardBusy;
  protected readonly targets = computed(() => {
    const env = this.env();
    return this.cluster.forwardTargets().map((target) => {
      const running = this.cluster
        .runningForwards()
        .find((forward) => forward.env === env && forward.id === target.id);
      return {
        target,
        running: running ?? null,
        tone: running ? (running.running ? 'ok' : 'danger') : null,
        noteTone: running && !running.running ? 'danger' : null,
        note: running
          ? running.running
            ? `läuft seit ${CLOCK.format(running.startedAt)} auf localhost:${target.localPort}`
            : (running.error ?? 'beendet')
          : `localhost:${target.localPort}`,
        action: `${target.label} auf ${ENV_LABELS[env]} ${running?.running ? 'stoppen' : 'starten'}`,
      };
    });
  });
  protected readonly running = computed(() =>
    this.cluster
      .runningForwards()
      .filter((forward) => forward.running)
      .map((forward) => ({
        forward,
        key: `${forward.env}/${forward.id}`,
        label: `${ENV_LABELS[forward.env]} · ${forward.label}`,
        note: `localhost:${forward.localPort} seit ${CLOCK.format(forward.startedAt)}`,
        action: `${forward.label} auf ${ENV_LABELS[forward.env]} stoppen`,
      })),
  );

  constructor() {
    injectSheetKeys(() => [{ keys: ['Q'], label: 'Stage' }]);
  }

  protected selectEnv(env: string): void {
    this.cluster.selectEnv(env as Env);
  }

  protected toggle(id: string, running: ForwardStatus | null): Promise<void> {
    const env = ENV_LABELS[this.env()];
    return this.task.run(async () => {
      if (running?.running) {
        await this.cluster.stopForward(running);
        return `${running.label} auf ${env} gestoppt`;
      }
      await this.cluster.startForward(id);
      return `Forward auf ${env} gestartet`;
    });
  }

  protected stop(forward: ForwardStatus): Promise<void> {
    return this.task.run(async () => {
      await this.cluster.stopForward(forward);
      return `${forward.label} auf ${ENV_LABELS[forward.env]} gestoppt`;
    });
  }
}
