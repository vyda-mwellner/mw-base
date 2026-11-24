/** A point on the map, seen from above: x to the right, y downwards. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export type Kind = 'linter' | 'test' | 'kaffee' | 'debugger';
export type BugKind = 'kaefer' | 'flitzer' | 'fork' | 'panzer' | 'mini' | 'boss';
export type Level = 1 | 2 | 3 | 4;
export type Direction = 'up' | 'down' | 'left' | 'right';
export const TOP_LEVEL: Level = 4;

interface Tower {
  readonly slot: number;
  readonly kind: Kind;
  readonly level: Level;
  /** Seconds until it fires again. */
  readonly cooldown: number;
  /** Where it looked when it last fired, in radians. */
  readonly aim: number;
}

export interface Bug {
  readonly id: number;
  readonly kind: BugKind;
  /** How far along the way it has crawled. */
  readonly along: number;
  readonly hp: number;
  readonly max: number;
  /** Taken off every hit: many small hits do little against it, a few big ones a lot. */
  readonly armor: number;
  /** Seconds the last hit still shows on it. */
  readonly flash: number;
}

/** A hit, drawn for a moment: a line from the tower to the bug, or a ring round a tower that hits all in reach. */
interface Shot {
  readonly from: Point;
  readonly to: Point;
  readonly kind: Kind;
  readonly age: number;
}

export interface Defense {
  readonly bits: number;
  readonly lives: number;
  /** The wave under way, or the last one; 0 before the first. */
  readonly wave: number;
  /** Waves the server got through: the score. */
  readonly cleared: number;
  /** Bugs of this wave still to come out of the drain. */
  readonly queue: readonly BugKind[];
  readonly spawnIn: number;
  /** Seconds of quiet left before the next wave. */
  readonly breakIn: number;
  readonly bugs: readonly Bug[];
  readonly towers: readonly Tower[];
  readonly shots: readonly Shot[];
  /** The place the cursor is on, and what would be built there. */
  readonly cursor: number;
  readonly pick: Kind;
  readonly nextId: number;
  readonly kills: number;
  /** Builds and upgrades that failed for want of bits. */
  readonly broke: number;
  /** Waves called in before their time, for bits. */
  readonly called: number;
  readonly time: number;
  readonly over: boolean;
}

export const TILE = 24;
export const GRID = { columns: 12, rows: 11 } as const;
const tile = ([column, row]: readonly [number, number]): Point => ({
  x: (column + 0.5) * TILE,
  y: (row + 0.5) * TILE,
});

/** The cable duct the bugs crawl along, corner by corner: out of the drain on the left, into the server on the right. */
export const WAY: readonly Point[] = (
  [
    [-1, 1],
    [4, 1],
    [4, 4],
    [1, 4],
    [1, 8],
    [5, 8],
    [5, 6],
    [8, 6],
    [8, 2],
    [10, 2],
    [10, 9],
    [12, 9],
  ] as const
).map(tile);
const LEGS = WAY.slice(1).map((to, index) => Math.hypot(to.x - WAY[index].x, to.y - WAY[index].y));
export const WAY_LENGTH = LEGS.reduce((sum, leg) => sum + leg, 0);

/** Where towers can stand beside the duct, most of them in a bend that reaches two stretches of it. */
export const SLOTS: readonly Point[] = (
  [
    [2, 0],
    [9, 1],
    [2, 2],
    [5, 2],
    [9, 4],
    [11, 4],
    [5, 5],
    [7, 5],
    [0, 6],
    [2, 6],
    [4, 6],
    [11, 6],
    [6, 7],
    [9, 7],
    [3, 9],
    [10, 10],
  ] as const
).map(tile);

interface TowerSpec {
  readonly label: string;
  readonly cost: number;
  readonly range: number;
  /** Seconds between two shots; 0 for one that does not shoot. */
  readonly every: number;
  /** By level, from the first to the fourth. */
  readonly damage: readonly number[];
  /** The share of its speed a bug keeps in range, by level; 1 for no slowing down. */
  readonly slow: readonly number[];
  /** It hits every bug in reach at once instead of the one furthest along. */
  readonly area?: true;
}

const NO_SLOW = [1, 1, 1, 1];
export const KINDS: readonly Kind[] = ['linter', 'test', 'kaffee', 'debugger'];
export const TOWERS: Readonly<Record<Kind, TowerSpec>> = {
  linter: { label: 'Linter', cost: 10, range: 50, every: 0.45, damage: [1, 1.6, 2.4, 3.4], slow: NO_SLOW },
  test: { label: 'Test', cost: 30, range: 64, every: 1.5, damage: [5, 7.5, 11, 15], slow: NO_SLOW },
  kaffee: {
    label: 'Kaffee',
    cost: 15,
    range: 42,
    every: 0,
    damage: [0, 0, 0, 0],
    slow: [0.6, 0.45, 0.32, 0.22],
  },
  debugger: {
    label: 'Debugger',
    cost: 25,
    range: 46,
    every: 0.9,
    damage: [1.5, 2.3, 3.4, 4.8],
    slow: NO_SLOW,
    area: true,
  },
};

interface BugSpec {
  readonly hp: number;
  readonly speed: number;
  readonly bits: number;
  /** Lives it costs once it reaches the server. */
  readonly harm: number;
  /** Against hits on the first wave; it grows with the waves, slower than the health. */
  readonly armor: number;
}

export const BUGS: Readonly<Record<BugKind, BugSpec>> = {
  kaefer: { hp: 3, speed: 48, bits: 2, harm: 1, armor: 0 },
  flitzer: { hp: 2, speed: 80, bits: 2, harm: 1, armor: 0 },
  fork: { hp: 6, speed: 40, bits: 3, harm: 1, armor: 0 },
  panzer: { hp: 9, speed: 30, bits: 4, harm: 2, armor: 1.5 },
  mini: { hp: 1, speed: 80, bits: 1, harm: 1, armor: 0 },
  boss: { hp: 36, speed: 28, bits: 15, harm: 3, armor: 1 },
};
/** However thick the armour, a hit keeps this share of its damage. */
const GRAZE = 0.2;
const FLASH = 0.1;
/** How far apart the two halves of a fork come out when it is hit for the last time. */
const SPLIT = 6;
/** A swarm comes as a tight row of small ones. */
export const SWARM = 6;
const SWARM_EVERY = 0.15;

const START = { bits: 30, lives: 10, quiet: 8 } as const;
/** Seconds between two waves, and what getting through one brings. */
const BREAK = 5;
const waveBonus = (wave: number): number => 4 + wave;
/** A wave called in before its time brings this, and a bit for every second of quiet it skips. */
const EARLY = 2;
const SHOT_SPAN = 0.12;
/** What selling a tower gives back of all that went into it. */
const RESALE = 0.6;
/** A level up costs this share of the build price times the level the tower is on. */
const RAISE = 0.8;

/** What it costs to build a tower, or to take one on `level` to the next. */
export const priceOf = (kind: Kind, level: number = 0): number =>
  level === 0 ? TOWERS[kind].cost : Math.round(TOWERS[kind].cost * level * RAISE);

/** A share of all the bits that went into a tower: the build and every level after it. */
export function refundOf(tower: Tower): number {
  let invested = 0;
  for (let level = 0; level < tower.level; level++) invested += priceOf(tower.kind, level);
  return Math.floor(invested * RESALE);
}

/**
 * The bugs of a wave in the order they come: more every wave, quick ones from the third, forks from the fourth,
 * armoured ones and swarms from the sixth, each kind spread evenly among the beetles, and a boss
 * at the end of every fifth.
 */
export function waveOf(wave: number): BugKind[] {
  const bugs: BugKind[] = Array.from({ length: 4 + wave }, () => 'kaefer');
  const spread = (kinds: readonly BugKind[], count: number): void => {
    for (let one = 0; one < count; one++)
      bugs.splice(Math.round(((one + 1) * bugs.length) / (count + 1)), 0, ...kinds);
  };
  spread(['flitzer'], wave >= 3 ? Math.floor(wave / 2) : 0);
  spread(['fork'], wave >= 4 ? Math.floor((wave - 2) / 2) : 0);
  spread(['panzer'], wave >= 6 ? Math.floor((wave - 4) / 2) : 0);
  spread(Array<BugKind>(SWARM).fill('mini'), wave >= 6 ? Math.floor((wave - 4) / 2) : 0);
  return wave % 5 === 0 ? [...bugs, 'boss'] : bugs;
}

const spawnEvery = (wave: number): number => Math.max(0.4, 0.95 - 0.04 * wave);
/** Every wave a fifth tougher than the one before: sooner or later no defence holds. */
const toughness = (wave: number): number => 1.2 ** (wave - 1);

/** Where on the map a bug is that has crawled `along`, and which way it looks. */
export function pointAt(along: number): Point & { readonly heading: number } {
  let left = Math.max(0, along);
  for (let index = 0; index < LEGS.length; index++) {
    const [from, to] = [WAY[index], WAY[index + 1]];
    const heading = Math.atan2(to.y - from.y, to.x - from.x);
    if (left <= LEGS[index] || index === LEGS.length - 1) {
      const share = Math.min(1, left / LEGS[index]);
      return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share, heading };
    }
    left -= LEGS[index];
  }
  return { ...WAY[WAY.length - 1], heading: 0 };
}

const inRange = (tower: Tower, bug: Bug): boolean => {
  const at = pointAt(bug.along);
  const slot = SLOTS[tower.slot];
  return Math.hypot(at.x - slot.x, at.y - slot.y) <= TOWERS[tower.kind].range;
};

const hurt = (bug: Bug, damage: number): Bug => ({
  ...bug,
  hp: bug.hp - Math.max(damage * GRAZE, damage - bug.armor),
  flash: FLASH,
});

const hatch = (id: number, kind: BugKind, wave: number, along = 0): Bug => {
  const hp = BUGS[kind].hp * toughness(wave);
  return { id, kind, along, hp, max: hp, armor: BUGS[kind].armor * Math.sqrt(toughness(wave)), flash: 0 };
};

export function newDefense(): Defense {
  return {
    bits: START.bits,
    lives: START.lives,
    wave: 0,
    cleared: 0,
    queue: [],
    spawnIn: 0,
    breakIn: START.quiet,
    bugs: [],
    towers: [],
    shots: [],
    cursor: 0,
    pick: 'linter',
    nextId: 1,
    kills: 0,
    broke: 0,
    called: 0,
    time: 0,
    over: false,
  };
}

export const towerAt = (defense: Defense, slot: number): Tower | null =>
  defense.towers.find((tower) => tower.slot === slot) ?? null;

const HEADINGS: Readonly<Record<Direction, Point>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** To the nearest place that way; one straight ahead beats one as near but off to the side. */
export function moveCursor(defense: Defense, direction: Direction): Defense {
  const from = SLOTS[defense.cursor];
  const heading = HEADINGS[direction];
  let best = defense.cursor;
  let bestScore = Infinity;
  SLOTS.forEach((slot, index) => {
    const [dx, dy] = [slot.x - from.x, slot.y - from.y];
    const ahead = dx * heading.x + dy * heading.y;
    if (ahead <= 0) return;
    const score = ahead + 2 * Math.abs(dx * heading.y - dy * heading.x);
    if (score < bestScore) [best, bestScore] = [index, score];
  });
  return best === defense.cursor ? defense : { ...defense, cursor: best };
}

export const choose = (defense: Defense, pick: Kind): Defense =>
  defense.pick === pick ? defense : { ...defense, pick };

/** Builds what is picked on an empty place, or takes the tower on it a level up, if the bits are there. */
export function build(defense: Defense): Defense {
  if (defense.over) return defense;
  const standing = towerAt(defense, defense.cursor);
  if (standing?.level === TOP_LEVEL) return defense;
  const price = standing ? priceOf(standing.kind, standing.level) : priceOf(defense.pick);
  if (defense.bits < price) return { ...defense, broke: defense.broke + 1 };
  const towers = standing
    ? defense.towers.map((tower) =>
        tower === standing ? { ...tower, level: (tower.level + 1) as Level } : tower,
      )
    : [
        ...defense.towers,
        { slot: defense.cursor, kind: defense.pick, level: 1 as Level, cooldown: 0, aim: 0 },
      ];
  return { ...defense, bits: defense.bits - price, towers };
}

/** Takes the tower under the cursor down for part of what went into it. */
export function sell(defense: Defense): Defense {
  const standing = towerAt(defense, defense.cursor);
  if (defense.over || !standing) return defense;
  return {
    ...defense,
    bits: defense.bits + refundOf(standing),
    towers: defense.towers.filter((tower) => tower !== standing),
  };
}

/** Lets the next wave out now, once the last one is all out of the drain, for bits. */
export function callWave(defense: Defense): Defense {
  if (defense.over || defense.queue.length > 0) return defense;
  const quiet = defense.bugs.length === 0 && defense.cleared === defense.wave;
  const skipped = Math.ceil(quiet ? Math.max(0, defense.breakIn) : BREAK);
  const wave = defense.wave + 1;
  return {
    ...defense,
    bits: defense.bits + EARLY + skipped,
    wave,
    queue: waveOf(wave),
    spawnIn: 0,
    breakIn: 0,
    called: defense.called + 1,
  };
}

/** The bug furthest along the way that a tower reaches. */
const targetOf = (tower: Tower, bugs: readonly Bug[]): Bug | null =>
  bugs.filter((bug) => inRange(tower, bug)).sort((a, b) => b.along - a.along)[0] ?? null;

export function advance(defense: Defense, seconds: number): Defense {
  if (defense.over) return defense;
  let { bits, lives, wave, cleared, queue, spawnIn, breakIn, nextId, kills } = defense;

  if (queue.length === 0 && defense.bugs.length === 0) {
    if (cleared < wave) {
      for (let done = cleared + 1; done <= wave; done++) bits += waveBonus(done);
      cleared = wave;
      breakIn = BREAK;
    } else if ((breakIn -= seconds) <= 0) {
      wave++;
      queue = waveOf(wave);
      spawnIn = 0;
    }
  }

  let bugs: Bug[] = defense.bugs.map((bug) =>
    bug.flash > 0 ? { ...bug, flash: Math.max(0, bug.flash - seconds) } : bug,
  );
  if (queue.length > 0 && (spawnIn -= seconds) <= 0) {
    const kind = queue[0];
    bugs.push(hatch(nextId++, kind, wave));
    queue = queue.slice(1);
    spawnIn = kind === 'mini' && queue[0] === 'mini' ? SWARM_EVERY : spawnEvery(wave);
  }

  const crawled: Bug[] = [];
  for (const bug of bugs) {
    const slowest = Math.min(
      1,
      ...defense.towers
        .filter((tower) => tower.kind === 'kaffee' && inRange(tower, bug))
        .map((tower) => TOWERS.kaffee.slow[tower.level - 1]),
    );
    const along = bug.along + BUGS[bug.kind].speed * slowest * seconds;
    if (along >= WAY_LENGTH) lives -= BUGS[bug.kind].harm;
    else crawled.push({ ...bug, along });
  }
  bugs = crawled;

  const shots: Shot[] = defense.shots
    .map((shot) => ({ ...shot, age: shot.age + seconds }))
    .filter((shot) => shot.age < SHOT_SPAN);
  const towers = defense.towers.map((tower) => {
    const spec = TOWERS[tower.kind];
    if (spec.every === 0) return tower;
    const cooldown = Math.max(0, tower.cooldown - seconds);
    if (cooldown > 0) return { ...tower, cooldown };
    const from = SLOTS[tower.slot];
    const damage = spec.damage[tower.level - 1];
    if (spec.area) {
      if (!bugs.some((bug) => inRange(tower, bug))) return { ...tower, cooldown };
      bugs = bugs.map((bug) => (inRange(tower, bug) ? hurt(bug, damage) : bug));
      shots.push({ from, to: from, kind: tower.kind, age: 0 });
      return { ...tower, cooldown: spec.every };
    }
    const target = targetOf(tower, bugs);
    if (!target) return { ...tower, cooldown };
    const to = pointAt(target.along);
    bugs = bugs.map((bug) => (bug === target ? hurt(bug, damage) : bug));
    shots.push({ from, to, kind: tower.kind, age: 0 });
    return { ...tower, cooldown: spec.every, aim: Math.atan2(to.y - from.y, to.x - from.x) };
  });

  const living = bugs.filter((bug) => bug.hp > 0);
  for (const dead of bugs.filter((bug) => bug.hp <= 0)) {
    bits += BUGS[dead.kind].bits;
    kills++;
    if (dead.kind !== 'fork') continue;
    for (const offset of [-SPLIT, SPLIT])
      living.push(hatch(nextId++, 'flitzer', wave, Math.max(0, dead.along + offset)));
  }

  return {
    ...defense,
    bits,
    lives: Math.max(0, lives),
    wave,
    cleared,
    queue,
    spawnIn,
    breakIn,
    bugs: living,
    towers,
    shots,
    nextId,
    kills,
    time: defense.time + seconds,
    over: lives <= 0,
  };
}
