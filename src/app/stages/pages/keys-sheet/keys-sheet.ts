import { Component, computed, inject } from '@angular/core';

import { CLOCK } from '../../../core/format';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { injectTask } from '../../../ui/task';
import type { ForwardStatus } from '../../model/cluster';
import type { ConnectionStatus } from '../../model/database';
import { ENV_LABELS } from '../../model/env';
import { ClusterState } from '../../state/cluster-state';
import { DatabaseState } from '../../state/database-state';

/** The key board by the counter: every unlocked password and running forward, to close one by one or all at once. */
@Component({
  templateUrl: './keys-sheet.html',
  styleUrl: './keys-sheet.scss',
})
export class KeysSheet {
  private readonly cluster = inject(ClusterState);
  private readonly database = inject(DatabaseState);
  private readonly task = injectTask();

  protected readonly passwords = computed(() =>
    this.database
      .connections()
      .filter((connection) => connection.requiresPassword && !connection.locked)
      .map((connection) => ({
        connection,
        note: `offen bis ${CLOCK.format(connection.unlockedUntil ?? 0)}`,
        tone: connection.production ? 'warning' : 'ok',
        action: `${connection.label} sperren`,
      })),
  );
  protected readonly forwards = computed(() =>
    this.cluster
      .runningForwards()
      .filter((forward) => forward.running)
      .map((forward) => ({
        forward,
        key: `${forward.env}/${forward.id}`,
        label: `${ENV_LABELS[forward.env]} · ${forward.label}`,
        note: `localhost:${forward.localPort} seit ${CLOCK.format(forward.startedAt)}`,
        tone: forward.env === 'prod' ? 'warning' : 'ok',
        action: `${forward.label} auf ${ENV_LABELS[forward.env]} stoppen`,
      })),
  );
  protected readonly empty = computed(() => this.passwords().length + this.forwards().length === 0);

  constructor() {
    injectSheetKeys(() => (this.empty() ? [] : [{ keys: ['Q'], label: 'Alles zu' }]));
  }

  protected lock(connection: ConnectionStatus): Promise<void> {
    return this.task.run(async () => {
      await this.database.lock(connection.id);
      return `${connection.label} gesperrt`;
    });
  }

  protected stop(forward: ForwardStatus): Promise<void> {
    return this.task.run(async () => {
      await this.cluster.stopForward(forward);
      return `${forward.label} auf ${ENV_LABELS[forward.env]} gestoppt`;
    });
  }

  protected closeAll(): Promise<void> {
    return this.task.run(async () => {
      const passwords = await this.database.lockAll();
      const forwards = await this.cluster.stopAll();
      return `Alles zu: ${passwords} Passwörter, ${forwards} Forwards`;
    });
  }
}
