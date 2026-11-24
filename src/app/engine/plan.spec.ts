import { NO_FACTS } from '../building/facts.testing';
import { piecesOf, roomArt, Setting } from '../building/rooms';
import { cameraFor } from './camera';
import { ROOM, WALL } from './geometry';
import type { Note } from './model';
import {
  besideStairs,
  COLUMNS,
  DOORS,
  FIT,
  GROUND_FLOOR,
  HOUSE_END,
  leftOf,
  noticesOf,
  placeOf,
  roomAt,
  roomBox,
  ROOMS,
  SHAFT,
  spreadBy,
  STAIRWELL,
  spotOf,
  thingKey,
  thingNear,
  TOP_FLOOR,
  VIEW,
  WALK,
  walkMax,
  WORLD,
  YARD_FENCE,
} from './plan';

const furnished = ROOMS.find((room) => room.things.length >= 2)!;
const [first, second] = furnished.things;
const left = roomBox(furnished).x;

describe('plan', () => {
  it('lays the rooms of each side of the stairwell side by side, a wall between them', () => {
    for (const room of ROOMS) {
      const before = leftOf(room);
      if (before) expect(roomBox(before).x + roomBox(before).width + WALL.inner, room.id).toBe(room.x);
      else expect([COLUMNS.left, COLUMNS.right], room.id).toContain(room.x);
    }
  });

  it('puts the stairwell with the lift between the sides, and the front door in the right wall', () => {
    for (const room of ROOMS) {
      const box = roomBox(room);
      const leftSide = box.x + box.width + WALL.inner <= STAIRWELL.x;
      const rightSide = box.x >= STAIRWELL.x + STAIRWELL.width + WALL.inner;
      expect(leftSide || rightSide, room.id).toBe(true);
    }
    expect(SHAFT.x - SHAFT.width / 2).toBeGreaterThan(STAIRWELL.x);
    expect(SHAFT.x + SHAFT.width / 2).toBeLessThan(STAIRWELL.x + STAIRWELL.width);
    expect(HOUSE_END).toBeGreaterThan(COLUMNS.right);
    expect(DOORS[0]).toEqual({ floor: GROUND_FLOOR, x: HOUSE_END });
  });

  it('opens a door from the stairwell onto a terrace left of it', () => {
    const terrace = besideStairs(TOP_FLOOR)?.open === true;

    expect(DOORS.some((door) => door.floor === TOP_FLOOR && door.x === STAIRWELL.x)).toBe(terrace);
  });

  it('lets the figure out of the front door on the ground floor only', () => {
    expect(walkMax(GROUND_FLOOR)).toBe(WALK.outside);
    expect(WALK.outside).toBeGreaterThan(HOUSE_END);
    for (const room of ROOMS.filter((each) => each.floor !== GROUND_FLOOR))
      expect(walkMax(room.floor), room.id).toBe(WALK.max);
  });

  it('finds the room the figure stands in, and none in the lift', () => {
    expect(roomAt(furnished.floor, left + 20)).toBe(furnished);
    expect(roomAt(furnished.floor, SHAFT.x)).toBeNull();
  });
});

describe('placeOf', () => {
  it('reads room and thing from the url', () => {
    const place = placeOf(`/${thingKey(furnished, first)}?x=1`);

    expect(place).toEqual({ room: furnished, thing: first });
  });

  it('is the house for anything unknown', () => {
    expect(placeOf('/')).toEqual({ room: null, thing: null });
    expect(placeOf('/nirgends')).toEqual({ room: null, thing: null });
    expect(placeOf(`/${furnished.id}/nichts`).thing).toBeNull();
  });
});

describe('spots', () => {
  it('stands beside the thing and looks at it, or in the middle of the room', () => {
    expect(spotOf({ room: furnished, thing: first })).toEqual({
      floor: furnished.floor,
      x: left + first.stand,
      facing: first.stand > first.at ? -1 : 1,
    });
    expect(spotOf({ room: furnished, thing: null })).toEqual({
      floor: furnished.floor,
      x: left + roomBox(furnished).width / 2,
    });
    expect(spotOf(placeOf('/'))).toBeNull();
  });

  it('reaches the nearest thing only from close by', () => {
    expect(thingNear(furnished, left + first.stand)).toBe(first);
    expect(thingNear(furnished, left + second.stand)).toBe(second);
    expect(thingNear(furnished, left + first.stand + 400)).toBeNull();
  });
});

describe('noticesOf', () => {
  it('lists the things with a tone, the most urgent first', () => {
    const notes = new Map<string, Note>([
      [thingKey(furnished, first), { text: 'Neu', tone: 'info' }],
      [thingKey(furnished, second), { text: 'Kaputt', tone: 'danger' }],
      ['nirgends/nichts', { text: 'Weg', tone: 'danger' }],
    ]);

    expect(noticesOf(notes).map((notice) => notice.thing)).toEqual([second, first]);
  });
});

describe('cameraFor', () => {
  it('fits the whole house into the device, standing on its foot', () => {
    const camera = cameraFor(placeOf('/'));

    expect(WORLD.width * camera.scale).toBeLessThanOrEqual(VIEW.width + 0.001);
    expect(WORLD.height * camera.scale).toBeLessThanOrEqual(VIEW.height + 0.001);
    expect(camera.scale).toBe(FIT);
    expect(WORLD.height * camera.scale + camera.y).toBeCloseTo(VIEW.height);
  });

  it('moves over to the yard while the figure is out of the front door, until the fence at its end shows', () => {
    const house = cameraFor(placeOf('/'));
    const yard = cameraFor(placeOf('/'), true);
    const onScreen = (x: number, camera: typeof house) => x * camera.scale + camera.x;

    expect(onScreen(YARD_FENCE, house)).toBeGreaterThan(VIEW.width);
    expect(onScreen(YARD_FENCE + 38, yard)).toBeLessThan(VIEW.width);
    expect(onScreen(HOUSE_END, yard)).toBeGreaterThan(0);
    expect({ scale: yard.scale, y: yard.y }).toEqual({ scale: house.scale, y: house.y });
    expect(WALK.outside).toBeLessThan(YARD_FENCE);
  });

  it('fills the width with a room and puts its ceiling at the top', () => {
    const room = ROOMS.find((each) => (each.width ?? ROOM.width) === ROOM.width)!;
    const camera = cameraFor({ room, thing: null });
    const box = roomBox(room);

    expect((box.x - 6) * camera.scale + camera.x).toBeCloseTo(0);
    expect((box.x + box.width + 10) * camera.scale + camera.x).toBeCloseTo(VIEW.width);
    expect((box.y - 4) * camera.scale + camera.y).toBeCloseTo(0);
  });

  it('keeps the floor of the room at the foot of the strip above an open thing', () => {
    const thing = furnished.things.find((each) => each.lift === undefined) ?? first;
    const camera = cameraFor({ room: furnished, thing });
    const box = roomBox(furnished);

    if (thing.lift === undefined)
      expect((box.y + box.height + 8) * camera.scale + camera.y).toBeCloseTo(camera.height);
    expect(camera.height).toBeLessThan(cameraFor({ room: furnished, thing: null }).height);
  });
});

describe('spreading the furniture of a room', () => {
  const setting: Setting = { glass: '#000000', facts: NO_FACTS };

  it('moves every thing as far as the piece of furniture it belongs to', () => {
    for (const room of ROOMS.filter((each) => each.spread)) {
      const parts = roomArt(room, setting).parts;
      const things = room.things.map((thing) => {
        const lift = thing.lift ?? 0;
        return [thing.at - 1, thing.at + 1, 0, 44, lift, lift + thing.height] as const;
      });
      const pieces = piecesOf([
        ...parts.map((part) =>
          'r' in part
            ? ([part.x - part.r, part.x + part.r, part.y, part.y, part.z - part.r, part.z + part.r] as const)
            : ([part.x, part.x + part.w, part.y, part.y + part.d, part.z, part.z + part.h] as const),
        ),
        ...things,
      ]);
      room.things.forEach((thing, index) => {
        const piece = parts.filter((_, part) => pieces[part] === pieces[parts.length + index]);
        if (piece.length === 0) return;
        const middle =
          (Math.min(...piece.map((part) => part.x)) + Math.max(...piece.map((part) => part.x))) / 2;
        expect(Math.sign(spreadBy(room, middle)), `${room.id}/${thing.id}`).toBe(
          Math.sign(spreadBy(room, thing.at)),
        );
      });
    }
  });
});
