import { box, Part, tone } from './oblique';
import { P } from './palette';

/** The plane of the back wall of a room 44 deep. */
export const BACK = 44;

const GLINT = '#ffffff';

/** The light on a pane, a screen or the water: two short bars, one over the other. */
export const glint = (x: number, y: number, z: number): Part[] => [
  box(x, y, z, 5, 0, 1.2, GLINT),
  box(x + 2.5, y, z - 2.6, 2.5, 0, 1.2, GLINT),
];

export function window(x: number, z: number, w: number, h: number, glass: string): Part[] {
  return [
    box(x - 1, BACK, z - 1, w + 2, 0, h + 2, P.trim),
    box(x + 3, BACK, z + 3, w - 6, 0, h - 6, glass),
    ...glint(x + 6, BACK, z + h - 7),
    box(x + w / 2 - 1, BACK, z + 3, 2, 0, h - 6, P.trim),
    box(x + 3, BACK, z + h / 2 - 1, w - 6, 0, 2, P.trim),
    box(x - 3, BACK - 5, z - 3, w + 6, 5, 2, P.trim),
  ];
}

export const ceilingLamp = (x: number): Part[] => [
  box(x - 2, 20, 147, 5, 5, 3, P.metalDark),
  box(x, 22, 132, 1, 1, 15, P.metalDark),
  box(x - 5, 18, 128, 11, 9, 4, P.shade),
  box(x - 8, 16, 121, 17, 12, 7, P.glow),
];

/** A shell is lit by a bulb on a wire. */
export const bulb = (x: number): Part[] => [
  box(x, 22, 122, 1, 1, 28, P.metalDark),
  box(x - 2, 20, 118, 5, 5, 4, P.metalDark),
  box(x - 1.5, 20.5, 113, 4, 4, 5, P.glow),
];

/** A strip light under the ceiling of a cellar. */
export const stripLight = (x: number, w: number): Part[] => [
  box(x, 20, 146, w, 5, 2, P.metalDark),
  box(x + 2, 20, 143, w - 4, 5, 3, P.glow),
];

/** What a shell has standing around instead of furniture. */
export const carton = (x: number, y: number, w: number, h: number): Part[] => [
  box(x, y, 0, w, 16, h, P.card),
  box(x + w / 2 - 2, y, 0, 4, 16, h + 0.2, P.tape),
  box(x + 3, y, h - 8, 7, 0, 5, P.paper),
];

/** A plant in a pot, 14 wide and deep. */
export const plant = (x: number, y: number): Part[] => [
  box(x + 2, y + 2, 0, 10, 10, 9, P.pot),
  box(x + 1, y + 1, 9, 12, 12, 2, P.pot),
  box(x + 6, y + 6, 11, 2, 2, 7, P.plantDark),
  box(x, y + 2, 17, 14, 12, 8, P.plantDark),
  box(x - 3, y + 5, 20, 4, 5, 4, P.plant),
  box(x + 13, y + 4, 22, 4, 5, 4, P.plant),
  box(x + 3, y + 4, 25, 9, 8, 7, P.plant),
  box(x + 5, y + 5, 32, 5, 5, 4, P.plantLight),
];

/** A rug with a border, flat on the floor. */
export const rug = (x: number, y: number, w: number, d: number, color: string): Part[] => [
  box(x, y, 0, w, d, 0, color),
  box(x + 3, y + 2.5, 0, w - 6, d - 5, 0, tone(color, 0.3)),
  box(x + 5.5, y + 4.5, 0, w - 11, d - 9, 0, color),
];

/** A picture on the back wall: sky, a hill, the sun. */
export const picture = (x: number, z: number, w: number, h: number, frame: string): Part[] => [
  box(x, BACK, z, w, 0, h, frame),
  box(x + 2, BACK, z + 2, w - 4, 0, h - 4, P.info),
  box(x + 2, BACK, z + 2, w - 4, 0, (h - 4) / 3, P.plant),
  box(x + 4, BACK, z + 2, (w - 4) / 3, 0, (h - 4) / 2, P.plantDark),
  box(x + w - 7, BACK, z + h - 7, 3, 0, 3, P.gold),
];

/** A lamp standing on the floor, its shade 46 up. */
export const floorLamp = (x: number, y: number): Part[] => [
  box(x - 3, y - 3, 0, 8, 8, 2, P.metalDark),
  box(x, y, 2, 2, 2, 44, P.metalDark),
  box(x - 3, y - 3, 46, 8, 8, 3, P.shade),
  box(x - 5, y - 5, 49, 12, 12, 9, P.glow),
];

/** A screen in a dark case, with lines of text and the light on its glass. */
export function screen(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  lines: readonly number[],
): Part[] {
  return [
    box(x, y, z, w, 3, h, P.steel),
    box(x + 2, y, z + 2, w - 4, 0, h - 4, P.screen),
    ...lines.map((length, line) => box(x + 5, y, z + h - 6 - line * 4, length, 0, 1, P.screenLine)),
    ...glint(x + w - 10, y, z + h - 5),
  ];
}
