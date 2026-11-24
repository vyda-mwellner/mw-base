import { box, Part, project } from './oblique';
import { P } from './palette';
import { JOINT, Limb, Pose } from './poses';

/** Boxes that turn together, drawn at `depth`: there they turn about their joints. */
interface Piece {
  readonly depth: number;
  readonly parts: readonly Part[];
}

/** `x` is the line the limb hangs on. */
interface Leg {
  readonly x: number;
  readonly depth: number;
  readonly thigh: readonly Part[];
  readonly shin: readonly Part[];
  readonly foot: readonly Part[];
}

interface Arm {
  readonly x: number;
  readonly depth: number;
  readonly upper: readonly Part[];
  readonly fore: readonly Part[];
}

/** The figure from one side, in the order it is painted. `toe` is where it tips over to lie down. */
interface FigureView {
  readonly farArm: Arm;
  readonly farLeg: Leg;
  readonly nearLeg: Leg;
  readonly trunk: Piece;
  readonly head: Piece;
  readonly face: readonly Part[];
  readonly nearArm: Arm;
  readonly toe: number;
}

const leg = (x: number): Leg => ({
  x: x + 3,
  depth: 8,
  foot: [
    box(x - 0.5, 6, 0, 6.5, 12, 1.5, P.sole),
    box(x - 0.5, 6.5, 1.5, 6.5, 11, 3, P.shoe),
    box(x - 0.5, 6.5, 2.2, 6.5, 0, 1, P.accent),
  ],
  shin: [box(x, 8, 4.5, 6, 8, 9, P.suit), box(x, 8, 4.5, 6, 0, 2, P.suitDark)],
  thigh: [box(x, 8, 13, 6, 8, 10, P.suit)],
});

const arm = (x: number): Arm => ({
  x: x + 2,
  depth: 8,
  fore: [
    box(x, 8, 26, 4, 8, 7, P.suit),
    box(x, 8, 24, 4, 8, 2.5, P.suitDark),
    box(x + 0.25, 8.5, 20, 3.5, 7, 4, P.skin),
  ],
  upper: [box(x, 8, 32.5, 4, 8, 10.5, P.suit)],
});

/** The figure stands 12 deep in a room, its feet at x 0, and shows its front while it stands. */
const FRONT: FigureView = {
  farArm: arm(-12),
  farLeg: leg(-7),
  nearLeg: leg(1),
  trunk: {
    depth: 7,
    parts: [
      box(-7, 11, 41, 14, 7, 6, P.suitDark),
      box(-8, 7, 22, 16, 10, 21, P.suit),
      box(-8, 7, 22, 16, 0, 3, P.suitDark),
      box(-7, 5.6, 25, 14, 1.4, 11, P.suit),
      box(-5, 5.6, 27, 10, 0, 6, P.suitDark),
      box(-2.5, 7, 35, 1, 0, 6, P.shoe),
      box(1.5, 7, 35, 1, 0, 6, P.shoe),
      box(3.5, 7, 36, 3, 0, 3, P.accent),
    ],
  },
  head: {
    depth: 5.5,
    parts: [
      box(-3, 9, 43, 6, 6, 2, P.skinDark),
      box(-9, 10, 50, 1, 3, 4, P.skinDark),
      box(-8, 5.5, 45, 16, 13, 14, P.skin),
      box(8, 10, 50, 1, 3, 4, P.skinDark),
      box(-8.5, 5, 58, 17, 14, 5, P.hair),
      box(-8, 5.5, 55, 16, 0, 3, P.hair),
      box(-8, 5.5, 52, 4, 0, 3, P.hair),
      box(6, 5.5, 53, 2, 0, 2, P.hair),
      box(-4, 5, 60.5, 7, 0, 1, P.hairLight),
      box(-5.5, 5.5, 53.6, 3, 0, 1, P.hair),
      box(2, 5.5, 53.6, 3, 0, 1, P.hair),
      box(-6.5, 5.5, 47.6, 2, 0, 1.5, P.blush),
      box(4.5, 5.5, 47.6, 2, 0, 1.5, P.blush),
      box(-2, 5.5, 46.8, 4, 0, 1, P.mouth),
    ],
  },
  face: [
    box(-5, 5.5, 49.5, 2.5, 0, 3.5, P.ink),
    box(2.5, 5.5, 49.5, 2.5, 0, 3.5, P.ink),
    box(-5, 5.5, 52, 1, 0, 1, P.shoe),
    box(2.5, 5.5, 52, 1, 0, 1, P.shoe),
  ],
  nearArm: arm(8),
  toe: 0,
};

/**
 * From the side the figure looks the way it goes: `ahead` is 1 looking right and -1 looking left. Only the side
 * of a box that faces right shows, so the face is there to see looking right and hidden looking left.
 */
function profile(ahead: 1 | -1): FigureView {
  /** A box given as if looking right, turned round for looking left. */
  const part = (x: number, y: number, z: number, w: number, d: number, h: number, color: string): Part =>
    box(ahead > 0 ? x : -x - w, y, z, w, d, h, color);
  const nose = part(7, 10, 49.5, 1.5, 4, 2.5, P.skinDark);
  const hood = part(-7.5, 7, 41, 3, 10, 5, P.suitDark);
  const trunk = [
    part(-5, 4, 22, 10, 16, 21, P.suit),
    part(-5, 4, 22, 10, 0, 3, P.suitDark),
    part(5, 5, 25, 1.6, 14, 11, P.suit),
  ];
  const head = [
    part(-2, 7, 43, 5, 10, 2, P.skinDark),
    part(-6, 5.5, 45, 13, 13, 14, P.skin),
    part(-6.5, 5, 58, 14, 14, 5, P.hair),
    part(-6, 5.5, 48, 5, 0, 10, P.hair),
    part(-1, 5.5, 55, 8, 0, 3, P.hair),
    part(-0.5, 5.5, 50, 2.5, 0, 4, P.skinDark),
    part(-3.5, 5, 60.5, 7, 0, 1, P.hairLight),
  ];
  const side = (depth: number, color: string, hand: string): Arm => ({
    x: 0,
    depth,
    fore: [
      part(-2.5, depth, 26, 5, 3, 7, color),
      part(-2.5, depth, 24, 5, 3, 2.5, P.suitDark),
      part(-2, depth + 0.5, 20, 4, 2.5, 4, hand),
    ],
    upper: [part(-2.5, depth, 32.5, 5, 3, 10.5, color)],
  });
  return {
    farArm: side(18, P.suitDark, P.skinDark),
    farLeg: {
      x: 0,
      depth: 12,
      foot: [part(-3.5, 12, 0, 10, 6, 1.5, P.sole), part(-3.5, 12, 1.5, 10, 6, 3, P.shoe)],
      shin: [part(-3, 12, 4.5, 6, 6, 9, P.suitDark)],
      thigh: [part(-3, 12, 13, 6, 6, 10, P.suitDark)],
    },
    nearLeg: {
      x: 0,
      depth: 5,
      foot: [
        part(-3.5, 5, 0, 10, 6, 1.5, P.sole),
        part(-3.5, 5, 1.5, 10, 6, 3, P.shoe),
        part(-1.5, 5, 2.2, 5, 0, 1, P.accent),
      ],
      shin: [part(-3, 5, 4.5, 6, 6, 9, P.suit), part(-3, 5, 4.5, 6, 0, 2, P.suitDark)],
      thigh: [part(-3, 5, 13, 6, 6, 10, P.suit)],
    },
    trunk: { depth: 4, parts: ahead > 0 ? [hood, ...trunk] : [...trunk, hood] },
    head: { depth: 5.5, parts: ahead > 0 ? [...head, nose] : [nose, ...head] },
    face:
      ahead > 0
        ? [
            box(7, 7, 50, 0, 3, 3.5, P.ink),
            box(7, 13.5, 50, 0, 3, 3.5, P.ink),
            box(7, 9.5, 46.8, 0, 4, 1, P.mouth),
          ]
        : [box(-5.5, 5.5, 50, 2.5, 0, 3.5, P.ink), box(-5.5, 5.5, 52.5, 1, 0, 1, P.shoe)],
    nearArm: side(1, P.suit, P.skin),
    toe: 6.5 * ahead,
  };
}

export const FIGURE = { front: FRONT, right: profile(1), left: profile(-1) } as const;

interface Layer {
  readonly key: string;
  readonly parts: readonly Part[];
  /** Every joint from the hips out to this piece, outermost first, as SVG reads it. */
  readonly transform: string | null;
  readonly face: boolean;
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** The pieces of a view in their pose, back to front. `ahead` turns a pose given looking right round. */
export function layersOf(view: FigureView, pose: Pose, ahead: 1 | -1): Layer[] {
  const turn = (angle: number, x: number, z: number, depth: number): string[] => {
    if (angle === 0) return [];
    const [px, py] = project(x, depth, z);
    return [`rotate(${round(angle * ahead)} ${round(px)} ${round(py)})`];
  };
  const { hips } = pose;
  const shift = hips.x || hips.z ? [`translate(${round(hips.x * ahead)} ${round(-hips.z)})`] : [];
  const body = (depth: number): string[] => [...turn(pose.lean, view.toe, 0, depth), ...shift];
  const trunk = (depth: number): string[] => [...body(depth), ...turn(pose.waist, 0, JOINT.waist, depth)];
  const layer = (key: string, parts: readonly Part[], chain: string[], face = false): Layer => ({
    key,
    parts,
    transform: chain.join(' ') || null,
    face,
  });
  const arm = (side: string, art: Arm, limb: Limb): Layer[] => {
    const upper = [...trunk(art.depth), ...turn(limb.shoulder, art.x, JOINT.shoulder, art.depth)];
    const fore = [...upper, ...turn(limb.elbow, art.x, JOINT.elbow, art.depth)];
    return [layer(`${side}-fore`, art.fore, fore), layer(`${side}-upper`, art.upper, upper)];
  };
  const leg = (side: string, art: Leg, limb: Limb): Layer[] => {
    const thigh = [...body(art.depth), ...turn(limb.hip, art.x, JOINT.hip, art.depth)];
    const shin = [...thigh, ...turn(limb.knee, art.x, JOINT.knee, art.depth)];
    const foot = [...shin, ...turn(limb.ankle, art.x, JOINT.ankle, art.depth)];
    return [
      layer(`${side}-foot`, art.foot, foot),
      layer(`${side}-shin`, art.shin, shin),
      layer(`${side}-thigh`, art.thigh, thigh),
    ];
  };
  const neck = [...trunk(view.head.depth), ...turn(pose.neck, 0, JOINT.neck, view.head.depth)];
  return [
    ...arm('far', view.farArm, pose.far),
    ...leg('far', view.farLeg, pose.far),
    ...leg('near', view.nearLeg, pose.near),
    layer('trunk', view.trunk.parts, trunk(view.trunk.depth)),
    layer('head', view.head.parts, neck),
    layer('face', view.face, neck, true),
    ...arm('near', view.nearArm, pose.near),
  ];
}

/** The lift cab, its floor level with the storey it stands on. */
export const CAB: readonly Part[] = [
  box(17, 13, 100, 2, 2, 760, P.metalDark),
  box(2, 26, 0, 32, 0, 96, P.metalDark),
  box(4, 26, 4, 28, 0, 88, P.cabin),
  box(4, 26, 4, 28, 0, 34, P.woodDark),
  box(7, 26, 50, 16, 0, 30, P.sheet),
  box(9, 26, 74, 5, 0, 1.2, P.shoe),
  box(11.5, 26, 71.4, 2.5, 0, 1.2, P.shoe),
  box(4, 25, 40, 22, 1, 2, P.gold),
  box(27, 26, 42, 5, 0, 16, P.steel),
  box(28, 26, 53, 3, 0, 3, P.glow),
  box(28, 26, 48, 3, 0, 3, P.metal),
  box(28, 26, 43, 3, 0, 3, P.metal),
  box(2, 2, -3, 32, 24, 3, P.metal),
  box(6, 6, 0, 24, 16, 0, P.bad),
  box(8, 8, 94, 18, 10, 2, P.glow),
  box(2, 2, 96, 32, 24, 4, P.metal),
];
