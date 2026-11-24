import {
  afterNextRender,
  afterRenderEffect,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';

import { FarewellSheet } from '../../../house/pages/farewell-sheet/farewell-sheet';
import { arm, isArmed, KeyWalk, writes } from '../../../ui/key-walk/key-walk';
import { CommandSheet } from '../../../workshop/pages/command-sheet/command-sheet';
import { DeskKeys, Workbench } from '../../workbench';
import { MarkdownTool } from '../markdown-tool/markdown-tool';
import { NoteView } from '../note-view/note-view';
import { PictureView } from '../picture-view/picture-view';
import { ReportView } from '../report-view/report-view';

/** What scrolls by itself in reports, notes and the preview: W and S stop there, the arrows scroll it. */
const SCROLLERS =
  '.wb-prose pre, .wb-prose .diagram, .wb-table-wrap, .wb-chart, .wb-trace, .wb-log, .mt-code';

/**
 * A layer over scene and panel for what needs the whole width: reports and tools. A desk for the mouse as much
 * as for the keys, so a field is open as soon as it has the focus.
 */
@Component({
  selector: 'app-workbench',
  imports: [CommandSheet, FarewellSheet, MarkdownTool, NoteView, PictureView, ReportView],
  templateUrl: './desk.html',
  styleUrl: './desk.scss',
  host: { '(document:focusin)': 'focused($event)' },
})
export class WorkbenchDesk implements DeskKeys {
  private readonly workbench = inject(Workbench);
  protected readonly desk = this.workbench.desk;
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  // A field here opens the moment it has the focus: W and S go past it, ⌘F and Q reach it.
  private readonly keys = new KeyWalk(0, 'input, select, textarea');

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.workbench.attach(this, destroyRef);
    // The arrow keys scroll what has the focus. A view in it that focused a field keeps it: its render hook may
    // run before this one.
    afterNextRender(() => {
      const body = this.body().nativeElement;
      if (!body.contains(document.activeElement)) body.focus({ preventScroll: true });
      // Reports and previews come in as HTML: whatever scrolls in them is marked as it arrives.
      const mark = (): void => {
        for (const box of body.querySelectorAll<HTMLElement>(SCROLLERS)) {
          if (box.hasAttribute('data-scroll')) continue;
          box.dataset['scroll'] = '';
          box.tabIndex = 0;
        }
      };
      mark();
      const watcher = new MutationObserver(mark);
      watcher.observe(body, { childList: true, subtree: true });
      destroyRef.onDestroy(() => watcher.disconnect());
    });
    // New content in place of the focused element drops the focus to the page, where the arrows scroll nothing.
    afterRenderEffect(() => {
      this.desk();
      const active = document.activeElement;
      if (active === null || active === document.body)
        this.body().nativeElement.focus({ preventScroll: true });
    });
  }

  /** Out of a field the desk takes the focus again, so the arrow keys scroll it. */
  leaveField(): void {
    this.body().nativeElement.focus({ preventScroll: true });
  }

  /** W and S go from button to link in a report or a note, as in a sheet; Enter then clicks what they are on. */
  walk(event: KeyboardEvent): void {
    if (!isArmed(document.activeElement)) this.keys.handle(event, this.body().nativeElement);
  }

  protected focused(event: FocusEvent): void {
    if (event.target instanceof HTMLElement && writes(event.target) && !isArmed(event.target))
      arm(event.target);
  }
}
