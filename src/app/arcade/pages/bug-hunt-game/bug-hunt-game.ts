import { Component, computed } from '@angular/core';

import { plural } from '../../../core/format';
import { injectSheetKeys, KeyHint } from '../../../ui/sheet-keys';
import { P } from '../../../engine/palette';
import {
  advance,
  Bug,
  BugKind,
  build,
  BUGS,
  callWave,
  choose,
  Defense,
  GRID,
  Kind,
  KINDS,
  moveCursor,
  newDefense,
  pointAt,
  priceOf,
  refundOf,
  sell,
  SLOTS,
  SWARM,
  TILE,
  TOP_LEVEL,
  towerAt,
  TOWERS,
  WAY,
  WAY_LENGTH,
  waveOf,
} from '../../domain/bug-hunt';
import { GameFrame, gameKeys } from '../../organisms/game-frame/game-frame';
import { GameFx } from '../../organisms/game-fx/game-fx';
import { UNITS } from '../../domain/round';
import { Fx, injectRound } from '../../state/round';

const MAP = { width: GRID.columns * TILE, height: GRID.rows * TILE } as const;
/** The bar over the map with bits and lives, and the one under it with the towers to build. */
const TOP = 18;
const BOTTOM = 28;
const COLORS: Readonly<Record<Kind, string>> = {
  linter: P.gold,
  test: P.plant,
  kaffee: P.wood,
  debugger: P.accent,
};
const BUG_LOOK: Readonly<
  Record<BugKind, { readonly color: string; readonly size: number; readonly name: string }>
> = {
  kaefer: { color: '#c0433f', size: 1.25, name: 'Käfer' },
  flitzer: { color: P.info, size: 1, name: 'Flitzer' },
  fork: { color: P.pot, size: 1.4, name: 'Forks' },
  panzer: { color: '#8b93a7', size: 1.55, name: 'Panzer' },
  mini: { color: '#d8e05a', size: 0.7, name: 'Schwarm' },
  boss: { color: '#8a2346', size: 2.3, name: 'Boss' },
};
/** Four chips side by side under the map, one for every kind of tower. */
const CHIP = { width: 69, pitch: 72, price: 65 } as const;
const SERVER = { x: MAP.width - 20, y: WAY[WAY.length - 1].y } as const;
const DRAIN = { x: 0, y: WAY[0].y } as const;
/** How fast the light runs along the cable to the server, and the beat the LEDs blink in. */
const FLOW = 40;
const BLINK = 3;

const STEERING: Readonly<Record<string, (defense: Defense) => Defense>> = {
  ...Object.fromEntries(
    (
      [
        ['w', 'up'],
        ['a', 'left'],
        ['s', 'down'],
        ['d', 'right'],
      ] as const
    ).map(([key, direction]) => [key, (defense: Defense) => moveCursor(defense, direction)]),
  ),
  ...Object.fromEntries(
    KINDS.map((kind, index) => [`${index + 1}`, (defense: Defense) => choose(defense, kind)]),
  ),
  x: sell,
  n: callWave,
};
const PLAYING_KEYS: readonly KeyHint[] = [
  { keys: ['W', 'A', 'S', 'D'], label: 'Platz' },
  { keys: ['1', '4'], label: 'Turm' },
  { keys: ['Leertaste'], label: 'bauen' },
  { keys: ['X'], label: 'verkaufen' },
  { keys: ['N'], label: 'Welle' },
];

/** The cells of the map the duct runs through, as `column,row`. */
const DUCT_CELLS = new Set(
  WAY.slice(1).flatMap((to, index) => {
    const from = WAY[index];
    const steps = Math.round(Math.hypot(to.x - from.x, to.y - from.y) / TILE);
    return Array.from({ length: steps + 1 }, (_, step) => {
      const share = steps === 0 ? 0 : step / steps;
      const x = from.x + (to.x - from.x) * share;
      const y = from.y + (to.y - from.y) * share;
      return `${Math.floor(x / TILE)},${Math.floor(y / TILE)}`;
    });
  }),
);

function events(before: Defense, after: Defense, fx: Fx): void {
  const slot = SLOTS[after.cursor];
  if (after.broke > before.broke) {
    fx.popup(slot.x, slot.y - 16, 'Zu wenig Bits', 'bad');
    fx.play('denied');
  }
  const built = after.towers.length > before.towers.length;
  const raised = after.towers.some(
    (tower, index) => tower.slot === before.towers[index]?.slot && tower.level > before.towers[index].level,
  );
  if (built || raised) {
    fx.burst(slot.x, slot.y - 4, COLORS[towerAt(after, after.cursor)!.kind], 10, 60);
    fx.play(built ? 'blip' : 'perfect');
  }
  if (after.towers.length < before.towers.length) {
    fx.popup(slot.x, slot.y - 16, `+${after.bits - before.bits} Bits`, 'gold');
    fx.burst(slot.x, slot.y, P.metal, 8, 50);
    fx.play('rustle');
  }
  if (after.called > before.called) {
    fx.popup(MAP.width / 2, MAP.height / 2, `Frühstart +${after.bits - before.bits} Bits`, 'gold');
    fx.play('level');
  }
  const gone = before.bugs.filter((bug) => !after.bugs.some((left) => left.id === bug.id));
  const leaked = after.lives < before.lives;
  for (const bug of gone) {
    const at = pointAt(bug.along);
    if (leaked && bug.along > WAY_LENGTH - 40) continue;
    fx.burst(
      at.x,
      at.y,
      BUG_LOOK[bug.kind].color,
      bug.kind === 'boss' ? 16 : bug.kind === 'mini' ? 3 : 7,
      55,
    );
    if (bug.kind === 'fork') fx.popup(at.x, at.y - 10, 'Fork!');
    fx.play('pop');
  }
  if (leaked) {
    fx.popup(SERVER.x, SERVER.y - 22, `-${before.lives - after.lives}`, 'bad');
    fx.impact({ trauma: 0.5 });
    fx.play('bust');
  }
  if (after.cleared > before.cleared) {
    fx.popup(MAP.width / 2, MAP.height / 2 - 14, `Welle ${after.cleared} geschafft`, 'gold');
    fx.play('done');
  }
  if (after.over) {
    fx.impact({ trauma: 1, freeze: 0.08 });
    fx.play('fail');
  }
}

/** What comes in a wave, kind by kind, a swarm counted as one. */
function preview(wave: number): string {
  const counts = new Map<BugKind, number>();
  for (const kind of waveOf(wave)) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  return [...counts]
    .map(([kind, count]) => `${kind === 'mini' ? count / SWARM : count} ${BUG_LOOK[kind].name}`)
    .join(' · ');
}

/** The screen on the wall of the break room: bugs crawl out of the drain to the server, towers keep them off. */
@Component({
  imports: [GameFrame, GameFx],
  templateUrl: './bug-hunt-game.html',
  styleUrl: './bug-hunt-game.scss',
  host: { '(document:keydown)': 'round.keyDown($event)', '(document:keyup)': 'round.keyUp($event)' },
})
export class BugHuntGame {
  protected readonly unit = UNITS.bugjagd;
  protected readonly round = injectRound<Defense>({
    game: 'bugjagd',
    fresh: newDefense,
    step: advance,
    press: build,
    steer: (key) => STEERING[key] ?? null,
    score: (defense) => defense.cleared,
    level: (defense) => Math.max(1, defense.wave),
    over: (defense) => defense.over,
    events,
  });

  constructor() {
    injectSheetKeys(() =>
      this.round.phase() === 'playing' ? PLAYING_KEYS : gameKeys(this.round.phase(), ''),
    );
  }

  protected readonly map = MAP;
  protected readonly viewBox = `0 ${-TOP} ${MAP.width} ${MAP.height + TOP + BOTTOM}`;
  protected readonly bottom = { y: MAP.height, text: MAP.height + 18 };
  protected readonly server = `translate(${SERVER.x} ${SERVER.y})`;
  protected readonly drain = `translate(${DRAIN.x} ${DRAIN.y})`;
  protected readonly chip = CHIP;
  protected readonly duct = WAY.map((point) => `${point.x},${point.y}`).join(' ');
  /** Every cell of the raised floor the duct leaves, every fifth of them a perforated one. */
  protected readonly tiles = Array.from({ length: GRID.columns * GRID.rows }, (_, cell) => ({
    column: cell % GRID.columns,
    row: Math.floor(cell / GRID.columns),
  }))
    .filter(({ column, row }) => !DUCT_CELLS.has(`${column},${row}`))
    .map(({ column, row }) => {
      const [x, y] = [column * TILE, row * TILE];
      return {
        x: x + 1,
        y: y + 1,
        vent: (column * 7 + row * 3) % 5 === 0 ? { x: x + 4, y: y + 4 } : null,
        light: `M${x + 1} ${y + 23}V${y + 1}H${x + 23}`,
      };
    });

  protected readonly note = computed(() => {
    const { kills, called } = this.round.sim();
    const early = called > 0 ? ` · ${plural(called, 'Frühstart', 'Frühstarts')}` : '';
    return `${plural(kills, 'Bug', 'Bugs')} erledigt${early}`;
  });

  protected readonly status = computed(() => {
    const { bits, lives, wave, queue, bugs, breakIn, cleared } = this.round.sim();
    const quiet = queue.length === 0 && bugs.length === 0 && cleared === wave;
    return {
      bits: `${bits}`,
      lives: `${lives}`,
      low: lives <= 3,
      wave: quiet
        ? `Welle ${wave + 1} in ${Math.max(0, Math.ceil(breakIn))} s`
        : `Welle ${wave} · ${queue.length + bugs.length} Bugs`,
    };
  });

  /** Between two waves: what comes next, and what calling it in now brings. */
  protected readonly banner = computed(() => {
    const defense = this.round.sim();
    const quiet = defense.queue.length === 0 && defense.bugs.length === 0 && defense.cleared === defense.wave;
    if (!quiet || this.round.phase() !== 'playing') return null;
    const bonus = callWave(defense).bits - defense.bits;
    return {
      title: `Welle ${defense.wave + 1} kommt`,
      what: preview(defense.wave + 1),
      hint: `N: jetzt los, +${bonus} Bits`,
    };
  });

  protected readonly flow = computed(() => `${(-this.round.sim().time * FLOW).toFixed(1)}`);

  protected readonly rack = computed(() => {
    const { lives, time } = this.round.sim();
    const color = lives <= 3 ? P.bad : lives <= 6 ? P.warning : P.ok;
    const beat = Math.floor(time * BLINK);
    return [0, 1, 2, 3].map((led) => {
      const y = -15 + led * 7;
      return { y, dot: y + 1.5, color, opacity: (beat + led) % 3 === 0 ? 0.25 : 1 };
    });
  });

  protected readonly slots = computed(() => {
    const defense = this.round.sim();
    return SLOTS.map((slot, index) => ({
      index,
      x: slot.x - 10,
      y: slot.y - 10,
      empty: towerAt(defense, index) === null,
    }));
  });

  protected readonly towers = computed(() => {
    const { towers, time } = this.round.sim();
    return towers.map((tower) => {
      const { x, y } = SLOTS[tower.slot];
      return {
        slot: tower.slot,
        kind: tower.kind,
        transform: `translate(${x} ${y})`,
        color: COLORS[tower.kind],
        barrel: `rotate(${((tower.aim * 180) / Math.PI).toFixed(1)})`,
        sweep: `rotate(${((time * 140) % 360).toFixed(0)})`,
        steam: `translate(0 ${(-((time * 6) % 4)).toFixed(1)})`,
        pips: Array.from({ length: tower.level }, (_, pip) => -7 + pip * 4.5),
        reach: tower.kind === 'kaffee' ? TOWERS.kaffee.range : 0,
      };
    });
  });

  protected readonly bugs = computed(() =>
    this.round.sim().bugs.map((bug: Bug) => {
      const { x, y, heading } = pointAt(bug.along);
      const { color, size } = BUG_LOOK[bug.kind];
      const width = 12 * size;
      return {
        id: bug.id,
        kind: bug.kind,
        transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`,
        body: `rotate(${((heading * 180) / Math.PI).toFixed(0)}) scale(${size})`,
        shadow: { rx: 5 * size, ry: 2.75 * size },
        color: bug.flash > 0 ? '#ffffff' : color,
        stride: Math.floor(bug.along / 5) % 2 === 0,
        bar:
          bug.hp < bug.max
            ? { x: -width / 2, y: -6 - 6 * size, width, left: width * Math.max(0, bug.hp / bug.max) }
            : null,
        armored: BUGS[bug.kind].armor > 0,
      };
    }),
  );

  protected readonly shots = computed(() =>
    this.round.sim().shots.map((shot) => {
      const ring = TOWERS[shot.kind].area ? (TOWERS[shot.kind].range * shot.age) / 0.12 : null;
      return {
        ...shot,
        fade: 1 - shot.age / 0.12,
        color: COLORS[shot.kind],
        wide: shot.kind === 'test' ? 2.5 : 1.2,
        glow: shot.kind === 'test' ? 7 : 3.5,
        ring,
      };
    }),
  );

  /** The place under the cursor: a frame round it and the reach of what stands or would stand there. */
  protected readonly cursor = computed(() => {
    const defense = this.round.sim();
    const { x, y } = SLOTS[defense.cursor];
    const kind = towerAt(defense, defense.cursor)?.kind ?? defense.pick;
    const [corner, leg] = [13, 5];
    return {
      frame:
        `M${x - corner} ${y - corner + leg}V${y - corner}h${leg}M${x + corner - leg} ${y - corner}H${x + corner}v${leg}` +
        `M${x + corner} ${y + corner - leg}V${y + corner}h${-leg}M${x - corner + leg} ${y + corner}H${x - corner}v${-leg}`,
      x,
      y,
      reach: TOWERS[kind].range,
    };
  });

  /** On a tower: what raising and selling it brings; on an empty place: the towers to choose from. */
  protected readonly offer = computed(() => {
    const defense = this.round.sim();
    const standing = towerAt(defense, defense.cursor);
    if (!standing) return null;
    const { label } = TOWERS[standing.kind];
    const raise =
      standing.level === TOP_LEVEL
        ? 'voll ausgebaut'
        : `Leertaste: Stufe ${standing.level + 1} für ${priceOf(standing.kind, standing.level)}`;
    return `${label} ${standing.level} · ${raise} · X: +${refundOf(standing)}`;
  });

  protected readonly menu = computed(() => {
    const { pick, bits } = this.round.sim();
    return KINDS.map((kind, index) => ({
      kind,
      key: `${index + 1}`,
      label: TOWERS[kind].label,
      price: `${priceOf(kind)}`,
      transform: `translate(${2 + index * CHIP.pitch} ${MAP.height + 6})`,
      picked: kind === pick,
      color: COLORS[kind],
      affordable: bits >= priceOf(kind),
    }));
  });
}
