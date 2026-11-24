import { computed, inject, Injectable, resource, signal } from '@angular/core';

import { errorMessage } from '../../core/ipc';
import { poll } from '../../core/poll';
import { WorkshopApi } from '../data/workshop-api';
import type { SetupCommand, ShownLine, StackAction, StackChange } from '../model/docker';

/** While the container sheet is open, so a card turns over soon after a container does. */
const WATCHED_POLL_MS = 5_000;
/** For the container stack in the workshop; docker ps is cheap, but not free. */
const IDLE_POLL_MS = 30_000;
const MAX_LOG_LINES = 2_000;

/**
 * The stacks of local-setup and the setup runs that start and stop them. App-wide on purpose: a run goes on and
 * keeps its output while the figure walks elsewhere, and the container stack shows what runs.
 */
@Injectable({ providedIn: 'root' })
export class DockerState {
  private readonly api = inject(WorkshopApi);

  private readonly watchers = signal(0);
  private readonly running = signal<SetupCommand | null>(null);
  private readonly lines = signal<readonly ShownLine[]>([]);
  private seq = 0;
  private readonly failure = signal<string | null>(null);
  private readonly overviewResource = resource({ loader: () => this.api.docker() });

  /** Null until docker answered once. */
  readonly stacks = computed(() =>
    this.overviewResource.hasValue() ? this.overviewResource.value().stacks : null,
  );
  readonly others = computed(() =>
    this.overviewResource.hasValue() ? this.overviewResource.value().others : [],
  );
  readonly error = computed(() => errorMessage(this.overviewResource.error()));
  readonly busy = this.running.asReadonly();
  readonly log = this.lines.asReadonly();
  readonly runError = this.failure.asReadonly();

  constructor() {
    poll(this.overviewResource, WATCHED_POLL_MS, () => this.watchers() > 0);
    poll(this.overviewResource, IDLE_POLL_MS, () => this.watchers() === 0);
  }

  /** While a sheet shows the stacks they are read every few seconds. Returns the call that ends it. */
  watch(): () => void {
    this.watchers.update((count) => count + 1);
    this.overviewResource.reload();
    return () => this.watchers.update((count) => count - 1);
  }

  startDefaults(): Promise<void> {
    const defaults = (this.stacks() ?? []).filter((stack) => stack.defaultStack);
    return this.run(defaults.map((stack) => ({ kind: 'up', stack: stack.name })));
  }

  /** Stack by stack, so each row turns over on its own instead of all of them after one long run. */
  stopAll(): Promise<void> {
    const started = (this.stacks() ?? []).filter((stack) => stack.containers.length > 0);
    return this.run(started.map((stack) => ({ kind: 'down', stack: stack.name })));
  }

  change(stack: string, kind: StackAction): Promise<void> {
    return this.run([{ kind, stack }]);
  }

  /**
   * For a command: stops first, then starts, one setup run per stack, and leaves out stopping a stack without
   * containers. It runs on in the background with its output on the container sheet.
   */
  changeStacks(change: StackChange): void {
    const started = new Set(
      (this.stacks() ?? []).filter((stack) => stack.containers.length > 0).map((stack) => stack.name),
    );
    const commands: SetupCommand[] = [
      ...change.down
        .filter((stack) => started.has(stack))
        .map((stack): SetupCommand => ({ kind: 'down', stack })),
      ...change.up.map((stack): SetupCommand => ({ kind: 'up', stack })),
    ];
    if (commands.length === 0) return;
    if (this.running()) throw new Error('Es läuft noch ein Setup-Lauf');
    void this.run(commands);
  }

  closeLog(): void {
    if (this.running()) return;
    this.lines.set([]);
    this.failure.set(null);
  }

  /** Never throws: a failed step ends the run and stays as its error under the output. */
  private async run(commands: readonly SetupCommand[]): Promise<void> {
    if (this.running() || commands.length === 0) return;
    this.lines.set([]);
    this.failure.set(null);
    try {
      for (const command of commands) {
        this.running.set(command);
        await this.api.runSetup(command, (line) =>
          this.lines.update((lines) => [...lines.slice(-(MAX_LOG_LINES - 1)), { ...line, seq: this.seq++ }]),
        );
        this.overviewResource.reload();
      }
    } catch (error) {
      this.failure.set(errorMessage(error));
    } finally {
      this.running.set(null);
      this.overviewResource.reload();
    }
  }
}
