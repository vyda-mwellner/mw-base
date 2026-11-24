import {
  advance,
  Bug,
  BugKind,
  build,
  callWave,
  choose,
  Defense,
  Direction,
  Kind,
  moveCursor,
  newDefense,
  pointAt,
  priceOf,
  refundOf,
  sell,
  SLOTS,
  TILE,
  towerAt,
  TOWERS,
  WAY,
  WAY_LENGTH,
  waveOf,
} from './bug-hunt';

const run = (defense: Defense, seconds: number, until = (_: Defense) => false, step = 1 / 120): Defense => {
  let state = defense;
  for (let elapsed = 0; elapsed < seconds && !state.over && !until(state); elapsed += step)
    state = advance(state, step);
  return state;
};
const firstWave = (defense: Defense): Defense => run(defense, 120, (state) => state.cleared === 1);

/** Towers of a kind already standing on the given places. */
const builtWith = (kind: Kind, slots: readonly number[]): Defense => ({
  ...newDefense(),
  towers: slots.map((slot) => ({ slot, kind, level: 1, cooldown: 0, aim: 0 })),
});
const bug = (kind: BugKind, along: number, extra: Partial<Bug> = {}): Bug => ({
  id: 1,
  kind,
  along,
  hp: 9,
  max: 9,
  armor: 0,
  flash: 0,
  ...extra,
});
/** A bug just below the place in the top left corner, in reach of whatever stands there. */
const BESIDE_FIRST = 60;

/** Builds and then raises the towers of a plan in its order whenever the bits are there, and lets the waves come. */
function defend(plan: readonly (readonly [number, Kind])[]): Defense {
  let state = newDefense();
  for (let elapsed = 0; elapsed < 900 && !state.over; elapsed += 1 / 30) {
    const missing = plan.find(([slot]) => !towerAt(state, slot));
    const lowest = plan
      .map(([slot]) => towerAt(state, slot))
      .filter((tower) => tower !== null && tower.level < 4)
      .sort((a, b) => a!.level - b!.level)[0];
    if (missing) state = build({ ...state, cursor: missing[0], pick: missing[1] });
    else if (lowest) state = build({ ...state, cursor: lowest.slot });
    state = advance(state, 1 / 30);
  }
  return state;
}

describe('the way', () => {
  it('runs from the drain to the server, corner by corner', () => {
    expect(pointAt(0)).toMatchObject(WAY[0]);
    expect(pointAt(WAY_LENGTH)).toMatchObject(WAY[WAY.length - 1]);
    expect(pointAt(5 * TILE + TILE)).toMatchObject({ x: WAY[1].x, y: WAY[1].y + TILE });
  });

  it('has every place right beside the duct, where even coffee reaches it, and none on it', () => {
    const distances = SLOTS.map((slot) => {
      let nearest = Infinity;
      for (let along = 0; along <= WAY_LENGTH; along += 2) {
        const at = pointAt(along);
        nearest = Math.min(nearest, Math.hypot(at.x - slot.x, at.y - slot.y));
      }
      return nearest;
    });

    expect(Math.min(...distances)).toBeGreaterThan(TILE / 2);
    expect(Math.max(...distances)).toBeLessThanOrEqual(TOWERS.kaffee.range);
  });
});

describe('the cursor', () => {
  it('goes to the nearest place that way, and stays at the edge of the map', () => {
    const start = newDefense();

    expect(SLOTS[moveCursor(start, 'down').cursor]).toEqual(SLOTS[2]);
    expect(moveCursor(start, 'up')).toBe(start);
  });

  it('reaches every place from the first one', () => {
    const seen = new Set([0]);
    const open = [0];
    while (open.length > 0) {
      const from = open.pop()!;
      for (const direction of ['up', 'down', 'left', 'right'] as Direction[]) {
        const to = moveCursor({ ...newDefense(), cursor: from }, direction).cursor;
        if (!seen.has(to)) {
          seen.add(to);
          open.push(to);
        }
      }
    }

    expect(seen.size).toBe(SLOTS.length);
  });
});

describe('building', () => {
  it('puts the chosen tower on the place under the cursor and takes its price', () => {
    const built = build(choose(moveCursor(newDefense(), 'down'), 'kaffee'));

    expect(towerAt(built, 2)).toMatchObject({ kind: 'kaffee', level: 1 });
    expect(built.bits).toBe(30 - TOWERS.kaffee.cost);
  });

  it('takes a tower a level up for four fifths of its price times its level, up to the fourth', () => {
    let state: Defense = { ...newDefense(), bits: 100 };
    for (let press = 0; press < 5; press++) state = build(state);

    expect(towerAt(state, 0)?.level).toBe(4);
    expect(state.bits).toBe(100 - 10 - 8 - 16 - 24);
  });

  it('builds nothing without the bits for it', () => {
    const poor = build({ ...newDefense(), bits: 5 });

    expect(poor.towers).toEqual([]);
    expect(poor.broke).toBe(1);
  });

  it('sells a tower for six tenths of all that went into it', () => {
    let state: Defense = { ...newDefense(), bits: 100 };
    for (let press = 0; press < 3; press++) state = build(state);
    const sold = sell(state);

    expect(refundOf(towerAt(state, 0)!)).toBe(Math.floor((10 + 8 + 16) * 0.6));
    expect(sold.towers).toEqual([]);
    expect(sold.bits).toBe(state.bits + 20);
    expect(sell(sold)).toBe(sold);
  });
});

describe('the waves', () => {
  it('grow, and bring a new kind of bug every few waves', () => {
    expect(waveOf(1)).toEqual(Array(5).fill('kaefer'));
    expect(waveOf(3).filter((kind) => kind === 'flitzer')).toHaveLength(1);
    expect(waveOf(4).filter((kind) => kind === 'fork')).toHaveLength(1);
    expect(waveOf(5).at(-1)).toBe('boss');
    expect(waveOf(4)).not.toContain('boss');
    expect(waveOf(5)).not.toContain('panzer');
    expect(waveOf(6).filter((kind) => kind === 'panzer')).toHaveLength(1);
    expect(waveOf(6).join(' ')).toContain(Array(6).fill('mini').join(' '));
  });

  it('start after a quiet spell, and cost lives where nothing stands in their way', () => {
    expect(run(newDefense(), 7).wave).toBe(0);

    const later = firstWave(newDefense());

    expect(later.wave).toBe(1);
    expect(later.lives).toBe(5);
  });

  it('are held off by a few towers beside the duct, which pays the bits of every bug and a bonus', () => {
    const held = firstWave(builtWith('linter', [0, 1, 2, 3]));

    expect(held).toMatchObject({ lives: 10, cleared: 1, kills: 5, bits: 30 + 5 * 2 + 5 });
  });

  it('can be called in early for a bit for every second of quiet it skips', () => {
    const called = callWave(newDefense());

    expect(called).toMatchObject({ wave: 1, queue: waveOf(1), called: 1, bits: 30 + 2 + 8 });
    expect(callWave(called)).toBe(called);
  });

  it('can be called while the last one is still crawling, and pays for both once both are through', () => {
    const spawned = run(
      builtWith('linter', [0, 1, 2, 3]),
      30,
      (state) => state.wave === 1 && state.queue.length === 0,
    );
    const called = callWave(spawned);
    const through = run(called, 120, (state) => state.cleared === 2);

    expect(called.wave).toBe(2);
    expect(through.cleared).toBe(2);
  });

  it('end the round once the server has no lives left', () => {
    const lost = run(newDefense(), 300);

    expect(lost).toMatchObject({ over: true, lives: 0 });
  });
});

describe('the bugs', () => {
  it('show a hit for a moment', () => {
    const hit = advance(
      { ...builtWith('linter', [0]), wave: 1, bugs: [bug('kaefer', BESIDE_FIRST)] },
      1 / 120,
    );
    const later = run(hit, 0.2, (state) => state.bugs[0].flash === 0);

    expect(hit.bugs[0].flash).toBeGreaterThan(0);
    expect(later.bugs[0].flash).toBe(0);
  });

  it('shrug off small hits with armour, but not big ones', () => {
    const panzer = bug('panzer', BESIDE_FIRST, { armor: 1.5 });
    const linted = advance({ ...builtWith('linter', [0]), wave: 6, bugs: [panzer] }, 1 / 120);
    const tested = advance({ ...builtWith('test', [0]), wave: 6, bugs: [panzer] }, 1 / 120);

    expect(9 - linted.bugs[0].hp).toBeCloseTo(0.2, 5);
    expect(9 - tested.bugs[0].hp).toBeCloseTo(TOWERS.test.damage[0] - 1.5, 5);
  });

  it('come as a swarm in a tight row', () => {
    const swarming: Defense = { ...newDefense(), wave: 8, queue: ['mini', 'mini', 'mini'], breakIn: 0 };
    const out = run(swarming, 0.32);

    expect(out.bugs.filter((one) => one.kind === 'mini')).toHaveLength(3);
  });

  it('slow down in the reach of coffee', () => {
    const plain = advance({ ...newDefense(), wave: 1, bugs: [bug('kaefer', BESIDE_FIRST)] }, 0.5);
    const slowed = advance(
      { ...builtWith('kaffee', [0]), wave: 1, bugs: [bug('kaefer', BESIDE_FIRST)] },
      0.5,
    );

    expect(slowed.bugs[0].along).toBeLessThan(plain.bugs[0].along);
  });

  it('are all hit at once by the debugger', () => {
    const pulsed = advance(
      {
        ...builtWith('debugger', [0]),
        wave: 1,
        bugs: [bug('kaefer', BESIDE_FIRST, { hp: 3 }), bug('kaefer', BESIDE_FIRST + 10, { id: 2, hp: 3 })],
      },
      1 / 120,
    );

    expect(pulsed.bugs.map((one) => one.hp)).toEqual([1.5, 1.5]);
    expect(pulsed.shots).toHaveLength(1);
  });

  it('split into two quick ones when a fork is hit for the last time', () => {
    const fork = bug('fork', BESIDE_FIRST, { hp: 0.5, max: 6 });
    const split = advance({ ...builtWith('linter', [0]), wave: 1, bugs: [fork] }, 1 / 120);

    expect(split.bugs.map((one) => one.kind)).toEqual(['flitzer', 'flitzer']);
    expect(split.kills).toBe(1);
  });
});

describe('a defence', () => {
  const ORDER = [2, 7, 12, 4, 9, 13, 6, 10, 3, 1, 14, 5, 11, 0, 8, 15];
  const only = (kind: Kind) => ORDER.map((slot) => [slot, kind] as const);
  const mixed: (readonly [number, Kind])[] = [
    [7, 'test'],
    [2, 'linter'],
    [12, 'debugger'],
    [4, 'test'],
    [13, 'kaffee'],
    [9, 'linter'],
    [6, 'test'],
    [10, 'debugger'],
    [3, 'test'],
    [1, 'linter'],
    [14, 'debugger'],
    [5, 'test'],
    [11, 'kaffee'],
    [0, 'linter'],
    [8, 'test'],
    [15, 'debugger'],
  ];

  it('of mixed towers gets further than one of a single kind', { timeout: 30_000 }, () => {
    const best = defend(mixed).cleared;

    for (const kind of ['linter', 'test', 'debugger'] as Kind[])
      expect(defend(only(kind)).cleared).toBeLessThan(best);
    expect(priceOf('test')).toBeGreaterThan(priceOf('linter'));
  });
});
