import { computed, inject, Injectable, resource, signal } from '@angular/core';

import { errorMessage } from '../../core/ipc';
import { poll } from '../../core/poll';
import type { Tone } from '../../engine/model';
import { ClusterApi } from '../data/cluster-api';
import { workloadRow } from '../domain/workload-rows';
import type {
  ErrorCount,
  ForwardStatus,
  Incidents,
  LogReport,
  LogRequest,
  Since,
  Workload,
} from '../model/cluster';
import { Env, ENV_LABELS, ENVS } from '../model/env';

const OVERVIEW_POLL_MS = 30_000;
/** Counting reads three hours of logs of every app, too much for every 30 seconds. */
const ERRORS_POLL_MS = 300_000;
/** Notices a forward that died; the list itself costs no kubectl call. */
const FORWARDS_POLL_MS = 5_000;

/** The worst of a stage's apps as the overview last saw them, for the monitors in the server room. */
function worstOf(workloads: readonly Workload[], now: number): Tone | null {
  const health = workloads.map((workload) => workloadRow(workload, now).health);
  if (health.includes('danger')) return 'danger';
  if (health.includes('warning')) return 'warning';
  return null;
}

/**
 * The backends on DEV, TEST and PROD, their logs, restarts and port-forwards. kubectl only runs while a sheet
 * of the cluster is open (`watch`); the restarts and the forwards are read from what the shell keeps anyway.
 * Logs stay in memory only, they may hold health data of PROD.
 */
@Injectable({ providedIn: 'root' })
export class ClusterState {
  private readonly api = inject(ClusterApi);

  private readonly watchers = signal(0);
  private readonly selectedEnv = signal<Env>('dev');
  private readonly sinceChoice = signal<Since>('1h');
  private readonly forwardInFlight = signal<string | null>(null);
  private readonly forwardFailure = signal<string | null>(null);
  private readonly seen = signal<Partial<Record<Env, Tone | null>>>({});

  private readonly incidentsResource = resource({ loader: () => this.api.incidents() });
  private readonly overviewResource = resource({
    params: () => (this.watchers() > 0 ? this.selectedEnv() : undefined),
    loader: async ({ params }) => {
      const workloads = await this.api.overview(params);
      this.seen.update((seen) => ({ ...seen, [params]: worstOf(workloads, Date.now()) }));
      // Rust notes a restart while it reads the overview, so the signs are only current after it.
      this.incidentsResource.reload();
      return workloads;
    },
  });
  private readonly errorsResource = resource({
    params: () => (this.watchers() > 0 ? this.selectedEnv() : undefined),
    loader: ({ params }) => this.api.errors(params),
  });
  private readonly forwardsResource = resource({ loader: () => this.api.forwards() });

  readonly env = this.selectedEnv.asReadonly();
  readonly workloads = computed(() =>
    this.overviewResource.hasValue() ? this.overviewResource.value() : [],
  );
  readonly isLoading = this.overviewResource.isLoading;
  readonly error = computed(() => errorMessage(this.overviewResource.error()));
  readonly incidents = computed((): Incidents =>
    this.incidentsResource.hasValue() ? this.incidentsResource.value() : {},
  );
  readonly incidentsError = computed(() => errorMessage(this.incidentsResource.error()));
  /** The worst state each stage showed the last time it was read; a stage not read yet is missing. */
  readonly stageTones = this.seen.asReadonly();

  /** A failed call, like a closed PROD tunnel, marks every app instead of leaving them "counting" for 5 minutes. */
  readonly errorCounts = computed((): ErrorCount[] => {
    const failure = errorMessage(this.errorsResource.error());
    if (failure)
      return this.workloads().map((workload) => ({
        id: workload.id,
        errors: null,
        warnings: null,
        error: failure,
      }));
    return this.errorsResource.hasValue() ? this.errorsResource.value() : [];
  });

  readonly since = this.sinceChoice.asReadonly();

  private readonly forwardList = computed(() =>
    this.forwardsResource.hasValue() ? this.forwardsResource.value() : null,
  );
  readonly allForwardTargets = computed(() => this.forwardList()?.targets ?? []);
  readonly forwardTargets = computed(() =>
    this.allForwardTargets().filter(
      (target) => target.envs.length === 0 || target.envs.includes(this.selectedEnv()),
    ),
  );
  readonly runningForwards = computed(() => this.forwardList()?.running ?? []);
  readonly forwardBusy = this.forwardInFlight.asReadonly();
  readonly forwardError = computed(
    () => this.forwardFailure() ?? errorMessage(this.forwardsResource.error()),
  );

  constructor() {
    poll(this.overviewResource, OVERVIEW_POLL_MS, () => this.watchers() > 0);
    poll(this.errorsResource, ERRORS_POLL_MS, () => this.watchers() > 0);
    poll(this.forwardsResource, FORWARDS_POLL_MS);
  }

  /** A sheet that shows the cluster keeps kubectl reading while it is open; the returned function lets go. */
  watch(): () => void {
    this.watchers.update((count) => count + 1);
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      this.watchers.update((count) => count - 1);
    };
  }

  /** The open logs stay open, so the same backend can be compared across stages. */
  selectEnv(env: Env): void {
    this.selectedEnv.set(env);
    this.forwardFailure.set(null);
  }

  reload(): void {
    this.overviewResource.reload();
    this.errorsResource.reload();
    this.incidentsResource.reload();
  }

  /** Reads every stage once, so the restart sign and the monitors are current without a sheet open; what failed, by stage. */
  async readAll(): Promise<string[]> {
    const failures: string[] = [];
    for (const env of ENVS) {
      try {
        const workloads = await this.api.overview(env);
        this.seen.update((seen) => ({ ...seen, [env]: worstOf(workloads, Date.now()) }));
      } catch (error) {
        failures.push(`${ENV_LABELS[env]}: ${errorMessage(error)}`);
      }
    }
    this.incidentsResource.reload();
    return failures;
  }

  /** The logs of one app on the selected stage, over the chosen time, grouped into problems by the shell. */
  logs(appId: string): Promise<LogReport> {
    const request: LogRequest = { env: this.selectedEnv(), appId, since: this.sinceChoice() };
    return this.api.logs(request);
  }

  changeSince(since: Since): void {
    this.sinceChoice.set(since);
  }

  startForward(id: string): Promise<void> {
    const env = this.selectedEnv();
    return this.changeForwards(`${env}/${id}`, () => this.api.startForward(env, id));
  }

  stopForward(forward: ForwardStatus): Promise<void> {
    return this.changeForwards(`${forward.env}/${forward.id}`, () =>
      this.api.stopForward(forward.env, forward.id),
    );
  }

  /** Every running forward ended, as the key board in the entrance offers; how many there were. */
  async stopAll(): Promise<number> {
    const running = this.runningForwards().filter((forward) => forward.running);
    for (const forward of running) await this.stopForward(forward);
    return running.length;
  }

  private async changeForwards(key: string, change: () => ReturnType<ClusterApi['forwards']>): Promise<void> {
    this.forwardInFlight.set(key);
    this.forwardFailure.set(null);
    try {
      this.forwardsResource.set(await change());
    } catch (error) {
      this.forwardFailure.set(errorMessage(error));
      this.forwardsResource.reload();
      throw error;
    } finally {
      this.forwardInFlight.set(null);
    }
  }
}
