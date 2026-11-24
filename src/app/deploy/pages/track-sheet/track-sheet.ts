import { Component, computed, inject, signal } from '@angular/core';

import { MOMENT } from '../../../core/format';
import { openExternal } from '../../../core/ipc';
import { HouseStatus } from '../../../house/state/house-status';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { injectTask } from '../../../ui/task';
import { Workbench } from '../../../workbench/workbench';
import { trackReport } from '../../domain/deploy-reports';
import { track } from '../../domain/tracks';
import { Env, ENV_LABELS, ENVS } from '../../model/deploy';
import { DeployState } from '../../state/deploy-state';

/** The model railway as a sheet: per repo the build on every stage, the GUIs per stage, the fetch of every repo. */
@Component({
  templateUrl: './track-sheet.html',
  styleUrl: './track-sheet.scss',
})
export class TrackSheet {
  private readonly deploy = inject(DeployState);
  private readonly status = inject(HouseStatus);
  private readonly workbench = inject(Workbench);
  private readonly task = injectTask();

  protected readonly guiEnv = signal<Env>('dev');
  protected readonly envs = ENVS.map((id) => ({ id, label: ENV_LABELS[id] }));
  protected readonly error = this.deploy.error;
  protected readonly loading = this.deploy.isLoading;
  protected readonly stand = computed(() => {
    const repo = this.deploy.stalestRepo();
    if (!repo) return '';
    return repo.fetchedAt === null
      ? `${repo.name} nie geholt`
      : `Stand ${MOMENT.format(repo.fetchedAt)}, am ältesten: ${repo.name}`;
  });
  protected readonly tracks = computed(() =>
    this.deploy.deploys().map((deploy) => {
      const plan = track(deploy);
      const waiting = [
        plan.toTest.keys.length > 0
          ? `${plan.toTest.keys.length}${plan.toTest.more ? '+' : ''} nach TEST`
          : '',
        plan.toProd.keys.length > 0
          ? `${plan.toProd.keys.length}${plan.toProd.more ? '+' : ''} nach PROD`
          : '',
      ].filter(Boolean);
      return {
        name: plan.name,
        github: deploy.github,
        action: deploy.github ? `${plan.name} auf GitHub öffnen` : plan.name,
        line: `${plan.kindLabel} · DEV ${plan.dev.text} · TEST ${plan.test.text} · PROD ${plan.prod.text}`,
        waiting: waiting.join(' · ') || 'nichts wartet',
        pending: waiting.length > 0,
      };
    }),
  );
  protected readonly guis = computed(() => {
    const env = this.guiEnv();
    return this.deploy.links().map((link) => {
      const url = link.urls[env] ?? null;
      return {
        id: link.id,
        label: link.label,
        url,
        note: url ?? `läuft laut gitops nicht auf ${ENV_LABELS[env]}`,
        action: `${link.label} auf ${ENV_LABELS[env]} öffnen`,
      };
    });
  });

  constructor() {
    this.deploy.reload();
    injectSheetKeys(() => [
      { keys: ['Q'], label: 'Alle fetchen' },
      { keys: ['E'], label: 'Tabelle' },
      { keys: ['G'], label: 'GUI-Stage' },
    ]);
  }

  protected fetchAll(): Promise<void> {
    return this.task.run(async () => {
      this.status.working.set('Alle Repos werden geholt');
      try {
        const failures = await this.deploy.fetchAll();
        if (failures.length > 0) throw new Error(failures.join(' · '));
        return 'Alle Repos geholt';
      } finally {
        this.status.working.set(null);
      }
    });
  }

  protected table(): Promise<void> {
    const repo = this.deploy.stalestRepo();
    return this.workbench.report('Gleisplan', trackReport(this.deploy.deploys(), repo?.fetchedAt ?? null));
  }

  protected selectGuiEnv(env: string): void {
    this.guiEnv.set(env as Env);
  }

  protected open(url: string | null, browser: 'Google Chrome' | 'Firefox' = 'Google Chrome'): Promise<void> {
    return url ? openExternal(url, browser) : Promise.resolve();
  }
}
