import { line as stroke } from './oblique';
import { ROOM } from './geometry';

/** What a wall is made of or covered with; `raw` is the concrete of a shell. */
export type Walling = 'paper' | 'panel' | 'brick' | 'plaster' | 'tile' | 'raw';
export type Flooring = 'planks' | 'slabs' | 'tiles' | 'grass';

/** The texture of a surface as two paths: what is scored into it and what catches the light. */
interface Marks {
  readonly dark: string;
  readonly light: string;
}

const { depth: D, height: H } = ROOM;
/** How high the boards of a panelled wall reach. */
const DADO = 46;

type Point = readonly [number, number, number];
const steps = (from: number, to: number, by: number): number[] =>
  Array.from({ length: Math.max(0, Math.ceil((to - from) / by)) }, (_, step) => from + step * by);
/** A number that looks like chance and is the same every time. */
const scatter = (seed: number, range: number): number => ((seed * 7919) % 104729) % range;

/** On the back wall `across` runs along x; on the left wall it runs into the depth. */
type Face = (across: number, z: number) => Point;

function wallFace(kind: Walling, face: Face, length: number): Marks {
  const upright = (across: number, from = 0, to: number = H): string =>
    stroke(face(across, from), face(across, to));
  const level = (z: number, from = 0, to = length): string => stroke(face(from, z), face(to, z));
  switch (kind) {
    case 'paper':
      return {
        dark: '',
        light: steps(6, length, 12)
          .map((across) => upright(across, 6))
          .join(''),
      };
    case 'panel':
      return {
        dark: steps(8, length, 12)
          .map((across) => upright(across, 6, DADO))
          .join(''),
        light: level(DADO) + level(DADO + 3),
      };
    case 'brick':
      return {
        dark: steps(9, H, 9)
          .map(
            (z, course) =>
              level(z) +
              steps(course % 2 === 0 ? 9 : 0, length, 18)
                .map((across) => upright(across, z - 9, z))
                .join(''),
          )
          .join(''),
        light: steps(0, H, 27)
          .map((z, row) => level(z + 4, scatter(row + 3, 60), scatter(row + 3, 60) + 7))
          .join(''),
      };
    case 'plaster':
      return {
        dark: steps(0, 9, 1)
          .map((mark) => {
            const across = scatter(mark + 11, Math.max(1, length - 8));
            const z = 14 + scatter(mark + 29, H - 30);
            return stroke(face(across, z), face(across + 5, z + (mark % 2 === 0 ? 2 : -2)));
          })
          .join(''),
        light: '',
      };
    case 'tile':
      return {
        dark: '',
        light:
          steps(12, length, 12)
            .map((across) => upright(across))
            .join('') +
          steps(12, H, 12)
            .map((z) => level(z))
            .join(''),
      };
    case 'raw':
      return {
        dark:
          steps(30, H, 30)
            .map((z) => level(z))
            .join('') +
          steps(22, length, 44)
            .map((across) => upright(across))
            .join(''),
        light: steps(11, length, 22)
          .flatMap((across) => steps(15, H, 30).map((z) => level(z, across, across + 1.5)))
          .join(''),
      };
  }
}

/** Back wall and left wall of a cell `width` wide. */
export function wallMarks(kind: Walling, width: number): Marks {
  const back = wallFace(kind, (x, z) => [x, D, z], width);
  const left = wallFace(kind, (y, z) => [0, y, z], D);
  return { dark: back.dark + left.dark, light: back.light + left.light };
}

export function floorMarks(kind: Flooring, width: number): Marks {
  const along = (y: number, from = 0, to = width): string => stroke([from, y, 0], [to, y, 0]);
  const into = (x: number, from = 0, to: number = D): string => stroke([x, from, 0], [x, to, 0]);
  switch (kind) {
    case 'planks':
      return {
        dark:
          steps(11, D, 11)
            .map((y) => along(y))
            .join('') +
          steps(0, D, 11)
            .flatMap((y, board) => steps(14 + board * 23, width, 52).map((x) => into(x, y, y + 11)))
            .join(''),
        light: '',
      };
    case 'slabs':
      return {
        dark:
          steps(40, width, 40)
            .map((x) => into(x))
            .join('') + along(22),
        light: '',
      };
    case 'tiles':
      return {
        dark:
          steps(14, width, 14)
            .map((x) => into(x))
            .join('') +
          steps(11, D, 11)
            .map((y) => along(y))
            .join(''),
        light: '',
      };
    case 'grass':
      return {
        dark: '',
        light: steps(0, Math.floor(width / 9), 1)
          .map((tuft) => {
            const x = 4 + tuft * 9 + scatter(tuft + 5, 5);
            const y = 3 + scatter(tuft + 17, D - 8);
            return stroke([x, y, 0], [x - 1, y, 3]) + stroke([x + 1.5, y, 0], [x + 2.5, y, 2.5]);
          })
          .join(''),
      };
  }
}

/** The board along the foot of back wall and left wall, as two polygons. */
export const SKIRTING = 5;
