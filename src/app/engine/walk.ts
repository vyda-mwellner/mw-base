import type { Spot } from './model';
import {
  CAB_REACH,
  DOORS,
  GROUND_FLOOR,
  HOUSE_END,
  roomAt,
  SHAFT,
  TOP_FLOOR,
  walkMax,
  walkMin,
} from './plan';

/**
 * One stretch of a way: along a floor to an x, in the lift to a floor, turning round, waiting for the lift doors,
 * or a step back into the cab and out of it again.
 */
export type Leg =
  | { readonly walk: number }
  | { readonly ride: number }
  | { readonly turn: 1 | -1 }
  | { readonly wait: number; readonly doors: 'closing' | 'opening' }
  | { readonly back: number };

export interface Motion {
  readonly x: number;
  /** The floor; fractional while the lift is between two. */
  readonly level: number;
  readonly facing: 1 | -1;
  readonly legs: readonly Leg[];
  /** How high the feet are above the floor in a jump, and how fast they rise. */
  readonly air: number;
  readonly rise: number;
  /** Floors per second the lift is moving at, upwards positive. */
  readonly speed: number;
  /** In the cab of the lift: from the moment its doors open for the figure until it has walked out again. */
  readonly aboard: boolean;
  /** How far behind the line it walks on the figure stands: in the cab a step back, behind the glass doors. */
  readonly depth: number;
}

/** House pixels per second - a room in about two seconds. */
const WALK_SPEED = 100;
/** Floors per second at full speed, and per second squared while the lift starts and stops: it does both gently. */
const LIFT_SPEED = 0.55;
const LIFT_PULL = 0.55;
/** The lift is moved in steps this short, however long the frame was, so it brakes at the same spot every time. */
const LIFT_STEP = 1 / 120;
/** Seconds the lift doors take, and how close to them W or S still calls the lift. */
const DOOR_TIME = 0.55;
const CALL_REACH = 30;
/** How deep the cab is stepped into, and how fast: a step back takes under half a second. */
export const CAB_DEPTH = 16;
const STEP_SPEED = 40;
/** House pixels per second and per second squared: half a second in the air, a good 20 pixels high. */
const JUMP_SPEED = 170;
const GRAVITY = 640;

const isAirborne = (motion: Motion): boolean => motion.air > 0 || motion.rise > 0;
export const isMoving = (motion: Motion): boolean => motion.legs.length > 0 || isAirborne(motion);
const isRiding = (motion: Motion): boolean => !Number.isInteger(motion.level);
/** In front of the lift doors, near enough to call it: walking past does nothing, a key opens them. */
export const atLift = (motion: Motion): boolean => Math.abs(motion.x - SHAFT.x) <= CALL_REACH;
/** How hard the lift is working, from 0 standing to 1 at full speed. */
export const liftLoad = (motion: Motion): number => Math.abs(motion.speed) / LIFT_SPEED;

/** The doors of the lift stand open for the figure in the cab, from closing until arrival they are shut. */
export function openDoor(motion: Motion): boolean {
  const leg = motion.legs[0];
  const shut = leg !== undefined && ('ride' in leg || ('wait' in leg && leg.doors === 'closing'));
  return motion.aboard && !isRiding(motion) && !shut;
}

/** How close to a door out of the house the figure has to be for it to stand open; the cab of the lift is further. */
const DOOR_OUT_REACH = 20;

/** The door out of the house that stands open: the one the figure is at. Doors on other floors share its x. */
export function doorOut(motion: Motion): Spot | null {
  return (
    DOORS.find((each) => each.floor === motion.level && Math.abs(motion.x - each.x) <= DOOR_OUT_REACH) ?? null
  );
}

/** Out of the front door, in the yard. */
export const inYard = (motion: Motion): boolean => motion.level === GROUND_FLOOR && motion.x > HOUSE_END;

/** Under the open sky: on a terrace, or out of the front door. */
export function isOutside(motion: Motion): boolean {
  if (isRiding(motion)) return false;
  return roomAt(motion.level, motion.x)?.open === true || inYard(motion);
}

/** To the doors, which open, and a step back into the cab: as much of it as the figure has not done yet. */
const board = (motion: Motion): Leg[] => [
  ...(motion.depth > 0 ? [] : [{ walk: SHAFT.x }]),
  ...(motion.aboard ? [] : [{ wait: DOOR_TIME, doors: 'opening' as const }]),
  ...(motion.depth < CAB_DEPTH ? [{ back: CAB_DEPTH }] : []),
];
/** Out of the cab: a step forward first, back onto the line the figure walks on. */
const alight = (motion: Motion): Leg[] => (motion.depth > 0 ? [{ back: 0 }] : []);

const ride = (floor: number): Leg[] => [
  { wait: DOOR_TIME, doors: 'closing' },
  { ride: floor },
  { wait: DOOR_TIME, doors: 'opening' },
];

export function legsTo(from: Motion, to: Spot): Leg[] {
  const x = Math.min(walkMax(to.floor), Math.max(walkMin(to.floor), to.x));
  const way: Leg[] =
    from.level === to.floor
      ? [...alight(from), { walk: x }]
      : [...board(from), ...ride(to.floor), { back: 0 }, { walk: x }];
  return to.facing ? [...way, { turn: to.facing }] : way;
}

/** Walking on until told otherwise - an arrow key held down. `max` is how far right it goes. Ignored in the lift. */
export function stride(motion: Motion, direction: 1 | -1, max = walkMax(motion.level)): Motion {
  if (isRiding(motion)) return motion;
  return { ...motion, legs: [...alight(motion), { walk: direction > 0 ? max : walkMin(motion.level) }] };
}

/** The key was let go. A lift ride and the way to it are finished first, a step out of the cab too. */
export function halt(motion: Motion): Motion {
  const striding = motion.legs.length > 0 && motion.legs.every((leg) => 'walk' in leg || 'back' in leg);
  return striding ? { ...motion, legs: motion.legs.filter((leg) => 'back' in leg) } : motion;
}

const storey = (floor: number): number => Math.min(TOP_FLOOR, Math.max(0, floor));

/**
 * One floor up or down, for a figure in the cab or in front of its doors; as far as the house goes. Pressed
 * again before the cab has arrived, it goes one floor further: twice up is two floors up.
 */
export function rideBy(motion: Motion, step: 1 | -1): Motion {
  if (motion.legs.some((leg) => 'ride' in leg)) {
    return {
      ...motion,
      legs: motion.legs.map((leg) => ('ride' in leg ? { ride: storey(leg.ride + step) } : leg)),
    };
  }
  if (isRiding(motion) || isAirborne(motion) || !(motion.aboard || atLift(motion))) return motion;
  const floor = storey(motion.level + step);
  return floor === motion.level ? motion : { ...motion, legs: [...board(motion), ...ride(floor)] };
}

/** Off the floor, unless the figure is in the air already or in the cab. */
export function jump(motion: Motion): Motion {
  return isRiding(motion) || isAirborne(motion) || motion.depth > 0
    ? motion
    : { ...motion, rise: JUMP_SPEED };
}

/** Moves along the legs for `seconds`; time left over at the end of a leg goes into the next one. */
export function advance(motion: Motion, seconds: number): Motion {
  let { x, level, facing, speed, aboard, depth } = motion;
  const { air, rise } = fall(motion, seconds);
  let legs = motion.legs;
  let left = seconds;
  while (legs.length > 0 && left > 0) {
    const leg = legs[0];
    if ('walk' in leg) {
      const distance = leg.walk - x;
      const reach = WALK_SPEED * left;
      if (distance !== 0) facing = distance > 0 ? 1 : -1;
      if (Math.abs(distance) > reach) {
        x += Math.sign(distance) * reach;
        break;
      }
      left -= Math.abs(distance) / WALK_SPEED;
      x = leg.walk;
    } else if ('turn' in leg) {
      facing = leg.turn;
    } else if ('back' in leg) {
      aboard = true;
      const way = leg.back - depth;
      const reach = STEP_SPEED * left;
      if (Math.abs(way) > reach) {
        depth += Math.sign(way) * reach;
        break;
      }
      left -= Math.abs(way) / STEP_SPEED;
      depth = leg.back;
    } else if ('wait' in leg) {
      aboard = true;
      if (leg.wait > left) {
        legs = [{ ...leg, wait: leg.wait - left }, ...legs.slice(1)];
        break;
      }
      left -= leg.wait;
    } else {
      aboard = true;
      const ride = lift(level, speed, leg.ride, left);
      ({ level, speed, left } = ride);
      if (level !== leg.ride) break;
    }
    legs = legs.slice(1);
  }
  // Without frames to fall in, as with reduced motion, the figure is on the ground where it ends up.
  const feet = Number.isFinite(seconds) ? { air, rise } : { air: 0, rise: 0 };
  const inside = depth > 0 || Math.abs(x - SHAFT.x) <= CAB_REACH;
  return { x, level, facing, legs, ...feet, speed, aboard: aboard && inside, depth };
}

/** The cab on its way to a floor: it gathers speed, and slows down in time to stop there. */
function lift(level: number, speed: number, target: number, seconds: number) {
  if (!Number.isFinite(seconds)) return { level: target, speed: 0, left: seconds };
  let left = seconds;
  while (left > 0) {
    const way = target - level;
    if (Math.abs(way) < 0.004 && Math.abs(speed) < 0.2) return { level: target, speed: 0, left };
    const step = Math.min(left, LIFT_STEP);
    const wanted = Math.sign(way) * Math.min(LIFT_SPEED, Math.sqrt(2 * LIFT_PULL * Math.abs(way)));
    const change = Math.min(Math.abs(wanted - speed), LIFT_PULL * step);
    speed += Math.sign(wanted - speed) * change;
    level += speed * step;
    left -= step;
  }
  return { level, speed, left: 0 };
}

function fall(motion: Motion, seconds: number): Pick<Motion, 'air' | 'rise'> {
  if (!isAirborne(motion)) return { air: 0, rise: 0 };
  const air = motion.air + motion.rise * seconds - (GRAVITY * seconds * seconds) / 2;
  return air > 0 ? { air, rise: motion.rise - GRAVITY * seconds } : { air: 0, rise: 0 };
}

/** Something to hear between two moments of a motion. */
type Cue =
  | 'doors-open'
  | 'doors-close'
  | 'door-open'
  | 'door-close'
  | 'ride-start'
  | 'ride-stop'
  | 'jump'
  | 'land'
  | 'step';

/** A step of the figure in house pixels, and what the pedometer takes for a metre. */
export const STEP_LENGTH = 38;
const onRide = (motion: Motion): boolean => motion.legs[0] !== undefined && 'ride' in motion.legs[0];

export function cuesOf(before: Motion, after: Motion): Cue[] {
  const cues: Cue[] = [];
  if (openDoor(before) !== openDoor(after)) cues.push(openDoor(after) ? 'doors-open' : 'doors-close');
  if (doorOut(before) !== doorOut(after)) cues.push(doorOut(after) === null ? 'door-close' : 'door-open');
  if (onRide(before) !== onRide(after)) cues.push(onRide(after) ? 'ride-start' : 'ride-stop');
  if (!isAirborne(before) && after.rise > 0) cues.push('jump');
  if (isAirborne(before) && !isAirborne(after)) cues.push('land');
  if (!isAirborne(after) && Math.floor(before.x / STEP_LENGTH) !== Math.floor(after.x / STEP_LENGTH))
    cues.push('step');
  return cues;
}
