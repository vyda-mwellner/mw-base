import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { injectConfirmTwice } from '../../../ui/confirm-twice';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { injectTask } from '../../../ui/task';
import { mailRow, matches } from '../../domain/mail-rows';
import { MailState } from '../../state/mail-state';

/** The mailboxes of the local Greenmail as one list, newest first; Enter opens a mail. */
@Component({
  imports: [RouterLink],
  templateUrl: './mail-sheet.html',
  styleUrl: './mail-sheet.scss',
})
export class MailSheet {
  private readonly state = inject(MailState);
  private readonly task = injectTask();

  protected readonly filter = signal('');
  private readonly twice = injectConfirmTwice();

  protected readonly error = this.state.error;
  protected readonly loading = computed(() => this.state.mails() === null && this.error() === null);
  protected readonly total = computed(() => this.state.mails()?.length ?? 0);
  protected readonly rows = computed(() => {
    const now = Date.now();
    return (this.state.mails() ?? [])
      .filter((mail) => matches(mail, this.filter()))
      .map((mail) => mailRow(mail, now));
  });
  protected readonly count = computed(() =>
    this.filter().trim() ? `${this.rows().length} von ${this.total()}` : String(this.total()),
  );
  protected readonly purgeLabel = computed(() =>
    this.twice.armed() ? 'Nochmal E: alle Mails löschen' : 'Alle löschen',
  );

  constructor() {
    inject(DestroyRef).onDestroy(this.state.watch());
    injectSheetKeys(() => [
      { keys: ['Q'], label: 'Filter' },
      ...(this.total() > 0 ? [{ keys: ['E'], label: 'Alle löschen' }] : []),
    ]);
  }

  protected purge(): Promise<void> {
    if (!this.twice.confirm('purge')) return Promise.resolve();
    return this.task.run(async () => {
      await this.state.purge();
      return 'Alle Mails gelöscht';
    });
  }
}
