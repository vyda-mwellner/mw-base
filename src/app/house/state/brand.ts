import { computed, inject, Injectable, resource } from '@angular/core';

import { Store } from '../../ui/store';

interface BrandFile {
  readonly name?: string;
  readonly farbe?: string | readonly string[];
}

const BRAND_PATH = 'einstellungen/marke.json';
const LOGO_PATH = 'einstellungen/marke.svg';
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The name of the company on the signs of the building, kept in the data folder so the code names none. */
@Injectable({ providedIn: 'root' })
export class Brand {
  private readonly store = inject(Store);
  private readonly doc = resource({ loader: () => this.store.read<BrandFile>(BRAND_PATH) });
  private readonly logoDoc = resource({ loader: () => this.store.readText(LOGO_PATH) });

  /** In capitals, as the signs write it; empty while there is none. */
  readonly name = computed(() =>
    ((this.doc.hasValue() ? this.doc.value()?.name : null) ?? '').trim().toUpperCase(),
  );
  /** What the logo stands on, `#rrggbb` each: one color, or a list for a gradient from left to right. */
  readonly colors = computed(() => {
    const farbe = this.doc.hasValue() ? this.doc.value()?.farbe : null;
    return [farbe ?? []]
      .flat()
      .filter((color): color is string => typeof color === 'string')
      .map((color) => color.trim())
      .filter((color) => HEX.test(color));
  });
  /** The SVG source as it lies in the data folder; empty while there is none. */
  readonly logo = computed(() => (this.logoDoc.hasValue() ? (this.logoDoc.value() ?? '') : ''));
}
