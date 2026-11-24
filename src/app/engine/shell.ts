import { box, points, project, SLANT } from './oblique';
import { ROOM } from './geometry';
import { SKIRTING } from './surfaces';

const D = ROOM.depth;
export const RUN = D * SLANT.x;
export const RISE = D * SLANT.y;

/** A cell open to the viewer: back wall, left wall and floor, measured from its front left corner on the floor. */
export const cell = (width: number, height: number) => ({
  back: { x: RUN, y: -height - RISE, width, height },
  left: points([0, 0, 0], [0, D, 0], [0, D, height], [0, 0, height]),
  floor: points([0, 0, 0], [width, 0, 0], [width, D, 0], [0, D, 0]),
  hull: points([0, 0, 0], [width, 0, 0], [width, D, 0], [width, D, height], [0, D, height], [0, 0, height]),
  skirting: [
    points([0, D, 0], [width, D, 0], [width, D, SKIRTING], [0, D, SKIRTING]),
    points([0, 0, 0], [0, D, 0], [0, D, SKIRTING], [0, 0, SKIRTING]),
  ],
  skirtingTop: `M${points([0, 0, SKIRTING], [0, D, SKIRTING], [width, D, SKIRTING]).replaceAll(' ', 'L')}`,
});

const DOOR_HEIGHT = 96;
const DOOR_FROM = 4;
const LEAF = 15;
const doorway = (from: number, depth: number): string =>
  points([0, from, 0], [0, from + depth, 0], [0, from + depth, DOOR_HEIGHT], [0, from, DOOR_HEIGHT]);

/** The doorway in a left wall. */
export const DOOR = doorway(DOOR_FROM, 2 * LEAF);
/** An open doorway in the left wall of a cell, to the room beside it; `sill` lifts it off the floor of the cell. */
const doorwayAt = (sill: number) => box(0, DOOR_FROM, sill, 0, 2 * LEAF, DOOR_HEIGHT, '#0a101c');
export const DOORWAY = doorwayAt(0);

export const LEAF_WOOD = '#a8744a';

/**
 * The leaf of a door that leads outside, drawn flat with its hinge at the origin: the far end of the doorway
 * in the left wall of a cell.
 */
export const LEAF_OUT = {
  hinge: project(0, DOOR_FROM + 2 * LEAF, 0),
  width: 2 * LEAF,
  height: DOOR_HEIGHT,
  pane: { x: 7, top: 82, width: 2 * LEAF - 14, height: 26 },
  knob: { x: 2 * LEAF - 6, top: 47 },
  rim: `M0.7 ${0.7 - DOOR_HEIGHT}h${2 * LEAF - 1.4}`,
} as const;
