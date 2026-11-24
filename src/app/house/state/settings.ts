import { computed, inject, Injectable, resource } from '@angular/core';

import { Store } from '../../ui/store';

interface SettingsFile {
  readonly sound?: boolean;
}

const SETTINGS_PATH = 'haus/einstellungen.json';

@Injectable({ providedIn: 'root' })
export class Settings {
  private readonly store = inject(Store);
  private readonly doc = resource({ loader: () => this.store.read<SettingsFile>(SETTINGS_PATH) });

  readonly sound = computed(() => (this.doc.hasValue() ? this.doc.value()?.sound : undefined) ?? true);

  async toggleSound(): Promise<void> {
    const file: SettingsFile = { sound: !this.sound() };
    await this.store.write(SETTINGS_PATH, file);
    this.doc.set(file);
  }
}
