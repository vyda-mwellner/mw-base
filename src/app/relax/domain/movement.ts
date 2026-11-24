import { plural } from '../../core/format';
import { addDays, toDate } from '../../engine/days';
import type { Note } from '../../engine/model';
import { STEP_LENGTH, type Motion } from '../../engine/walk';

/** What the figure covered on a day: house pixels walked, floors ridden in the lift. */
export interface MovementDay {
  readonly px: number;
  readonly floors: number;
}

/** By ISO day. */
export type MovementLog = Readonly<Record<string, MovementDay>>;

interface Movement {
  readonly steps: number;
  readonly metres: number;
  readonly floors: number;
}

/** The figure is 68 house pixels tall: taken for 1.75 m, that is how long a metre is. */
const PX_PER_METRE = 68 / 1.75;
export const NO_MOVEMENT: MovementDay = { px: 0, floors: 0 };
const DAY = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});

/** What one change of the figure covered: walking on a floor, or riding between floors. A jump covers nothing. */
export function coveredBetween(before: Motion, after: Motion): MovementDay {
  const walking = Number.isInteger(before.level) && before.level === after.level;
  return { px: walking ? Math.abs(after.x - before.x) : 0, floors: Math.abs(after.level - before.level) };
}

export const addTo = (day: MovementDay | undefined, more: MovementDay): MovementDay => ({
  px: (day?.px ?? 0) + more.px,
  floors: (day?.floors ?? 0) + more.floors,
});

export const movementOf = ({ px, floors }: MovementDay): Movement => ({
  steps: Math.round(px / STEP_LENGTH),
  metres: Math.round(px / PX_PER_METRE),
  floors: Math.round(floors),
});

export function distance(metres: number): string {
  return metres >= 1000
    ? `${(metres / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`
    : `${metres} m`;
}

export const stepsText = (steps: number): string => plural(steps, 'Schritt', 'Schritte');
export const floorsText = (floors: number): string => plural(floors, 'Etage', 'Etagen');

/** "Mo., 23.11." for an ISO day. */
export const dayLabel = (iso: string): string => DAY.format(toDate(iso));

/** The last `count` days up to `today`, oldest first, the days without a step as nothing. */
export const lastDays = (log: MovementLog, today: string, count: number): MovementDay[] =>
  Array.from({ length: count }, (_, index) => log[addDays(today, index - count + 1)] ?? NO_MOVEMENT);

/** Each day of a week against the best of them, 0 to 1, for the bars on the board. */
export function shares(days: readonly MovementDay[]): number[] {
  const best = Math.max(0, ...days.map((day) => day.px));
  return days.map((day) => (best > 0 ? day.px / best : 0));
}

export function movementNote(today: MovementDay | undefined): Note {
  const { steps, metres, floors } = movementOf(today ?? NO_MOVEMENT);
  return {
    text: `Heute ${stepsText(steps)} · ${distance(metres)} · ${floorsText(floors)}`,
    tone: null,
  };
}
