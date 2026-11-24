import { computed, inject, Injectable, resource, signal } from '@angular/core';

import { errorMessage } from '../../core/ipc';
import { poll } from '../../core/poll';
import { WorkshopApi } from '../data/workshop-api';

/** While the mailbox is open, so a mail shows up a moment after the app sent it. */
const WATCHED_POLL_MS = 5_000;
/** For the letters in the mailbox of the workshop. */
const IDLE_POLL_MS = 60_000;

/** Every mailbox of the local Greenmail, newest first. */
@Injectable({ providedIn: 'root' })
export class MailState {
  private readonly api = inject(WorkshopApi);

  private readonly watchers = signal(0);
  private readonly inboxResource = resource({ loader: () => this.api.mails() });

  /** Null until Greenmail answered once. */
  readonly mails = computed(() => (this.inboxResource.hasValue() ? this.inboxResource.value() : null));
  readonly error = computed(() => errorMessage(this.inboxResource.error()));

  constructor() {
    poll(this.inboxResource, WATCHED_POLL_MS, () => this.watchers() > 0);
    poll(this.inboxResource, IDLE_POLL_MS, () => this.watchers() === 0);
  }

  /** Returns the call that ends it. */
  watch(): () => void {
    this.watchers.update((count) => count + 1);
    this.inboxResource.reload();
    return () => this.watchers.update((count) => count - 1);
  }

  async purge(): Promise<void> {
    try {
      await this.api.purgeMails();
    } finally {
      this.inboxResource.reload();
    }
  }
}
