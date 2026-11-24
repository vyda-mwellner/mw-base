import { computed, inject, Injectable, linkedSignal } from '@angular/core';

import { spotOf, thingNear } from '../../engine/plan';
import type { Place } from '../../engine/model';
import { Figure } from './figure';
import { Whereabouts } from './whereabouts';

/** The last entry of every room's menu: out of the room, back to the house. */
export const BACK = 'zurueck';

/** The menu under a room: its things and the way back, with a cursor that the arrow keys move. */
@Injectable({ providedIn: 'root' })
export class RoomMenu {
  private readonly whereabouts = inject(Whereabouts);
  private readonly figure = inject(Figure);

  private readonly room = computed(() => this.whereabouts.place().room);

  /** The thing the figure stands at, in the room on screen. */
  readonly near = computed(() => {
    const { room, thing } = this.whereabouts.place();
    return room && !thing && this.figure.room() === room ? thingNear(room, this.figure.pose().x) : null;
  });

  // The cursor is on the thing that is open. A new room starts with it on what the figure stands at, or on its first thing.
  private readonly cursor = linkedSignal<Place, string>({
    source: this.whereabouts.place,
    computation: (place, previous) => {
      if (place.thing) return place.thing.id;
      if (previous?.source.room === place.room) return previous.value;
      return this.near()?.id ?? place.room?.things[0]?.id ?? BACK;
    },
  });
  readonly selected = this.cursor.asReadonly();
  readonly selectedThing = computed(
    () => this.room()?.things.find((thing) => thing.id === this.cursor()) ?? null,
  );

  /** One entry down or up, round the ends. Onto a thing, the figure walks there. */
  move(step: 1 | -1): void {
    const room = this.room();
    if (!room) return;
    const entries = [...room.things.map((thing) => thing.id), BACK];
    const next = entries[(entries.indexOf(this.cursor()) + step + entries.length) % entries.length];
    this.cursor.set(next);
    const spot = spotOf({ room, thing: room.things.find((thing) => thing.id === next) ?? null });
    if (next !== BACK && spot) this.figure.goTo(spot);
  }

  /** After walking by hand: the cursor goes to the thing the figure stopped at. */
  pickNear(): void {
    const near = this.near();
    if (near) this.cursor.set(near.id);
  }
}
