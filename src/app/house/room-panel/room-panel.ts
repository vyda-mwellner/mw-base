import { Component, computed, inject, input } from '@angular/core';

import { ROOMS, thingKey } from '../../engine/plan';
import { BACK, RoomMenu } from '../state/room-menu';
import { HouseStatus } from '../state/house-status';

/** The menu under a room: what stands in it, and the way back. The cursor follows the arrow keys. */
@Component({
  templateUrl: './room-panel.html',
  styleUrl: './room-panel.scss',
})
export class RoomPanel {
  /** The room id from the route. */
  readonly room = input.required<string>();

  private readonly status = inject(HouseStatus);
  private readonly menu = inject(RoomMenu);

  protected readonly view = computed(() => {
    const room = ROOMS.find((candidate) => candidate.id === this.room());
    const selected = this.menu.selected();
    const things = (room?.things ?? []).map((thing) => {
      const note = this.status.notes().get(thingKey(room!, thing));
      return {
        id: thing.id,
        label: thing.label,
        text: note?.text ?? '',
        tone: note?.tone ?? null,
      };
    });
    const entries = [...things, { id: BACK, label: 'Zurück ins Gebäude', text: '', tone: null }];
    return {
      empty: things.length === 0,
      entries: entries.map((entry) => ({ ...entry, current: entry.id === selected ? 'true' : null })),
    };
  });
}
