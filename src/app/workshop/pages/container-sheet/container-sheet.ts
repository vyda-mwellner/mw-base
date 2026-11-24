import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';

import { injectConfirmTwice } from '../../../ui/confirm-twice';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { injectTask } from '../../../ui/task';
import { HEALTH_TONE, looseServices, stackRow, type StackRow } from '../../domain/stack-rows';
import { DockerState } from '../../state/docker-state';
import { HealthState } from '../../state/health-state';

const ALL = '*';

/**
 * The stacks of local-setup as rows: Enter starts one or starts it anew, X stops it. Stopping takes the data of
 * a stack with it, so it needs the key twice.
 */
@Component({
  templateUrl: './container-sheet.html',
  styleUrl: './container-sheet.scss',
})
export class ContainerSheet {
  private readonly docker = inject(DockerState);
  private readonly health = inject(HealthState);
  private readonly task = injectTask();
  /** The stack whose stop waits for the second key, or every stack. */
  private readonly twice = injectConfirmTwice();
  private readonly output = viewChild<ElementRef<HTMLPreElement>>('output');
  /** The output follows new lines unless it was scrolled up to read. */
  private follow = true;

  protected readonly error = this.docker.error;
  protected readonly busy = this.docker.busy;
  protected readonly log = this.docker.log;
  protected readonly runError = this.docker.runError;
  protected readonly loading = computed(() => this.docker.stacks() === null && this.error() === null);
  protected readonly rows = computed(() =>
    (this.docker.stacks() ?? []).map((stack) => {
      const row = stackRow(stack, this.health.services(), this.busy());
      const armed = this.twice.armed() === row.name;
      return {
        ...row,
        note: armed ? `Nochmal X: stoppt ${row.name}, seine Daten sind weg` : row.note,
        noteTone: armed ? 'danger' : row.noteTone,
        action: `${row.name} ${row.running ? 'neu starten' : 'starten'}`,
        stop: `${row.name} stoppen`,
      };
    }),
  );
  protected readonly runningCount = computed(() => this.rows().filter((row) => row.running).length);
  protected readonly stopAllLabel = computed(() =>
    this.twice.armed() === ALL ? 'Nochmal E: alle Daten sind weg' : 'Alle stoppen',
  );
  protected readonly others = computed(() =>
    this.docker.others().map((container) => ({
      id: container.id,
      name: container.name,
      note: `${container.image} · ${container.status}`,
    })),
  );
  protected readonly services = computed(() =>
    looseServices(this.health.services()).map((service) => ({
      id: service.id,
      label: service.label,
      note: `${service.target} · ${service.detail}`,
      tone: HEALTH_TONE[service.health],
    })),
  );
  protected readonly logState = computed(() =>
    this.busy() ? 'läuft' : this.runError() ? 'fehlgeschlagen' : 'fertig',
  );

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(this.docker.watch());
    destroy.onDestroy(this.health.watch());
    injectSheetKeys(() => [
      { keys: ['Q'], label: 'Standard starten' },
      { keys: ['E'], label: 'Alle stoppen' },
      { keys: ['X'], label: 'Stack stoppen' },
    ]);
    afterRenderEffect(() => {
      this.log();
      const output = this.output()?.nativeElement;
      if (output && this.follow) output.scrollTop = output.scrollHeight;
    });
  }

  protected primary(row: StackRow): Promise<void> {
    return this.act(() => this.docker.change(row.name, row.running ? 'restart' : 'up'));
  }

  protected stop(row: StackRow): Promise<void> {
    if (!this.twice.confirm(row.name)) return Promise.resolve();
    return this.act(() => this.docker.change(row.name, 'down'));
  }

  protected startDefaults(): Promise<void> {
    return this.act(() => this.docker.startDefaults());
  }

  protected stopAll(): Promise<void> {
    if (!this.twice.confirm(ALL)) return Promise.resolve();
    return this.act(() => this.docker.stopAll());
  }

  protected closeLog(): void {
    this.docker.closeLog();
  }

  protected scrolled(output: HTMLElement): void {
    this.follow = output.scrollHeight - output.scrollTop - output.clientHeight < 24;
  }

  /** A run goes on in the background; the sheet only refuses a second one. */
  private act(run: () => Promise<void>): Promise<void> {
    this.twice.disarm();
    return this.task.run(async () => {
      if (this.busy()) throw new Error('Es läuft noch ein Setup-Lauf');
      this.follow = true;
      void run();
    });
  }
}
