import { blend } from './sky';

/** A box in space: x to the right, y into the depth, z up. A side of 0 leaves a flat piece on one of the three faces. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly color: string;
}

/** A disc facing the viewer, a wheel. `ring` leaves the middle open. */
interface Disc {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
  readonly color: string;
  readonly ring?: boolean;
}

/** Painted in the order of the list: what is further back comes first. */
export type Part = Box | Disc;

export const box = (
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  color: string,
): Box => ({ x, y, z, w, d, h, color });

export const disc = (x: number, y: number, z: number, r: number, color: string, ring = false): Disc => ({
  x,
  y,
  z,
  r,
  color,
  ring,
});

/** How far one unit of depth moves a point to the right and up on screen. */
export const SLANT = { x: 0.5, y: 0.4 } as const;

/** Screen position relative to the origin on the floor; screen y grows downwards, so up is negative. */
export function project(x: number, y: number, z: number): readonly [number, number] {
  return [x + y * SLANT.x, -z - y * SLANT.y];
}

export const points = (...corners: readonly (readonly [number, number, number])[]): string =>
  corners.map((corner) => project(...corner).join(',')).join(' ');

/** What light and shadow are made of: light is warm, shadow is not black but a deep blue. */
const LIGHT = '#fff3d1';
const DARK = '#15102e';

/** The same material in other light, -1 to 1: brighter turns warm, darker turns blue. */
export const tone = (hex: string, amount: number): string =>
  blend(hex, amount > 0 ? LIGHT : DARK, Math.abs(amount));

const TOP = 0.22;
const SIDE = -0.3;
const EDGE = -0.58;
const RIM = 0.55;
const FOOT = -0.2;
/** A face smaller than this has no room for a lit edge, or for the dark line at its foot. */
const RIM_FROM = 4;
const FOOT_FROM = 7;
const INSET = 0.7;
const SPECK = 2;

type Shape =
  | { readonly points: string; readonly fill: string; readonly stroke: string }
  | {
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly fill: string;
      readonly stroke: string;
    }
  | { readonly d: string; readonly stroke: string };

const round = (value: number): number => Math.round(value * 100) / 100;

/** A path from corner to corner, for a line that lies on a face. */
export const line = (...corners: readonly (readonly [number, number, number])[]): string =>
  `M${corners
    .map((corner) =>
      project(...corner)
        .map(round)
        .join(' '),
    )
    .join('L')}`;

/**
 * The visible faces of a part: front in its colour, top lighter, right side darker. The edge where the light
 * comes over the top of the front is lit, and a front tall enough stands in a line of shadow.
 */
export function shapesOf(part: Part): Shape[] {
  if ('r' in part) {
    const [cx, cy] = project(part.x, part.y, part.z);
    return [
      {
        cx,
        cy,
        r: part.r,
        fill: part.ring ? 'none' : part.color,
        stroke: part.ring ? part.color : tone(part.color, EDGE),
      },
    ];
  }
  const { x, y, z, w, d, h, color } = part;
  const stroke = tone(color, EDGE);
  const shapes: Shape[] = [];
  // On a speck an outline would be all there is to see of it.
  const face = (corners: string, fill: string, a: number, b: number): Shape => ({
    points: corners,
    fill,
    stroke: Math.min(a, b) < SPECK ? fill : stroke,
  });
  if (w > 0 && h > 0)
    shapes.push(face(points([x, y, z], [x + w, y, z], [x + w, y, z + h], [x, y, z + h]), color, w, h));
  if (w > 0 && d > 0)
    shapes.push(
      face(
        points([x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]),
        tone(color, TOP),
        w,
        d,
      ),
    );
  if (d > 0 && h > 0)
    shapes.push(
      face(
        points([x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]),
        tone(color, SIDE),
        d,
        h,
      ),
    );
  if (w >= FOOT_FROM && h >= FOOT_FROM)
    shapes.push({
      d: line([x + INSET, y, z + INSET], [x + w - INSET, y, z + INSET]),
      stroke: tone(color, FOOT),
    });
  if (w >= RIM_FROM && h >= RIM_FROM) {
    // A flat piece has no top to catch the light: its lit edge lies inside the face.
    const top = d > 0 ? z + h : z + h - INSET;
    const inset = d > 0 ? 0 : INSET;
    shapes.push({ d: line([x + inset, y, top], [x + w - inset, y, top]), stroke: tone(color, RIM) });
  }
  return shapes;
}

/** A group of parts somewhere else: a vehicle parked in a garage. */
export function moved(parts: readonly Part[], x: number, y: number, z = 0): Part[] {
  return parts.map((part) => ({ ...part, x: part.x + x, y: part.y + y, z: part.z + z }));
}
