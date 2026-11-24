import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { search, type Hit } from '../../domain/project';

/** What was found, and with what, so the find window can list it all. */
export interface Found {
  readonly hit: Hit;
  readonly query: string;
}

/** Find in Files as IntelliJ shows it: a field, every line that matches with its place, Enter opens the picked one. */
@Component({
  selector: 'app-find-popup',
  templateUrl: './find-popup.html',
  styleUrl: './find-popup.scss',
})
export class FindPopup {
  readonly opened = output<Found>();
  readonly closed = output<void>();

  protected readonly query = signal('');
  private readonly hits = computed(() => search(this.query()));
  protected readonly picked = linkedSignal({ source: this.hits, computation: () => 0 });
  protected readonly rows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.hits().map((hit, index) => {
      const text = hit.text.trim();
      const at = text.toLowerCase().indexOf(query);
      return {
        key: `${hit.file}:${hit.line}`,
        on: index === this.picked(),
        before: text.slice(0, at),
        match: text.slice(at, at + query.length),
        after: text.slice(at + query.length),
        place: `${hit.file} ${hit.line}`,
      };
    });
  });
  protected readonly count = computed(() => {
    const count = this.hits().length;
    return this.query().trim() === '' ? '' : `${count} Treffer`;
  });

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
      const hit = this.hits()[this.picked()];
      if (hit) this.opened.emit({ hit, query: this.query().trim() });
    } else if (event.key === 'Escape') {
      this.closed.emit();
    } else {
      return;
    }
    event.preventDefault();
  }
}
