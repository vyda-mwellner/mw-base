import { endsOf, FigureMove, Point, poseAt } from './poses';

const BEATS = Array.from({ length: 41 }, (_, step) => step / 20);
const ends = (move: FigureMove, beat: number) => endsOf(poseAt(move, beat));
const near = (points: readonly Point[]) =>
  points.map(({ x, z }) => ({ x: expect.closeTo(x, 1), z: expect.closeTo(z, 1) }));
const lowest = (points: readonly Point[]): number => Math.min(...points.map((point) => point.z));

describe('poseAt', () => {
  it('keeps the feet where they stand all through a squat', () => {
    const standing = ends('stand', 0).soles;
    for (const beat of BEATS) expect(ends('squat', beat).soles).toEqual(near(standing));
  });

  it('keeps the hands on one spot of the floor through a push-up', () => {
    const top = ends('push', 0).hands;
    expect(top.map((hand) => hand.z)).toEqual([expect.closeTo(0, 1), expect.closeTo(0, 1)]);
    for (const beat of BEATS) expect(ends('push', beat).hands).toEqual(near(top));
  });

  it('keeps the hands where they are while the knees come in turns in a climb', () => {
    const top = ends('push', 0).hands;
    for (const beat of BEATS) {
      const { hands, soles } = ends('climb', beat);
      expect(hands).toEqual(near(top));
      expect(lowest(soles)).toBeCloseTo(0);
    }
  });

  it('reaches the toes with the fingertips at the bottom of a toe touch, the feet staying put', () => {
    const standing = ends('stand', 0).soles;
    for (const beat of BEATS) expect(ends('touch', beat).soles).toEqual(near(standing));
    expect(ends('touch', 0.5).hands).toEqual(
      near([
        { x: 5.5, z: 1 },
        { x: 5.5, z: 1 },
      ]),
    );
  });

  it('jumps up from a squat and lands where it took off', () => {
    const standing = ends('stand', 0).soles;
    for (const beat of [0, 0.2, 0.4, 1]) expect(ends('leap', beat).soles).toEqual(near(standing));
    expect(lowest(ends('leap', 0.65).soles)).toBeGreaterThan(5);
  });

  it('stands on one leg while the other is lifted out to the side, in turn', () => {
    for (const beat of BEATS) expect(lowest(ends('raise', beat).soles)).toBeCloseTo(0);
    const [nearHeel, nearToe, farHeel, farToe] = ends('raise', 0.5).soles;
    expect(Math.min(nearHeel.z, nearToe.z)).toBeGreaterThan(2);
    expect(Math.min(farHeel.z, farToe.z)).toBeCloseTo(0);
  });

  it('lies on the forearms in a plank, the toes on the floor', () => {
    const { soles } = ends('plank', 0);
    expect(soles[1]).toEqual(near([{ x: 6.5, z: 0 }])[0]);
    expect(lowest(soles)).toBeCloseTo(0);
  });

  it('has a foot on the floor all through a walk and a run', () => {
    for (const move of ['walk', 'run'] as const)
      for (const beat of BEATS) expect(lowest(ends(move, beat).soles)).toBeCloseTo(0);
  });

  it('puts the near heel down ahead at the start of a stride and the far one halfway', () => {
    const [nearHeel, , farHeel] = ends('walk', 0).soles;
    expect(nearHeel.z).toBeCloseTo(0);
    expect(nearHeel.x).toBeGreaterThan(farHeel.x);
    const [nearLater, , farLater] = ends('walk', 0.5).soles;
    expect(farLater.z).toBeCloseTo(0);
    expect(farLater.x).toBeGreaterThan(nearLater.x);
  });

  it('steps out with the legs in turn in a lunge, the back toes staying where they stood', () => {
    const [, firstNear, , firstFar] = ends('lunge', 0.5).soles;
    const [, secondNear, , secondFar] = ends('lunge', 1.5).soles;
    expect(firstNear.x).toBeGreaterThan(firstFar.x);
    expect(secondFar.x).toBeGreaterThan(secondNear.x);
    expect([firstFar, secondNear]).toEqual(
      near([
        { x: 6.5, z: 0 },
        { x: 6.5, z: 0 },
      ]),
    );
  });

  it('lands with the feet on the floor between the hops of a jumping jack', () => {
    expect(lowest(ends('jack', 0).soles)).toBeCloseTo(0);
    expect(lowest(ends('jack', 0.5).soles)).toBeCloseTo(0);
    expect(lowest(ends('jack', 0.25).soles)).toBeGreaterThan(3);
  });
});
