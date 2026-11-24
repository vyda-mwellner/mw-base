import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';

import type { Facts } from '../../building/facts';
import { roomArt } from '../../building/rooms';
import { cameraFor } from '../../engine/camera';
import { ROOM, SLAB, WALL } from '../../engine/geometry';
import type { Gauge, Place, Room, RoomArt, Thing, Tone } from '../../engine/model';
import { box, disc, Part, points, project, SLANT, tone } from '../../engine/oblique';
import { dusk, P } from '../../engine/palette';
import {
  besideStairs,
  COLUMNS,
  FIT,
  FLOOR_SIGNS,
  floorY,
  GROUND_FLOOR,
  HOUSE_END,
  HOUSE_START,
  leftOf,
  PIPE_TOP,
  roomAt,
  roomBox,
  roomFloor,
  ROOMS,
  SHAFT,
  SKY,
  STAIRWELL,
  thingKey,
  thingX,
  TOP_FLOOR,
  VIEW,
  WORLD,
  YARD_FENCE,
} from '../../engine/plan';
import type { FigureMove } from '../../engine/poses';
import { cell, DOORWAY, LEAF_WOOD, RISE, RUN } from '../../engine/shell';
import { blend, Outside, Sky } from '../../engine/sky';
import { callPanel, landingArt, LIFT } from '../../engine/stairwell';
import { floorMarks } from '../../engine/surfaces';
import { atLift, doorOut, inYard, Motion, openDoor, STEP_LENGTH } from '../../engine/walk';
import { FigureArt } from '../figure/figure';
import { OuterDoor } from '../outer-door/outer-door';
import { RoomCell } from '../room-cell/room-cell';
import { Solids } from '../solids/solids';

/** A mark floats above the thing, and above the head of a figure standing at it. */
const MARK_GAP = 14;
/** Things stand at the back of a room, so on screen they sit a little to the right of and above their place on the floor. */
const BACK_SHIFT = { x: 8, y: -8 } as const;
const HEAD = 68;
/** How long the legs of a corner are, of the frame round the thing in reach. */
const CORNER = 7;
/** How deep in a room the figure walks. */
const WALK_DEPTH = 12;
/** How dark a room without light is at night, and how much of that daylight takes away above the ground. */
const DARK = 0.58;
const DAYLIGHT = 0.36;
/** The lamp of the porch shines in through the front door: the room beside it is never as dark as the others. */
const PORCH_LIGHT = 0.18;
/** The dark laid over a room nobody is in, as `.vl-dark` of the room cell has it. */
const UNLIT = '#050a16';
/** How bright the lamp on the wall makes a terrace at night, against full daylight. */
const LANTERN_LIGHT = 0.7;

/**
 * A room under the open sky in the light it has: no dark is laid over it as over a room, its colours go to the
 * night as everything outside the house does. Its own glow stays as it is.
 */
function inLight(art: RoomArt, light: number): RoomArt {
  const shaded = (parts: readonly Part[]): Part[] =>
    parts.map((part) => ({ ...part, color: dusk(part.color, light) }));
  return {
    ...art,
    floor: dusk(art.floor, light),
    parts: shaded(art.parts),
    critters: art.critters?.map(shaded),
  };
}

const { height: H, depth: D } = ROOM;
const FLOORS = Array.from({ length: TOP_FLOOR + 1 }, (_, floor) => floor);
const BASE = floorY(0);
const STREET = floorY(GROUND_FLOOR);
const ROOF = floorY(TOP_FLOOR);
const EAVE = ROOF - H - SLAB;
/** The house from its left wall to its right one, as the cut shows it. */
const HOUSE = { x: HOUSE_START, width: HOUSE_END - HOUSE_START } as const;
/** The ground floor room by the front door: the porch lamp shines into it. */
const BY_THE_DOOR = ROOMS.filter((room) => room.floor === GROUND_FLOOR).at(-1)!;
const TOP_ROOMS = ROOMS.filter((room) => room.floor === TOP_FLOOR);
/** A terrace at the left end of the top floor has no wall to the outside and no roof over it. */
const TERRACE_LEFT = TOP_ROOMS[0]?.open === true;
const FIRST_CLOSED = TOP_ROOMS.find((room) => !room.open && room.x < STAIRWELL.x);
/** The flat roof over the closed rooms of the top floor and the stairwell; a terrace to their left has none. */
const TOP_FROM = !TERRACE_LEFT
  ? HOUSE_START
  : FIRST_CLOSED
    ? FIRST_CLOSED.x - WALL.inner
    : STAIRWELL.x - WALL.inner;
const TOP = { x: TOP_FROM, width: HOUSE_END - TOP_FROM } as const;
const PARAPET = 6;
/** The housing of the lift on the roof, over its shaft: high enough for the temperature in lights over its hatch. */
const HOUSING = { x: SHAFT.x - TOP.x - 19, height: 38 } as const;
/** The mast on it, with a light on top. */
const MAST = { x: SHAFT.x - TOP.x, y: 23, foot: HOUSING.height + 3, top: HOUSING.height + 38 } as const;
/** The air conditioning at the right end of the flat roof, and its fan. */
const AIR = { x: TOP.width - 40, fan: TOP.width - 31 } as const;
/** Solar panels lean towards the viewer: low at the front, high at the back. In rows wherever the roof is free. */
const PANEL = { width: 42, pitch: 50, front: 10, back: 34, low: 4, high: 16 } as const;
const row = (from: number, to: number): number[] =>
  Array.from(
    { length: Math.max(0, Math.floor((to - from - PANEL.width) / PANEL.pitch) + 1) },
    (_, at) => from + at * PANEL.pitch,
  );
const PANEL_XS = [...row(12, HOUSING.x - 8), ...row(HOUSING.x + 60, AIR.x - 8)];
/**
 * What falls from the sky, as one path: column after column, each row a step down and to the left, so the
 * whole of it can move by one row and look the same.
 */
const FALL = { column: 34, row: 48, lean: -12 } as const;
const falling = (shape: string): string =>
  Array.from({ length: 34 }, (_, column) =>
    Array.from(
      { length: 24 },
      (_, row) =>
        `M${-60 + column * FALL.column + row * FALL.lean} ${-360 + row * FALL.row + ((column * 17) % FALL.row)}${shape}`,
    ).join(''),
  ).join('');
const RAIN = falling('l-3 9');
const SNOW = falling('h2v2h-2z');
const URGENCY: readonly Tone[] = ['danger', 'warning', 'info'];
const SLABS = [...FLOORS.map((floor) => ({ ...HOUSE, y: floorY(floor) })), { ...TOP, y: EAVE }];
const column = (x: number, width: number, top: number, bottom = BASE + SLAB): string =>
  `M${x} ${top}h${width}v${bottom - top}h${-width}z`;
/** The wall between two rooms side by side, as high as their storey. */
const PARTITIONS = ROOMS.filter((room) => leftOf(room)).map((room) =>
  column(room.x - WALL.inner, WALL.inner, floorY(room.floor) - H, floorY(room.floor)),
);

/** How far up the screen the ground reaches behind the house and the forecourt. */
const LAWN = 80 * SLANT.y;
/** The pavement in front of the house. */
const PAVEMENT = 36;
const PORCH_DEPTH = 42;
const PORCH_WIDTH = 46;
/**
 * The fence round the grounds, almost as high as the ground floor: along the back, and at the end of the yard
 * down to the front. That side runs into the depth, so its bars stand further apart than the ones at the back.
 */
const FENCE = { depth: 76, front: 4, height: 120, post: 36, bar: 4, side: 8, from: -140 } as const;
/** The yard from the front door to its fence. */
const YARD_END = YARD_FENCE - HOUSE_END;
/** The strip of hedge along the back of the forecourt, in front of the fence. */
const HEDGE = { from: 56, to: 72 } as const;
/** The board with the name of the company in front of the house, in its green on two posts. */
const SIGN = { x: HOUSE_END + 44, y: 28, width: 36, depth: 4, post: 12, height: 22 } as const;
/** Three parking bays right of the board, a car in each, nose to the viewer, a little behind the way the figure walks. */
const BAY = { from: SIGN.x + SIGN.width + 4 - HOUSE_END, width: 64, depth: 54 } as const;
const CAR = { y: 16, depth: 34 } as const;

/** One tile of stars, laid three times across and the row again higher up, for the sky over the roof. */
const STAR_TILE =
  'M40 30h2v2h-2zM92 14h2v2h-2zM150 60h2v2h-2zM262 6h2v2h-2zM22 92h2v2h-2zM300 40h2v2h-2zM118 130h1v1h-1zM232 88h1v1h-1zM366 70h2v2h-2zM70 170h1v1h-1zM410 22h2v2h-2zM452 110h2v2h-2zM498 50h1v1h-1zM530 150h2v2h-2zM472 190h1v1h-1zM560 84h2v2h-2zM584 16h1v1h-1zM196 180h2v2h-2zM330 150h1v1h-1z';
const STAR_TILES = [0, -240].flatMap((y) => [0, 600, 1200].map((x) => `translate(${x} ${y})`));

/** What sets a car apart: its paint, how wide and high body and cabin are, how far the cabin is set in, its lights. */
interface CarShape {
  readonly paint: string;
  readonly width: number;
  readonly wheel: number;
  readonly body: number;
  readonly cabin: number;
  readonly inset: number;
  readonly lamp: readonly [width: number, height: number];
  readonly rails?: boolean;
}

/** A small one, a tall one with rails on the roof, a low one with narrow lights. */
const CARS: readonly CarShape[] = [
  { paint: P.carBlue, width: 50, wheel: 10, body: 18, cabin: 19, inset: 5, lamp: [10, 5] },
  { paint: P.metal, width: 56, wheel: 12, body: 22, cabin: 20, inset: 3, lamp: [8, 6], rails: true },
  { paint: P.carBlack, width: 54, wheel: 9, body: 15, cabin: 14, inset: 8, lamp: [13, 3] },
];
const OWN_CAR_LEFT = HOUSE_END + BAY.from + (BAY.width - CARS[0].width) / 2;
/** The blue car in the first bay is the one to drive home in: standing in front of it, Enter ends the day. */
export const OWN_CAR = { from: OWN_CAR_LEFT, to: OWN_CAR_LEFT + CARS[0].width } as const;

/** The fence from `from` to `to`: a post every few bars, two rails, and the bars between them. */
function fence(from: number, to: number, color: string, rail: string): Part[] {
  const { depth: y, height, post, bar } = FENCE;
  const bars = Array.from({ length: Math.floor((to - from) / bar) }, (_, at) => from + at * bar);
  return [
    ...bars.map((x) => box(x, y, 0, 1, 1, height - 4, color)),
    box(from, y - 0.5, 10, to - from, 2, 2, rail),
    box(from, y - 0.5, height - 14, to - from, 2, 2, rail),
    ...bars.filter((x) => (x - from) % post === 0).map((x) => box(x - 1, y - 1, 0, 3, 3, height, rail)),
  ];
}

/** A side of the fence at `x`, from the back corner to the front, the bars back to front. */
function sideFence(x: number, color: string, rail: string): Part[] {
  const { depth, front, height, side } = FENCE;
  const bars = Array.from({ length: Math.floor((depth - front) / side) + 1 }, (_, at) => depth - at * side);
  return [
    ...bars.map((y) => box(x, y, 0, 1, 1, height - 4, color)),
    box(x - 0.5, front, 10, 2, depth - front, 2, rail),
    box(x - 0.5, front, height - 14, 2, depth - front, 2, rail),
    ...[depth, (depth + front) / 2, front].map((y) => box(x - 1, y - 1, 0, 3, 3, height, rail)),
  ];
}

/**
 * A car seen from the front, in the middle of the bay from `bay` on: the wheels under the body, lights, grille
 * and plate on its nose, the cabin set back on top with the windscreen and the mirrors.
 */
function car(bay: number, shape: CarShape, glass: string, shade: (color: string) => string): Part[] {
  const { y, depth: d } = CAR;
  const { width: w, wheel, body, cabin, inset, lamp } = shape;
  const x = bay + (BAY.width - w) / 2;
  const paint = shade(shape.paint);
  const dark = shade(P.tyre);
  const trim = shade(P.metalDark);
  const [floor, top] = [wheel - 3, wheel - 3 + body];
  const [lampWidth, lampHeight] = lamp;
  return [
    box(x + 2, y + 2, 0, w - 4, d - 4, 0, shade(tone(P.tyre, -0.3))),
    box(x + 3, y + 3, 0, 9, 8, wheel, dark),
    box(x + w - 12, y + 3, 0, 9, 8, wheel, dark),
    box(x, y, floor, w, d, body, paint),
    box(x + 4, y, top - 9, lampWidth, 0, lampHeight, shade(P.sheet)),
    box(x + w - 4 - lampWidth, y, top - 9, lampWidth, 0, lampHeight, shade(P.sheet)),
    box(x + 7 + lampWidth, y, top - 11, w - 14 - 2 * lampWidth, 0, 7, dark),
    box(x + w / 2 - 8, y, floor + 1, 16, 0, 4, shade(P.paper)),
    box(x - 1, y - 1, floor - 1, w + 2, 2, 3, trim),
    box(x + inset, y + 12, top, w - 2 * inset, d - 14, cabin, paint),
    box(x + inset + 3, y + 12, top + 2, w - 2 * inset - 6, 0, cabin - 5, glass),
    ...(shape.rails
      ? [
          box(x + inset + 3, y + 14, top + cabin, 2, d - 18, 2, trim),
          box(x + w - inset - 5, y + 14, top + cabin, 2, d - 18, 2, trim),
        ]
      : []),
    box(x + inset - 4, y + 12, top + 4, 4, 2, 3, paint),
    box(x + w - inset, y + 12, top + 4, 4, 2, 3, paint),
  ];
}

/** Where a point outside the house lies in the picture, for writing put there. */
function onStreet(x: number, y: number, z: number): string {
  const [left, up] = project(x, y, z);
  return `translate(${left} ${STREET + up})`;
}

/** A bush on the ground, `w` wide, standing at the depth `y`. */
const bush = (x: number, y: number, w: number, h: number, leaf: string, light: string): Part[] => [
  box(x, y, 0, w, 12, h, leaf),
  box(x + 3, y + 2, h, w - 6, 8, 4, light),
];

/** Blades of grass hanging over the edge of the cut from `from` to `to`, each a little longer or shorter than the one before. */
const fringe = (from: number, to: number, y: number): string =>
  Array.from({ length: 300 }, (_, blade) => blade)
    .filter((blade) => -400 + blade * 7 >= from && -400 + blade * 7 < to)
    .map((blade) => `M${-400 + blade * 7} ${y + 4}v${2 + ((blade * 5) % 4)}h2v${-2 - ((blade * 5) % 4)}z`)
    .join('');

/** Where a body stands on its way across the sky. */
const arc = (way: number): string =>
  `translate(${20 + way * (WORLD.width - 40)} ${200 - Math.sin(Math.PI * way) * (160 + SKY)})`;

/**
 * The pipe in the earth under the lowest floor: a duct across the whole picture with a window for every gauge.
 * It does not move to the side with the house, so what it says stays in view.
 */
const PIPE = { y: PIPE_TOP, height: 36, depth: 10, window: 94, gap: 9 } as const;
/**
 * A small pipe right of the pit of the lift, from under the foundation down into the big one. It belongs to the
 * house and moves with it; the big one, drawn over it, takes it in wherever it is.
 */
const FEEDER = {
  x: STAIRWELL.x + LIFT.pit.shell.x + LIFT.pit.shell.width + 10,
  top: BASE + SLAB + 6,
} as const;
const FEEDER_HEIGHT = PIPE.y + 4 - FEEDER.top;
/** How wide the picture of the whole house is in the unit of the pipe, and how many windows fit into it. */
const PIPE_SPAN = VIEW.width / FIT;
const PIPE_WINDOWS = Math.floor((PIPE_SPAN - 16 + PIPE.gap) / (PIPE.window + PIPE.gap));
/** Where the first of `count` windows begins, so that they stand in the middle of the pipe. */
const pipeFrom = (count: number): number => (PIPE_SPAN - count * PIPE.window - (count - 1) * PIPE.gap) / 2;

/** A tall window in the side of the house on every floor above the ground floor, as an office has them. */
const FACADE_WINDOWS = FLOORS.filter((floor) => floor > GROUND_FLOOR).map((floor) => ({
  room: roomAt(floor, HOUSE_END - WALL.outer - 1),
  transform: `translate(${HOUSE_END} ${floorY(floor)})`,
  frame: points([0, 5, 24], [0, 39, 24], [0, 39, 126], [0, 5, 126]),
  points: points([0, 7, 27], [0, 37, 27], [0, 37, 123], [0, 7, 123]),
  bars: `M${project(0, 22, 27).join(' ')}L${project(0, 22, 123).join(' ')}M${project(0, 7, 75).join(' ')}L${project(0, 37, 75).join(' ')}`,
}));

/** A string of lights along the parapet of the roof in advent. */
const ROOF_LIGHTS: readonly Part[] = Array.from({ length: Math.floor((TOP.width - 8) / 10.6) }, (_, bulb) =>
  box(4 + bulb * 10.6, -0.5, PARAPET - 1, 2.6, 1, 2.6, [P.glow, P.bad, P.info, P.ok][bulb % 4]),
);
/** Where the rockets burst on New Year's Eve. */
const ROCKETS = [
  { at: 'translate(90 70)', color: '#ff4fd8' },
  { at: 'translate(230 40)', color: '#f8cd3f' },
  { at: 'translate(330 110)', color: '#22b8cf' },
  { at: 'translate(150 150)', color: '#4ade80' },
] as const;

/** The frame of the lift doors with the call buttons dark or lit, built once: the same array draws nothing anew. */
const DOOR_FRAMES = {
  dark: [...LIFT.frame, ...callPanel(false)],
  lit: [...LIFT.frame, ...callPanel(true)],
} as const;

/** How far in from its left wall the name of a room stands, and how far above the ceiling its baseline lies. */
const NAMEPLATE = { x: 28, lift: 3.5 } as const;

/** What a room cell is drawn from. */
interface RoomView {
  readonly id: string;
  readonly floor: number;
  readonly x: number;
  readonly width: number;
  readonly transform: string;
  readonly lit: boolean;
  readonly dim: number;
  readonly art: RoomArt;
  readonly cone: string;
}

/** The building cut open at the front and seen at a slant, built from boxes. */
@Component({
  selector: 'app-building-scene',
  imports: [NgTemplateOutlet, Solids, FigureArt, RoomCell, OuterDoor],
  templateUrl: './building-scene.html',
  styleUrl: './building-scene.scss',
  host: { style: 'display: contents' },
})
export class BuildingScene {
  protected readonly starTile = STAR_TILE;
  protected readonly starTiles = STAR_TILES;
  readonly place = input.required<Place>();
  readonly pose = input.required<Motion>();
  /** The tone of every thing that has something to say, by `<room id>/<thing id>`. */
  readonly tones = input.required<ReadonlyMap<string, Tone>>();
  readonly near = input<Thing | null>(null);
  readonly sky = input.required<Sky>();
  /** The weather outside; null while nobody knows it. */
  readonly weather = input<Outside | null>(null);
  /** What the rooms show of the state of things. */
  readonly facts = input.required<Facts>();
  /** The windows of the pipe under the house; none, and the pipe stays empty. */
  readonly gauges = input<readonly Gauge[]>([]);
  /** The mark that was jumped at last and bursts, with how many have before it, so the next one bursts anew. */
  readonly popped = input<{ readonly key: string; readonly count: number } | null>(null);

  protected readonly lift = { ...LIFT, transform: `translate(${STAIRWELL.x} ${BASE})` };
  protected readonly feeder = {
    transform: `translate(0 ${PIPE.y + 4})`,
    parts: [
      box(FEEDER.x, 2, 0, 6, 4, FEEDER_HEIGHT, P.duct),
      box(FEEDER.x - 2, 1, FEEDER_HEIGHT - 5, 10, 6, 3, tone(P.duct, -0.25)),
      box(FEEDER.x - 2, 1, 6, 10, 6, 3, tone(P.duct, -0.25)),
    ],
  };
  protected readonly frame = {
    street: STREET,
    lawnTop: STREET - LAWN,
    lawnHeight: LAWN,
    houseEnd: HOUSE_END,
    // The lawn left of the house reaches as far as the house; beyond it the forecourt draws its own.
    lawnWidth: HOUSE_END + 400,
    slabs: SLABS.map((slab) => `M${slab.x} ${slab.y}h${slab.width}v${SLAB}h${-slab.width}z`).join(''),
    slabLines: SLABS.map((slab) => `M${slab.x} ${slab.y + 0.5}h${slab.width}`).join(''),
    walls: [
      column(HOUSE.x, WALL.outer, TERRACE_LEFT ? ROOF : EAVE),
      ...PARTITIONS,
      column(STAIRWELL.x - WALL.inner, WALL.inner, EAVE),
      column(COLUMNS.right - WALL.inner, WALL.inner, EAVE + SLAB),
      column(HOUSE_END - WALL.outer, WALL.outer, EAVE),
    ].join(''),
    footing: { x: HOUSE.x - 4, y: BASE + SLAB, width: HOUSE.width + 8 },
    top: `translate(${TOP.x} ${EAVE})`,
    topDeck: points([0, 0, 0], [TOP.width, 0, 0], [TOP.width, D, 0], [0, D, 0]),
    panels: PANEL_XS.map((x) => {
      const middle = (PANEL.front + PANEL.back) / 2;
      const [left, right] = [project(x, middle, 10), project(x + PANEL.width, middle, 10)];
      const [near, far] = [
        project(x + PANEL.width / 2, PANEL.front, PANEL.low),
        project(x + PANEL.width / 2, PANEL.back, PANEL.high),
      ];
      const half = (from: number): string =>
        points(
          [from, PANEL.front, PANEL.low],
          [from + PANEL.width / 2, PANEL.front, PANEL.low],
          [from + PANEL.width / 2, PANEL.back, PANEL.high],
          [from, PANEL.back, PANEL.high],
        );
      return {
        x,
        halves: [half(x), half(x + PANEL.width / 2)],
        grid: `M${left}L${right}M${near}L${far}`,
      };
    }),
    beacon: `translate(${project(MAST.x + 1, MAST.y + 1, MAST.top + 2).join(' ')})`,
    fan: `translate(${project(AIR.fan, 14, 6).join(' ')})`,
    // Taller than the font draws them: a 6 and an 8 are told apart by their height, not their width.
    thermo: `translate(${project(HOUSING.x + 34, 8, 20).join(' ')}) scale(1 1.12)`,
    facade: `${HOUSE_END},${EAVE} ${HOUSE_END + RUN},${EAVE - RISE} ${HOUSE_END + RUN},${STREET - RISE} ${HOUSE_END},${STREET}`,
    // Concrete panels, a joint at every slab and one halfway up each storey.
    siding: FLOORS.filter((floor) => floor >= GROUND_FLOOR)
      .flatMap((floor) => [floorY(floor) - H / 2, floorY(floor) - H - SLAB / 2])
      .map((y) => `M${HOUSE_END} ${y}l${RUN} ${-RISE}`)
      .join(''),
    fringe: fringe(-400, HOUSE_END, STREET),
    frontDoor: `translate(${HOUSE_END} ${STREET})`,
    yard: `${HOUSE_END},${STREET} 1300,${STREET} 1300,${STREET - LAWN} ${HOUSE_END + RUN},${STREET - LAWN} ${HOUSE_END + RUN},${STREET - RISE}`,
    // Paving stones in rows along the forecourt, from the wall of the house on.
    paving: [8, 16, 24, 32, 40, 48]
      .map((y) => `M${HOUSE_END + Math.min(y, RUN / SLANT.x) * SLANT.x} ${STREET - y * SLANT.y}H1300`)
      .join(''),
    hedgeStrip: points([HOUSE_END, HEDGE.from, 0], [1300, HEDGE.from, 0], [1300, 80, 0], [HOUSE_END, 80, 0]),
    bay: Array.from({ length: CARS.length + 1 }, (_, line) => BAY.from + line * BAY.width)
      .map((x) => `M${project(x, 4, 0).join(' ')}L${project(x, BAY.depth, 0).join(' ')}`)
      .join(''),
    // The yard ends at its fence; beyond it the lawn of the neighbours, cut at the front like the garden.
    beyond: points([YARD_END, 0, 0], [YARD_END + 400, 0, 0], [YARD_END + 400, 80, 0], [YARD_END, 80, 0]),
    beyondEdge: YARD_FENCE,
    beyondFringe: fringe(YARD_FENCE, YARD_FENCE + 400, STREET),
    ground: `translate(0 ${STREET})`,
    pavement: points([0, 0, 0], [YARD_END, 0, 0], [YARD_END, PAVEMENT, 0], [0, PAVEMENT, 0]),
    fascia: onStreet(HOUSE_END + PORCH_WIDTH / 2 - 1, -2, 101.5),
    sign: onStreet(SIGN.x + SIGN.width / 2, SIGN.y, SIGN.post + 6),
  };
  /** The names of the closed rooms on the slab over each: shown while the whole house is in view. */
  protected readonly nameplates = ROOMS.filter((room) => !room.open).map((room) => ({
    id: room.id,
    label: room.label,
    transform: `translate(${roomBox(room).x + NAMEPLATE.x} ${roomFloor(room) - H - NAMEPLATE.lift})`,
  }));
  /** Birds crossing the sky now and then: each at its own height and pace, and at another point of its round with every start. */
  protected readonly birds = [
    { y: 26, size: 3, every: 61 },
    { y: 96, size: 2.4, every: 89 },
    { y: 58, size: 3.6, every: 131 },
    { y: -40, size: 2.6, every: 73 },
    { y: 12, size: 2.2, every: 107 },
    { y: -90, size: 3.2, every: 157 },
  ].map((bird) => ({
    at: `translate(0 ${bird.y})`,
    // The size sits inside the flight, or a bigger bird would also fly faster.
    size: `scale(${bird.size})`,
    every: bird.every,
    delay: -Math.random() * bird.every,
  }));
  /** Out of the front door the picture moves over to the yard; changes only at the door. */
  private readonly inYard = computed(() => inYard(this.pose()));
  protected readonly camera = computed(() => cameraFor(this.place(), this.inYard()));
  /**
   * Moved by `translate` and `scale`, never by `transform`: under the zoom of the app window WebKit stretches the px
   * of a transform on SVG, those of `translate` it keeps. The same goes for everything else moved in px here.
   */
  protected readonly cameraStyle = computed(() => {
    const { x, y, scale } = this.camera();
    return { translate: `${x}px ${y}px`, scale: `${scale}` };
  });
  /** The sky does not go along to the side: the house moves in front of it. */
  protected readonly skyStyle = computed(() => {
    const { y, scale } = this.camera();
    return { translate: `0px ${y}px`, scale: `${scale}` };
  });

  /** Share of the sky under clouds: rain and snow come from a covered one. */
  private readonly covered = computed(() => {
    const weather = this.weather();
    if (!weather) return 0;
    return weather.falling ? Math.max(weather.cloud, 0.9) : weather.cloud;
  });

  /** The colours of everything under the open sky, between night and day. */
  protected readonly heaven = computed(() => {
    const { light, sun, moon } = this.sky();
    const twilight = 1 - Math.abs(2 * light - 1);
    const covered = this.covered();
    // Under clouds the sky loses its colour, and the clouds their white; rain and snow clouds are darker and denser.
    const falling = this.fall() !== null;
    const grey = blend('#161c29', falling ? '#66707f' : '#8b95a3', light);
    const greyed = covered * (falling ? 0.8 : 0.6);
    const cloud = blend(blend('#3a4a66', '#ffffff', light), grey, covered * 0.5);
    return {
      top: blend(blend('#070c1a', '#3f8fd8', light), grey, greyed),
      bottom: blend(blend(blend('#22366a', '#bfe3f5', light), '#f2a65a', twilight * 0.8), grey, greyed),
      stars: (1 - light) * (1 - covered),
      bodies: 1 - covered * 0.8,
      sun: sun === null ? null : arc(sun),
      moon: moon === null ? null : arc(moon),
      cloud: [
        box(-9, 0, 0, 12, 10, 5, cloud),
        box(0, 0, 0, 34, 12, 8, cloud),
        box(9, 0, 8, 18, 12, 7, cloud),
      ],
      lawnTop: blend('#1f6a3a', '#63b25c', light),
      lawn: blend('#14532d', '#3d8a45', light),
      path: blend('#3b4354', '#c9c4ba', light),
      paving: blend('#2b3240', '#a7a49c', light),
      facade: blend('#2a3550', '#b7bdc6', light),
      parapet: blend('#3a4868', '#d3d7dd', light),
      gravel: blend('#262e3f', '#8f969f', light),
      marking: blend('#4a505c', '#e9e5da', light),
      // Birds are about by day, and fewer under a covered sky.
      birds: light * (1 - covered * 0.5),
    };
  });

  protected readonly pipeTransform = `translate(0 ${PIPE.y + PIPE.height})`;
  private readonly shownGauges = computed(() => this.gauges().slice(0, PIPE_WINDOWS));
  /** The duct with a flange on either side of every window. */
  protected readonly duct = computed(() => {
    const count = this.shownGauges().length;
    return [
      box(-20, 0, 0, PIPE_SPAN + 40, PIPE.depth, PIPE.height, P.duct),
      ...Array.from({ length: count + 1 }, (_, flange) => {
        const x = pipeFrom(count) - PIPE.gap / 2 - 3 + flange * (PIPE.window + PIPE.gap);
        return [
          box(x, -1, -2, 6, PIPE.depth + 2, PIPE.height + 4, tone(P.duct, -0.25)),
          box(x + 2, -1, 3, 2, 0, 2, P.metal),
          box(x + 2, -1, PIPE.height - 5, 2, 0, 2, P.metal),
        ];
      }).flat(),
    ];
  });
  protected readonly windows = computed(() =>
    this.shownGauges().map((gauge, index, shown) => {
      const x = pipeFrom(shown.length) + index * (PIPE.window + PIPE.gap);
      const inner = PIPE.window - 12;
      return {
        ...gauge,
        frame: [
          box(x + 3, 0, 3, PIPE.window - 6, 0, PIPE.height - 6, P.steel),
          box(x + 5, 0, 5, PIPE.window - 10, 0, PIPE.height - 10, '#0b1220'),
        ],
        x: x + 8,
        end: x + PIPE.window - 8,
        bar:
          gauge.share === undefined
            ? null
            : { x: x + 6, width: inner, filled: Math.max(0, Math.min(1, gauge.share)) * inner },
      };
    }),
  );
  /** The company on the board in front of the house, from the data folder; without one the board stays blank. */
  protected readonly brand = computed(() => {
    const name = this.facts().brand;
    // Twice as big as the name over the door; a long one gets smaller until it fits on the board.
    return name ? { name, size: Math.min(14, 60 / name.length) } : null;
  });
  protected readonly rockets = computed(() => (this.facts().season === 'silvester' ? ROCKETS : []));

  protected readonly overcast = computed(() => this.covered() >= 0.5);
  /** What the lights on the roof show: a minus if there is one and two digits, or dashes while nobody knows. */
  protected readonly thermo = computed(() => {
    const degrees = this.weather()?.temperature;
    return degrees === undefined ? '--' : String(Math.max(-99, Math.min(99, degrees)));
  });
  protected readonly fall = computed(() => {
    const falling = this.weather()?.falling;
    return falling ? { snow: falling === 'snow', path: falling === 'snow' ? SNOW : RAIN } : null;
  });

  /** The door out of the house the figure is at: it stands open. Reads the pose, changes only at a door. */
  private readonly ajar = computed(() => doorOut(this.pose()));

  protected readonly frontDoorOpen = computed(
    () => this.ajar()?.floor === GROUND_FLOOR && this.ajar()?.x === HOUSE_END,
  );

  private dusk(color: string): string {
    return dusk(color, this.sky().light);
  }

  /** What stands on the flat roof, behind the solar panels and in front of them. */
  protected readonly top = computed(() => {
    const { facade, parapet } = this.heaven();
    const legs = PANEL_XS.flatMap((x) => [
      box(x + 2, PANEL.back - 2, 0, 2, 2, PANEL.high - 1, this.dusk(P.metalDark)),
      box(x + PANEL.width - 4, PANEL.back - 2, 0, 2, 2, PANEL.high - 1, this.dusk(P.metalDark)),
    ]);
    return {
      solar: this.dusk('#1c3f94'),
      // A panel that is lit shines by itself, so the night does not darken it; a deep blue, not a lamp.
      solarLit: '#2c5bb4',
      behind: [
        box(0, D - 2, 0, TOP.width, 2, PARAPET, parapet),
        box(0, 0, 0, 2, D, PARAPET, parapet),
        ...legs,
        box(AIR.x, 14, 0, 18, 16, 12, this.dusk(P.metal)),
        disc(AIR.fan, 14, 6, 4, P.steel),
        box(HOUSING.x, 8, 0, 38, 30, HOUSING.height, facade),
        box(HOUSING.x + 12, 8, 0, 10, 0, 15, this.dusk(P.metalDark)),
        box(HOUSING.x + 2, 8, 17, 34, 0, 19, P.steel),
        box(HOUSING.x - 2, 6, HOUSING.height, 42, 34, 3, P.wallShaft),
        disc(HOUSING.x + 7, 12, HOUSING.height + 11, 6, this.dusk(P.sheet)),
        box(MAST.x, MAST.y, MAST.foot, 2, 2, MAST.top - MAST.foot, this.dusk(P.metalDark)),
        box(TOP.width - 2, 0, 0, 2, D, PARAPET, parapet),
      ],
      front: [
        box(0, 0, 0, TOP.width, 2, PARAPET, parapet),
        ...(this.facts().season === 'advent' ? ROOF_LIGHTS : []),
      ],
    };
  });

  protected readonly solar = computed(() => {
    const { solar, solarLit } = this.top();
    const lit = Math.round(Math.max(0, Math.min(1, this.facts().solar)) * PANEL_XS.length * 2);
    return this.frame.panels.map((panel, index) => ({
      x: panel.x,
      grid: panel.grid,
      lit: index * 2 < lit,
      halves: panel.halves.map((face, half) => ({ face, fill: index * 2 + half < lit ? solarLit : solar })),
    }));
  });

  /** The front door in the right wall of the house, and the canopy over it with a lamp. */
  protected readonly entrance = computed(() => {
    const { parapet } = this.heaven();
    return {
      frame: [box(0, 2, 0, 0, 34, 100, parapet)],
      door: { glass: this.doorGlass(), wood: this.dusk(LEAF_WOOD) },
      canopy: [
        box(PORCH_WIDTH - 8, 34, 0, 3, 3, 100, this.dusk(P.metalDark)),
        box(PORCH_WIDTH - 8, 2, 0, 3, 3, 100, this.dusk(P.metalDark)),
        box(12, 16, 95, 6, 6, 5, P.glow),
        box(30, 16, 95, 6, 6, 5, P.glow),
        box(-1, -2, 100, PORCH_WIDTH, PORCH_DEPTH, 8, this.dusk(P.steel)),
        box(-1, -2, 107, PORCH_WIDTH, 0, 1, this.dusk(P.accent)),
      ],
    };
  });

  /**
   * Behind the house and the forecourt: the fence and a small bush in the garden. In front: the hedge along the
   * back of the yard, the board of the company, the cars in their bays and the fence at the end.
   */
  protected readonly grounds = computed(() => {
    const shade = (color: string) => this.dusk(color);
    const leaf = shade(P.hedge);
    const light = shade(P.plantLight);
    const [bar, rail] = [shade(P.fence), shade(tone(P.fence, 0.25))];
    const behind = [...fence(FENCE.from, YARD_FENCE, bar, rail), ...bush(-56, 62, 22, 12, leaf, light)];
    const concrete = shade('#9aa1ab');
    const front = [
      ...[30, 74, 118, 162, 206, 240].flatMap((x) =>
        bush(HOUSE_END + x, HEDGE.from + 2, 38, 18, leaf, light),
      ),
      box(HOUSE_END + 22, 40, 0, 18, 12, 9, concrete),
      box(HOUSE_END + 24, 42, 9, 14, 8, 12, leaf),
      box(HOUSE_END + 27, 43, 21, 8, 6, 6, light),
      box(SIGN.x + 6, SIGN.y + 1, 0, 3, 2, SIGN.post, shade(P.metalDark)),
      box(SIGN.x + SIGN.width - 9, SIGN.y + 1, 0, 3, 2, SIGN.post, shade(P.metalDark)),
      box(SIGN.x, SIGN.y, SIGN.post, SIGN.width, SIGN.depth, SIGN.height, P.brand),
      box(SIGN.x, SIGN.y, SIGN.post + 2, SIGN.width, 0, 2, shade(P.accent)),
      ...CARS.flatMap((shape, bay) =>
        car(HOUSE_END + BAY.from + bay * BAY.width, shape, this.glass(), shade),
      ),
      ...sideFence(YARD_FENCE, bar, rail),
    ];
    return { behind, front };
  });

  /** The pane of the front door: at night the room behind it, its lamp on or only the porch light; by day the sky. */
  private readonly doorGlass = computed(() => {
    const { lit, dim } = this.view(BY_THE_DOOR);
    if (lit) return P.glow;
    return this.sky().light < 0.5 ? blend(P.glow, UNLIT, dim) : this.glass();
  });

  /** The windows in the side of the house: lit only while somebody is in the room behind, as its lamp is. */
  protected readonly facadeWindows = computed(() =>
    FACADE_WINDOWS.map(({ room, ...window }) => ({
      ...window,
      fill: room && (room === this.figureRoom() || room === this.place().room) ? P.glow : this.glass(),
    })),
  );

  /** The light on the mast takes the tone of the most urgent notice in the house; without one it is off. */
  protected readonly beacon = computed(() => {
    const raised = new Set(this.tones().values());
    return URGENCY.find((tone) => raised.has(tone)) ?? null;
  });

  private readonly figureRoom = computed(() => {
    const { level, x } = this.pose();
    return Number.isInteger(level) ? roomAt(level, x) : null;
  });

  private readonly glass = computed(() => blend('#16264a', '#a8d4f0', this.sky().light));
  private readonly arts = computed(() => {
    const setting = { glass: this.glass(), facts: this.facts() };
    return new Map(ROOMS.map((room) => [room.id, roomArt(room, setting)]));
  });

  private view(room: Room): RoomView {
    const { light } = this.sky();
    const dim = DARK - DAYLIGHT * light;
    const box = roomBox(room);
    const art = this.arts().get(room.id)!;
    return {
      id: room.id,
      floor: room.floor,
      x: box.x,
      width: box.width,
      transform: `translate(${box.x} ${roomFloor(room)})`,
      lit: room === this.figureRoom() || room === this.place().room,
      dim: room.floor < GROUND_FLOOR ? DARK : room === BY_THE_DOOR ? dim - PORCH_LIGHT : dim,
      art,
      cone: cone(art.lamp),
    };
  }

  /** The floor of the landing the figure is on: a number, so the cells stay as they are through a walk. */
  private readonly onLanding = computed(() => {
    const { level, x } = this.pose();
    const inStairwell = x >= STAIRWELL.x && x <= STAIRWELL.x + STAIRWELL.width;
    return Number.isInteger(level) && inStairwell ? level : null;
  });

  /** The landing of the stairwell on a floor, lit while the figure stands on it. */
  private landing(floor: number): RoomView {
    const art = landingArt(besideStairs(floor)?.open === true);
    return {
      id: `treppe-${floor}`,
      floor,
      x: STAIRWELL.x,
      width: STAIRWELL.width,
      transform: `translate(${STAIRWELL.x} ${floorY(floor)})`,
      lit: this.onLanding() === floor,
      dim: floor < GROUND_FLOOR ? DARK : DARK - DAYLIGHT * this.sky().light,
      art,
      cone: cone(art.lamp),
    };
  }

  // A room covers the slanted back wall of the one to its left, and the top of the one below: bottom up, left to right.
  protected readonly cells = computed(() => {
    const views = [
      ...ROOMS.map((room) => ({ ...this.view(room), open: room.open ?? false })),
      ...FLOORS.map((floor) => ({ ...this.landing(floor), open: false })),
    ].sort((a, b) => a.floor - b.floor || a.x - b.x);
    const doorOpen = (floor: number, x: number) => this.ajar()?.floor === floor && this.ajar()?.x === x;
    const door = (open: boolean) => ({ open, glass: this.glass(), wood: this.dusk(LEAF_WOOD) });
    return views.map((view) => {
      const beside = views.find((other) => {
        const gap = view.x - other.x - other.width;
        return other.floor === view.floor && gap > 0 && gap <= WALL.outer;
      });
      const stairs = view.x === STAIRWELL.x;
      // On a terrace the wall to the room on its left is the outer wall of that room.
      const wall =
        beside && view.open ? [box(-WALL.outer, 0, 0, WALL.outer, D, H, this.heaven().facade)] : [];
      // From a room into the open air there is a door that opens; between two rooms the doorway is all there is.
      const outside = beside !== undefined && beside.open && !view.open;
      const doorway = beside !== undefined && !outside;
      const lantern = view.art.lantern;
      const lanternOn = lantern !== undefined && view.lit && this.sky().sun === null;
      const light = lanternOn ? LANTERN_LIGHT : this.sky().light;
      const art = view.open ? inLight(view.art, light) : view.art;
      return {
        ...view,
        art: stairs ? art : { ...art, parts: [...wall, ...(doorway ? [DOORWAY] : []), ...art.parts] },
        door: outside ? door(doorOpen(view.floor, view.x)) : null,
        deck: cell(view.width, H).floor,
        marks: view.open ? floorMarks(view.art.flooring, view.width) : null,
        lantern: lantern && {
          on: lanternOn,
          at: project(lantern.x - 30, D / 2, lantern.z - 36),
        },
      };
    });
  });

  private readonly liftOpen = computed(() => openDoor(this.pose()));
  /** A step back in the cab: the figure is drawn inside the core, seen only through the openings. */
  protected readonly inCab = computed(() => this.pose().depth > 0);
  protected readonly liftOpenings = FLOORS.map((floor) => ({
    floor,
    transform: `translate(${STAIRWELL.x} ${floorY(floor)})`,
  }));
  protected readonly cabAt = computed(() => `0px ${floorY(this.pose().level) - BASE}px`);
  protected readonly weightAt = computed(() => `0px ${floorY(TOP_FLOOR - this.pose().level) - BASE}px`);
  protected readonly leafSlide = {
    left: `${-LIFT.leaves.slide}px`,
    right: `${LIFT.leaves.slide}px`,
  };
  /** The floor the cab is nearest to and the floor where the figure can call it, as plain values. */
  private readonly liftAt = computed(
    () => {
      const pose = this.pose();
      const calling = !pose.aboard && atLift(pose) && Number.isInteger(pose.level);
      return { here: Math.round(pose.level), calling: calling ? pose.level : null };
    },
    { equal: (a, b) => a.here === b.here && a.calling === b.calling },
  );
  /**
   * The doors of the lift on every floor: open where the cab stands for the figure, the name of the floor lit
   * where the cab is, the buttons beside them lit while the figure stands in front and can call it.
   */
  protected readonly liftDoors = computed(() => {
    const { here, calling } = this.liftAt();
    const open = this.liftOpen();
    return FLOORS.map((floor) => ({
      floor,
      transform: `translate(0 ${floorY(floor) - BASE})`,
      open: floor === here && open,
      here: floor === here,
      name: FLOOR_SIGNS[floor],
      frame: calling === floor ? DOOR_FRAMES.lit : DOOR_FRAMES.dark,
    }));
  });

  protected readonly shadowAt = computed(() => {
    const { x, level, depth } = this.pose();
    const back = WALK_DEPTH + depth;
    return `${x + back * SLANT.x}px ${floorY(level) - back * SLANT.y}px`;
  });
  protected readonly figureAt = computed(() => {
    const { x, level, air, depth } = this.pose();
    return `${x + depth * SLANT.x}px ${floorY(level) - air - depth * SLANT.y}px`;
  });
  protected readonly move = computed<FigureMove>(() => {
    const leg = this.pose().legs[0];
    return leg !== undefined && 'walk' in leg ? 'walk' : 'stand';
  });
  /** Tied to the way walked, so a heel comes down at every step that is heard. */
  protected readonly strides = computed(() => (this.pose().facing * this.pose().x) / (2 * STEP_LENGTH));

  protected readonly marks = computed(() =>
    ROOMS.flatMap((room) =>
      room.things.flatMap((thing) => {
        const key = thingKey(room, thing);
        const tone = this.tones().get(key);
        return tone ? [{ key, tone, transform: this.markAt(key)! }] : [];
      }),
    ),
  );

  /** Bits of the mark that was jumped at, flying apart from where it hung. */
  protected readonly pops = computed(() => {
    const popped = this.popped();
    const at = popped && this.markAt(popped.key);
    if (!popped || !at) return [];
    return [
      {
        id: popped.count,
        transform: at,
        bits: Array.from({ length: 8 }, (_, bit) => {
          const angle = (Math.PI * 2 * bit) / 8 + 0.3;
          return { dx: Math.cos(angle) * 18, dy: Math.sin(angle) * 18 - 6 };
        }),
      },
    ];
  });

  private markAt(key: string): string | null {
    const [roomId, thingId] = key.split('/');
    const room = ROOMS.find((each) => each.id === roomId);
    const thing = room?.things.find((each) => each.id === thingId);
    if (!room || !thing) return null;
    const y = roomFloor(room) - Math.max((thing.lift ?? 0) + thing.height, HEAD) - MARK_GAP;
    return `translate(${thingX(room, thing) + BACK_SHIFT.x} ${y})`;
  }

  /** The four corners of a frame round the thing in reach, in house coordinates. */
  protected readonly reach = computed(() => {
    const room = this.place().room;
    const thing = this.near();
    if (!room || !thing) return null;
    const left = thingX(room, thing) - thing.width / 2 + BACK_SHIFT.x;
    const top = roomFloor(room) - (thing.lift ?? 0) - thing.height + BACK_SHIFT.y;
    const [right, bottom] = [left + thing.width, top + thing.height];
    return (
      `M${left} ${top + CORNER}V${top}h${CORNER}M${right - CORNER} ${top}H${right}v${CORNER}` +
      `M${right} ${bottom - CORNER}V${bottom}h${-CORNER}M${left + CORNER} ${bottom}H${left}v${-CORNER}`
    );
  });
}

/** The light of a ceiling lamp falling to the floor. */
const cone = (lamp: number): string =>
  points([lamp - 8, 22, H - 28], [lamp + 9, 22, H - 28], [lamp + 44, 22, 0], [lamp - 44, 22, 0]);
