import { ROOMS } from '../engine/plan';
import GUIDE from './guide.md';

const rowOf = (label: string): RegExp =>
  new RegExp(`^\\| ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} +\\|`, 'm');

describe('guide', () => {
  it('has a row in a table for every thing of the building, and names every room', () => {
    for (const room of ROOMS) {
      expect(GUIDE, room.id).toContain(room.label);
      for (const thing of room.things) expect(GUIDE, `${room.id}/${thing.id}`).toMatch(rowOf(thing.label));
    }
  });
});
