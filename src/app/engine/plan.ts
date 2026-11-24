import { BUILDING } from '../building/building.config';
import { DRAWN, ROOM, STOREY, WALL } from './geometry';
import type { Box, Notice, Note, Place, Room, RoomSpec, Spot, Thing, Tone } from './model';

/**
 * What the scene has of the window, in CSS pixels: 770 x 1021 but the frame of 3 on each side, the status bar
 * (3.125rem) and the bar of keys (2.375rem) at the root size of 17.6.
 */
export const VIEW = { width: 764, height: 918.2 } as const;

/** Room above the top floor for the roof and what stands on it. */
const TOP = 74;
/** The left wall of the house. */
export const HOUSE_START = 10;

export const TOP_FLOOR = BUILDING.floors.length - 1;
/** The floor the front door is on: only there the way goes on outside the house. */
export const GROUND_FLOOR = BUILDING.ground;
export const FLOOR_SIGNS: readonly string[] = BUILDING.floors.map((floor) => floor.sign);

const widthOf = (spec: RoomSpec): number => spec.width ?? ROOM.width;
const sideWidth = (rooms: readonly RoomSpec[]): number =>
  rooms.reduce((width, room, index) => width + widthOf(room) + (index > 0 ? WALL.inner : 0), 0);

/** Every floor has its rooms left and right of the stairwell; each side is as wide as on the widest floor. */
const SIDES = {
  left: Math.max(...BUILDING.floors.map((floor) => sideWidth(floor.left))),
  right: Math.max(...BUILDING.floors.map((floor) => sideWidth(floor.right))),
} as const;
const LEFT = HOUSE_START + WALL.outer;
/** On every floor the stairwell with the lift on its left, between the rooms of the two sides. */
export const STAIRWELL = { x: LEFT + SIDES.left + WALL.inner, width: 124 } as const;
/** Where the rooms of each side begin: on the left at the outer wall, on the right beside the stairwell. */
export const COLUMNS = { left: LEFT, right: STAIRWELL.x + STAIRWELL.width + WALL.inner } as const;
/** The right wall of the house: the front door is in it. */
export const HOUSE_END = COLUMNS.right + SIDES.right + WALL.outer;
/** The glass shaft on the left of the stairwell, the landing to its right: the figure walks past in front of it. */
export const SHAFT = { x: STAIRWELL.x + 34, width: 44 } as const;
/** How far from the middle of the shaft the figure still stands in the cab. */
export const CAB_REACH = 12;
/**
 * What the picture of the whole house shows beside it: the garden on the left, on the right the yard into the
 * first parked car. The picture fills the width of the device, so less here makes the house bigger.
 */
const GARDEN = 37;
const YARD = 144;
/** The side of the fence that closes the yard, behind three parked cars. */
export const YARD_FENCE = HOUSE_END + 284;

/** How far something whose middle is at `x` moves with the furniture of its room. */
export function spreadBy(room: Pick<RoomSpec, 'spread'>, x: number): number {
  const spread = room.spread;
  if (!spread) return 0;
  return x < spread.at ? -spread.left : spread.right;
}

/** A closed standard room is drawn on a canvas narrower than itself: its art sits in the middle, spread apart. */
const isFitted = (spec: RoomSpec): boolean => !spec.open && spec.width === undefined;

/** Closed rooms were drawn higher than they are: their art is lowered to the height of the room. */
export const LOWER = ROOM.height / DRAWN.height;

/** Things as the config gives them, moved and lowered with the art of their room. */
function placed(spec: RoomSpec): readonly Thing[] {
  const shift = isFitted(spec) ? (ROOM.width - DRAWN.width) / 2 : 0;
  return spec.things.map((thing) => {
    const moved = shift + spreadBy(spec, thing.at + shift);
    const lowered = spec.open
      ? thing
      : {
          ...thing,
          height: thing.height * LOWER,
          ...(thing.lift === undefined ? {} : { lift: thing.lift * LOWER }),
        };
    return { ...lowered, at: thing.at + moved, stand: thing.stand + moved };
  });
}

function side(rooms: readonly RoomSpec[], floor: number, from: number): Room[] {
  let x = from;
  return rooms.map((spec) => {
    const room: Room = { ...spec, floor, x, things: placed(spec) };
    x += widthOf(spec) + WALL.inner;
    return room;
  });
}

export const ROOMS: readonly Room[] = BUILDING.floors.flatMap((floor, index) => [
  ...side(floor.left, index, COLUMNS.left),
  ...side(floor.right, index, COLUMNS.right),
]);

/** The y of the line the figure walks on; fractional levels are the lift between two floors. */
export function floorY(level: number): number {
  return TOP + (TOP_FLOOR - level) * STOREY + ROOM.height;
}

/**
 * What the picture of the whole house shows, in the unit the camera scales, from `left` on: the garden, the
 * house, the yard, and under the lowest floor earth enough for the pit of the lift and the pipe.
 */
export const WORLD = { left: -GARDEN, width: GARDEN + HOUSE_END + YARD, height: floorY(0) + 112 } as const;
/**
 * How far the picture of the whole house moves to the right while the figure is out of the front door: until
 * the fence at the end of the yard shows, whose back lies 38 further right in the picture than its foot.
 */
export const YARD_PAN = YARD_FENCE + 44 - (WORLD.left + WORLD.width);
/** The scale of the picture of the whole house: as wide as the device, or as high where the house is tall. */
export const FIT = Math.min(VIEW.width / WORLD.width, VIEW.height / WORLD.height);
/** The top of the pipe with the gauges: it keeps to the bottom of the picture, with some earth under it. */
export const PIPE_TOP = WORLD.height - 48;
/** With the whole world in view, how much sky is left above it for sun and moon to pass over the house. */
export const SKY = Math.max(0, VIEW.height / FIT - WORLD.height);

/** How far the figure walks inside the house, and outside along the parked cars up to the middle of the last one. */
export const WALK = {
  min: COLUMNS.left + 10,
  max: HOUSE_END - WALL.outer - 18,
  outside: YARD_FENCE - 40,
} as const;

export const roomFloor = (room: Room): number => floorY(room.floor);

export function roomBox(room: Room): Box {
  return {
    x: room.x,
    y: roomFloor(room) - ROOM.height,
    width: room.width ?? ROOM.width,
    height: ROOM.height,
  };
}

/** The room right behind the wall on the left of a room, or none; the stairwell between two rooms is no wall. */
export function leftOf(room: Room): Room | null {
  return (
    ROOMS.find((other) => {
      const gap = roomBox(room).x - roomBox(other).x - roomBox(other).width;
      return other.floor === room.floor && gap > 0 && gap <= WALL.outer;
    }) ?? null
  );
}

/** The room on the left of the stairwell on a floor, the one the landing has its doorway to. */
export const besideStairs = (floor: number): Room | null =>
  ROOMS.find(
    (room) => room.floor === floor && room.x + (room.width ?? ROOM.width) + WALL.inner === STAIRWELL.x,
  ) ?? null;

/**
 * Where a door leads out of the house: the front door, the one from the stairwell onto a terrace left of it,
 * and every room with the open air on its left.
 */
export const DOORS: readonly Spot[] = [
  { floor: GROUND_FLOOR, x: HOUSE_END },
  ...(besideStairs(TOP_FLOOR)?.open ? [{ floor: TOP_FLOOR, x: STAIRWELL.x }] : []),
  ...ROOMS.filter((room) => !room.open && leftOf(room)?.open).map((room) => ({
    floor: room.floor,
    x: room.x,
  })),
];

/** The furthest right the figure gets on a floor: on the ground floor out of the front door onto the forecourt. */
export const walkMax = (floor: number): number => (floor === GROUND_FLOOR ? WALK.outside : WALK.max);

export const walkMin = (_floor: number): number => WALK.min;

export function roomAt(floor: number, x: number): Room | null {
  return (
    ROOMS.find((room) => {
      const box = roomBox(room);
      return room.floor === floor && x >= box.x && x <= box.x + box.width;
    }) ?? null
  );
}

/** Where the figure stands for a place, looking at the thing; null for the house as a whole, which moves nobody. */
export function spotOf(place: Place): Spot | null {
  const { room, thing } = place;
  if (!room) return null;
  const box = roomBox(room);
  if (!thing) return { floor: room.floor, x: box.x + box.width / 2 };
  return { floor: room.floor, x: box.x + thing.stand, facing: thing.stand > thing.at ? -1 : 1 };
}

export function thingX(room: Room, thing: Thing): number {
  return roomBox(room).x + thing.at;
}

export function thingNear(room: Room, x: number, reach = 22): Thing | null {
  const left = roomBox(room).x;
  const near = room.things
    .map((thing) => ({ thing, distance: Math.abs(left + thing.stand - x) }))
    .filter((entry) => entry.distance <= reach)
    .sort((a, b) => a.distance - b.distance)[0];
  return near?.thing ?? null;
}

/** `/serverraum/news?x=1` to room and thing; anything unknown is the house. */
export function placeOf(url: string): Place {
  const [roomId, thingId] = url.split(/[?#]/, 1)[0].split('/').filter(Boolean);
  const room = ROOMS.find((candidate) => candidate.id === roomId) ?? null;
  return { room, thing: room?.things.find((candidate) => candidate.id === thingId) ?? null };
}

export const thingKey = (room: Room, thing: Thing): string => `${room.id}/${thing.id}`;

const SEVERITY: Readonly<Record<Tone, number>> = { danger: 0, warning: 1, info: 2 };

/** Every thing whose note carries a tone, the most urgent first. */
export function noticesOf(notes: ReadonlyMap<string, Note>): Notice[] {
  return ROOMS.flatMap((room) =>
    room.things.flatMap((thing) => {
      const note = notes.get(thingKey(room, thing));
      return note?.tone ? [{ room, thing, text: note.text, tone: note.tone }] : [];
    }),
  ).sort((a, b) => SEVERITY[a.tone] - SEVERITY[b.tone]);
}
