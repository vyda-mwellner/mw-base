import { Component, computed, input } from '@angular/core';

import { placeOf } from '../../engine/plan';

/** What a thing opens until it has a sheet of its own: a route `<room>/<thing>` in `app.routes.ts` replaces it. */
@Component({
  template: `
    <h2 class="gm-plaque">{{ label() }}</h2>
    <p class="gm-empty">Hier ist noch nichts eingebaut.</p>
    <p class="gm-hint">
      Ein eigenes Blatt bekommt es mit der Route <code>{{ key() }}</code> in <code>app.routes.ts</code>.
    </p>
  `,
})
export class PlaceholderSheet {
  readonly room = input.required<string>();
  readonly thing = input.required<string>();

  protected readonly key = computed(() => `${this.room()}/${this.thing()}`);
  protected readonly label = computed(() => placeOf(this.key()).thing?.label ?? this.thing());
}
