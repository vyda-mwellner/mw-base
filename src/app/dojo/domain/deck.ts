import { addDays } from '../../engine/days';
import { lessonById, LESSONS, type Lesson } from './lessons';

/** A lesson that has been met: its box in the card index, and the day it is due again. */
export interface Card {
  readonly box: number;
  readonly due: string;
}

/**
 * How a lesson went. `clean` within par and without help moves it up a box, `solved` keeps it where it was,
 * `helped` after the solution was shown and `skipped` put it back into the first box.
 */
export type Outcome = 'clean' | 'solved' | 'helped' | 'skipped';

/** The lessons of a round in the order they come, and how each one that is over went. */
export interface Round {
  readonly day: string;
  readonly ids: readonly string[];
  readonly outcomes: readonly Outcome[];
}

export interface DojoFile {
  readonly cards: Readonly<Record<string, Card>>;
  /** Lessons solved, day by day. */
  readonly solved: Readonly<Record<string, number>>;
  readonly round: Round | null;
}

/** Days until a lesson comes again, by the box it is in: the better it sits, the longer it rests. */
const INTERVALS: readonly number[] = [1, 3, 7, 14, 30];
const TOP_BOX = INTERVALS.length;

/** A round has ten lessons: every third one a shortcut of IntelliJ, the others vim. */
const PATTERN: readonly Lesson['kind'][] = [
  'vim',
  'vim',
  'ide',
  'vim',
  'vim',
  'ide',
  'vim',
  'vim',
  'ide',
  'vim',
];
export const ROUND_SIZE = PATTERN.length;
/** New lessons a round brings at the least while there are any left, so learning never stalls behind repeats. */
const FRESH: Readonly<Record<Lesson['kind'], number>> = { vim: 2, ide: 1 };

export function graded(card: Card | undefined, outcome: Outcome, day: string): Card {
  const box =
    outcome === 'clean'
      ? Math.min(TOP_BOX, (card?.box ?? 0) + 1)
      : outcome === 'solved'
        ? Math.max(1, card?.box ?? 1)
        : 1;
  return { box, due: addDays(day, INTERVALS[box - 1]) };
}

/**
 * The lessons of one kind in the order a round takes them: for its own slots the due ones first and at least
 * a few new ones, then whatever else there is, for when the other kind runs short.
 */
function queueOf(kind: Lesson['kind'], cards: DojoFile['cards'], day: string): string[] {
  const slots = PATTERN.filter((each) => each === kind).length;
  const order = (id: string) => LESSONS.findIndex((lesson) => lesson.id === id);
  const ids = LESSONS.filter((lesson) => lesson.kind === kind).map((lesson) => lesson.id);
  const met = ids.filter((id) => cards[id]);
  const byDue = (a: string, b: string) =>
    cards[a].due.localeCompare(cards[b].due) || cards[a].box - cards[b].box || order(a) - order(b);
  const due = met.filter((id) => cards[id].due <= day).sort(byDue);
  const fresh = ids.filter((id) => !cards[id]);
  const repeats = due.slice(0, slots - Math.min(FRESH[kind], fresh.length));
  const picked = [...repeats, ...fresh.slice(0, slots - repeats.length)];
  const rest = [...due, ...fresh, ...met.sort(byDue)].filter((id) => !picked.includes(id));
  return [...new Set([...picked, ...rest])];
}

/** Ten lessons for a round, vim and IntelliJ in turn; with one kind used up, the other fills in. */
export function roundOf(cards: DojoFile['cards'], day: string): string[] {
  const queues = { vim: queueOf('vim', cards, day), ide: queueOf('ide', cards, day) };
  const taken = { vim: 0, ide: 0 };
  const round: string[] = [];
  for (const kind of PATTERN) {
    const from = taken[kind] < queues[kind].length ? kind : kind === 'vim' ? 'ide' : 'vim';
    const id = queues[from][taken[from]];
    if (id === undefined) break;
    taken[from]++;
    round.push(id);
  }
  return round;
}

/** The file after a lesson of the round: its card graded, the round one further, a solved one counted. */
export function answered(file: DojoFile, id: string, outcome: Outcome, day: string): DojoFile {
  const round = file.round;
  if (!round || round.ids[round.outcomes.length] !== id) return file;
  const counted = outcome === 'skipped' ? 0 : 1;
  return {
    cards: { ...file.cards, [id]: graded(file.cards[id], outcome, day) },
    solved: counted ? { ...file.solved, [day]: (file.solved[day] ?? 0) + counted } : file.solved,
    round: { ...round, outcomes: [...round.outcomes, outcome] },
  };
}

/** How many lessons are in each box, the first box first. */
export function boxesOf(cards: DojoFile['cards']): number[] {
  const boxes = INTERVALS.map(() => 0);
  for (const card of Object.values(cards)) boxes[card.box - 1]++;
  return boxes;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OUTCOMES: readonly string[] = ['clean', 'solved', 'helped', 'skipped'];

const objectOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** Reads what was kept; a lesson that no longer exists is dropped, and so is a round that names one. */
export function parseDojo(raw: unknown): DojoFile {
  const doc = objectOf(raw);
  const cards: Record<string, Card> = {};
  for (const [id, value] of Object.entries(objectOf(doc['cards']))) {
    const { box, due } = objectOf(value);
    if (!lessonById(id) || !isCount(box) || box < 1 || box > TOP_BOX) continue;
    if (typeof due !== 'string' || !ISO_DATE.test(due)) continue;
    cards[id] = { box, due };
  }
  const solved: Record<string, number> = {};
  for (const [day, count] of Object.entries(objectOf(doc['solved']))) {
    if (ISO_DATE.test(day) && isCount(count)) solved[day] = count;
  }
  const { day, ids, outcomes } = objectOf(doc['round']);
  const round =
    typeof day === 'string' &&
    ISO_DATE.test(day) &&
    Array.isArray(ids) &&
    ids.every((id) => typeof id === 'string' && lessonById(id)) &&
    Array.isArray(outcomes) &&
    outcomes.length <= ids.length &&
    outcomes.every((outcome) => OUTCOMES.includes(outcome))
      ? { day, ids: ids as string[], outcomes: outcomes as Outcome[] }
      : null;
  return { cards, solved, round };
}
