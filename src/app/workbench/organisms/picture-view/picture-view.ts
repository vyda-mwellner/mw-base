import { Component, computed, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { keyOf } from '../../../ui/key-walk/key-walk';
import { copySvgAsPng } from '../../../ui/png';
import { injectTask } from '../../../ui/task';
import { Workbench } from '../../workbench';

/** A drawing on the workbench; Q puts it on the clipboard as a PNG. */
@Component({
  selector: 'app-picture-view',
  templateUrl: './picture-view.html',
  styleUrl: './picture-view.scss',
  host: { '(document:keydown)': 'copyKey($event)' },
})
export class PictureView {
  private readonly desk = inject(Workbench).desk;
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly task = injectTask();

  protected readonly page = computed(() => {
    const page = this.desk();
    return page?.kind === 'picture' ? page : null;
  });
  // An SVG the app drew itself: the sanitizer would take it out whole.
  protected readonly drawing = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.page()?.svg ?? ''));

  protected copyKey(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey || keyOf(event) !== 'q') return;
    event.preventDefault();
    void this.copy();
  }

  protected copy(): Promise<void> {
    const page = this.page();
    if (!page) return Promise.resolve();
    return this.task.run(async () => {
      await copySvgAsPng(page.svg);
      return `${page.title} als Bild kopiert`;
    });
  }
}
