import { booleanAttribute, Component, computed, input } from '@angular/core';

import { SLANT, tone } from '../../engine/oblique';
import { DOOR, LEAF_OUT } from '../../engine/shell';

/**
 * A door out of the house, in the left wall of a cell. Shut it lies in the wall; opening it swings out on its
 * far hinge until it shows its face.
 */
@Component({
  selector: '[app-outer-door]',
  templateUrl: './outer-door.html',
  styleUrl: './outer-door.scss',
  host: { '[style.--vl-run]': 'slant.x', '[style.--vl-rise]': 'slant.y' },
})
export class OuterDoor {
  readonly open = input(false, { transform: booleanAttribute });
  /** The side the open air is on: 1 to the right of the wall, -1 to its left. */
  readonly out = input.required<1 | -1>();
  readonly glass = input.required<string>();
  readonly wood = input.required<string>();

  protected readonly slant = SLANT;
  protected readonly doorway = DOOR;
  protected readonly leaf = LEAF_OUT;
  protected readonly hinge = `translate(${LEAF_OUT.hinge.join(' ')})`;
  protected readonly edge = computed(() => tone(this.wood(), -0.58));
  protected readonly lit = computed(() => tone(this.wood(), 0.55));
}
