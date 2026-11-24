import { Component, computed, DestroyRef, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { mailFields, size, subjectOf } from '../../domain/mail-rows';
import { MailState } from '../../state/mail-state';

/** One mail of the local Greenmail: who sent it to whom, its attachments, and the mail as the recipient sees it. */
@Component({
  templateUrl: './mail-page.html',
  styleUrl: './mail-page.scss',
})
export class MailPage {
  private readonly state = inject(MailState);
  private readonly sanitizer = inject(DomSanitizer);

  /** From the route `werkstatt/postfach/:id`. */
  readonly id = input.required<string>();

  protected readonly mail = computed(() => this.state.mails()?.find((mail) => mail.id === this.id()) ?? null);
  protected readonly loading = computed(() => this.state.mails() === null && this.state.error() === null);
  protected readonly subject = computed(() => {
    const mail = this.mail();
    return mail ? subjectOf(mail) : '';
  });
  protected readonly fields = computed(() => {
    const mail = this.mail();
    return mail ? mailFields(mail) : [];
  });
  protected readonly attachments = computed(() =>
    (this.mail()?.attachments ?? []).map((attachment, index) => ({
      key: index,
      name: attachment.name,
      note: `${attachment.contentType} · ${size(attachment.size)}`,
    })),
  );
  // No script runs in the frame (its sandbox has no allow-scripts), so the HTML of the mail may stay as it is.
  protected readonly body = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.mail()?.html ?? ''));

  constructor() {
    inject(DestroyRef).onDestroy(this.state.watch());
  }

  /** As tall as the mail, so the sheet scrolls it with the arrow keys like everything else. */
  protected fit(frame: HTMLIFrameElement): void {
    const height = frame.contentDocument?.documentElement.scrollHeight;
    if (height) frame.style.blockSize = `${height}px`;
  }
}
