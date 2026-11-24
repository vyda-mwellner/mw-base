import { DOORS, GROUND_FLOOR, HOUSE_END, ROOMS, SHAFT, TOP_FLOOR, WALK } from './plan';
import {
  advance,
  CAB_DEPTH,
  cuesOf,
  doorOut,
  halt,
  isMoving,
  inYard,
  isOutside,
  jump,
  legsTo,
  Motion,
  openDoor,
  rideBy,
  stride,
} from './walk';

/** The ground floor and one beside it: the specs hold for any building of three floors or more. */
const G = GROUND_FLOOR;
const UP = G < TOP_FLOOR ? G + 1 : G - 1;
const TOWARDS: 1 | -1 = UP > G ? 1 : -1;

const at = (x: number, level: number, legs: Motion['legs'] = []): Motion => ({
  x,
  level,
  facing: 1,
  legs,
  air: 0,
  rise: 0,
  speed: 0,
  aboard: false,
  depth: 0,
});
/** Standing in the cab on a floor, a step back from its open doors. */
const inCab = (level: number): Motion => ({ ...at(SHAFT.x, level), aboard: true, depth: CAB_DEPTH });

describe('legsTo', () => {
  it('walks straight to a spot on the same floor', () => {
    expect(legsTo(at(60, G), { floor: G, x: 300 })).toEqual([{ walk: 300 }]);
  });

  it('takes the lift to another floor, a step into the cab and out of it again', () => {
    expect(legsTo(at(60, G), { floor: UP, x: 50 })).toEqual([
      { walk: SHAFT.x },
      { wait: 0.55, doors: 'opening' },
      { back: CAB_DEPTH },
      { wait: 0.55, doors: 'closing' },
      { ride: UP },
      { wait: 0.55, doors: 'opening' },
      { back: 0 },
      { walk: 50 },
    ]);
  });

  it('turns to the thing at the end of the way', () => {
    const arrived = advance(at(60, G, legsTo(at(60, G), { floor: G, x: 90, facing: -1 })), 10);

    expect(arrived).toEqual({ ...at(90, G), facing: -1 });
  });

  it('keeps the figure inside the house, and lets it out in front of it on the ground floor', () => {
    expect(legsTo(at(60, UP), { floor: UP, x: 999 })).toEqual([{ walk: WALK.max }]);
    expect(legsTo(at(60, G), { floor: G, x: 999 })).toEqual([{ walk: WALK.outside }]);
    expect(legsTo(at(60, G), { floor: G, x: HOUSE_END + 20 })).toEqual([{ walk: HOUSE_END + 20 }]);
    expect(legsTo(at(60, G), { floor: G, x: -999 })).toEqual([{ walk: WALK.min }]);
  });
});

describe('advance', () => {
  it('stops at the spot and looks where it went', () => {
    const arrived = advance(at(100, G, [{ walk: 60 }]), 10);

    expect(arrived).toEqual({ ...at(60, G), facing: -1 });
  });

  it('is on the way after a short while', () => {
    const moved = advance(at(100, G, [{ walk: 300 }]), 0.25);

    expect(moved.x).toBeGreaterThan(100);
    expect(moved.x).toBeLessThan(300);
    expect(moved.legs).toHaveLength(1);
  });

  it('goes on into the next leg within one step', () => {
    const x = SHAFT.x - 30;
    const arrived = advance(at(60, G, legsTo(at(60, G), { floor: UP, x })), 10);

    expect(arrived).toEqual({ ...at(x, UP), facing: -1 });
  });

  it('is between two floors while the lift moves', () => {
    const riding = advance(at(SHAFT.x, 1, [{ ride: 0 }]), 0.5);

    expect(riding.level).toBeLessThan(1);
    expect(riding.level).toBeGreaterThan(0);
  });

  it('starts the lift gently and stops it gently', () => {
    const start = at(SHAFT.x, 0, [{ ride: 2 }]);
    const upTo = (level: number, from: Motion): Motion => {
      let motion = from;
      while (motion.level < level) motion = advance(motion, 0.05);
      return motion;
    };
    const early = advance(start, 0.2);
    const cruising = upTo(1, early);
    const late = upTo(1.95, cruising);

    expect(Math.abs(early.speed)).toBeLessThan(Math.abs(cruising.speed));
    expect(Math.abs(late.speed)).toBeLessThan(Math.abs(cruising.speed));
    expect(advance(late, 5)).toEqual({ ...at(SHAFT.x, 2), aboard: true });
  });

  it('takes the same time whatever the frames were like', () => {
    const start = at(SHAFT.x, 0, [{ ride: 2 }]);
    let stepped = start;
    for (let frame = 0; frame < 20; frame++) stepped = advance(stepped, 0.05);

    expect(stepped.level).toBeCloseTo(advance(start, 1).level, 2);
  });
});

describe('keys', () => {
  it('strides to the end of the floor and stops when the key is let go', () => {
    const striding = stride(at(100, G), 1);

    expect(striding.legs).toEqual([{ walk: WALK.outside }]);
    expect(stride(at(100, UP), 1).legs).toEqual([{ walk: WALK.max }]);
    expect(stride(at(100, G), -1).legs).toEqual([{ walk: WALK.min }]);
    expect(stride(at(100, G), 1, 230).legs).toEqual([{ walk: 230 }]);
    expect(halt(advance(striding, 0.1)).legs).toEqual([]);
  });

  it('calls the lift only in front of its doors or from inside the cab', () => {
    expect(rideBy(at(100, G), TOWARDS).legs).toEqual([]);
    expect(rideBy(at(SHAFT.x + 40, G), TOWARDS).legs).toEqual([]);
    expect(rideBy(at(SHAFT.x + 25, G), TOWARDS).legs).toContainEqual({ ride: UP });
    expect(rideBy(inCab(G), TOWARDS).legs).toEqual([
      { wait: 0.55, doors: 'closing' },
      { ride: UP },
      { wait: 0.55, doors: 'opening' },
    ]);
  });

  it('finishes a ride even when a key is let go', () => {
    const riding = rideBy(at(SHAFT.x, G), TOWARDS);

    expect(halt(riding).legs).toHaveLength(6);
  });

  it('does not ride above the top floor or below the lowest one', () => {
    expect(rideBy(at(SHAFT.x, TOP_FLOOR), 1).legs).toEqual([]);
    expect(rideBy(at(SHAFT.x, 0), -1).legs).toEqual([]);
  });

  it('lets go of a stride out of the cab only once the figure has stepped forward', () => {
    expect(halt(stride(inCab(UP), 1)).legs).toEqual([{ back: 0 }]);
  });

  it('does not jump in the cab', () => {
    expect(jump(inCab(G))).toEqual(inCab(G));
  });

  it('ignores the arrow keys inside the moving lift', () => {
    const riding = at(SHAFT.x, 0.5, [{ ride: 0 }]);

    expect(stride(riding, 1)).toBe(riding);
    expect(jump(riding)).toBe(riding);
  });

  it('rides a floor further for every press before the cab has arrived', () => {
    const once = rideBy(at(SHAFT.x, 0), 1);
    const twice = rideBy(advance(once, 0.1), 1);
    const thrice = rideBy(advance(twice, 0.6), 1);

    expect(once.legs).toContainEqual({ ride: 1 });
    expect(twice.legs).toContainEqual({ ride: 2 });
    expect(advance(thrice, 20).level).toBe(Math.min(3, TOP_FLOOR));
    expect(rideBy(rideBy(thrice, 1), 1).legs).toContainEqual({ ride: TOP_FLOOR });
  });
});

describe('lift doors', () => {
  it('stay shut for a figure walking past or standing in front', () => {
    expect(openDoor(at(SHAFT.x, G))).toBe(false);
    expect(openDoor(advance(at(SHAFT.x - 40, G, [{ walk: SHAFT.x + 40 }]), 0.5))).toBe(false);
  });

  it('open once the lift is called, and the figure steps in', () => {
    const called = advance(rideBy(at(SHAFT.x + 20, G), TOWARDS), 0.3);

    expect(called.aboard).toBe(true);
    expect(openDoor(called)).toBe(true);
  });

  it('close before the ride and open again once the cab has arrived', () => {
    const closing = advance(rideBy(inCab(G), TOWARDS), 0.1);
    const riding = advance(closing, 0.6);
    const opening = advance(riding, 10);

    expect([openDoor(closing), openDoor(riding), openDoor(opening)]).toEqual([false, false, true]);
    expect(opening.level).toBe(UP);
  });

  it('fall shut behind the figure walking out', () => {
    const out = advance(stride(inCab(UP), 1), 1);

    expect(out.aboard).toBe(false);
    expect(openDoor(out)).toBe(false);
  });
});

describe('the cab', () => {
  it('is stepped into once the doors are open, before they close for the ride', () => {
    const aboard = advance(rideBy(at(SHAFT.x, G), TOWARDS), 1);

    expect(aboard.depth).toBe(CAB_DEPTH);
    expect(aboard.level).toBe(G);
    expect(openDoor(aboard)).toBe(false);
  });

  it('is left with a step forward before the figure walks on', () => {
    const stepping = advance(stride(inCab(UP), 1), 0.2);

    expect(stepping.depth).toBeGreaterThan(0);
    expect(stepping.depth).toBeLessThan(CAB_DEPTH);
    expect(stepping.x).toBe(SHAFT.x);
  });
});

describe('doors out of the house', () => {
  it('stand open while the figure is at them, on their floor only', () => {
    for (const door of DOORS) {
      expect(doorOut(at(door.x - 10, door.floor))).toEqual(door);
      expect(doorOut(at(door.x + 15, door.floor))).toEqual(door);
    }
    expect(doorOut(at(HOUSE_END - 10, UP))).toBeNull();
    expect(doorOut(at(100, G))).toBeNull();
  });

  it('stay shut for a figure at the lift', () => {
    expect(doorOut(at(SHAFT.x, G))).toBeNull();
  });

  it('are heard opening and falling shut', () => {
    expect(cuesOf(at(HOUSE_END + 21, G), at(HOUSE_END + 2, G))).toEqual(['door-open']);
    expect(cuesOf(at(HOUSE_END + 2, G), at(HOUSE_END + 21, G))).toEqual(['door-close']);
  });
});

describe('isOutside', () => {
  it('is under the sky on a terrace and in front of the house', () => {
    for (const terrace of ROOMS.filter((room) => room.open))
      expect(isOutside(at(terrace.x + 20, terrace.floor)), terrace.id).toBe(true);
    expect(isOutside(at(HOUSE_END + 60, G))).toBe(true);
  });

  it('is inside in every closed room and in the lift', () => {
    for (const room of ROOMS.filter((each) => !each.open))
      expect(isOutside(at(room.x + 20, room.floor)), room.id).toBe(false);
    expect(isOutside(at(SHAFT.x, 0.5))).toBe(false);
  });
});

describe('inYard', () => {
  it('is out of the front door only, not on a terrace or inside', () => {
    expect(inYard(at(HOUSE_END + 60, G))).toBe(true);
    expect(inYard(at(HOUSE_END - 20, G))).toBe(false);
    for (const terrace of ROOMS.filter((room) => room.open))
      expect(inYard(at(terrace.x + 20, terrace.floor)), terrace.id).toBe(false);
  });
});

describe('cuesOf', () => {
  it('tells doors, ride and arrival apart', () => {
    const start = inCab(G);
    const closing = advance(rideBy(start, TOWARDS), 0.1);
    const riding = advance(closing, 0.6);
    const arrived = advance(riding, 10);

    expect(cuesOf(start, closing)).toEqual(['doors-close']);
    expect(cuesOf(closing, riding)).toEqual(['ride-start']);
    expect(cuesOf(riding, arrived)).toEqual(['doors-open', 'ride-stop']);
  });

  it('hears a step every few pixels, a jump and the landing', () => {
    expect(cuesOf(at(100, G), at(120, G))).toEqual(['step']);
    expect(cuesOf(at(120, G), at(140, G))).toEqual([]);
    expect(cuesOf(at(100, G), at(101, G))).toEqual([]);
    const up = advance(jump(at(100, G)), 0.1);

    expect(cuesOf(at(100, G), up)).toEqual(['jump']);
    expect(cuesOf(at(SHAFT.x - 3, G), at(SHAFT.x + 3, G))).not.toContain('doors-open');
    expect(cuesOf(up, advance(up, 2))).toEqual(['land']);
  });
});

describe('jump', () => {
  it('leaves the floor and lands on it again', () => {
    const up = advance(jump(at(100, G)), 0.1);

    expect(up.air).toBeGreaterThan(0);
    expect(isMoving(up)).toBe(true);
    expect(advance(up, 2)).toEqual(at(100, G));
  });

  it('keeps walking while in the air', () => {
    const leaping = advance(jump(stride(at(100, G), 1)), 0.1);

    expect(leaping.x).toBeGreaterThan(100);
    expect(leaping.air).toBeGreaterThan(0);
  });

  it('does not jump again before it has landed', () => {
    const up = advance(jump(at(100, G)), 0.1);

    expect(jump(up)).toBe(up);
  });
});
