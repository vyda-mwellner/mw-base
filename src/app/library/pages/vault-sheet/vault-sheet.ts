import { Component, computed, inject, signal } from '@angular/core';

import { HouseStatus } from '../../../house/state/house-status';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { injectTask } from '../../../ui/task';
import { Workbench } from '../../../workbench/workbench';
import { linkedNote, noteFacts, shelves } from '../../domain/shelves';
import { LibraryState } from '../../state/library-state';

/** The knowledge vault as shelves, one per top folder; Enter lays a note on the workbench to read. */
@Component({
  templateUrl: './vault-sheet.html',
  styleUrl: './vault-sheet.scss',
})
export class VaultSheet {
  private readonly library = inject(LibraryState);
  private readonly status = inject(HouseStatus);
  private readonly workbench = inject(Workbench);
  private readonly task = injectTask();

  protected readonly filter = signal('');
  protected readonly error = this.library.error;
  protected readonly loading = computed(() => this.library.categories() === null && this.error() === null);
  protected readonly shelves = computed(() => shelves(this.library.categories() ?? [], this.filter()));
  protected readonly empty = computed(() => this.shelves().every((shelf) => shelf.rows.length === 0));

  constructor() {
    this.library.reload();
    injectSheetKeys(() => [{ keys: ['Q'], label: 'Filter' }]);
  }

  protected open(path: string): Promise<void> {
    return this.task.run(async () => {
      this.status.working.set('Notiz wird gelesen');
      try {
        const note = await this.library.note(path);
        await this.workbench.note({
          title: note.title,
          markdown: note.body,
          facts: noteFacts(note),
          follow: (href) => {
            const target = linkedNote(path, href);
            if (target) void this.open(target);
          },
        });
      } finally {
        this.status.working.set(null);
      }
    });
  }
}
