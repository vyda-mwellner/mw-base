import { ROOM } from './geometry';
import type { Place } from './model';
import { FIT, roomBox, roomFloor, VIEW, WORLD, YARD_PAN } from './plan';

/** What the scene shows: the world scaled and shifted inside a viewport one device wide and `height` high. */
interface Camera {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

/** What stays in the picture around a room: the walls to either side, ceiling and slab. */
const FRAME = { left: 6, right: 10, top: 4, bottom: 8 } as const;
/** With a thing open only the lower part of the room stays visible above the sheet. */
const STRIP = 286;
/** How much wall the strip shows over a thing on the wall: the top of its frame and a little air. */
const OVER_THING = 14;

/** `inYard`: the figure is out of the front door, and the picture of the whole house moves over to the yard. */
export function cameraFor(place: Place, inYard = false): Camera {
  if (!place.room) {
    const x = (VIEW.width - WORLD.width * FIT) / 2 - (WORLD.left + (inYard ? YARD_PAN : 0)) * FIT;
    return { scale: FIT, x, y: VIEW.height - WORLD.height * FIT, height: VIEW.height };
  }
  const box = roomBox(place.room);
  // A room narrower than the others is not blown up to the width of the device: it sits in the middle.
  const scale = VIEW.width / (Math.max(box.width, ROOM.width) + FRAME.left + FRAME.right);
  const x = VIEW.width / 2 - (box.x + box.width / 2 + (FRAME.right - FRAME.left) / 2) * scale;
  const bottom = (roomFloor(place.room) + FRAME.bottom) * scale;
  if (place.thing) {
    // A thing on the wall that hangs higher than the strip reaches lifts the picture until all of it shows.
    const top = place.thing.lift === undefined ? 0 : place.thing.lift + place.thing.height + OVER_THING;
    const raise = Math.max(0, top + FRAME.bottom - STRIP / scale);
    return { scale, x, y: STRIP - bottom + raise * scale, height: STRIP };
  }
  const top = (box.y - FRAME.top) * scale;
  return { scale, x, y: -top, height: bottom - top };
}
