/** Rooms are drawn at a slant: `depth` is how far the back wall lies behind the cut the viewer looks through. */
export const ROOM = { width: 205, height: 140, depth: 44 } as const;
/** How thick the walls are where the cut goes through them: round the house, and between two rooms. */
export const WALL = { outer: 11, inner: 7 } as const;
export const SLAB = 14;
/** A storey from floor to floor: the room plus the slab under it. */
export const STOREY = ROOM.height + SLAB;
/**
 * The canvas a standard room is drawn on: its things measured from its left edge, its furniture 143 wide in the
 * middle of it, everything 150 high. The plan puts it into the middle of the room, lowers it to the height of
 * the room and moves its pieces apart as `spread` says.
 */
export const DRAWN = { width: 171, height: 150, art: 143 } as const;
