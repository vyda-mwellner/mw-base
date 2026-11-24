import { levelAt } from './round';

/**
 * Something in the way, measured from the runner: `x` is where it starts ahead of the runner's middle. A crate
 * stands on the floor and is `height` high; a pipe hangs from the ceiling and leaves `height` under it.
 */
export interface Crate {
  readonly x: number;
  readonly width: number;
  readonly height: number;
  readonly hang?: true;
  /** The least the feet were above it while over it. */
  readonly gap?: number;
}

export interface Run {
  readonly distance: number;
  /** How high the feet are above the floor, and how fast they rise. */
  readonly air: number;
  readonly rise: number;
  readonly crates: readonly Crate[];
  /** The distance at which the next row is laid out behind the horizon. */
  readonly next: number;
  /** The distance by which the runner is down again after the last row, however it took it. */
  readonly clear: number;
  readonly time: number;
  /** Metres given for crates cleared by a hair. */
  readonly bonus: number;
  readonly nears: number;
  /** Crates in a row cleared by a hair. */
  readonly nearStreak: number;
  readonly over: boolean;
}

/** An obstacle of a row, `at` behind the front of the row. */
export interface Placed {
  readonly at: number;
  readonly width: number;
  readonly height: number;
  readonly hang?: true;
}

/** Half the width of the runner, and how far ahead a crate appears. */
export const RUNNER = 7;
export const HORIZON = 250;
/** How tall the runner is, and how low a pipe hangs: under it there is no room to jump. */
const BODY = 68;
export const PIPE = 78;
const SPEED = { start: 125, perLevel: 15, max: 320 } as const;
/** 49 high at the top, and 0.78 seconds in the air. */
const JUMP = 250;
const GRAVITY = 640;
export const AIRTIME = (2 * JUMP) / GRAVITY;
/** Free running before the first row: it reaches the runner after five seconds at the earliest. */
const FIRST_CLEAR = 520;
/** Feet this close over a crate make it a close call, worth `NEAR_BONUS` metres times the calls in a row. */
const NEAR = 7;
export const NEAR_BONUS = 5;
const NEAR_MOST = 4;
/** Level 12 is as hard as the rows get; only the speed goes on rising until its limit. */
const HARDEST = 12;
const TRIES = 16;

type Kind = 'crate' | 'pipe' | 'pair' | 'crateThenPipe' | 'pipeThenCrate';
/** The level from which a kind of row comes, and how often against the others. */
const KINDS: readonly { readonly kind: Kind; readonly from: number; readonly weight: number }[] = [
  { kind: 'crate', from: 1, weight: 3 },
  { kind: 'pipe', from: 2, weight: 1 },
  { kind: 'pair', from: 3, weight: 2 },
  { kind: 'crateThenPipe', from: 4, weight: 2 },
  { kind: 'pipeThenCrate', from: 5, weight: 2 },
];

/** Ten units of the floor are one metre. */
export const metresOf = (run: Run): number => Math.floor(run.distance / 10);
export const scoreOf = (run: Run): number => metresOf(run) + run.bonus;
export const levelOf = (run: Run): number => levelAt(run.time);
export const speedOf = (run: Run): number =>
  Math.min(SPEED.max, SPEED.start + (levelOf(run) - 1) * SPEED.perLevel);

export function newRun(): Run {
  return {
    distance: 0,
    air: 0,
    rise: 0,
    crates: [],
    next: 0,
    clear: FIRST_CLEAR,
    time: 0,
    bonus: 0,
    nears: 0,
    nearStreak: 0,
    over: false,
  };
}

export function jump(run: Run): Run {
  return run.over || run.air > 0 || run.rise > 0 ? run : { ...run, rise: JUMP };
}

/** When the feet are higher than `height` after a takeoff, in seconds; null for a height a jump never reaches. */
export function airAbove(height: number): readonly [number, number] | null {
  const room = JUMP * JUMP - 2 * GRAVITY * height;
  if (room <= 0) return null;
  const root = Math.sqrt(room);
  return [(JUMP - root) / GRAVITY, (JUMP + root) / GRAVITY];
}

/**
 * The takeoffs that get through a whole row with one jump, in seconds after its front reached the runner: the
 * longest unbroken stretch, and the latest takeoff of any. Null where there is none or the row asks for no jump.
 */
export function takeoffs(
  row: readonly Placed[],
  speed: number,
): { from: number; to: number; latest: number } | null {
  const enter = (placed: Placed) => placed.at / speed;
  const leave = (placed: Placed) => (placed.at + placed.width + 2 * RUNNER) / speed;
  const crates = row.filter((placed) => !placed.hang);
  if (crates.length === 0) return null;
  let stretches: (readonly [number, number])[] = [[-Infinity, Infinity]];
  for (const crate of crates) {
    const above = airAbove(crate.height);
    if (!above) return null;
    const [from, to] = [leave(crate) - above[1], enter(crate) - above[0]];
    stretches = stretches.map(([a, b]) => [Math.max(a, from), Math.min(b, to)] as const);
  }
  const ducked = airAbove(PIPE - BODY)!;
  for (const pipe of row.filter((placed) => placed.hang)) {
    const [from, to] = [enter(pipe) - ducked[1], leave(pipe) - ducked[0]];
    stretches = stretches.flatMap(([a, b]) => [
      [a, Math.min(b, from)] as const,
      [Math.max(a, to), b] as const,
    ]);
  }
  const open = stretches.filter(([a, b]) => b > a);
  const longest = [...open].sort(([a, b], [c, d]) => d - c - (b - a))[0];
  if (!longest) return null;
  return { from: longest[0], to: longest[1], latest: Math.max(...open.map(([, b]) => b)) };
}

/** 0 on the first level, 1 from the hardest on. */
const hardness = (level: number): number => Math.min(1, (level - 1) / (HARDEST - 1));
const between = (from: number, to: number, share: number): number => from + (to - from) * share;

/** The least time a row leaves to jump it right: generous at first, a tenth of a second at the end. */
export const leeway = (level: number): number => between(0.22, 0.1, hardness(level));

function kindOf(level: number, random: () => number): Kind {
  const open = KINDS.filter((kind) => kind.from <= level);
  let pick = random() * open.reduce((sum, kind) => sum + kind.weight, 0);
  for (const kind of open) {
    pick -= kind.weight;
    if (pick < 0) return kind.kind;
  }
  return 'crate';
}

function rowOf(kind: Kind, level: number, random: () => number): Placed[] {
  const hard = hardness(level);
  const crate = (at: number, low = false): Placed => ({
    at,
    width: 14 + Math.round(random() * between(10, 20, hard)),
    height: 12 + Math.round(random() * (low ? 8 : between(12, 30, hard))),
  });
  const pipe = (at: number): Placed => ({
    at,
    width: 16 + Math.round(random() * 12),
    height: PIPE,
    hang: true,
  });
  const spacing = () => between(70, 24, hard) + random() * 30;
  switch (kind) {
    case 'crate':
      return [crate(0)];
    case 'pipe':
      return [pipe(0)];
    case 'pair': {
      const first = crate(0, true);
      return [first, crate(first.width + between(26, 10, hard) + random() * 12, true)];
    }
    case 'crateThenPipe': {
      const first = crate(0);
      return [first, pipe(first.width + spacing())];
    }
    case 'pipeThenCrate': {
      const first = pipe(0);
      return [first, crate(first.width + spacing())];
    }
  }
}

/** A row that leaves enough time to be jumped right, tried a few times before a low crate stands in for it. */
export function rowFor(level: number, speed: number, random: () => number): Placed[] {
  for (let tried = 0; tried < TRIES; tried++) {
    const row = rowOf(kindOf(level, random), level, random);
    const window = takeoffs(row, speed);
    if (row.every((placed) => placed.hang) || (window && window.to - window.from >= leeway(level)))
      return row;
  }
  return [{ at: 0, width: 14, height: 12 }];
}

/**
 * The next row, laid out behind the horizon: far enough behind the last one that the runner is down again before
 * its first chance to jump, with a pause that shrinks level by level.
 */
function layOut(run: Run, speed: number, random: () => number): Pick<Run, 'crates' | 'next' | 'clear'> {
  const level = levelOf(run);
  const hard = hardness(level);
  const row = rowFor(level, speed, random);
  const window = takeoffs(row, speed);
  const pause = between(0.55, 0.12, hard) + random() * between(0.75, 0.38, hard);
  const front = Math.max(run.distance + HORIZON - RUNNER, run.clear + speed * (pause - (window?.from ?? 0)));
  const end = Math.max(...row.map((placed) => placed.at + placed.width));
  return {
    crates: [
      ...run.crates,
      ...row.map(({ at, ...placed }) => ({ ...placed, x: front - run.distance + RUNNER + at })),
    ],
    next: front + RUNNER + end - HORIZON,
    clear: window ? front + speed * (window.latest + AIRTIME) : front + end + 2 * RUNNER,
  };
}

const over = (crate: Crate): boolean => crate.x < RUNNER && crate.x + crate.width > -RUNNER;
const behind = (crate: Crate): boolean => crate.x + crate.width <= -RUNNER;
const hits = (crate: Crate, air: number): boolean =>
  over(crate) && (crate.hang ? air + BODY > crate.height : air < crate.height);

/** `random` gives numbers from 0 up to 1, as `Math.random` does; it decides kind, size and distance of what comes. */
export function advance(run: Run, seconds: number, random: () => number): Run {
  if (run.over) return run;
  const speed = speedOf(run);
  const travelled = speed * seconds;
  const distance = run.distance + travelled;
  const height = run.air + run.rise * seconds - (GRAVITY * seconds * seconds) / 2;
  const landed = height <= 0;
  const air = landed ? 0 : height;
  const rise = landed ? 0 : run.rise - GRAVITY * seconds;

  let { bonus, nears, nearStreak } = run;
  const crates: Crate[] = [];
  for (const before of run.crates) {
    const moved = { ...before, x: before.x - travelled };
    const crate =
      over(moved) && !moved.hang
        ? { ...moved, gap: Math.min(moved.gap ?? Infinity, air - moved.height) }
        : moved;
    if (!crate.hang && behind(crate) && !behind(before)) {
      const close = (crate.gap ?? Infinity) < NEAR;
      nearStreak = close ? nearStreak + 1 : 0;
      if (close) {
        nears++;
        bonus += NEAR_BONUS * Math.min(nearStreak, NEAR_MOST);
      }
    }
    if (crate.x > -80) crates.push(crate);
  }
  const moved: Run = { ...run, distance, crates };
  const laid = distance >= run.next ? layOut(moved, speed, random) : moved;
  return {
    distance,
    air,
    rise,
    crates: laid.crates,
    next: laid.next,
    clear: laid.clear,
    time: run.time + seconds,
    bonus,
    nears,
    nearStreak,
    over: laid.crates.some((crate) => hits(crate, air)),
  };
}
