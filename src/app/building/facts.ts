import type { Game } from '../arcade/domain/round';
import type { Tone } from '../engine/model';
import type { Season } from '../engine/season';

/** A column of the board in the entrance: the workdays left in a period, three ways, and how much of it is past. */
export interface WorkdayColumn {
  readonly label: string;
  /** Monday to Friday. */
  readonly full: number;
  /** Monday to Thursday. */
  readonly mine: number;
  /** Monday to Thursday without the vacation days. */
  readonly left: number;
  /** 0 to 1. */
  readonly share: number;
}

/** A screen of the monitors in the server room and its line on the restart sign. */
export interface EnvFact {
  readonly name: string;
  /** How the env is doing; null while all runs. */
  readonly tone: Tone | null;
  /** Read at least once since the window opened: before that the screen shows nothing. */
  readonly seen: boolean;
  /** Days since a container there restarted last, null while nobody knows. */
  readonly calm: number | null;
}

/** How high the bars of the step board on the terrace are: a share finer than one of these draws nothing new. */
export const MOVEMENT_STEPS = 14;

/** What the rooms show of the state of things, each in a thing of its own. Demo values stand in until a feature is built. */
export interface Facts {
  /** The containers of the stack in the workshop, a stack of local-setup each: whether it runs. */
  readonly live: readonly boolean[];
  /** Docker does not answer: every lamp of the container stack turns red. */
  readonly alarm: boolean;
  /** The display in the break room. */
  readonly record: number;
  /** The lamps on the machines in the break room: every game, its record, today's task done. */
  readonly scores: readonly { readonly game: Game; readonly best: number; readonly solved: boolean }[];
  /** Letters in the pigeonholes of the mail room: what waits in the local inboxes. */
  readonly mails: number;
  /** The board in the entrance. */
  readonly week: number;
  readonly workdays: readonly WorkdayColumn[];
  /** A hook per password or forward on the key board in the entrance: true while its key is out, the access open. */
  readonly keys: readonly boolean[];
  /** A lamp per dev server on the screen in the office: true while it runs. */
  readonly servers: readonly boolean[];
  /** The screen of the dojo in the library: lessons solved today against a round, 0 to 1. */
  readonly dojo: number;
  /** The monitors in the server room, one screen per stage. */
  readonly envs: readonly EnvFact[];
  /** A port on the patch panel in the server room per forward: true while it runs. */
  readonly forwards: readonly boolean[];
  /** A unit in the database rack of the server room per connection: true while its password is unlocked. */
  readonly databases: readonly boolean[];
  /** The model railway in the office: a track per repo, a wagon per commit not yet on PROD. */
  readonly trains: readonly number[];
  /** Books on the shelves of the library beyond those that stand there anyway: the notes of the vault. */
  readonly books: number;
  /** Letters in the tray on the bookcase: what waits in the inbox of the vault. */
  readonly inbox: number;
  /** The lock of the chest in the archive. */
  readonly backedUp: boolean;
  /** A lamp per backup job on the chest in the archive, in the tone of how it is doing. */
  readonly flows: readonly (Tone | null)[];
  /** The meter in the attic: what Claude cost today against the most expensive day of the month, 0 to 1. */
  readonly usage: number;
  /** The board on the roof terrace: the last seven days walked, oldest first, each against the best of them, 0 to 1. */
  readonly movement: readonly number[];
  /** The solar panels on the roof, a half panel per hour from the left: how much of the workday is past, 0 to 1. */
  readonly solar: number;
  /** How the house is decorated today. */
  readonly season: Season | null;
  /** The company on the plate in the entrance and outside, from the data folder; empty for none. */
  readonly brand: string;
}
