import { DRAWN, ROOM } from '../engine/geometry';
import type { Room, RoomArt, Sign, Tone } from '../engine/model';
import { box, moved, Part, tone } from '../engine/oblique';
import { P } from '../engine/palette';
import { LOWER, spreadBy } from '../engine/plan';
import {
  BACK,
  carton,
  ceilingLamp,
  floorLamp,
  glint,
  picture,
  plant,
  rug,
  screen,
  stripLight,
  window,
} from '../engine/props';
import type { Flooring, Walling } from '../engine/surfaces';
import type { Game } from '../arcade/domain/round';
import { type EnvFact, type Facts, MOVEMENT_STEPS, type WorkdayColumn } from './facts';

/** What a room looks like depends on what it shows. */
export interface Setting {
  /** The colour of the sky behind the windows. */
  readonly glass: string;
  readonly facts: Facts;
}

const surfaces = (
  wall: string,
  walling: Walling,
  floor: string = P.floorWood,
  flooring: Flooring = 'planks',
) => ({ wall, floor, walling, flooring });

/** Four legs under a top that lies on `z`; `x`, `y`, `w` and `d` are those of the legs' outer corners. */
const legs = (x: number, y: number, w: number, d: number, z: number, color: string): Part[] => [
  box(x, y + d - 3, 0, 3, 3, z, color),
  box(x + w - 3, y + d - 3, 0, 3, 3, z, color),
  box(x, y, 0, 3, 3, z, color),
  box(x + w - 3, y, 0, 3, 3, z, color),
];

const TONE_LIGHT: Readonly<Record<Tone, string>> = { danger: P.bad, warning: P.warning, info: P.info };

/** A carved pumpkin with a light inside. */
const pumpkin = (x: number, y: number): Part[] => [
  box(x, y, 0, 12, 10, 9, P.pot),
  box(x + 4, y, 0, 1, 10, 9, tone(P.pot, -0.3)),
  box(x + 8, y, 0, 1, 10, 9, tone(P.pot, -0.3)),
  box(x + 5, y + 4, 9, 2, 2, 3, P.plantDark),
  box(x + 2, y, 4, 2, 0, 2, P.glow),
  box(x + 8, y, 4, 2, 0, 2, P.glow),
  box(x + 3, y, 1.5, 6, 0, 1.2, P.glow),
];

/** A painted egg lying on its side. */
const egg = (x: number, y: number, z: number, color: string): Part[] => [
  box(x, y, z, 4, 3, 3, color),
  box(x, y, z + 1.2, 4, 0, 0.8, P.paper),
];

/** A fir in a corner, hung with baubles, a star on top; 18 wide from `x`. */
const xmasTree = (x: number): Part[] => [
  box(x + 4, 4, 0, 10, 10, 6, P.pot),
  box(x + 7.5, 7.5, 6, 3, 3, 5, P.woodDark),
  box(x, 2, 11, 18, 14, 12, P.plantDark),
  box(x + 2, 3, 23, 14, 12, 11, P.plantDark),
  box(x + 4, 4, 34, 10, 10, 10, P.plant),
  box(x + 6, 5, 44, 6, 8, 8, P.plant),
  box(x + 7.5, 6, 52, 3, 3, 3, P.gold),
  ...(
    [
      [2, 15, P.bad],
      [10, 19, P.gold],
      [15, 14, P.info],
      [5, 27, P.gold],
      [12, 30, P.bad],
      [7, 38, P.info],
      [9, 47, P.bad],
    ] as const
  ).map(([dx, z, color]) => box(x + dx, 2, z, 2.4, 0, 2.4, color)),
];

/** Sheets lying on each other, every other one a little offset. */
const sheets = (x: number, y: number, z: number, w: number, d: number, count: number): Part[] =>
  Array.from({ length: count }, (_, sheet) =>
    box(x + (sheet % 2) * 0.7, y, z + sheet, w, d, 1, sheet % 2 ? P.sheet : P.paper),
  );

// ---------------------------------------------------------------------------------------------------------- U

/** The air conditioning on the outer wall of the server room, left of where its furniture begins. */
const AIR_CONDITIONING: readonly Part[] = [
  box(-14, 8, 114, 9, 28, 26, P.trim),
  ...[119, 123, 127, 131].map((z) => box(-5, 11, z, 0, 22, 1.4, P.metalDark)),
  box(-5, 11, 135, 0, 12, 2, P.info),
  box(-5, 31, 135, 0, 2, 2, P.ok),
];

/** A unit of a rack, `w` wide: its two lamps, a third one and the slots for air. */
const unit = (x: number, y: number, z: number, w: number, led: string): Part[] => [
  box(x, y, z, w, 0, 13, P.metalDark),
  box(x + 3, y, z + 8, 2, 0, 2, led),
  box(x + 7, y, z + 8, 2, 0, 2, led),
  box(x + 3, y, z + 3, 2, 0, 2, P.info),
  ...[9, 7, 5, 3].map((line) => box(x + 13, y, z + line, w - 16, 0, 1, P.steel)),
];

const UNITS = [6, 23, 40, 57, 74, 91];

/** The rack of the databases: a unit per connection from the top, gold while its password is unlocked. */
function dbRack(databases: readonly boolean[]): { parts: Part[]; sign: Sign } {
  const led = (index: number): string => {
    const open = databases[index];
    return open === undefined ? P.steel : open ? P.gold : P.ok;
  };
  return {
    parts: [
      box(26, 42, 112, 1, 1, 38, P.warning),
      box(29, 42, 112, 1, 1, 38, P.info),
      box(32, 42, 112, 1, 1, 38, P.metal),
      box(2, 24, 0, 32, 20, 112, P.steel),
      box(4, 24, 105, 28, 0, 6, P.metalDark),
      ...UNITS.flatMap((z, index) => unit(4, 24, z, 28, led(UNITS.length - 1 - index))),
      box(0, 4, 0, 38, 2, 0, P.warning),
    ],
    sign: { x: 18, y: 24, z: 106.2, text: 'DB', size: 4.6, color: P.screenLine, lit: true },
  };
}

/** The sign of the days since the last restart, right of the console, one line per stage. */
const SAFETY = { x: 112, z: 86, width: 26, height: 42 } as const;

function safetySign(envs: readonly EnvFact[]): { parts: Part[]; signs: Sign[] } {
  const { x, z, width, height } = SAFETY;
  return {
    parts: [
      box(x - 1, BACK, z - 1, width + 2, 0, height + 2, P.plantDark),
      box(x + 1, BACK, z + 1, width - 2, 0, height - 2, P.paper),
      box(x + 1, BACK, z + height - 14, width - 2, 0, 13, P.plantDark),
    ],
    signs: [
      { x: x + width / 2, z: z + height - 6.5, text: 'TAGE OHNE', size: 4.4, color: P.paper, lit: true },
      { x: x + width / 2, z: z + height - 12, text: 'RESTART', size: 4.4, color: P.paper, lit: true },
      ...envs.slice(0, 3).flatMap((env, row): Sign[] => {
        const line = z + height - 21 - row * 7.5;
        return [
          { x: x + 3, z: line, text: env.name, size: 4.2, color: P.ink, anchor: 'start' },
          {
            x: x + width - 3,
            z: line - 0.5,
            text: env.calm === null ? '--' : String(Math.min(999, env.calm)),
            size: 6.5,
            color: env.calm !== null && env.calm < 1 ? P.bad : P.plantDark,
            anchor: 'end',
            lit: true,
          },
        ];
      }),
    ],
  };
}

/** The monitors of the stages on the wall: a screen per stage, its head in the tone of how it is doing. */
const SCREENS = { x: 36, z: 84, width: 19, height: 24, gap: 1.5 } as const;

function monitorWall(envs: readonly EnvFact[]): { parts: Part[]; glow: Part[]; signs: Sign[] } {
  const { x, z, width, height, gap } = SCREENS;
  const shown = envs.slice(0, 3);
  const faces = shown.map((env, index) => {
    const left = x + 2 + index * (width + gap);
    const head = !env.seen ? P.steel : env.tone ? TONE_LIGHT[env.tone] : P.ok;
    return {
      parts: [
        box(left, BACK, z + 2, width, 0, height - 4, P.ide),
        box(left, BACK, z + height - 7, width, 0, 5, head),
        ...[13, 9, 5].map((line, at) =>
          box(left + 3, BACK, z + line, [13, 9, 11][at], 0, 1.2, at === 0 ? P.screenLine : P.accentSoft),
        ),
      ],
      sign: {
        x: left + width / 2,
        z: z + height - 6.2,
        text: env.name,
        size: 4.4,
        color: P.ink,
        lit: true,
      } as Sign,
    };
  });
  const frame = box(x, BACK, z, shown.length * (width + gap) + gap + 2, 0, height, P.steel);
  const glow = faces.flatMap((face) => face.parts);
  return { parts: [frame, ...glow], glow, signs: faces.map((face) => face.sign) };
}

/** The patch panel of the forwards under the monitors: a port per forward, a cable down from every one that runs. */
const CABLES = [P.warning, P.info, P.bad, P.ok, P.accentSoft, P.gold] as const;

function patchPanel(forwards: readonly boolean[]): Part[] {
  return [
    box(40, BACK, 48, 32, 0, 14, P.steel),
    ...forwards.slice(0, 12).flatMap((on, index) => {
      const px = 42.5 + (index % 6) * 4.8;
      const pz = 57 - Math.floor(index / 6) * 5;
      return [
        box(px, BACK, pz, 2.6, 0, 2, on ? P.ok : P.ink),
        ...(on ? [box(px + 0.8, BACK, 38, 1, 0, pz - 38, CABLES[index % CABLES.length])] : []),
      ];
    }),
  ];
}

/** A chair at the console, its back to the viewer. */
const CONSOLE_CHAIR: readonly Part[] = [
  box(62, 6, 0, 12, 10, 3, P.steel),
  box(67, 10, 3, 2, 2, 14, P.steel),
  box(61, 5, 17, 14, 11, 3, P.accent),
  box(61, 3, 20, 14, 3, 16, P.accent),
];

function serverRoom({ facts }: Setting): RoomArt {
  const sign = safetySign(facts.envs);
  const wall = monitorWall(facts.envs);
  const rack = dbRack(facts.databases);
  return {
    ...surfaces(P.wallServer, 'tile', P.floorConcrete, 'tiles'),
    lamp: 76,
    glow: wall.glow,
    parts: [
      ...AIR_CONDITIONING,
      ...sign.parts,
      ...wall.parts,
      ...patchPanel(facts.forwards),
      box(40, 38, 128, 66, 6, 3, P.metalDark),
      ...stripLight(56, 50),
      ...rack.parts,
      ...legs(40, 23, 64, 20, 34, P.metalDark),
      box(38, 22, 34, 66, 22, 3, P.steel),
      box(52, 26, 37, 18, 6, 1, P.metal),
      box(74, 27, 37, 4, 5, 1.5, P.metalDark),
      ...screen(80, 36, 37, 20, 14, [10, 6, 12]),
      box(94, 27, 37, 3, 3, 4, P.bad),
      box(106, 38, 0, 5, 5, 14, P.bad),
      box(107, 39, 14, 3, 3, 3, P.steel),
      ...CONSOLE_CHAIR,
    ],
    signs: [...sign.signs, ...wall.signs, rack.sign],
  };
}

const CABINET = '#43217c';

/** Light strips round the front of the arcade cabinet. */
const CABINET_LEDS: readonly Part[] = [
  box(9, 26, 0, 1.5, 0, 40, P.info),
  box(39.5, 26, 0, 1.5, 0, 40, P.info),
  box(9, 30, 46, 1.5, 0, 41, P.info),
  box(39.5, 30, 46, 1.5, 0, 41, P.info),
  box(9, 30, 86, 32, 0, 1.5, P.neon),
];
/** A strip of light under the ceiling, along the back wall and the left one: the room is lit from it. */
const LED_COVE: readonly Part[] = [
  box(0, 0, 143, 0, BACK, 2, P.neon),
  box(0, BACK - 1, 143, 143, 1, 2, P.neon),
];
/** What that strip throws onto the walls under it. */
const LED_WASH: readonly Part[] = [
  box(0, 0, 131, 0, BACK, 12, P.neon),
  box(0, BACK, 131, 143, 0, 12, P.neon),
];

/** The screen on the wall that the bug hunt runs on: the cable duct winding across it, towers beside it, a bug on its way. */
const BUG_SCREEN: readonly Part[] = [
  box(53, BACK, 66, 34, 0, 26, P.steel),
  box(55, BACK, 68, 30, 0, 22, '#1b2a22'),
  box(55, BACK, 85, 7, 0, 1.6, P.screenLine),
  box(61, BACK, 73, 1.6, 0, 13.6, P.screenLine),
  box(61, BACK, 73, 9, 0, 1.6, P.screenLine),
  box(68.4, BACK, 73, 1.6, 0, 13.6, P.screenLine),
  box(68.4, BACK, 85, 8, 0, 1.6, P.screenLine),
  box(74.8, BACK, 73, 1.6, 0, 13.6, P.screenLine),
  box(74.8, BACK, 73, 10.2, 0, 1.6, P.screenLine),
  box(57, BACK, 79, 2.4, 0, 2.4, P.gold),
  box(64.6, BACK, 78, 2.4, 0, 2.4, P.plant),
  box(71.6, BACK, 80, 2.4, 0, 2.4, P.gold),
  box(78.6, BACK, 79, 2.4, 0, 2.4, P.wood),
  box(65, BACK, 72.6, 2, 0, 2.4, P.bad),
];

/** A lamp on every machine: it lights green once the task of the day is done in its game. */
function taskLamps(facts: Facts): Part[] {
  const color = (game: Game) =>
    facts.scores.find((score) => score.game === game)?.solved ? P.ok : P.metalDark;
  return [
    box(23, 34, 86, 4, 4, 3, color('stapler')),
    box(85.3, BACK, 87, 1.4, 0, 2.6, color('bugjagd')),
    box(104, 38.5, 50, 3, 2, 1.6, color('laeufer')),
  ];
}

function gamingCellar({ facts }: Setting): RoomArt {
  return {
    ...surfaces(P.wallGaming, 'brick', P.floorConcrete, 'slabs'),
    lamp: 70,
    glow: [...LED_WASH, ...LED_COVE, ...CABINET_LEDS, ...BUG_SCREEN.slice(1)],
    parts: [
      ...LED_COVE,
      ...BUG_SCREEN,
      box(50, BACK, 102, 38, 0, 13, P.steel),
      box(52, BACK, 104, 34, 0, 9, P.screen),
      box(10, 30, 46, 30, 14, 40, CABINET),
      box(13, 30, 54, 24, 0, 22, P.screen),
      box(16, 30, 68, 8, 0, 2, P.screenLine),
      box(16, 30, 62, 14, 0, 2, P.screenLine),
      box(30, 30, 57, 4, 0, 4, P.gold),
      ...glint(26, 30, 72),
      box(11, 30, 80, 28, 0, 5, P.gold),
      box(14, 30, 81.5, 22, 0, 2, P.bad),
      box(10, 26, 0, 30, 18, 46, CABINET),
      box(13, 26, 6, 24, 0, 22, P.curtain),
      box(22, 26, 12, 6, 0, 10, P.gold),
      box(10, 24, 40, 30, 6, 6, P.steel),
      box(18, 25, 46, 2, 2, 4, P.metalDark),
      box(17.5, 24.5, 50, 3, 3, 2, P.bad),
      box(28, 25, 46, 3, 3, 1, P.warning),
      box(33, 25, 46, 3, 3, 1, P.ok),
      ...CABINET_LEDS,
      box(56, 34, 0, 60, 10, 16, P.steel),
      box(60, 34, 4, 22, 0, 8, P.metalDark),
      box(90, 34, 4, 22, 0, 8, P.metalDark),
      ...screen(60, 38, 18, 52, 32, []),
      box(66, 38, 40, 14, 0, 4, P.gold),
      box(66, 38, 30, 30, 0, 2, P.screenLine),
      box(66, 38, 26, 18, 0, 2, P.ok),
      box(84, 30, 16, 14, 8, 3, P.paper),
      box(86, 30, 17, 3, 0, 1, P.ink),
      box(70, 24, 12, 18, 4, 8, P.bad),
      box(66, 10, 0, 26, 18, 12, P.bad),
      box(68, 10, 12, 22, 14, 2, P.bad),
      box(102, 24, 12, 18, 4, 8, P.accent),
      box(98, 10, 0, 26, 18, 12, P.accent),
      box(100, 10, 12, 22, 14, 2, P.accent),
      ...taskLamps(facts),
    ],
    signs: [{ x: 69, z: 105.6, text: `HI ${facts.record}`, size: 9, color: P.screenLine, lit: true }],
  };
}

// ---------------------------------------------------------------------------------------------------------- E

/** The cabinet of the dev servers on the wall: a breaker per server on its rail, the lever up and green while it runs. */
function breakerCabinet(servers: readonly boolean[]): Part[] {
  return [
    box(40, 40, 68, 40, 4, 44, P.metalDark),
    box(42, 40, 70, 36, 0, 40, P.sheet),
    box(42, 40, 96, 36, 0, 2, P.metal),
    box(42, 40, 78, 36, 0, 2, P.metal),
    box(44, 40, 106, 18, 0, 3, P.paper),
    ...servers.slice(0, 12).flatMap((on, index) => {
      const x = 44 + (index % 6) * 5.6;
      const z = index < 6 ? 91 : 73;
      return [
        box(x, 40, z, 4.6, 0, 12, P.trim),
        box(x + 1.3, 40, z + (on ? 7.5 : 2.5), 2, 0, 2.5, on ? P.ok : P.steel),
      ];
    }),
  ];
}

/** The letter box of the local mail server under the cabinet: a letter sticking out for each that waits. */
const mailbox = (mails: number): Part[] => [
  box(64, 38, 40, 14, 6, 20, P.warning),
  box(66, 38, 54, 10, 0, 1.5, P.ink),
  box(66, 38, 44, 10, 0, 6, tone(P.warning, -0.15)),
  ...Array.from({ length: Math.min(mails, 3) }, (_, letter) =>
    box(66.5 + letter * 3, 40, 60, 2.5, 3, 3 + letter, P.paper),
  ),
];

/** Shipping containers in the colours they come in, from the bottom of the stack up. */
const CARGO = ['#b4532f', '#2f659e', '#3d8566', '#c48a2c', '#8a4a6e', '#4f6d8f'] as const;
const CONTAINER = { width: 33, height: 16 } as const;

/** A container on its long side: ribs along it, the bars of the doors on its end, a lamp at its corner. */
const container = (x: number, z: number, color: string, led: string | null): Part[] => [
  box(x, 24, z, CONTAINER.width, 18, CONTAINER.height, color),
  ...[6, 9.5, 13, 16.5, 20, 23.5, 27].map((rib) => box(x + rib, 24, z + 2, 1, 0, 12, tone(color, -0.25))),
  ...[5, 11].map((bar) => box(x + CONTAINER.width, 24 + bar, z + 1.5, 0, 1, 13, tone(color, -0.5))),
  ...(led
    ? [box(x + 1.5, 24, z + 9.5, 4.4, 0, 4.4, P.steel), box(x + 2.3, 24, z + 10.3, 2.8, 0, 2.8, led)]
    : []),
];

/** The hook of the crane over the stack, its trolley on a rail under the ceiling. */
const CRANE: readonly Part[] = [
  box(0, 30, 144, 40, 4, 3, P.warning),
  box(14, 30, 138, 8, 4, 6, P.metalDark),
  box(17.5, 31.5, 112, 1, 1, 26, P.steel),
  box(15, 30.5, 106, 6, 3, 6, P.warning),
  box(17, 31.5, 101, 2, 1, 5, P.metal),
  box(17, 31.5, 100, 5, 1, 1.5, P.metal),
];

/**
 * The stacks of local-setup as containers from the bottom up: green lamp running, amber and dimmed down, grey
 * and dark for a spare slot or while unknown, every lamp red when docker does not answer.
 */
function containerStack(live: readonly boolean[], alarm: boolean): Part[] {
  return [
    box(0, 4, 0, 38, 2, 0, P.warning),
    ...CARGO.flatMap((color, slot) => {
      const x = 2 + (slot % 2) * 1.5;
      const z = slot * CONTAINER.height;
      const on = live[slot];
      if (alarm) return container(x, z, color, P.bad);
      if (on === undefined) return container(x, z, P.metalDark, null);
      return on ? container(x, z, color, P.ok) : container(x, z, tone(color, -0.4), P.warning);
    }),
    ...CRANE,
  ];
}

/** The workbench under the map, a laptop on it. */
const WORKBENCH: readonly Part[] = [
  ...legs(84, 22, 56, 20, 34, P.woodDark),
  box(82, 20, 34, 60, 24, 4, P.wood),
  box(92, 26, 38, 22, 12, 1.5, P.steel),
  box(92, 38, 38, 22, 1.5, 14, P.steel),
  box(93.5, 38, 39.5, 19, 0, 11, P.screen),
  box(96, 38, 46, 10, 0, 1, P.screenLine),
  box(96, 38, 43, 7, 0, 1, P.screenLine),
];

/** The local workshop: the stacks of local-setup, the dev servers, the mail they send and the map. */
function localWorkshop({ facts }: Setting): RoomArt {
  return {
    ...surfaces(P.wallWorkshop, 'brick', P.floorConcrete, 'slabs'),
    lamp: 70,
    glow: [WORKBENCH[4]],
    parts: [
      ...blueprint(86, 64),
      ...breakerCabinet(facts.servers),
      ...mailbox(facts.mails),
      ...ceilingLamp(70),
      ...containerStack(facts.live, facts.alarm),
      ...WORKBENCH,
      ...(facts.season === 'halloween' ? pumpkin(44, 4) : []),
    ],
  };
}

/** The board in the entrance: a column per period, a row each for Monday to Friday, Monday to Thursday and net. */
const BOARD = { x: 74, z: 36, width: 50, height: 80, labels: 14 } as const;
const BOARD_ROWS = { header: 89.5, full: 76, mine: 65, left: 48 } as const;

function boardParts(columns: readonly WorkdayColumn[]): Part[] {
  const width = (BOARD.width - BOARD.labels) / Math.max(1, columns.length);
  return [
    box(BOARD.x - 2, BACK, BOARD.z - 2, BOARD.width + 4, 0, BOARD.height + 4, P.woodDark),
    box(BOARD.x, BACK, BOARD.z, BOARD.width, 0, BOARD.height, P.paper),
    box(BOARD.x + 2, BACK, BOARD.z + 61, BOARD.width - 4, 0, 0.6, P.metal),
    box(BOARD.x + 2, BACK, BOARD.z + 49, BOARD.width - 4, 0, 0.6, P.metal),
    box(BOARD.x + 4, BACK, BOARD.z + BOARD.height - 3, 3, 0, 3, P.bad),
    box(BOARD.x + BOARD.width - 7, BACK, BOARD.z + BOARD.height - 3, 3, 0, 3, P.bad),
    ...columns.flatMap((column, index) => {
      const left = BOARD.x + BOARD.labels + index * width + 2;
      const track = width - 4;
      return [
        box(left, BACK, BOARD.z + 4, track, 0, 2, P.sheet),
        box(left, BACK, BOARD.z + 4, Math.max(0.6, Math.min(1, column.share) * track), 0, 2, P.accent),
      ];
    }),
  ];
}

function boardSigns(columns: readonly WorkdayColumn[], week: number): Sign[] {
  const width = (BOARD.width - BOARD.labels) / Math.max(1, columns.length);
  const middle = BOARD.x + BOARD.width / 2;
  const label = (z: number, text: string): Sign => ({
    x: BOARD.x + 2,
    z,
    text,
    size: 5.5,
    color: P.ink,
    anchor: 'start',
  });
  return [
    { x: middle - 10, z: BOARD.z + 68, text: 'KW', size: 9, color: P.ink },
    { x: middle + 6, z: BOARD.z + 65, text: String(week), size: 20, color: P.ink, lit: true },
    label(BOARD_ROWS.full, 'MO-FR'),
    label(BOARD_ROWS.mine, 'MO-DO'),
    label(BOARD_ROWS.left + 2.5, 'NETTO'),
    ...columns.flatMap((column, index): Sign[] => {
      const x = BOARD.x + BOARD.labels + width * (index + 0.5);
      return [
        { x, z: BOARD_ROWS.header, text: column.label, size: 6.5, color: P.accentDeep },
        { x, z: BOARD_ROWS.full, text: String(column.full), size: 8, color: P.ink },
        { x, z: BOARD_ROWS.mine, text: String(column.mine), size: 8, color: P.ink },
        { x, z: BOARD_ROWS.left, text: String(column.left), size: 14, color: P.brand, lit: true },
      ];
    }),
  ];
}

/** A sign hung from the ceiling: the markdown mark, an M and an arrow down. */
const markdownSign = (x: number): { wires: Part[]; mark: Part[] } => ({
  wires: [
    box(x + 3, BACK, 122, 0.6, 0, 28, P.metalDark),
    box(x + 17, BACK, 122, 0.6, 0, 28, P.metalDark),
    box(x, BACK, 110, 20, 0, 12, P.steel),
  ],
  mark: [
    box(x + 3, BACK, 113, 1.4, 0, 6, P.paper),
    box(x + 8.6, BACK, 113, 1.4, 0, 6, P.paper),
    box(x + 4.4, BACK, 117, 1.4, 0, 1.4, P.paper),
    box(x + 5.8, BACK, 115.6, 1.4, 0, 1.4, P.paper),
    box(x + 7.2, BACK, 117, 1.4, 0, 1.4, P.paper),
    box(x + 13.8, BACK, 115, 1.4, 0, 4, P.paper),
    box(x + 12.4, BACK, 114.2, 4.2, 0, 1.2, P.paper),
    box(x + 13.8, BACK, 113, 1.4, 0, 1.2, P.paper),
  ],
});
const MARKDOWN = markdownSign(24);

/** The key board by the counter: a hook per access, its key hanging while the access is shut. */
function keyBoard(keys: readonly boolean[]): Part[] {
  const hooks = keys.slice(0, 8);
  return [
    box(2, BACK, 55, 16, 0, 30, P.woodDark),
    box(3.5, BACK, 56.5, 13, 0, 27, P.card),
    ...hooks.flatMap((out, index) => {
      const x = 6 + (index % 2) * 6;
      const z = 79 - Math.floor(index / 2) * 6.5;
      return [
        box(x, BACK, z, 1.4, 0, 1.4, P.metal),
        ...(out
          ? []
          : [box(x - 0.3, BACK, z - 3.6, 2, 0, 3.6, P.gold), box(x - 1, BACK, z - 5.4, 3.4, 0, 2, P.bad)]),
      ];
    }),
  ];
}

/** The intercom by the front door: a speaker, a button that lights. */
const INTERCOM: readonly Part[] = [
  box(130, BACK, 50, 8, 0, 18, P.steel),
  ...[61, 63.5, 66].map((z) => box(131.5, BACK, z - 2, 5, 0, 0.8, P.metalDark)),
  box(132.5, BACK, 53, 3, 0, 3, P.info),
];

/** The news, a paper clamped into a holder on the wall over the counter. */
const NEWSPAPER: readonly Part[] = [
  box(36, BACK, 55, 18, 0, 23, P.paper),
  box(38, BACK, 72, 14, 0, 4, P.ink),
  box(38, BACK, 63, 6, 0, 7, P.info),
  ...[68.5, 66, 63.5].map((z) => box(46, BACK, z, 6, 0, 1, P.metalDark)),
  ...[60, 57.5].map((z) => box(38, BACK, z, 14, 0, 1, P.metalDark)),
  box(34, BACK - 1, 77, 22, 1, 3, P.woodDark),
];

function entrance({ facts }: Setting): RoomArt {
  return {
    ...surfaces(P.wallEntrance, 'panel'),
    lamp: 70,
    glow: [...MARKDOWN.mark, INTERCOM[INTERCOM.length - 1]],
    parts: [
      box(18, BACK, 88, 48, 0, 18, P.brand),
      box(18, BACK, 88, 48, 0, 1.2, P.accent),
      ...MARKDOWN.wires,
      ...MARKDOWN.mark,
      ...keyBoard(facts.keys),
      ...NEWSPAPER,
      ...boardParts(facts.workdays),
      ...INTERCOM,
      ...ceilingLamp(70),
      ...plant(3, 26),
      box(22, 18, 0, 48, 16, 34, P.trim),
      box(22, 18, 12, 48, 0, 5, P.accent),
      box(20, 16, 34, 52, 20, 3, P.wood),
      box(48, 30, 37, 3, 3, 3, P.steel),
      box(42, 31, 40, 16, 2, 12, P.steel),
      box(43.5, 31, 41.5, 13, 0, 9, P.screen),
      box(28, 22, 37, 4, 4, 1.5, P.gold),
      box(29, 23, 38.5, 2, 2, 1.5, P.gold),
      ...sheets(60, 22, 37, 7, 6, 2),
      ...rug(84, 4, 46, 22, P.mat),
      ...(facts.season === 'halloween' ? pumpkin(76, 30) : []),
      ...(facts.season === 'advent' ? xmasTree(124) : []),
    ],
    signs: [
      {
        x: 42,
        z: 91.5,
        text: facts.brand || 'EMPFANG',
        size: facts.brand.length > 6 ? 8 : 11,
        color: P.paper,
        lit: true,
      },
      ...boardSigns(facts.workdays, facts.week),
    ],
  };
}

// ---------------------------------------------------------------------------------------------------------- 1

/** A stool to lean on at the desk: a round foot, one post, a saddle high up. */
const STANDING_STOOL: readonly Part[] = [
  box(24, 8, 0, 16, 10, 2, P.steel),
  box(31, 12, 2, 2, 2, 22, P.steel),
  box(28, 11, 12, 8, 4, 1.5, P.metal),
  box(25, 8, 24, 14, 10, 4, P.accent),
  box(27, 9, 28, 10, 8, 1.5, P.accentSoft),
];

/** The map of the apps as a blueprint on the wall: a column of cards for the GUIs, the backends and what they need. */
function blueprint(x: number, z: number): Part[] {
  const card = ([dx, dz]: readonly [number, number]) => box(x + dx, BACK, z + dz, 9, 0, 6, P.screenLine);
  const line = (dx: number, dz: number) => box(x + dx, BACK, z + dz, 4, 0, 0.6, P.paper);
  const cards = [
    [5, 38],
    [5, 29],
    [5, 20],
    [5, 11],
    [18, 34],
    [18, 16],
    [31, 38],
    [31, 25],
    [31, 12],
  ] as const;
  return [
    box(x, BACK, z, 46, 0, 52, P.metalDark),
    box(x + 2, BACK, z + 2, 42, 0, 48, P.blueprint),
    ...cards.map(card),
    line(14, 40.5),
    line(14, 22.5),
    line(14, 13.5),
    line(27, 36.5),
    line(27, 18.5),
    box(x + 5, BACK, z + 4, 22, 0, 1, P.paper),
  ];
}

/**
 * The model railway on its table: a track per repo, the stations DEV, TEST and PROD at the back, a wagon per
 * commit on its way.
 */
const TABLE = { x: 60, y: 4, width: 80, depth: 26, z: 28 } as const;
const TRACKS = [9, 16, 23] as const;
const STATIONS = ['DEV', 'TEST', 'PROD'] as const;
const WAGONS = [P.accent, P.gold, P.paper, P.curtain, P.info, P.pot] as const;

function railway(trains: readonly number[]): Part[] {
  const top = TABLE.z + 1.5;
  const tracks = TRACKS.slice(0, Math.max(1, Math.min(TRACKS.length, trains.length || TRACKS.length)));
  const end = TABLE.x + TABLE.width;
  return [
    ...legs(TABLE.x + 2, TABLE.y + 2, TABLE.width - 4, TABLE.depth - 4, TABLE.z - 3, P.woodDark),
    box(TABLE.x, TABLE.y, TABLE.z - 3, TABLE.width, TABLE.depth, 3, P.wood),
    box(TABLE.x + 2, TABLE.y + 1, TABLE.z, TABLE.width - 4, TABLE.depth - 2, 1.5, P.plant),
    ...STATIONS.flatMap((_, station) => {
      const x = TABLE.x + 5 + station * 25;
      return [
        box(x, 26, top, 14, 2.5, 1.5, P.stone),
        box(x + 6.5, 27.5, top + 1.5, 1, 1, 5, P.metalDark),
        box(x + 2.5, 28, top + 6.5, 9, 0, 4, P.paper),
      ];
    }),
    ...tracks.flatMap((y) => [
      ...Array.from({ length: Math.floor((TABLE.width - 8) / 6.2) }, (_, sleeper) =>
        box(TABLE.x + 4 + sleeper * 6.2, y - 0.6, top, 1.6, 3.6, 0.3, P.woodDark),
      ),
      box(TABLE.x + 3, y, top + 0.3, TABLE.width - 6, 0.6, 0.6, P.metal),
      box(TABLE.x + 3, y + 2.4, top + 0.3, TABLE.width - 6, 0.6, 0.6, P.metal),
    ]),
    ...tracks.flatMap((y, track) => {
      const head = end - 14 - track * 14;
      const room = Math.floor((head - TABLE.x - 3) / 7.5);
      const wagons = Math.min(room, 6, trains[track] ?? track + 1);
      return [
        ...Array.from({ length: wagons }, (_, wagon) =>
          box(
            head - 7.5 * (wagon + 1),
            y - 0.2,
            top + 1,
            6.5,
            3.4,
            3.6,
            WAGONS[(wagon + track) % WAGONS.length],
          ),
        ),
        box(head, y - 0.2, top + 1, 8, 3.4, 4.5, P.bad),
        box(head + 4.5, y - 0.2, top + 5.5, 3.5, 3.4, 2.5, P.bad),
        box(head + 1, y + 0.8, top + 5.5, 1.5, 1.5, 2.5, P.ink),
      ];
    }),
  ];
}

const RAILWAY_SIGNS: readonly Sign[] = STATIONS.map((text, station) => ({
  x: TABLE.x + 12 + station * 25,
  y: 28,
  z: TABLE.z + 8.7,
  text,
  size: 3.4,
  color: P.ink,
}));

/** The board of the releases: tickets pinned in three columns under a head. */
function releaseBoard(x: number, z: number): { parts: Part[]; sign: Sign } {
  return {
    parts: [
      box(x, BACK, z, 50, 0, 46, P.woodDark),
      box(x + 2, BACK, z + 2, 46, 0, 42, P.card),
      box(x + 2, BACK, z + 38, 46, 0, 6, P.accentDeep),
      ...[0, 1, 2].flatMap((column) =>
        [0, 1, 2].flatMap((row) => {
          if ((column + row) % 4 === 3) return [];
          const left = x + 5 + column * 14.5;
          const bottom = z + 26 - row * 11;
          return [
            box(left, BACK, bottom, 11, 0, 9, P.paper),
            box(left + 2, BACK, bottom + 5.5, 7, 0, 1, P.ink),
            box(left + 2, BACK, bottom + 2.5, 3, 0, 1.5, [P.ok, P.warning, P.info][(column + row) % 3]),
            box(left + 4.5, BACK, bottom + 7.5, 2, 0, 2, P.bad),
          ];
        }),
      ),
    ],
    sign: { x: x + 25, z: z + 39.5, text: 'RELEASES', size: 4.6, color: P.paper, lit: true },
  };
}

function office({ glass, facts }: Setting): RoomArt {
  const releases = releaseBoard(86, 62);
  return {
    ...surfaces(P.wallOffice, 'paper'),
    lamp: 84,
    parts: [
      ...window(8, 70, 34, 40, glass),
      ...picture(56, 82, 22, 18, P.gold),
      ...releases.parts,
      ...ceilingLamp(84),
      ...legs(4, 22, 48, 20, 34, P.woodDark),
      box(2, 20, 34, 52, 24, 4, P.wood),
      box(15, 36, 38, 12, 4, 2, P.steel),
      ...screen(8, 35, 40, 26, 18, [12, 18, 8]),
      box(10, 26, 38, 18, 6, 1, P.steel),
      box(31, 30, 38, 3, 3, 4, P.bad),
      box(38, 30, 38, 12, 10, 18, P.metalDark),
      box(40, 30, 50, 8, 0, 3, P.ok),
      box(40, 30, 44, 8, 0, 1, P.steel),
      box(40, 30, 41, 8, 0, 1, P.steel),
      ...STANDING_STOOL,
      ...railway(facts.trains),
      ...(facts.season === 'ostern' ? egg(66, 8, TABLE.z + 1.5, P.gold) : []),
    ],
    signs: [releases.sign, ...RAILWAY_SIGNS],
  };
}

/**
 * The dojo on a dark editor: a few lines of code, and under them a pip for every lesson solved today out of a
 * round of ten, all gold once the round is full.
 */
function ideFace(x: number, y: number, z: number, w: number, h: number, share: number): Part[] {
  const lit = Math.round(share * 10);
  const pip = (w - 3) / 10;
  return [
    box(x, y, z, w, 0, h, P.ide),
    box(x + 2, y, z + h - 3, 3, 0, 1, P.gold),
    box(x + 6, y, z + h - 3, 6, 0, 1, P.screenLine),
    box(x + 4, y, z + h - 6, 5, 0, 1, P.accentSoft),
    box(x + 10, y, z + h - 6, 4, 0, 1, P.plant),
    box(x + 4, y, z + h - 9, 8, 0, 1, P.screenLine),
    ...Array.from({ length: 10 }, (_, at) =>
      box(x + 1.5 + at * pip, y, z + 1, pip - 0.5, 0, 1.2, at < lit ? (lit === 10 ? P.gold : P.ok) : P.steel),
    ),
  ];
}

/** A standing desk with a screen of its own, 32 wide from `x`: the dojo. */
function dojoDesk(x: number, share: number): Part[] {
  return [
    box(x + 2, 19, 0, 3, 3, 36, P.metalDark),
    box(x + 27, 19, 0, 3, 3, 36, P.metalDark),
    box(x + 2, 9, 0, 3, 3, 36, P.metalDark),
    box(x + 27, 9, 0, 3, 3, 36, P.metalDark),
    box(x, 8, 36, 32, 15, 3, P.wood),
    box(x + 14, 19, 39, 4, 2, 4, P.metalDark),
    box(x + 4, 18, 43, 24, 2, 18, P.steel),
    ...ideFace(x + 5.5, 18, 44.5, 21, 15, share),
    box(x + 7, 10, 39, 17, 6, 1, P.metalDark),
  ];
}

const SHELVES = [6, 32, 58, 84];
const SPINES = [P.bad, P.accent, P.plant, P.gold, P.paper, P.curtain, P.info, P.pot];

/**
 * A bookcase with a row of books on every board; `seed` shifts the colours so two cases do not look alike.
 * Every third place holds a book from the start, the others fill up top down with the `read` ones.
 */
function bookcase(x: number, width: number, seed: number, read: number): Part[] {
  const books = Math.floor((width - 6) / 5);
  let free = 0;
  return [
    box(x, 34, 0, width, 10, 112, P.woodDark),
    ...[...SHELVES].reverse().flatMap((z) => [
      box(x + 2, 34, z, width - 4, 0, 24, P.steel),
      ...Array.from({ length: books }, (_, book) => book)
        .filter((book) => (book + z) % 3 === 0 || free++ < read)
        .flatMap((book) => {
          const height = 14 + ((book * 7 + seed + z) % 8);
          return [
            box(x + 3 + book * 5, 34, z, 4, 0, height, SPINES[(book + seed + z) % SPINES.length]),
            box(x + 3 + book * 5, 34, z + height - 4, 4, 0, 1, P.paper),
          ];
        }),
    ]),
    box(x - 1, 33, 112, width + 2, 12, 3, P.wood),
  ];
}

/** How many books fit into a case beside those that stand in it from the start. */
const CASE_ROOM = 16;

/** A tray on the first case: a letter in it for every note in the inbox of the vault, the top one stamped. */
function letterTray(count: number): Part[] {
  const letters = Math.min(count, 8);
  return [
    box(14, 35, 115, 16, 8, 1.5, P.wood),
    ...sheets(15, 36, 116.5, 13, 6, letters),
    ...(letters > 0 ? [box(25, 39, 116.5 + letters, 2, 2, 0.3, P.bad)] : []),
  ];
}

function library({ glass, facts }: Setting): RoomArt {
  return {
    ...surfaces(P.wallLibrary, 'panel', P.floorDark),
    lamp: 66,
    parts: [
      ...window(48, 64, 34, 36, glass),
      ...bookcase(-6, 40, 1, Math.min(CASE_ROOM, facts.books)),
      ...bookcase(87, 36, 4, Math.max(0, facts.books - CASE_ROOM)),
      ...letterTray(facts.inbox),
      ...ceilingLamp(66),
      ...rug(40, 6, 60, 26, P.rug),
      box(48, 30, 2, 4, 12, 22, P.woodDark),
      box(52, 40, 14, 26, 4, 24, P.pot),
      box(52, 30, 2, 26, 12, 9, P.pot),
      box(53, 30, 11, 24, 11, 4, P.card),
      box(49, 31, 0, 3, 3, 2, P.steel),
      box(78, 31, 0, 3, 3, 2, P.steel),
      box(78, 30, 2, 4, 12, 22, P.woodDark),
      ...dojoDesk(44, facts.dojo),
      box(127, 8, 0, 3, 3, 30, P.woodDark),
      box(121, 4, 30, 16, 12, 2, P.wood),
      box(125, 7, 32, 8, 6, 3, P.accentDeep),
      box(125, 7, 33, 8, 0, 1, P.paper),
      ...floorLamp(133, 28),
      ...(facts.season === 'ostern' ? egg(8, 38, 115, P.curtain) : []),
    ],
  };
}

// ---------------------------------------------------------------------------------------------------------- D

/** What is on the roof ends here: the cable of the antenna and the solar panels, in a box with a display. */
const ROOF_BOX: readonly Part[] = [
  box(19, BACK, 94, 2, 0, 46, P.metalDark),
  box(10, BACK, 66, 20, 0, 28, P.metalDark),
  box(12, BACK, 82, 16, 0, 9, P.screen),
  box(14, BACK, 87, 9, 0, 1, P.screenLine),
  box(13, BACK, 71, 3, 0, 3, P.ok),
  box(18.5, BACK, 71, 3, 0, 3, P.warning),
  box(24, BACK, 71, 3, 0, 3, P.info),
];

/** A lamp per backup flow along the lid of the chest, round the lock: green while it is backed up. */
const flowLamps = (flows: Facts['flows']): Part[] =>
  flows
    .slice(0, 6)
    .map((state, index, shown) =>
      box(34.75 - shown.length * 1.75 + index * 3.5, 26, 23.5, 2, 0, 2, state ? TONE_LIGHT[state] : P.ok),
    );

function attic({ glass, facts }: Setting): RoomArt {
  return {
    ...surfaces(P.wallAttic, 'plaster', P.floorDark),
    lamp: 72,
    parts: [
      ...window(82, 70, 36, 42, glass),
      ...picture(38, 88, 22, 18, P.gold),
      box(0, 34, 140, 142, 5, 5, P.woodDark),
      ...ceilingLamp(72),
      ...ROOF_BOX,
      ...rug(8, 4, 70, 16, P.rug),
      box(12, 26, 0, 44, 16, 22, P.woodDark),
      box(12, 26, 22, 44, 16, 5, P.wood),
      box(18, 26, 0, 3, 0, 27, P.metalDark),
      box(47, 26, 0, 3, 0, 27, P.metalDark),
      box(31, 26, 14, 6, 0, 8, facts.backedUp ? P.gold : P.bad),
      box(33, 26, 16, 2, 0, 3, P.ink),
      ...flowLamps(facts.flows),
      box(62, 28, 0, 20, 14, 52, P.sheet),
      box(66, 28, 0, 1, 0, 46, P.metal),
      box(74, 28, 0, 1, 0, 40, P.metal),
      box(60, 27, 50, 24, 16, 3, P.sheet),
      ...carton(100, 10, 22, 14),
      box(102, 12, 14, 16, 12, 9, P.card),
      box(108, 12, 14, 4, 12, 9.2, P.tape),
      box(88, 28, 0, 10, 8, 3, P.bad),
      box(88.5, 28, 3, 9, 8, 2.5, P.accent),
      box(89, 28, 5.5, 8, 8, 2.5, P.plant),
      ...usageMeter(126, facts.usage),
    ],
  };
}

function railing(width: number): Part[] {
  const gaps = Math.round(width / 16);
  const posts = Array.from({ length: gaps + 1 }, (_, post) =>
    box(((width - 2) * post) / gaps, BACK - 2, 0, 2, 2, 22, P.metalDark),
  );
  return [
    ...posts,
    box(0, BACK - 2, 11, width, 1, 1, P.metalDark),
    box(0, BACK - 2, 22, width, 2, 2, P.trim),
  ];
}

/** Under the sky there is no wall and no lamp: the colours are those of the ground. */
const outdoors = (
  ground: string,
  flooring: Flooring,
  parts: readonly Part[],
  critters: readonly (readonly Part[])[] = [],
): RoomArt => ({
  wall: ground,
  floor: ground,
  walling: 'raw',
  flooring,
  lamp: 0,
  parts,
  critters,
});

/** A meter standing on the floor from `x`, filled as far as `share` and gold once it is full. */
const usageMeter = (x: number, share: number): Part[] => [
  box(x + 1, 35, 0, 8, 5, 3, P.metalDark),
  box(x + 2, 36, 3, 6, 3, 52, P.steel),
  box(x + 3, 36, 5, 4, 0, 46 * share, share >= 1 ? P.gold : P.ok),
  box(x, 36, 51, 10, 3, 1.5, P.gold),
  ...[16.5, 28, 39.5].map((z) => box(x + 2, 36, z, 2, 0, 0.6, P.metal)),
];

/** A board on a post at the back of the deck from `x`: a bar for each of the last days walked, today's in gold. */
const stepBoard = (x: number, days: readonly number[]): Part[] => [
  box(x + 7, 36, 0, 2, 2, 30, P.metalDark),
  box(x, 35, 30, 16, 2, 20, P.woodDark),
  box(x + 1, 35, 31, 14, 0, 18, P.paper),
  ...days.map((share, day) =>
    box(
      x + 2 + day * 1.8,
      35,
      33,
      1.2,
      0,
      Math.max(0.6, share * MOVEMENT_STEPS),
      day === days.length - 1 ? P.gold : P.ok,
    ),
  ),
];

/** A lamp on the wall of the stairwell, hanging from an arm out over the deck by the door. */
const LANTERN = { x: 195, z: 88 } as const;
const wallLamp = (glass: string): Part[] => [
  box(LANTERN.x + 4, 3, LANTERN.z + 12, ROOM.width - LANTERN.x - 4, 2, 1.5, P.metalDark),
  box(LANTERN.x + 3, 3.5, LANTERN.z + 10, 1, 1, 2, P.metalDark),
  box(LANTERN.x - 1, 2, LANTERN.z + 8, 9, 5, 2, P.steel),
  box(LANTERN.x, 2.5, LANTERN.z, 7, 4, 8, glass),
  box(LANTERN.x - 0.5, 2, LANTERN.z - 1.5, 8, 5, 1.5, P.steel),
];
/** Its glass, drawn once more in light while the lamp is on. */
const LANTERN_PANE: readonly Part[] = [box(LANTERN.x, 2.5, LANTERN.z, 7, 4, 8, P.glow)];

function terrace({ glass, facts }: Setting): RoomArt {
  const deck = outdoors(P.deck, 'planks', [
    box(0, 0, 0, 2, 2, 22, P.metalDark),
    box(0, 20, 0, 2, 2, 22, P.metalDark),
    box(0, 0, 22, 2, BACK, 2, P.trim),
    ...railing(ROOM.width),
    ...plant(6, 26),
    ...legs(132, 16, 30, 14, 16, P.woodDark).slice(0, 2),
    box(144, 22, 0, 2, 2, 68, P.metalDark),
    box(30, 10, 0, 48, 16, 7, P.wood),
    box(30, 10, 7, 48, 16, 3, P.paper),
    box(52, 10, 10, 10, 16, 0.6, P.info),
    box(30, 10, 10, 5, 16, 14, P.wood),
    box(35, 11, 10, 8, 14, 3, P.accentSoft),
    ...legs(132, 16, 30, 14, 16, P.woodDark).slice(2),
    box(130, 14, 16, 34, 18, 3, P.wood),
    box(140, 20, 19, 6, 5, 4, P.info),
    box(114, 18, 0, 10, 10, 10, P.accent),
    box(168, 18, 0, 10, 10, 10, P.accent),
    box(118, 6, 68, 54, 30, 4, P.accent),
    ...[0, 2, 4].map((stripe) => box(118 + stripe * 10.8, 6, 68, 10.8, 0, 4, P.paper)),
    box(130, 12, 72, 30, 18, 3, P.accent),
    box(143, 20, 75, 4, 4, 2, P.gold),
    box(86, 3, 0, 28, 13, 1, P.plant),
    box(88, 5, 1, 24, 1, 0, P.plantLight),
    box(90, 18, 0, 3, 3, 4, P.steel),
    box(93, 19, 1, 6, 1, 2, P.metal),
    box(99, 18, 0, 3, 3, 4, P.steel),
    ...stepBoard(113, facts.movement),
    ...wallLamp(glass),
  ]);
  return { ...deck, lantern: LANTERN, glow: LANTERN_PANE };
}

type Builder = (setting: Setting) => RoomArt;

/** Art drawn `drawn` wide, in the middle of a standard room: the walls left and right of it are free for more. */
const centred =
  (build: Builder, drawn: number = DRAWN.art): Builder =>
  (setting) => {
    const inset = (ROOM.width - drawn) / 2;
    const art = build(setting);
    return {
      ...art,
      lamp: art.lamp + inset,
      parts: moved(art.parts, inset, 0),
      glow: art.glow && moved(art.glow, inset, 0),
      signs: art.signs?.map((sign) => ({ ...sign, x: sign.x + inset })),
    };
  };

/**
 * What every room of `building.config.ts` looks like, by its id. A closed standard room goes in `centred`; an
 * open room or one with a width of its own is drawn for its real width.
 */
export const ART: Readonly<Record<string, Builder>> = {
  serverraum: centred(serverRoom),
  pausenraum: centred(gamingCellar),
  werkstatt: centred(localWorkshop),
  empfang: centred(entrance),
  buero: centred(office),
  bibliothek: centred(library),
  dachterrasse: terrace,
  dachboden: centred(attic, 142),
};

/** A part as the space it takes: x, y and z from and to. */
type Extent = readonly [number, number, number, number, number, number];
const extentOf = (part: Part): Extent =>
  'r' in part
    ? [part.x - part.r, part.x + part.r, part.y, part.y, part.z - part.r, part.z + part.r]
    : [part.x, part.x + part.w, part.y, part.y + part.d, part.z, part.z + part.h];
const touch = (a: Extent, b: Extent): boolean =>
  [0, 2, 4].every((axis) => a[axis] <= b[axis + 1] + 0.6 && b[axis] <= a[axis + 1] + 0.6);

/** Which extents touch, directly or through others: the pieces of furniture they make up, as the index of the first one of each. */
export function piecesOf(extents: readonly Extent[]): number[] {
  const piece = extents.map((_, index) => index);
  const root = (index: number): number =>
    piece[index] === index ? index : (piece[index] = root(piece[index]));
  extents.forEach((a, i) =>
    extents.slice(i + 1).forEach((b, offset) => {
      if (touch(a, b)) piece[root(i + 1 + offset)] = root(i);
    }),
  );
  return piece.map((_, index) => root(index));
}

/** How far each extent moves: with the whole piece it belongs to, by where the middle of that piece is. */
function spreadOf(room: Room, extents: readonly Extent[]): number[] {
  const pieces = piecesOf(extents);
  const span = new Map<number, [number, number]>();
  pieces.forEach((piece, index) => {
    const [from, to] = span.get(piece) ?? [Infinity, -Infinity];
    span.set(piece, [Math.min(from, extents[index][0]), Math.max(to, extents[index][1])]);
  });
  return pieces.map((piece) => {
    const [from, to] = span.get(piece)!;
    return spreadBy(room, (from + to) / 2);
  });
}

/** The lamp and the writing on the wall as extents, so they go with the piece they hang on or by. */
const lampExtent = (x: number): Extent => [x - 1, x + 1, 16, 28, 120, 150];
const signExtent = (sign: Sign): Extent => {
  const y = sign.y ?? BACK;
  return [sign.x - 1, sign.x + 1, y, y, sign.z, sign.z + sign.size];
};

/** Every piece of furniture moved apart from the others, as `spread` of the room says; never torn apart itself. */
function spread(art: RoomArt, room: Room): RoomArt {
  if (!room.spread) return art;
  const glow = art.glow ?? [];
  const signs = art.signs ?? [];
  const dx = spreadOf(room, [
    ...art.parts.map(extentOf),
    ...glow.map(extentOf),
    ...signs.map(signExtent),
    lampExtent(art.lamp),
  ]);
  const glowFrom = art.parts.length;
  const signsFrom = glowFrom + glow.length;
  return {
    ...art,
    lamp: art.lamp + dx[signsFrom + signs.length],
    parts: art.parts.map((part, index) => ({ ...part, x: part.x + dx[index] })),
    glow: art.glow && glow.map((part, index) => ({ ...part, x: part.x + dx[glowFrom + index] })),
    signs: art.signs && signs.map((sign, index) => ({ ...sign, x: sign.x + dx[signsFrom + index] })),
  };
}

/** Indoors everything is lowered to the height of the room, as its things are: under the open sky nothing is. */
function lowered(art: RoomArt, room: Room): RoomArt {
  if (room.open) return art;
  const lower = (part: Part): Part =>
    'r' in part ? { ...part, z: part.z * LOWER } : { ...part, z: part.z * LOWER, h: part.h * LOWER };
  return {
    ...art,
    parts: art.parts.map(lower),
    glow: art.glow?.map(lower),
    signs: art.signs?.map((sign) => ({ ...sign, z: sign.z * LOWER })),
  };
}

export const roomArt = (room: Room, setting: Setting): RoomArt =>
  spread(lowered(ART[room.id](setting), room), room);
