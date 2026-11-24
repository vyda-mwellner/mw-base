import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';

/** Every typed letter in that order somewhere in the name, as IntelliJ matches: "ordserv" finds OrderService.kt. */
const matches = (name: string, query: string): boolean => {
  let at = 0;
  for (const letter of name.toLowerCase()) if (letter === query[at]) at++;
  return at === query.length;
};

/** A popup like IntelliJ's Recent Files or Go to File: type to narrow it down, ↑ ↓ to pick, Enter to open. */
@Component({
  selector: 'app-goto-popup',
  templateUrl: './goto-popup.html',
  styleUrl: './goto-popup.scss',
})
export class GotoPopup {
  readonly title = input.required<string>();
  readonly entries = input.required<readonly string[]>();
  readonly opened = output<string>();
  readonly closed = output<void>();

  protected readonly query = signal('');
  protected readonly hits = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.entries().filter((entry) => matches(entry, query));
  });
  protected readonly picked = linkedSignal({ source: this.hits, computation: () => 0 });
  protected readonly rows = computed(() =>
    this.hits().map((file, index) => ({ file, on: index === this.picked() })),
  );

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  constructor() {
    afterNextRender(() => this.field().nativeElement.focus());
  }

  protected typed(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected key(event: KeyboardEvent): void {
    const count = this.hits().length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (count > 0) this.picked.update((at) => (at + (event.key === 'ArrowDown' ? 1 : count - 1)) % count);
    } else if (event.key === 'Enter') {
      const file = this.hits()[this.picked()];
      if (file) this.opened.emit(file);
    } else if (event.key === 'Escape') {
      this.closed.emit();
    } else {
      return;
    }
    event.preventDefault();
  }
}
