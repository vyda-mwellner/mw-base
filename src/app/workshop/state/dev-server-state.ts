import { computed, inject, Injectable, resource, signal } from '@angular/core';

import { errorMessage } from '../../core/ipc';
import { poll } from '../../core/poll';
import { Store } from '../../ui/store';
import { WorkshopApi } from '../data/workshop-api';
import { DevServerPhase, ServerChange, STARTABLE, STOPPABLE } from '../model/dev-server';

/** Quick enough to see "baut" turn into "läuft"; a tick costs one port probe per frontend, no process. */
const WATCHED_POLL_MS = 3_000;
/** For the breakers in the workshop. */
const IDLE_POLL_MS = 30_000;
const FAVORITES_PATH = 'haus/dev-favoriten.json';

/** The frontends the shell can serve. App-wide: a server outlives its sheet, and a command starts servers too. */
@Injectable({ providedIn: 'root' })
export class DevServerState {
  private readonly api = inject(WorkshopApi);
  private readonly store = inject(Store);

  private readonly watchers = signal(0);
  private readonly listResource = resource({ loader: () => this.api.devServers() });
  private readonly favoritesDoc = resource({ loader: () => this.store.read<string[]>(FAVORITES_PATH) });
  private readonly inFlight = signal<ReadonlySet<string>>(new Set());

  /** Null until the shell answered once. */
  readonly servers = computed(() => (this.listResource.hasValue() ? this.listResource.value() : null));
  readonly error = computed(() => errorMessage(this.listResource.error()));
  /** The ones "Favoriten starten" and a command saying "alle" start. */
  readonly favorites = computed(
    () => (this.favoritesDoc.hasValue() ? this.favoritesDoc.value() : null) ?? [],
  );
  readonly pending = this.inFlight.asReadonly();

  constructor() {
    poll(this.listResource, WATCHED_POLL_MS, () => this.watchers() > 0);
    poll(this.listResource, IDLE_POLL_MS, () => this.watchers() === 0);
  }

  /** Returns the call that ends it. */
  watch(): () => void {
    this.watchers.update((count) => count + 1);
    this.listResource.reload();
    return () => this.watchers.update((count) => count - 1);
  }

  /**
   * Starts what is off and stops what the shell runs, the rest it leaves alone. Throws with one line per server
   * that failed, after all others are through.
   */
  async apply(change: ServerChange): Promise<void> {
    const tasks = [
      ...this.due(change.start, STARTABLE).map((id) => ({ id, run: () => this.api.startDevServer(id) })),
      ...this.due(change.stop, STOPPABLE).map((id) => ({ id, run: () => this.api.stopDevServer(id) })),
    ];
    const ids = tasks.map((task) => task.id);
    this.inFlight.update((pending) => new Set([...pending, ...ids]));
    const results = await Promise.allSettled(tasks.map((task) => task.run()));
    this.inFlight.update((pending) => new Set([...pending].filter((id) => !ids.includes(id))));
    this.listResource.reload();
    const failed = results.flatMap((result) =>
      result.status === 'rejected' ? [errorMessage(result.reason) ?? 'Unbekannter Fehler'] : [],
    );
    if (failed.length > 0) throw new Error(failed.join('\n'));
  }

  stopAll(): Promise<void> {
    return this.apply({ start: [], stop: (this.servers() ?? []).map((server) => server.id) });
  }

  startFavorites(): Promise<void> {
    return this.apply({ start: this.favorites(), stop: [] });
  }

  log(id: string): Promise<string[]> {
    return this.api.devServerLog(id);
  }

  async toggleFavorite(id: string): Promise<void> {
    const favorites = this.favorites().includes(id)
      ? this.favorites().filter((favorite) => favorite !== id)
      : [...this.favorites(), id];
    await this.store.write(FAVORITES_PATH, favorites);
    this.favoritesDoc.set(favorites);
  }

  private due(ids: readonly string[], phases: readonly DevServerPhase[]): string[] {
    const phaseOf = new Map((this.servers() ?? []).map((server) => [server.id, server.phase]));
    return ids.filter((id) => {
      const phase = phaseOf.get(id);
      return phase !== undefined && phases.includes(phase);
    });
  }
}
