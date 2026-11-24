import type { Part } from './oblique';
import type { Flooring, Walling } from './surfaces';

/** Danger: something is broken or overdue. Warning: something waits for a decision. Info: something new to look at. */
export type Tone = 'danger' | 'warning' | 'info';

/** Something in a room that opens a part of the app. Its route is `<room id>/<thing id>`. */
export interface Thing {
  readonly id: string;
  readonly label: string;
  /** Centre of the thing, measured from the left edge of its room. */
  readonly at: number;
  readonly width: number;
  readonly height: number;
  /** For a thing on the wall: how far its lower edge hangs above the floor. */
  readonly lift?: number;
  /** Where the figure stands to use it, beside the thing so it stays visible; from the left edge of the room. */
  readonly stand: number;
  /** A tool of the workbench it opens instead of a sheet, with Enter or by jumping under it. */
  readonly tool?: Tool;
  /** A game, tables or a viewer: its sheet lies over the whole window instead of under the room. */
  readonly full?: true;
}

/** The tools of the workbench, the layer over the whole window (`workbench/workbench.ts`). */
export type Tool = 'markdown' | 'befehl' | 'feierabend';

/** How the furniture of a standard room parts: what stands left of `at` moves `left` to the left, the rest `right` to the right. */
interface Spread {
  readonly at: number;
  readonly left: number;
  readonly right: number;
}

/** A room as `building.config.ts` describes it. */
export interface RoomSpec {
  readonly id: string;
  readonly label: string;
  /**
   * For a room wider or narrower than the standard one: it is drawn at its real width, and its things are
   * measured in it. Every side of the stairwell adds up to the same width on every floor.
   */
  readonly width?: number;
  /** Under the sky: no walls, no ceiling, no lamp. Only on the top floor, left of the stairwell. */
  readonly open?: true;
  /** Only for a closed standard room: how its furniture moves apart in the room, which is wider than its canvas. */
  readonly spread?: Spread;
  readonly things: readonly Thing[];
}

interface FloorSpec {
  /** What the plate over the lift doors says: U, E, 1, 2, D. */
  readonly sign: string;
  /** Left of the stairwell, from the outer wall in. */
  readonly left: readonly RoomSpec[];
  /** Right of the stairwell, from the stairwell out to the wall with the front door. */
  readonly right: readonly RoomSpec[];
}

export interface BuildingSpec {
  /** From the bottom up. */
  readonly floors: readonly FloorSpec[];
  /** The index of the floor with the front door; the floors below it lie in the earth. */
  readonly ground: number;
}

/** A room placed in the building. */
export interface Room extends RoomSpec {
  /** 0 is the lowest floor. */
  readonly floor: number;
  /** Its left edge, in house pixels. */
  readonly x: number;
}

export interface Place {
  readonly room: Room | null;
  readonly thing: Thing | null;
}

/** One line about a thing: shown in its room's list, and house-wide once it has a tone. */
export interface Note {
  readonly text: string;
  readonly tone: Tone | null;
}

export interface Notice {
  readonly room: Room;
  readonly thing: Thing;
  readonly text: string;
  readonly tone: Tone;
}

export interface Spot {
  readonly floor: number;
  readonly x: number;
  readonly facing?: 1 | -1;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One window in the pipe under the house: a short label over a value, with a bar where there is a share to show. */
export interface Gauge {
  readonly label: string;
  readonly value: string;
  /** 0 to 1. */
  readonly share?: number;
  /** Reached for today: the value shows in the colour of success. */
  readonly done?: boolean;
}

/**
 * What a room looks like. Furniture is drawn with its back wall in the plane y 44 and its left wall in the
 * plane x 0, 150 high (`DRAWN` in `geometry.ts`). The wall to the next cell hides what stands at the back in
 * the last 22 of the width.
 */
export interface RoomArt {
  readonly wall: string;
  readonly floor: string;
  readonly walling: Walling;
  readonly flooring: Flooring;
  /** The x of the ceiling lamp whose light falls into the room while somebody is in it. */
  readonly lamp: number;
  readonly parts: readonly Part[];
  /** What shines by itself: drawn once more over the dark of a room without light, faintly and never still. */
  readonly glow?: readonly Part[];
  /** What lives there, each on its own: it hops about by day and is gone at night. */
  readonly critters?: readonly (readonly Part[])[];
  /** Writing on the back wall. */
  readonly signs?: readonly Sign[];
  /**
   * Under the open sky, a lamp on the wall of the house: where its glass is. It is on while somebody is out there
   * after sunset.
   */
  readonly lantern?: { readonly x: number; readonly z: number };
}

/** A line of text centred on `x` and standing on `z`: on the back wall, or on a screen `y` deep. */
export interface Sign {
  readonly x: number;
  readonly y?: number;
  readonly z: number;
  readonly text: string;
  readonly size: number;
  readonly color: string;
  /** For a table: `x` is where the text starts or ends instead of its middle. */
  readonly anchor?: 'start' | 'end';
  /** It glows a little: a room without light does not darken it all the way. */
  readonly lit?: true;
}
