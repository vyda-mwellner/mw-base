import { booleanAttribute, Component, computed, input } from '@angular/core';

import { ROOM } from '../../engine/geometry';
import type { RoomArt } from '../../engine/model';
import { project, tone } from '../../engine/oblique';
import { cell } from '../../engine/shell';
import { floorMarks, wallMarks } from '../../engine/surfaces';
import { OuterDoor } from '../outer-door/outer-door';
import { Solids } from '../solids/solids';

/** The left wall lies in the shade of the lamp, the floor catches most of its light. */
const SHADE = { wall: -0.26, floor: 0.08 } as const;

/** One room seen through its missing front wall. The origin is its front left corner on the floor. */
@Component({
  selector: '[app-room-cell]',
  imports: [Solids, OuterDoor],
  templateUrl: './room-cell.html',
  styleUrl: './room-cell.scss',
})
export class RoomCell {
  readonly art = input.required<RoomArt>();
  /** Somebody is in it: the lamp is on. */
  readonly lit = input(false, { transform: booleanAttribute });
  /** How dark it is without the lamp, 0 to 1. */
  readonly dim = input.required<number>();
  /** The light of the lamp as a polygon. */
  readonly cone = input.required<string>();
  readonly width = input<number>(ROOM.width);
  /** The door in its left wall, if that one leads outside. */
  readonly door = input<{ open: boolean; glass: string; wood: string } | null>(null);

  protected readonly shell = computed(() => cell(this.width(), ROOM.height));
  protected readonly sideWall = computed(() => tone(this.art().wall, SHADE.wall));
  protected readonly floor = computed(() => tone(this.art().floor, SHADE.floor));
  protected readonly wallMarks = computed(() => wallMarks(this.art().walling, this.width()));
  protected readonly floorMarks = computed(() => floorMarks(this.art().flooring, this.width()));
  /** A shell has no board along the foot of its walls. */
  protected readonly finished = computed(() => this.art().walling !== 'raw');
  protected readonly signs = computed(() =>
    (this.art().signs ?? []).map((sign) => {
      const [x, y] = project(sign.x, sign.y ?? ROOM.depth, sign.z);
      return { ...sign, x, y };
    }),
  );
  /** Written once more over the dark of a room without light, faintly: it stays readable there. */
  protected readonly glowing = computed(() => this.signs().filter((sign) => sign.lit));
}
