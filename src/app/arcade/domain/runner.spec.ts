import {
  advance,
  AIRTIME,
  airAbove,
  Crate,
  HORIZON,
  jump,
  leeway,
  levelOf,
  metresOf,
  NEAR_BONUS,
  newRun,
  PIPE,
  Placed,
  rowFor,
  Run,
  RUNNER,
  scoreOf,
  speedOf,
  takeoffs,
} from './runner';

const STEP = 1 / 120;
const steady = (): number => 0.5;
const seeded = (seed: number) => {
  let dice = seed;
  return (): number => (dice = (dice * 16807) % 2147483647) / 2147483647;
};

function play(run: Run, seconds: number, random = steady): Run {
  let state = run;
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) state = advance(state, STEP, random);
  return state;
}

/** Nothing else is laid out while this runs. */
const alone = (crates: readonly Crate[]): Run => ({ ...newRun(), crates, next: 1e9, clear: 1e9 });

/** Runs until the crate in front is as close as `at`, then jumps and runs on for a second and a half. */
function jumpAt(crate: Crate, at: number): Run {
  let state = alone([crate]);
  while (state.crates[0].x > at) state = advance(state, STEP, steady);
  return play(jump(state), 1.5);
}

/** A row whose front reaches the runner after one second, taken off `takeoff` seconds after that. */
function tryRow(row: readonly Placed[], takeoff: number): Run {
  const speed = speedOf(newRun());
  let state = alone(row.map(({ at, ...placed }) => ({ ...placed, x: RUNNER + speed + at })));
  const steps = Math.round((1 + takeoff) / STEP);
  for (let step = 0; step < steps; step++) state = advance(state, STEP, steady);
  return play(jump(state), 2);
}

/** High over whatever is under the runner, with nothing else on its way. */
const flying: Run = { ...alone([]), air: 40, rise: 0 };

/** Waits until the last step from which one jump still gets through what comes, and jumps there. */
function lastMoment(state: Run, random: () => number): Run {
  if (state.air > 0 || state.rise > 0) return state;
  if (!state.crates.some((crate) => crate.x < RUNNER + speedOf(state) * 0.5)) return state;
  const survives = (from: Run, seconds: number): boolean => !play(from, seconds, () => 0.5).over;
  if (survives(state, 0.5)) return state;
  const later = advance(state, STEP, random);
  return survives(jump(state), AIRTIME + 0.05) && !survives(jump(later), AIRTIME + 0.05)
    ? jump(state)
    : state;
}

describe('runner', () => {
  it('runs on by itself and counts the metres', () => {
    const run = play(newRun(), 1);

    expect(metresOf(run)).toBeGreaterThan(10);
    expect(run.over).toBe(false);
  });

  it('sends the first row towards the runner, behind the horizon', () => {
    const laid = play(newRun(), STEP);
    const coming = play(newRun(), 4.5);

    expect(laid.crates.every((crate) => crate.x >= HORIZON)).toBe(true);
    expect(coming.crates[0].x).toBeLessThan(HORIZON);
  });

  it('cannot be lost in the first five seconds, and is lost soon after by a runner who never jumps', () => {
    for (const seed of [1, 7, 42]) {
      expect(play(newRun(), 5, seeded(seed)).over).toBe(false);
      expect(play(newRun(), 9, seeded(seed)).over).toBe(true);
    }
  });

  it('gets over a crate with a jump in time', () => {
    const run = alone([{ x: 30, width: 24, height: 24 }]);

    expect(play(run, 1).over).toBe(true);
    expect(play(jump(run), 1).over).toBe(false);
  });

  it('lands again and does not jump twice in the air', () => {
    const up = advance(jump(newRun()), 0.1, steady);

    expect(up.air).toBeGreaterThan(0);
    expect(jump(up)).toBe(up);
    expect(play(up, 1).air).toBe(0);
  });

  it('gives metres for a crate cleared by a hair, and none for a safe jump', () => {
    const crate = { x: 120, width: 14, height: 24 };
    const safe = jumpAt(crate, 50);
    const close = jumpAt(crate, 22);

    expect(safe).toMatchObject({ over: false, nears: 0, bonus: 0 });
    expect(close).toMatchObject({ over: false, nears: 1, nearStreak: 1, bonus: NEAR_BONUS });
    expect(scoreOf(close)).toBe(metresOf(close) + NEAR_BONUS);
  });

  it('pays more for every close call in a row, and starts over after a safe jump', () => {
    const passing: Crate = { x: -6.5, width: 14, height: 20, gap: 3 };
    const row: Run = { ...flying, crates: [passing], nears: 2, nearStreak: 2, bonus: 15 };
    const safe: Run = { ...row, crates: [{ ...passing, gap: 20 }] };

    expect(play(row, 0.2)).toMatchObject({ nears: 3, nearStreak: 3, bonus: 15 + 3 * NEAR_BONUS });
    expect(play(safe, 0.2)).toMatchObject({ nears: 2, nearStreak: 0, bonus: 15 });
  });

  it('caps what a close call is worth at four in a row', () => {
    const passing: Crate = { x: -6.5, width: 14, height: 20, gap: 3 };

    expect(play({ ...flying, crates: [passing], nearStreak: 9 }, 0.2).bonus).toBe(4 * NEAR_BONUS);
  });

  it('ends under a pipe for a runner who jumps, and lets one through who stays down', () => {
    const pipe: Crate = { x: 40, width: 16, height: PIPE, hang: true };

    expect(play(alone([pipe]), 1)).toMatchObject({ over: false, nears: 0 });
    expect(jumpAt(pipe, 30).over).toBe(true);
  });

  it('jumps 49 high at most, and is in the air for about three quarters of a second', () => {
    expect(airAbove(48)).not.toBeNull();
    expect(airAbove(49)).toBeNull();
    expect(airAbove(0)?.[1]).toBeCloseTo(AIRTIME, 5);
  });

  it('knows the takeoffs that get through a row, as the runner finds them', () => {
    const rows: Placed[][] = [
      [{ at: 0, width: 24, height: 30 }],
      [
        { at: 0, width: 16, height: 16 },
        { at: 30, width: 16, height: 18 },
      ],
      [
        { at: 0, width: 20, height: 24 },
        { at: 60, width: 20, height: PIPE, hang: true },
      ],
      [
        { at: 0, width: 20, height: PIPE, hang: true },
        { at: 50, width: 20, height: 20 },
      ],
    ];
    for (const row of rows) {
      const window = takeoffs(row, speedOf(newRun()))!;
      const inside = [0.2, 0.5, 0.8].map((share) => window.from + (window.to - window.from) * share);

      for (const takeoff of inside) expect(tryRow(row, takeoff).over).toBe(false);
      expect(tryRow(row, window.from - 0.03).over).toBe(true);
      expect(tryRow(row, window.latest + 0.03).over).toBe(true);
    }
  });

  it('asks for no jump at a pipe alone, and has no way through a crate under a pipe', () => {
    expect(takeoffs([{ at: 0, width: 16, height: PIPE, hang: true }], 200)).toBeNull();
    expect(
      takeoffs(
        [
          { at: 0, width: 20, height: 20 },
          { at: 0, width: 20, height: PIPE, hang: true },
        ],
        200,
      ),
    ).toBeNull();
  });

  it('starts with crates alone and adds pipes and rows of two level by level', () => {
    const random = seeded(3);
    const rows = (level: number) => Array.from({ length: 200 }, () => rowFor(level, 160, random));

    expect(rows(1).every((row) => row.length === 1 && !row[0].hang)).toBe(true);
    expect(rows(2).some((row) => row.some((placed) => placed.hang))).toBe(true);
    expect(rows(2).every((row) => row.length === 1)).toBe(true);
    expect(rows(5).some((row) => row.length === 2 && row[0].hang)).toBe(true);
    expect(rows(5).some((row) => row.length === 2 && row[1].hang)).toBe(true);
  });

  it('leaves every row at least the time it promises to jump it right, less and less of it', () => {
    const random = seeded(11);
    for (let level = 1; level <= 16; level++) {
      const speed = speedOf({ ...newRun(), time: (level - 1) * 10 });
      for (let tried = 0; tried < 150; tried++) {
        const row = rowFor(level, speed, random);
        const window = takeoffs(row, speed);
        if (row.every((placed) => placed.hang)) continue;

        expect(window!.to - window!.from).toBeGreaterThanOrEqual(leeway(level) - 1e-9);
      }
    }
    expect(leeway(1)).toBeGreaterThan(leeway(6));
    expect(leeway(6)).toBeGreaterThan(leeway(12));
    expect(leeway(30)).toBe(leeway(12));
  });

  it('gets faster level by level, every ten seconds, up to a limit', () => {
    expect(levelOf({ ...newRun(), time: 9.9 })).toBe(1);
    expect(speedOf({ ...newRun(), time: 9.9 })).toBe(speedOf(newRun()));
    expect(levelOf({ ...newRun(), time: 10 })).toBe(2);
    expect(speedOf({ ...newRun(), time: 10 })).toBeGreaterThan(speedOf(newRun()));
    expect(speedOf({ ...newRun(), time: 900 })).toBe(320);
  });

  it('stands still once it is over', () => {
    const over: Run = { ...newRun(), over: true };

    expect(advance(over, 1, steady)).toBe(over);
    expect(jump(over)).toBe(over);
  });

  it('does not let a runner through who jumps all the time', () => {
    for (const seed of [1, 7, 42, 99, 1234]) {
      const random = seeded(seed);
      let state = newRun();
      for (let elapsed = 0; elapsed < 60 && !state.over; elapsed += STEP)
        state = advance(jump(state), STEP, random);

      expect(state.over).toBe(true);
    }
  });

  it('lets a runner who jumps at the last possible moment through every level', { timeout: 30_000 }, () => {
    for (const seed of [1, 42, 1234]) {
      const random = seeded(seed);
      let state = newRun();
      for (let elapsed = 0; elapsed < 130 && !state.over; elapsed += STEP)
        state = advance(lastMoment(state, random), STEP, random);

      expect(state).toMatchObject({ over: false });
      expect(levelOf(state)).toBeGreaterThanOrEqual(14);
    }
  });

  it('is too hard for a runner who just jumps whenever a crate comes close', () => {
    for (const seed of [1, 7, 42, 99, 1234]) {
      const random = seeded(seed);
      let state = newRun();
      for (let elapsed = 0; elapsed < 120 && !state.over; elapsed += STEP) {
        const ahead = state.crates.find((crate) => !crate.hang && crate.x > -RUNNER);
        const close = ahead && ahead.x <= RUNNER + speedOf(state) * 0.16;
        state = advance(close ? jump(state) : state, STEP, random);
      }

      expect(state.over).toBe(true);
    }
  });
});
