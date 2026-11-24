import { Component, computed, input } from '@angular/core';

import { Part, shapesOf } from '../../engine/oblique';

/** Boxes and discs drawn at a slant, the origin on the floor at the front left. */
@Component({
  selector: '[app-solids]',
  templateUrl: './solids.html',
  styleUrl: './solids.scss',
})
export class Solids {
  readonly parts = input.required<readonly Part[]>();

  protected readonly shapes = computed(() => this.parts().flatMap(shapesOf));
}
