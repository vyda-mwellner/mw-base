import { Component, computed, ElementRef, input, model, viewChild } from '@angular/core';

import { arm, isArmed } from '../../ui/key-walk/key-walk';

/** Search in the text under it: Enter goes to the next match, Shift and Enter to the one before. */
@Component({
  selector: 'app-find-bar',
  templateUrl: './find-bar.html',
  host: { '(document:keydown)': 'focusOnShortcut($event)' },
})
export class FindBar {
  readonly total = input.required<number>();
  readonly label = input.required<string>();
  readonly query = model('');
  readonly active = model(0);

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected readonly count = computed(() => {
    if (this.query().trim() === '') return '';
    const total = this.total();
    return total > 0 ? `${this.active() + 1} / ${total}, Enter springt weiter` : 'Keine Treffer.';
  });

  protected fieldKey(event: KeyboardEvent): void {
    // While the field is shut, Enter opens it: see `KeyWalk`.
    if (event.key === 'Enter' && isArmed(this.field().nativeElement)) {
      event.preventDefault();
      const total = this.total();
      const step = event.shiftKey ? -1 : 1;
      if (total > 0) this.active.update((index) => (index + step + total) % total);
    } else if (event.key === 'Escape' && this.query() !== '') {
      // The first Escape clears the search, the next one leaves the sheet.
      event.preventDefault();
      this.query.set('');
    }
  }

  protected focusOnShortcut(event: KeyboardEvent): void {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f') return;
    event.preventDefault();
    const field = this.field().nativeElement;
    field.focus();
    arm(field);
    field.select();
  }
}
