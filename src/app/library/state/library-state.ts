import { computed, inject, Injectable, resource } from '@angular/core';

import { errorMessage } from '../../core/ipc';
import { LibraryApi } from '../data/library-api';
import type { NoteContent } from '../model/note';

/** The notes of the knowledge vault, read once and again whenever the vault sheet opens. */
@Injectable({ providedIn: 'root' })
export class LibraryState {
  private readonly api = inject(LibraryApi);
  private readonly listResource = resource({ loader: () => this.api.notes() });

  /** Null until the vault was read once. */
  readonly categories = computed(() => (this.listResource.hasValue() ? this.listResource.value() : null));
  readonly error = computed(() => errorMessage(this.listResource.error()));

  reload(): void {
    this.listResource.reload();
  }

  note(path: string): Promise<NoteContent> {
    return this.api.note(path);
  }
}
