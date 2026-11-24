import { Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { openExternal } from '../../../core/ipc';
import { renderMarkdown } from '../../domain/markdown';
import { FindBar } from '../../find-bar/find-bar';
import { mermaidDrawings } from '../../state/diagrams';
import { htmlFinder } from '../../state/html-finder';
import { Workbench } from '../../workbench';

const EXTERNAL = /^(https?:|mailto:)/i;

/** A note on the workbench: its figures, the Markdown as GitHub renders it with its diagrams, and a search. */
@Component({
  selector: 'app-note-view',
  imports: [FindBar],
  templateUrl: './note-view.html',
})
export class NoteView {
  private readonly desk = inject(Workbench).desk;
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly page = computed(() => {
    const page = this.desk();
    return page?.kind === 'note' ? page : null;
  });
  private readonly markdown = computed(() => this.page()?.markdown ?? '');
  private readonly drawings = mermaidDrawings(this.markdown);
  private readonly html = computed(() => renderMarkdown(this.markdown(), this.drawings()));
  // The renderer filtered what may not run, mermaid cleans its drawings itself.
  protected readonly body = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.html()));

  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  protected readonly finder = htmlFinder(this.html, () => this.content()?.nativeElement);

  /** A followed link would take the window away from the app: it opens in the browser or as the next note. */
  protected click(event: MouseEvent): void {
    const link = (event.target as Element).closest('a[href]');
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute('href') ?? '';
    if (EXTERNAL.test(href)) void openExternal(href);
    else if (!href.startsWith('#')) this.page()?.follow(href);
  }
}
