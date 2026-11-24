import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { arm, keyOf, writes } from '../../../ui/key-walk/key-walk';
import { injectTask } from '../../../ui/task';
import { measureMarkdown, renderMarkdown } from '../../domain/markdown';
import { FindBar } from '../../find-bar/find-bar';
import { mermaidDrawings } from '../../state/diagrams';
import { htmlFinder } from '../../state/html-finder';

const number = (count: number): string => count.toLocaleString('de-DE');
/** Typing on, the preview waits this long: parsing and drawing every key would only be thrown away. */
const SETTLE_MS = 150;

/** Markdown in, below it the preview as GitHub renders it, and its HTML to copy. */
@Component({
  selector: 'app-markdown-tool',
  imports: [FindBar],
  templateUrl: './markdown-tool.html',
  styleUrl: './markdown-tool.scss',
  host: { '(document:keydown)': 'toField($event)' },
})
export class MarkdownTool {
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly task = injectTask();

  /** What the field holds, key by key. */
  protected readonly markdown = signal('');
  /** What the preview shows: the field once typing has paused, a paste at once. */
  private readonly settled = signal('');
  private pending: ReturnType<typeof setTimeout> | undefined;
  protected readonly html = computed(() => (this.settled() ? renderMarkdown(this.settled()) : ''));
  private readonly drawings = mermaidDrawings(this.settled);
  private readonly drawn = computed(() =>
    this.settled() ? renderMarkdown(this.settled(), this.drawings()) : '',
  );
  // The renderer filtered what may not run, mermaid cleans its drawings itself; the sanitizer would also take
  // the boxes of task lists and every diagram.
  protected readonly trusted = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.drawn()));
  protected readonly showResult = computed(() => this.settled() !== '' && this.html() !== '');
  protected readonly figures = computed(() => {
    const stats = measureMarkdown(this.settled());
    return [
      { label: 'Zeilen', value: number(stats.lines) },
      { label: 'Abschnitte', value: number(stats.sections) },
      { label: 'Wörter', value: number(stats.words) },
      { label: 'Lesezeit', value: `${stats.readingMinutes} Min` },
      ...(stats.tasks > 0
        ? [{ label: 'Aufgaben erledigt', value: `${stats.doneTasks} / ${stats.tasks}` }]
        : []),
    ];
  });

  private readonly input = viewChild.required<ElementRef<HTMLTextAreaElement>>('input');
  private readonly preview = viewChild<ElementRef<HTMLElement>>('preview');
  protected readonly finder = htmlFinder(
    () => (this.showResult() ? this.drawn() : ''),
    () => this.preview()?.nativeElement,
  );

  constructor() {
    afterNextRender(() => this.input().nativeElement.focus());
    inject(DestroyRef).onDestroy(() => clearTimeout(this.pending));
  }

  protected write(text: string, event: Event): void {
    this.markdown.set(text);
    clearTimeout(this.pending);
    const pasted = event instanceof InputEvent && event.inputType === 'insertFromPaste';
    if (pasted || text === '') this.settled.set(text);
    else this.pending = setTimeout(() => this.settled.set(text), SETTLE_MS);
  }

  /** Q from anywhere on the desk: back into the field, its text selected, so a paste replaces it. */
  protected toField(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey || keyOf(event) !== 'q') return;
    if (writes(document.activeElement)) return;
    event.preventDefault();
    const field = this.input().nativeElement;
    field.focus();
    arm(field);
    field.select();
  }

  protected copy(): Promise<void> {
    return this.task.run(async () => {
      await navigator.clipboard.writeText(this.html());
      return 'HTML kopiert';
    });
  }
}
