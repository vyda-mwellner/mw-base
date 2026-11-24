import { Component, computed, inject } from '@angular/core';

import { injectSheetKeys } from '../../../ui/sheet-keys';
import { StagesInfoState } from '../../state/stages-info';

/** The building services: where the shell reads workspace and kubeconfigs from, and what of the config is missing. */
@Component({
  templateUrl: './setup-sheet.html',
  styleUrl: './setup-sheet.scss',
})
export class SetupSheet {
  private readonly state = inject(StagesInfoState);

  protected readonly error = this.state.error;
  protected readonly rows = computed(() => {
    const info = this.state.info();
    if (!info) return [];
    return [
      {
        label: 'Workspace',
        note: info.workspaceDir || 'nicht eingetragen',
        tone: info.workspaceFound ? 'ok' : 'danger',
        value: info.workspaceFound ? 'da' : 'fehlt',
      },
      {
        label: 'gitops',
        note: 'Checkout im Workspace, wie git/gitops.json ihn nennt',
        tone: info.gitopsFound ? 'ok' : 'danger',
        value: info.gitopsFound ? 'da' : 'fehlt',
      },
      {
        label: 'Kubeconfigs',
        note: info.kubeconfigDir,
        tone: info.kubeconfigEnvs.length > 0 ? 'ok' : 'warning',
        value: info.kubeconfigEnvs.map((env) => env.toUpperCase()).join(' ') || 'keine',
      },
      {
        label: 'local-setup',
        note: info.localSetupDir || 'localSetupDir oder local-setup im Workspace, mit setup.sh',
        tone: info.localSetupDir ? 'ok' : 'warning',
        value: info.localSetupDir ? 'da' : 'fehlt',
      },
      {
        label: 'Greenmail',
        note: info.greenmailUrl || 'greenmailUrl in einstellungen/pfade.json',
        tone: info.greenmailUrl ? 'ok' : 'warning',
        value: info.greenmailUrl ? 'da' : 'fehlt',
      },
      {
        label: 'Vault',
        note: info.vaultDir || 'vaultDir in einstellungen/pfade.json, der Ordner mit INDEX.md',
        tone: info.vaultDir ? 'ok' : 'warning',
        value: info.vaultDir ? 'da' : 'fehlt',
      },
    ];
  });
  protected readonly problems = computed(() => this.state.info()?.configErrors ?? []);
  protected readonly complete = computed(() => this.state.info() !== null && this.problems().length === 0);

  constructor() {
    this.state.reload();
    injectSheetKeys(() => [{ keys: ['Q'], label: 'Neu prüfen' }]);
  }

  protected reload(): void {
    this.state.reload();
  }
}
