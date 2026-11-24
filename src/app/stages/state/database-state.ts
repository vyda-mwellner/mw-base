import { computed, DestroyRef, inject, Injectable, linkedSignal, resource, signal } from '@angular/core';

import { errorMessage } from '../../core/ipc';
import { DatabaseApi } from '../data/database-api';
import type {
  ConnectionStatus,
  ParamValues,
  QueryArea,
  QueryDefinition,
  QueryParam,
  SectionResult,
} from '../model/database';

interface RunRequest {
  readonly queryId: string;
  readonly connectionId: string;
  readonly params: ParamValues;
}

export interface Run {
  readonly request: RunRequest;
  readonly results: SectionResult[];
  readonly ranAt: number;
}

const CLOCK_TICK_MS = 30_000;
const RESULT_TTL_MS = 10 * 60 * 60_000;

const defaultValue = (param: QueryParam): string => (param.kind === 'choice' ? (param.options[0] ?? '') : '');
const runKey = (queryId: string | null, connectionId: string): string => `${queryId}@${connectionId}`;

/**
 * The predefined queries against LOCAL, DEV, TEST and PROD. Passwords live in the shell for 10 hours, results here
 * for as long, in memory only: a result stays readable once the connection is locked again.
 */
@Injectable({ providedIn: 'root' })
export class DatabaseState {
  private readonly api = inject(DatabaseApi);

  private readonly now = signal(Date.now());
  private readonly connectionsResource = resource({ loader: () => this.api.connections(), defaultValue: [] });
  private readonly queriesResource = resource({ loader: () => this.api.queries(), defaultValue: [] });
  /** Keeps the choice while the connection is there, falls back to LOCAL or the first one otherwise. */
  private readonly selectedConnectionId = linkedSignal<string[], string>({
    source: () => this.connections().map((connection) => connection.id),
    computation: (ids, previous) => {
      if (previous && ids.includes(previous.value)) return previous.value;
      return ids.includes('local') || ids.length === 0 ? 'local' : ids[0];
    },
  });
  /** Keyed by param name, so a batch id survives switching between queries. */
  private readonly paramValues = signal<ParamValues>({});

  private readonly allQueries = computed(() =>
    this.queriesResource.hasValue() ? this.queriesResource.value() : [],
  );
  private readonly matchingQueries = computed(() =>
    this.allQueries().filter(
      (query) => query.connections.length === 0 || query.connections.includes(this.selectedConnectionId()),
    ),
  );
  private readonly selectedQueryId = linkedSignal<QueryDefinition[], string | null>({
    source: this.matchingQueries,
    computation: (queries, previous) =>
      previous && queries.some((query) => query.id === previous.value)
        ? previous.value
        : (queries[0]?.id ?? null),
  });

  private readonly recentRuns = new Map<string, Run>();
  private readonly lastRun = signal<Run | null>(null);
  private readonly running = signal(false);

  readonly connections = computed<ConnectionStatus[]>(() =>
    (this.connectionsResource.hasValue() ? this.connectionsResource.value() : []).map((connection) => ({
      ...connection,
      locked: connection.requiresPassword && (connection.unlockedUntil ?? 0) <= this.now(),
    })),
  );
  readonly selectedConnection = computed(
    () => this.connections().find((connection) => connection.id === this.selectedConnectionId()) ?? null,
  );
  readonly areas = computed<QueryArea[]>(() => {
    const areas: QueryArea[] = [];
    for (const query of this.matchingQueries()) {
      const area = areas.find((candidate) => candidate.name === query.area);
      if (area) area.queries.push(query);
      else areas.push({ name: query.area, queries: [query] });
    }
    return areas;
  });
  readonly selectedQuery = computed(
    () => this.matchingQueries().find((query) => query.id === this.selectedQueryId()) ?? null,
  );
  readonly params = computed(() => {
    const values = this.paramValues();
    return Object.fromEntries(
      (this.selectedQuery()?.params ?? []).map((param) => [
        param.name,
        values[param.name] ?? defaultValue(param),
      ]),
    );
  });
  readonly configError = computed(
    () => errorMessage(this.connectionsResource.error()) ?? errorMessage(this.queriesResource.error()),
  );
  readonly isLoadingDefinitions = computed(
    () => this.connectionsResource.isLoading() || this.queriesResource.isLoading(),
  );
  readonly isRunning = this.running.asReadonly();
  readonly last = this.lastRun.asReadonly();
  readonly canRun = computed(() => {
    const connection = this.selectedConnection();
    const complete = Object.values(this.params()).every((value) => value.trim() !== '');
    return !!connection && !connection.locked && !!this.selectedQuery() && complete && !this.running();
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), CLOCK_TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  selectConnection(id: string): void {
    this.selectedConnectionId.set(id);
  }

  /**
   * Its choices start again from their first option, unless it ran here lately: then they are what they were. What
   * was typed stays.
   */
  selectQuery(id: string): void {
    this.selectedQueryId.set(id);
    const choices = (this.allQueries().find((query) => query.id === id)?.params ?? [])
      .filter((param) => param.kind === 'choice')
      .map((param) => [param.name, defaultValue(param)]);
    const run = this.recentRun(runKey(id, this.selectedConnectionId()));
    this.paramValues.update((values) => ({
      ...values,
      ...Object.fromEntries(choices),
      ...run?.request.params,
    }));
  }

  changeParam(name: string, value: string): void {
    this.paramValues.update((values) => ({ ...values, [name]: value }));
  }

  /** The result of the selected query on the selected connection from the last 10 hours, if there is one. */
  recent(): Run | null {
    return this.recentRun(runKey(this.selectedQueryId(), this.selectedConnectionId())) ?? null;
  }

  /** Always asks the database; the shell runs every section read-only in its own savepoint. */
  async runSelectedQuery(): Promise<Run> {
    const query = this.selectedQuery();
    const connection = this.selectedConnection();
    if (!query || !connection) throw new Error('Erst eine Verbindung und eine Abfrage wählen');
    if (connection.locked) throw new Error(`${connection.label} ist gesperrt: erst das Passwort eingeben`);
    const missing = query.params.find((param) => !(this.params()[param.name] ?? '').trim());
    if (missing) throw new Error(`${missing.name} fehlt noch`);
    const request: RunRequest = { queryId: query.id, connectionId: connection.id, params: this.params() };
    this.running.set(true);
    try {
      const results = await this.api.run(request.queryId, request.connectionId, request.params);
      const run: Run = { request, results, ranAt: Date.now() };
      this.recentRuns.set(runKey(request.queryId, request.connectionId), run);
      this.lastRun.set(run);
      return run;
    } catch (error) {
      // The password may have run out in the meantime.
      this.connectionsResource.reload();
      throw error;
    } finally {
      this.running.set(false);
    }
  }

  async unlock(id: string, password: string): Promise<void> {
    await this.api.unlock(id, password);
    this.now.set(Date.now());
    this.connectionsResource.reload();
  }

  async lock(id: string): Promise<void> {
    await this.api.lock(id);
    this.connectionsResource.reload();
  }

  /** Every password out of memory again, as the key board in the entrance offers. */
  async lockAll(): Promise<number> {
    const open = this.connections().filter((connection) => connection.requiresPassword && !connection.locked);
    for (const connection of open) await this.api.lock(connection.id);
    this.connectionsResource.reload();
    return open.length;
  }

  reloadDefinitions(): void {
    this.connectionsResource.reload();
    this.queriesResource.reload();
  }

  private recentRun(key: string): Run | undefined {
    const run = this.recentRuns.get(key);
    return run && Date.now() - run.ranAt < RESULT_TTL_MS ? run : undefined;
  }
}
