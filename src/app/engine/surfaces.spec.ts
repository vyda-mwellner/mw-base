import { floorMarks, Flooring, Walling, wallMarks } from './surfaces';

const WALLS: readonly Walling[] = ['paper', 'panel', 'brick', 'plaster', 'tile', 'raw'];
const FLOORS: readonly Flooring[] = ['planks', 'slabs', 'tiles', 'grass'];

describe('surfaces', () => {
  it('has a texture for every wall and every floor', () => {
    for (const kind of WALLS)
      expect(wallMarks(kind, 171).dark + wallMarks(kind, 171).light, kind).not.toBe('');
    for (const kind of FLOORS)
      expect(floorMarks(kind, 171).dark + floorMarks(kind, 171).light, kind).not.toBe('');
  });

  it('draws the same texture every time, and more of it on a wider wall', () => {
    expect(wallMarks('plaster', 171)).toEqual(wallMarks('plaster', 171));
    expect(wallMarks('brick', 260).dark.length).toBeGreaterThan(wallMarks('brick', 171).dark.length);
  });

  it('keeps the boards of a floor inside the room', () => {
    const xs = [...floorMarks('planks', 100).dark.matchAll(/[ML](-?[\d.]+) /g)].map((match) =>
      Number(match[1]),
    );

    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(100 + 22);
  });
});
