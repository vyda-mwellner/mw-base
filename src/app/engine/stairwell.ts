import { CAB } from './figure';
import { ROOM, SLAB } from './geometry';
import type { RoomArt } from './model';
import { box, moved, Part, points, project, tone } from './oblique';
import { P } from './palette';
import { floorY, PIPE_TOP, SHAFT, STAIRWELL, TOP_FLOOR } from './plan';
import { BACK, ceilingLamp, plant } from './props';
import { DOORWAY } from './shell';

/**
 * The lift runs in a core of its own at the left of the stairwell, from the left edge of the stairwell. On every
 * floor its front has an opening with glass doors: only there the cab, and the figure in it, can be seen.
 */
const SX = SHAFT.x - SHAFT.width / 2 - STAIRWELL.x;
const FRONT = 16;
const BASE = floorY(0);
/** From the floor of the cellar up to the flat roof. */
const SHAFT_HEIGHT = BASE - (floorY(TOP_FLOOR) - ROOM.height);
const DOOR = { height: 100, leaf: SHAFT.width / 2 - 2 } as const;
const CORE = tone(P.wallStairs, -0.15);
/** The pit under the shaft reaches half the way from under the cellar slab down to the pipe. */
const PIT = { depth: SLAB + (PIPE_TOP - BASE - SLAB) / 2, wall: 4 } as const;
const PIT_FLOOR = PIT.depth - PIT.wall;
/** The core stands back from the cut: the pit, drawn on the cut, moves along with it to sit under the shaft. */
const PIT_X = SX + project(0, FRONT - 2, 0)[0];
/** A buffer on the floor of the pit, for the cab to stop on: a plate, a yellow spring, a cap. */
const buffer = (x: number): Part[] => [
  box(x, 4, 0, 7, 4, 1.5, P.metalDark),
  box(x + 1.5, 4.5, 1.5, 4, 3, 5, P.gold),
  box(x + 1, 4, 6.5, 5, 4, 1.2, P.ink),
];

const front = (x: number, width: number, z: number, height: number): string =>
  points([x, FRONT, z], [x + width, FRONT, z], [x + width, FRONT, z + height], [x, FRONT, z + height]);

/** Everything of the lift in the coordinates of the stairwell, its origin on the floor of the cellar. */
export const LIFT = {
  /** Behind the openings: the dark inside of the core, its wall on the left. */
  inside: [
    box(SX + 2, BACK, 0, SHAFT.width - 4, 0, SHAFT_HEIGHT, '#141d30'),
    box(SX + 2, FRONT, 0, 0, BACK - FRONT, SHAFT_HEIGHT, '#1d2a44'),
    box(SX + SHAFT.width - 6.5, BACK - 2, 0, 1, 0, SHAFT_HEIGHT, P.metal),
  ] as readonly Part[],
  /** The counterweight on its cable at the back, moving the other way than the cab. */
  weight: [
    box(SX + SHAFT.width - 9, BACK - 4, 36, 6, 2, 34, P.metal),
    box(SX + SHAFT.width - 6.5, BACK - 3, 70, 1, 0, 830, P.metalDark),
  ] as readonly Part[],
  cab: moved(CAB, SX + 4, FRONT - 2),
  /** The opening of one floor, from its floor: all there is to see of the inside of the core. */
  opening: front(SX + 2, SHAFT.width - 4, 0, DOOR.height),
  /** The core round the opening of one floor, up to the ceiling: a pier on either side and a lintel. */
  core: [
    box(SX - 4, FRONT - 2, 0, 6, BACK - FRONT + 2, ROOM.height, CORE),
    box(SX + SHAFT.width - 2, FRONT - 2, 0, 6, BACK - FRONT + 2, ROOM.height, CORE),
    box(SX + 2, FRONT - 2, DOOR.height, SHAFT.width - 4, BACK - FRONT + 2, ROOM.height - DOOR.height, CORE),
  ] as readonly Part[],
  /** The doors of one floor: two glass leaves that slide apart, their frame, a plate over them. */
  leaves: {
    left: front(SX + 2, DOOR.leaf, 0, DOOR.height),
    right: front(SX + 2 + DOOR.leaf, DOOR.leaf, 0, DOOR.height),
    slide: DOOR.leaf - 3,
  },
  frame: [
    box(SX - 3, FRONT - 3, 0, 4, 1, DOOR.height + 4, P.metal),
    box(SX + SHAFT.width - 1, FRONT - 3, 0, 4, 1, DOOR.height + 4, P.metal),
    box(SX - 3, FRONT - 3, DOOR.height, SHAFT.width + 6, 1, 4, P.metal),
    box(SX + SHAFT.width / 2 - 14, FRONT - 3, DOOR.height + 6, 28, 0, 18, '#0b1220'),
  ] as readonly Part[],
  sign: `translate(${project(SX + SHAFT.width / 2, FRONT - 3, DOOR.height + 9.5).join(' ')})`,
  /** The pit under the shaft, cut open as the house is: concrete round it, the shaft going on through the slab. */
  pit: {
    shell: { x: PIT_X - PIT.wall, y: SLAB, width: SHAFT.width + 2 * PIT.wall, height: PIT.depth - SLAB },
    inside: { x: PIT_X + 2, y: 0, width: SHAFT.width - 4, height: PIT_FLOOR },
    floor: `translate(0 ${PIT_FLOOR})`,
    buffers: [...buffer(PIT_X + 7), ...buffer(PIT_X + SHAFT.width - 14)] as readonly Part[],
  },
} as const;

/** A post right of the doors with two buttons, up and down: lit while the figure stands in front and can call the lift. */
export const callPanel = (lit: boolean): Part[] => {
  const x = SX + SHAFT.width + 8;
  return [
    box(x + 2, FRONT, 0, 2, 2, 38, P.metalDark),
    box(x, FRONT, 38, 6, 2, 18, P.steel),
    box(x + 1.5, FRONT, 48, 3, 0, 3, lit ? P.glow : P.metalDark),
    box(x + 1.5, FRONT, 41, 3, 0, 3, lit ? P.glow : P.metalDark),
  ];
};

/** A flight of steps along the back wall of the landing, up to the next floor: there to look at, not to climb. */
const STEPS: readonly Part[] = [
  ...Array.from({ length: 7 }, (_, step) => box(60 + step * 8, 30, 0, 8, 14, 10 + step * 10, P.floorStone)),
  ...Array.from({ length: 7 }, (_, step) => box(63 + step * 8, 31, 10 + step * 10, 2, 1, 18, P.metalDark)),
  ...Array.from({ length: 7 }, (_, step) => box(60 + step * 8, 31, 28 + step * 10, 8, 1, 2, P.wood)),
];

/**
 * The landing of one floor: a doorway to the room on its left, or a door where that room is open, which the cell
 * draws. A lamp and a plant; the name of the floor is lit over the lift doors.
 */
export function landingArt(door: boolean): RoomArt {
  return {
    wall: P.wallStairs,
    floor: P.floorStone,
    walling: 'plaster',
    flooring: 'tiles',
    lamp: 70,
    parts: [
      ...(door ? [] : [DOORWAY]),
      ...STEPS,
      ...moved(ceilingLamp(70), 0, 0, ROOM.height - 150),
      ...plant(104, 2),
    ],
  };
}
