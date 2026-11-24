/** What the figure can do; standing, the jumping jack and the side leg raise face the viewer, the rest its side. */
export type FigureMove =
  | 'stand'
  | 'walk'
  | 'run'
  | 'jack'
  | 'squat'
  | 'lunge'
  | 'push'
  | 'knees'
  | 'plank'
  | 'sit'
  | 'climb'
  | 'punch'
  | 'touch'
  | 'leap'
  | 'raise';

/** Heights of the joints above the floor while it stands; every limb hangs straight down from its first joint. */
export const JOINT = {
  hip: 21.5,
  knee: 13.5,
  ankle: 4.5,
  waist: 22,
  neck: 44,
  shoulder: 41,
  elbow: 33,
  fingers: 20,
} as const;
/** The sole from heel to toe, from the ankle, looking right. */
const FOOT = { heel: -3.5, toe: 6.5 } as const;

const THIGH = JOINT.hip - JOINT.knee;
const SHIN = JOINT.knee - JOINT.ankle;
const UPPER_ARM = JOINT.shoulder - JOINT.elbow;
const FOREARM = JOINT.elbow - JOINT.fingers;
/** Half the thickness of the forearm: lying on the floor, the elbow is this high. */
const SLEEVE = 2.5;

/** Seen from the side looking right: x ahead, z up, from the spot the figure stands on. */
export interface Point {
  readonly x: number;
  readonly z: number;
}

/** Angles in degrees, each against the part above; positive turns clockwise looking right, a hanging end goes back. */
export interface Limb {
  readonly shoulder: number;
  readonly elbow: number;
  readonly hip: number;
  readonly knee: number;
  readonly ankle: number;
}

export interface Pose {
  /** The whole figure tipped over its toes, to lie on the floor. */
  readonly lean: number;
  readonly hips: Point;
  readonly waist: number;
  readonly neck: number;
  readonly near: Limb;
  readonly far: Limb;
}

const RAD = Math.PI / 180;
const TAU = 2 * Math.PI;
const TOE: Point = { x: FOOT.toe, z: 0 };

const STRAIGHT: Limb = { shoulder: 0, elbow: 0, hip: 0, knee: 0, ankle: 0 };
const STAND: Pose = { lean: 0, hips: { x: 0, z: 0 }, waist: 0, neck: 0, near: STRAIGHT, far: STRAIGHT };

function turned(point: Point, around: Point, angle: number): Point {
  const [dx, dz] = [point.x - around.x, point.z - around.z];
  const [cos, sin] = [Math.cos(angle * RAD), Math.sin(angle * RAD)];
  return { x: around.x + dx * cos + dz * sin, z: around.z - dx * sin + dz * cos };
}

/** The end of a limb hanging from `from` at an angle against the floor: 0 is straight down, -90 straight ahead. */
const along = (from: Point, angle: number, length: number): Point => ({
  x: from.x - length * Math.sin(angle * RAD),
  z: from.z - length * Math.cos(angle * RAD),
});

const angleTo = (from: Point, to: Point): number => Math.atan2(from.x - to.x, from.z - to.z) / RAD;

/**
 * The angles against the floor of a limb in two parts that reaches from `root` to `end`, the joint between them
 * ahead (1) or behind (-1). Out of reach it stretches towards the end.
 */
function reach(
  root: Point,
  end: Point,
  upper: number,
  lower: number,
  bend: 1 | -1,
): readonly [number, number] {
  const span = Math.min(
    upper + lower,
    Math.max(Math.abs(upper - lower), Math.hypot(end.x - root.x, end.z - root.z)),
  );
  const spread = Math.acos((upper ** 2 + span ** 2 - lower ** 2) / (2 * upper * span)) / RAD;
  const line = angleTo(root, end);
  const [one, other] = [line - spread, line + spread];
  const first = (along(root, one, upper).x - along(root, other, upper).x) * bend >= 0 ? one : other;
  return [first, angleTo(along(root, first, upper), end)];
}

/** A leg from the moved hips down to `ankle`, the foot at `foot` against the floor. */
function planted(hips: Point, ankle: Point, foot: number): Pick<Limb, 'hip' | 'knee' | 'ankle'> {
  const [thigh, shin] = reach({ x: hips.x, z: JOINT.hip + hips.z }, ankle, THIGH, SHIN, 1);
  return { hip: thigh, knee: shin - thigh, ankle: foot - shin };
}

function soleOf(limb: Limb): Point[] {
  const knee = along({ x: 0, z: JOINT.hip }, limb.hip, THIGH);
  const ankle = along(knee, limb.hip + limb.knee, SHIN);
  const foot = limb.hip + limb.knee + limb.ankle;
  return [FOOT.heel, FOOT.toe].map((x) => turned({ x: ankle.x + x, z: ankle.z - JOINT.ankle }, ankle, foot));
}

function fingersOf(limb: Limb, waist: number): Point {
  const shoulder = turned({ x: 0, z: JOINT.shoulder }, { x: 0, z: JOINT.waist }, waist);
  const elbow = along(shoulder, waist + limb.shoulder, UPPER_ARM);
  return along(elbow, waist + limb.shoulder + limb.elbow, FOREARM);
}

/** Where the fingertips and the heels and toes are: near limb first. */
export function endsOf(pose: Pose): { readonly hands: readonly Point[]; readonly soles: readonly Point[] } {
  const placed = (point: Point): Point =>
    turned({ x: point.x + pose.hips.x, z: point.z + pose.hips.z }, TOE, pose.lean);
  return {
    hands: [pose.near, pose.far].map((limb) => placed(fingersOf(limb, pose.waist))),
    soles: [pose.near, pose.far].flatMap((limb) => soleOf(limb).map(placed)),
  };
}

/** Moved up or down until the lower foot stands on the floor, then `hop` higher. */
function grounded(pose: Pose, hop = 0): Pose {
  const lowest = Math.min(...endsOf(pose).soles.map((point) => point.z));
  return { ...pose, hips: { x: pose.hips.x, z: pose.hips.z - lowest + hop } };
}

/** How far it leans over its toes for its shoulders to be this high. */
function leanFor(height: number): number {
  const [dx, dz] = [-FOOT.toe, JOINT.shoulder];
  return (Math.atan2(-dx, dz) + Math.acos(height / Math.hypot(dx, dz))) / RAD;
}

/** From 0 up to 1 and back within one beat, slow at both ends. */
const swell = (beat: number): number => (1 - Math.cos(TAU * beat)) / 2;
const between = (from: number, to: number, share: number): number => from + (to - from) * share;
const smooth = (share: number): number => {
  const t = Math.min(1, Math.max(0, share));
  return t * t * (3 - 2 * t);
};

interface Gait {
  readonly swing: number;
  readonly knee: number;
  readonly arm: number;
  readonly elbow: number;
  readonly lean: number;
}

const WALK: Gait = { swing: 22, knee: 45, arm: 16, elbow: 12, lean: 3 };
const RUN: Gait = { swing: 30, knee: 80, arm: 30, elbow: 75, lean: 9 };

/** Two steps a beat: the near heel comes down at the start, the far one halfway. */
function stride(gait: Gait, beat: number): Pose {
  const limb = (shift: number): Limb => {
    const turn = TAU * (beat + shift);
    const hip = -gait.swing * Math.cos(turn);
    // The foot is off the floor while the thigh swings ahead; the knee folds most early in that.
    const knee = 5 + gait.knee * Math.max(0, -Math.sin(turn + 0.3)) ** 2;
    return {
      hip,
      knee,
      ankle: -0.75 * (hip + knee),
      shoulder: gait.arm * Math.cos(turn),
      elbow: -gait.elbow - 10 * Math.max(0, -Math.cos(turn)),
    };
  };
  return grounded({ ...STAND, waist: gait.lean, neck: -gait.lean / 2, near: limb(0), far: limb(0.5) });
}

/** Seen from the front: open with the arms overhead halfway, a hop in between. */
function jack(beat: number): Pose {
  const open = swell(beat);
  const side = (out: 1 | -1): Limb => ({
    shoulder: -155 * open * out,
    elbow: -15 * open * out,
    hip: -10 * open * out,
    knee: 0,
    ankle: 10 * open * out,
  });
  return grounded({ ...STAND, near: side(1), far: side(-1) }, 4 * Math.abs(Math.sin(TAU * beat)));
}

/** Seen from the front: one leg lifted out to the side and lowered, then the other, the hands on the hips. */
function raise(beat: number): Pose {
  const lift = (shift: number): number => Math.max(0, -Math.cos(TAU * (beat + shift))) ** 1.5;
  const [near, far] = [lift(0), lift(0.5)];
  const side = (out: 1 | -1, up: number): Limb => ({
    shoulder: -45 * out,
    elbow: 83 * out,
    hip: -40 * up * out,
    knee: 0,
    ankle: 15 * up * out,
  });
  const waist = 6 * (far - near);
  return grounded({ ...STAND, waist, neck: -waist, near: side(1, near), far: side(-1, far) });
}

/** Down until the thighs are level at 1, the seat back and the arms ahead for balance. */
function crouch(down: number): Pose {
  const hips = { x: -4 * down, z: -THIGH * down };
  const leg = { ...planted(hips, { x: 0, z: JOINT.ankle }, 0), shoulder: -110 * down, elbow: 0 };
  return { ...STAND, hips, waist: 25 * down, neck: -12 * down, near: leg, far: leg };
}

const squat = (beat: number): Pose => crouch(swell(beat));

/** Down into a squat, up into a jump with the arms high, and a soft landing. */
function leap(beat: number): Pose {
  const at = beat - Math.floor(beat);
  const flight = at >= 0.5 && at < 0.8 ? Math.sin((Math.PI * (at - 0.5)) / 0.3) : 0;
  const down =
    at < 0.35
      ? smooth(at / 0.35)
      : at < 0.5
        ? 1 - smooth((at - 0.35) / 0.15)
        : at < 0.8
          ? 0
          : 0.4 * Math.sin((Math.PI * (at - 0.8)) / 0.2);
  const arms = at < 0.6 ? smooth((at - 0.38) / 0.17) : 1 - smooth((at - 0.75) / 0.2);
  const pose = crouch(0.7 * down);
  const limb = (limb: Limb): Limb => ({
    ...limb,
    shoulder: between(limb.shoulder, -165, arms),
    ankle: limb.ankle + 25 * flight,
  });
  return {
    ...pose,
    hips: { x: pose.hips.x, z: pose.hips.z + 10 * flight },
    near: limb(pose.near),
    far: limb(pose.far),
  };
}

/** A step ahead, down until the back knee nearly touches, and back; the legs take turns. */
function lunge(beat: number): Pose {
  const deep = swell(beat);
  const out = smooth(deep / 0.5);
  const hips = { x: 9 * deep, z: -7.5 * smooth((deep - 0.3) / 0.7) };
  const heel = 45 * deep;
  const front = planted(hips, { x: 17 * out, z: JOINT.ankle + 3 * Math.sin(Math.PI * out) }, 0);
  const back = planted(hips, turned({ x: 0, z: JOINT.ankle }, TOE, heel), heel);
  const arms = { shoulder: -10 * deep, elbow: -20 * deep };
  const [near, far] = Math.floor(beat) % 2 === 0 ? [front, back] : [back, front];
  return { ...STAND, hips, waist: 4 * deep, near: { ...near, ...arms }, far: { ...far, ...arms } };
}

const STRETCHED = JOINT.shoulder - JOINT.fingers;
const HANDS: Point = { x: turned({ x: 0, z: JOINT.shoulder }, TOE, leanFor(STRETCHED)).x, z: 0 };

/** On the toes and the hands, the arms bent until the chest is near the floor. */
function push(beat: number): Pose {
  // Tipped over, the slanted sides of the boxes point down: any lower and they would reach through the floor.
  const lean = leanFor(STRETCHED - 9 * swell(beat));
  const shoulder = turned({ x: 0, z: JOINT.shoulder }, TOE, lean);
  const [upper, fore] = reach(shoulder, HANDS, UPPER_ARM, FOREARM, -1);
  const arm = { ...STRAIGHT, shoulder: upper - lean, elbow: fore - upper };
  return { ...STAND, lean, neck: -15, near: arm, far: arm };
}

/** Running on the spot, a knee up to the hips at every half beat. */
function knees(beat: number): Pose {
  const limb = (shift: number): Limb => {
    const turn = TAU * (beat + shift);
    const lift = Math.max(0, -Math.cos(turn)) ** 1.5;
    return { hip: -80 * lift, knee: 90 * lift, ankle: 0, shoulder: -35 * Math.cos(turn), elbow: -80 };
  };
  return grounded({ ...STAND, near: limb(0), far: limb(0.5) }, 1.5 * Math.abs(Math.sin(TAU * beat)));
}

/** From the top of a push-up, a knee pulled in under the chest, the legs in turn; the foot never touches down. */
function climb(beat: number): Pose {
  const top = push(0);
  const hip = turned({ x: 0, z: JOINT.hip }, TOE, top.lean);
  const back = turned({ x: 0, z: JOINT.ankle }, TOE, top.lean);
  const leg = (limb: Limb, shift: number): Limb => {
    const pull = Math.max(0, -Math.cos(TAU * (beat + shift))) ** 1.5;
    const ankle = {
      x: between(back.x, hip.x + 6, pull),
      z: between(back.z, 7, pull) + 3 * Math.sin(Math.PI * pull),
    };
    const [thigh, shin] = reach(hip, ankle, THIGH, SHIN, 1);
    return { ...limb, hip: thigh - top.lean, knee: shin - thigh, ankle: between(top.lean, 0, pull) - shin };
  };
  return { ...top, near: leg(top.near, 0), far: leg(top.far, 0.5) };
}

/** Feet apart and the fists up before the face, a straight punch with each hand in turn, on light feet. */
function punch(beat: number): Pose {
  const hips = { x: 0.5, z: -1.5 };
  const arm = (shift: number) => {
    const out = Math.max(0, -Math.cos(TAU * (beat + shift))) ** 3;
    return { shoulder: -40 - 45 * out, elbow: -110 + 105 * out };
  };
  return {
    ...STAND,
    hips: { x: hips.x, z: hips.z + Math.abs(Math.sin(TAU * 2 * beat)) },
    waist: 6,
    neck: -6,
    near: { ...planted(hips, { x: 4, z: JOINT.ankle }, 0), ...arm(0) },
    far: { ...planted(hips, { x: -4, z: JOINT.ankle }, 0), ...arm(0.5) },
  };
}

/** The arms high, then folded down from the waist until the fingertips reach the toes. */
function touch(beat: number): Pose {
  const down = swell(beat);
  const hips = { x: -6 * down, z: -1.5 * down };
  const waist = 95 * down;
  const bent = turned({ x: 0, z: JOINT.shoulder }, { x: 0, z: JOINT.waist }, waist);
  const shoulder = { x: bent.x + hips.x, z: bent.z + hips.z };
  const [upper, fore] = reach(shoulder, { x: FOOT.toe - 1, z: 1 }, UPPER_ARM, FOREARM, 1);
  const arm = {
    shoulder: between(-170, upper - waist, down),
    elbow: between(0, fore - upper, down),
  };
  const leg = { ...planted(hips, { x: 0, z: JOINT.ankle }, 0), ...arm };
  return { ...STAND, hips, waist, neck: -25 * down, near: leg, far: leg };
}

const PLANK: Pose = (() => {
  const lean = leanFor(UPPER_ARM + SLEEVE);
  const arm = { ...STRAIGHT, shoulder: -lean, elbow: -90 };
  return { ...STAND, lean, neck: -20, near: arm, far: arm };
})();

/** The back against a wall behind it, the thighs level and the hands on the knees. */
const SIT: Pose = (() => {
  const hips = { x: -THIGH, z: -THIGH };
  const leg = { ...planted(hips, { x: 0, z: JOINT.ankle }, 0), shoulder: -30, elbow: -15 };
  return { ...STAND, hips, near: leg, far: leg };
})();

const MOVES: Record<FigureMove, (beat: number) => Pose> = {
  stand: () => STAND,
  walk: (beat) => stride(WALK, beat),
  run: (beat) => stride(RUN, beat),
  jack,
  squat,
  lunge,
  push,
  knees,
  plank: () => PLANK,
  sit: () => SIT,
  climb,
  punch,
  touch,
  leap,
  raise,
};

/** One beat is one repetition, or two steps. */
export const poseAt = (move: FigureMove, beat: number): Pose => MOVES[move](beat);
/** Halfway through, every move shows what it is about: held there when motion is turned off. */
export const HELD_BEAT = 0.5;

export const facesFront = (move: FigureMove): boolean =>
  move === 'stand' || move === 'jack' || move === 'raise';
