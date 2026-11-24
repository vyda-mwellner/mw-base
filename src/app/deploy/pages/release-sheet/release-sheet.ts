import { Component, computed, inject, signal } from '@angular/core';

import { openExternal } from '../../../core/ipc';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { injectTask } from '../../../ui/task';
import { releaseHtml, releaseText, subjectLine } from '../../domain/deploy-reports';
import { Env, ENV_LABELS } from '../../model/deploy';
import { DeployState } from '../../state/deploy-state';

/** What one stage has and the next still lacks, by ticket, and the list to copy into the release mail. */
@Component({
  templateUrl: './release-sheet.html',
  styleUrl: './release-sheet.scss',
})
export class ReleaseSheet {
  private readonly deploy = inject(DeployState);
  private readonly task = injectTask();

  /** PROD first: that is the list that goes into the release mail. */
  protected readonly target = signal<Env>('prod');
  protected readonly error = this.deploy.error;
  protected readonly stages = computed(() =>
    this.deploy.releases().map((release) => ({
      to: release.to,
      label: `${ENV_LABELS[release.from]} nach ${ENV_LABELS[release.to]} (${release.tickets.length})`,
    })),
  );
  private readonly release = computed(
    () =>
      this.deploy.releases().find((release) => release.to === this.target()) ??
      this.deploy.releases()[0] ??
      null,
  );
  protected readonly tickets = computed(() =>
    (this.release()?.tickets ?? []).map((ticket) => ({
      ...ticket,
      note: `${ticket.repos.join(', ')} · ${ticket.authors.join(', ')}`,
      action: `${ticket.key} in Jira öffnen`,
    })),
  );
  protected readonly untracked = computed(() =>
    (this.release()?.untracked ?? []).map((commit) => ({
      id: `${commit.repo}/${commit.shortSha}`,
      label: subjectLine(commit),
      note: `${commit.repo} · ${commit.shortSha}`,
    })),
  );
  protected readonly empty = computed(() => {
    const release = this.release();
    if (!release) return 'Noch nichts gelesen.';
    return `Auf ${ENV_LABELS[release.from]} liegt nichts, was ${ENV_LABELS[release.to]} noch fehlt.`;
  });

  constructor() {
    this.deploy.reload();
    injectSheetKeys(() => [
      { keys: ['Q'], label: 'Stufe' },
      { keys: ['E'], label: 'Kopieren' },
    ]);
  }

  protected selectTarget(to: string): void {
    this.target.set(to as Env);
  }

  protected open(url: string): Promise<void> {
    return openExternal(url);
  }

  protected copy(): Promise<void> {
    const release = this.release();
    if (!release) return Promise.resolve();
    return this.task.run(async () => {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([releaseText(release)], { type: 'text/plain' }),
          'text/html': new Blob([releaseHtml(release)], { type: 'text/html' }),
        }),
      ]);
      return `Release-Liste ${ENV_LABELS[release.from]} nach ${ENV_LABELS[release.to]} kopiert`;
    });
  }
}
