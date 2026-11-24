import { Component, computed, inject } from '@angular/core';

import { NUMBER } from '../../../core/format';
import { HouseStatus } from '../../../house/state/house-status';
import { dayLabel, distance, floorsText, movementOf, NO_MOVEMENT, stepsText } from '../../domain/movement';
import { MovementState } from '../../state/movement-state';

/** Shown days, newest first. */
const SHOWN = 30;

/** The board on the roof terrace as a sheet: how far the figure walked and rode today, and on each day before. */
@Component({
  templateUrl: './movement-sheet.html',
  styleUrl: './movement-sheet.scss',
})
export class MovementSheet {
  private readonly movement = inject(MovementState);
  private readonly status = inject(HouseStatus);

  protected readonly tiles = computed(() => {
    const { steps, metres, floors } = movementOf(this.movement.today() ?? NO_MOVEMENT);
    return [
      { label: 'Schritte', value: NUMBER.format(steps) },
      { label: 'Strecke', value: distance(metres) },
      { label: 'Etagen', value: NUMBER.format(floors) },
    ];
  });
  protected readonly days = computed(() => {
    const today = this.status.today();
    return Object.entries(this.movement.log())
      .filter(([day]) => day !== today)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, SHOWN)
      .map(([day, covered]) => {
        const { steps, metres, floors } = movementOf(covered);
        return {
          day,
          label: dayLabel(day),
          note: `${distance(metres)} · ${floorsText(floors)}`,
          value: stepsText(steps),
        };
      });
  });
}
