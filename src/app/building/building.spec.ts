import { routes } from '../app.routes';
import { ROOM, WALL } from '../engine/geometry';
import type { RoomSpec } from '../engine/model';
import { GROUND_FLOOR, roomBox, ROOMS, STAIRWELL, thingKey, TOP_FLOOR } from '../engine/plan';
import { BUILDING } from './building.config';
import { NO_FACTS } from './facts.testing';
import { ART, roomArt, Setting } from './rooms';

const setting: Setting = { glass: '#16264a', facts: NO_FACTS };
const widthOf = (rooms: readonly RoomSpec[]): number =>
  rooms.reduce((width, room, index) => width + (room.width ?? ROOM.width) + (index > 0 ? WALL.inner : 0), 0);

describe('building.config', () => {
  it('has the front door on one of its floors and three floors at least for the lift', () => {
    expect(BUILDING.floors.length).toBeGreaterThanOrEqual(3);
    expect(GROUND_FLOOR).toBeGreaterThanOrEqual(0);
    expect(GROUND_FLOOR).toBeLessThanOrEqual(TOP_FLOOR);
  });

  it('has each side of the stairwell as wide on every floor, so the walls stand on each other', () => {
    for (const side of ['left', 'right'] as const) {
      const widths = BUILDING.floors.map((floor) => widthOf(floor[side]));
      expect(new Set(widths).size, `${side}: ${widths.join(' ')}`).toBe(1);
      expect(widths[0], side).toBeGreaterThan(0);
    }
  });

  it('has each room id and each thing id in its room only once', () => {
    const ids = ROOMS.map((room) => room.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const room of ROOMS) {
      const things = room.things.map((thing) => thing.id);
      expect(new Set(things).size, room.id).toBe(things.length);
    }
  });

  it('has rooms under the sky only on the top floor, left of the stairwell and of every closed room there', () => {
    const top = ROOMS.filter((each) => each.floor === TOP_FLOOR);
    for (const room of ROOMS.filter((each) => each.open)) {
      expect(room.floor, room.id).toBe(TOP_FLOOR);
      expect(room.x, room.id).toBeLessThan(STAIRWELL.x);
      expect(top.indexOf(room), room.id).toBeLessThan(top.findIndex((each) => !each.open));
    }
  });

  it('spreads only closed rooms of the standard width, which are drawn narrower than they are', () => {
    for (const room of ROOMS.filter((each) => each.spread)) {
      expect(room.open, room.id).toBeUndefined();
      expect(room.width, room.id).toBeUndefined();
    }
  });

  it('keeps every thing and the spot to stand at inside its room', () => {
    for (const room of ROOMS)
      for (const thing of room.things) {
        const key = thingKey(room, thing);
        expect(thing.stand, key).toBeGreaterThan(0);
        expect(thing.stand, key).toBeLessThan(roomBox(room).width);
        expect(thing.at - thing.width / 2, key).toBeGreaterThanOrEqual(0);
        expect(thing.at + thing.width / 2, key).toBeLessThanOrEqual(roomBox(room).width);
        expect((thing.lift ?? 0) + thing.height, key).toBeLessThanOrEqual(roomBox(room).height);
      }
  });
});

describe('rooms', () => {
  it('has art for every room and for nothing else', () => {
    expect(Object.keys(ART).sort()).toEqual(ROOMS.map((room) => room.id).sort());
    for (const room of ROOMS) expect(roomArt(room, setting).parts.length, room.id).toBeGreaterThan(0);
  });
});

describe('routes', () => {
  it('opens only things that are in the building', () => {
    const keys = new Set(ROOMS.flatMap((room) => room.things.map((thing) => thingKey(room, thing))));
    const paths = routes
      .flatMap((route) => route.children ?? [])
      .map((route) => (route.path ?? '').split('/').slice(0, 2).join('/'))
      .filter((path) => path.includes('/') && !path.includes(':'));

    for (const path of paths) expect(keys, path).toContain(path);
  });
});
