import { afterNextRender, Component, ElementRef, input, output, viewChild } from '@angular/core';

/** A field as IntelliJ asks for a name or a line: the value all picked, Enter takes it, Esc closes. */
@Component({
  selector: 'app-field-popup',
  templateUrl: './field-popup.html',
  styleUrl: './field-popup.scss',
})
export class FieldPopup {
  readonly title = input.required<string>();
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input.required<string>();
  readonly entered = output<string>();
  readonly closed = output<void>();

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  constructor() {
    afterNextRender(() => this.field().nativeElement.select());
  }

  protected key(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.entered.emit(this.field().nativeElement.value.trim());
    else if (event.key === 'Escape') this.closed.emit();
    else return;
    event.preventDefault();
  }
}
