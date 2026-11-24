import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { arm } from '../../../ui/key-walk/key-walk';
import { injectTask } from '../../../ui/task';
import { parseCommand } from '../../domain/command-parser';
import { commandSteps } from '../../domain/command-steps';
import { DevServerState } from '../../state/dev-server-state';
import { DockerState } from '../../state/docker-state';

/**
 * Befehl, on the workbench from anywhere with B: a field to dictate or type into, like "starte shop-gui und den
 * mail container". Below it what the command would do; Enter does it.
 */
@Component({
  selector: 'app-command-sheet',
  templateUrl: './command-sheet.html',
  styleUrl: './command-sheet.scss',
})
export class CommandSheet {
  private readonly servers = inject(DevServerState);
  private readonly docker = inject(DockerState);
  private readonly task = injectTask();
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected readonly text = signal('');
  private readonly parsed = computed(() =>
    parseCommand(this.text(), {
      servers: (this.servers.servers() ?? []).map(({ id, label, repo }) => ({ id, label, repo })),
      favorites: this.servers.favorites(),
      stacks: (this.docker.stacks() ?? []).map(({ name, defaultStack }) => ({ name, defaultStack })),
    }),
  );
  protected readonly steps = computed(() =>
    commandSteps(this.parsed(), this.servers.servers() ?? [], this.docker.stacks() ?? []),
  );
  protected readonly unknown = computed(() => this.parsed().unknown.join(', '));
  protected readonly verbMissing = computed(() => this.parsed().verbMissing);
  protected readonly canRun = computed(() => !this.task.busy() && this.steps().length > 0);

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(this.servers.watch());
    destroy.onDestroy(this.docker.watch());
    // Open for typing right away, so the paste of a dictation tool lands in it.
    afterNextRender(() => {
      const field = this.field().nativeElement;
      field.focus();
      arm(field);
    });
  }

  protected run(): Promise<void> {
    const { servers, stacks } = this.parsed();
    const steps = this.steps();
    if (steps.length === 0) return Promise.resolve();
    return this.task.run(async () => {
      this.docker.changeStacks(stacks);
      await this.servers.apply(servers);
      this.text.set('');
      return steps.map((step) => `${step.verb}: ${step.names}`).join(' · ');
    });
  }
}
