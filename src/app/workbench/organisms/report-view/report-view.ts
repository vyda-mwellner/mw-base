import { Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { keyOf, writes } from '../../../ui/key-walk/key-walk';
import { Toasts } from '../../../ui/toasts';
import { FindBar } from '../../find-bar/find-bar';
import { htmlFinder } from '../../state/html-finder';
import { Workbench } from '../../workbench';

/** The report that lies open on the workbench, with a search over it; A and D turn its first dial. */
@Component({
  selector: 'app-report-view',
  imports: [FindBar],
  templateUrl: './report-view.html',
  styleUrl: './report-view.scss',
  host: { '(document:keydown)': 'turn($event)' },
})
export class ReportView {
  private readonly desk = inject(Workbench).desk;
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toasts = inject(Toasts);

  protected readonly page = computed(() => {
    const page = this.desk();
    return page?.kind === 'report' ? page : null;
  });
  // HTML the app built itself: the sanitizer would strip the data attributes that carry the tones.
  protected readonly body = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.page()?.body ?? ''));

  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  protected readonly finder = htmlFinder(
    () => this.page()?.body ?? '',
    () => this.content()?.nativeElement,
  );

  protected turn(event: KeyboardEvent): void {
    const dial = this.page()?.dials[0];
    const key = keyOf(event);
    if (!dial || event.metaKey || event.ctrlKey || event.altKey || (key !== 'a' && key !== 'd')) return;
    if (writes(document.activeElement)) return;
    event.preventDefault();
    const index = dial.options.indexOf(dial.value) + (key === 'd' ? 1 : -1);
    const next = dial.options[Math.min(Math.max(index, 0), dial.options.length - 1)];
    if (next !== undefined && next !== dial.value) dial.pick(next);
  }

  /** The buttons in a report are HTML, not Angular: their clicks are picked up here. */
  protected act(event: MouseEvent): void {
    const trigger = (event.target as Element).closest<HTMLElement>('[data-action]');
    const action = trigger?.dataset['action'];
    if (!trigger || !action) return;
    if (action === 'copy') {
      const text = trigger.parentElement?.querySelector('pre')?.textContent ?? '';
      navigator.clipboard.writeText(text).then(
        () => this.toasts.success('Kopiert'),
        () => this.toasts.error('Nicht kopierbar'),
      );
      return;
    }
    this.page()?.actions[action]?.(trigger.dataset);
  }
}
