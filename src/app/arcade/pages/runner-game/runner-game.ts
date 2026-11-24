import { Component, computed } from '@angular/core';

import { injectSheetKeys } from '../../../ui/sheet-keys';
import { box } from '../../../engine/oblique';
import { Solids } from '../../../scene/solids/solids';
import { P } from '../../../engine/palette';
import { FigureArt } from '../../../scene/figure/figure';
import {
  advance,
  Crate,
  HORIZON,
  jump,
  levelOf,
  NEAR_BONUS,
  newRun,
  Run,
  RUNNER,
  scoreOf,
} from '../../domain/runner';
import { GameFrame, gameKeys } from '../../organisms/game-frame/game-frame';
import { GameFx } from '../../organisms/game-fx/game-fx';
import { UNITS } from '../../domain/round';
import { Fx, injectRound } from '../../state/round';

/** How far apart the marks on the floor are; they are what shows the speed. */
const MARKS = 60;
/** The way two steps at a run cover. */
const STRIDE = 100;
/** How high the ceiling is that the hanging ducts come down from on two rods. */
const CEILING = 256;
const DUCT = 36;
/** Pillars and lamps on the back wall, this far apart: they pass by as fast as the floor. */
const BAY = 200;
/** The wall stands at the back of the floor, which the slant moves this far to the right. */
const WALL_SHIFT = 15;
const DUST = '#c9d0dc';

const rod = (x: number, bottom: number) => box(x, 12, bottom, 2, 2, CEILING - bottom, P.metalDark);

const crateParts = (crate: Crate) =>
  crate.hang
    ? [
        rod(crate.x + 3, crate.height + DUCT),
        rod(crate.x + crate.width - 5, crate.height + DUCT),
        box(crate.x, 6, crate.height, crate.width, 16, DUCT, P.metalDark),
        box(crate.x, 6, crate.height, crate.width, 0, 5, P.warning),
        box(crate.x + crate.width / 2 - 2, 6, crate.height, 4, 0, 5, P.ink),
      ]
    : [
        box(crate.x, 6, 0, crate.width, 16, crate.height, P.card),
        box(crate.x + crate.width / 2 - 1.5, 6, 0, 3, 16, crate.height + 0.2, P.tape),
      ];

function events(before: Run, after: Run, fx: Fx): void {
  if (before.rise === 0 && after.rise > 0 && before.air === 0) {
    fx.play('jump');
    fx.burst(0, -2, DUST, 4, 40);
  }
  if (before.air > 0 && after.air === 0) {
    fx.play('land');
    fx.impact({ squash: 1 });
    fx.burst(4, -2, DUST, 5, 45);
  }
  if (after.nears > before.nears) {
    const gained = after.bonus - before.bonus;
    fx.popup(8, -84, `Knapp +${gained} m`, 'gold');
    fx.play('near');
    if (gained > NEAR_BONUS) fx.combo(after.nearStreak);
  }
  if (levelOf(after) > levelOf(before)) fx.popup(100, -60, `Level ${levelOf(after)}`);
  if (after.over) {
    const hit = after.crates.find((crate) => crate.x < RUNNER && crate.x + crate.width > -RUNNER);
    fx.burst(RUNNER, hit?.hang ? -72 : -14, hit?.hang ? P.metal : P.card, 10, 110);
    fx.impact({ trauma: 1, freeze: 0.08 });
    fx.play('fail');
  }
}

/** The screen in the break room: the figure runs through a cellar, over crates and under pipes. */
@Component({
  imports: [Solids, FigureArt, GameFrame, GameFx],
  templateUrl: './runner-game.html',
  styleUrl: './runner-game.scss',
  host: { '(document:keydown)': 'round.keyDown($event)', '(document:keyup)': 'round.keyUp($event)' },
})
export class RunnerGame {
  protected readonly unit = UNITS.laeufer;
  protected readonly bricks = Array.from({ length: 11 }, (_, row) => `M-600 ${-28 - row * 24}h1500`).join('');
  protected readonly round = injectRound<Run>({
    game: 'laeufer',
    fresh: newRun,
    step: advance,
    press: jump,
    score: scoreOf,
    level: levelOf,
    over: (run) => run.over,
    events,
  });

  protected readonly move = computed(() => (this.round.phase() === 'playing' ? 'run' : 'stand'));
  protected readonly strides = computed(() => this.round.sim().distance / STRIDE);

  constructor() {
    injectSheetKeys(() => gameKeys(this.round.phase(), 'springen'));
  }

  protected readonly combo = computed(() => {
    const { nearStreak } = this.round.sim();
    return nearStreak > 1 ? `Knapp x${nearStreak}` : '';
  });
  protected readonly note = computed(() => {
    const { nears, bonus } = this.round.sim();
    return nears > 0 ? `${nears} mal knapp: +${bonus} Meter` : '';
  });

  protected readonly floor = computed(() => {
    const shift = this.round.sim().distance % MARKS;
    return Array.from({ length: 8 }, (_, mark) =>
      box(mark * MARKS - shift - 120, 4, 0, 26, 24, 0, P.metalDark),
    );
  });

  protected readonly wall = computed(() => {
    const shift = this.round.sim().distance % BAY;
    return Array.from({ length: 3 }, (_, bay) => {
      const x = bay * BAY - shift - 60 + WALL_SHIFT;
      return { pillar: x, glow: x + BAY / 2 + 10, lamp: x + BAY / 2 + 1 };
    });
  });

  protected readonly crates = computed(() => this.round.sim().crates.flatMap(crateParts));

  /** A flag where the record falls: metres for close calls bring it nearer. */
  protected readonly flag = computed(() => {
    const best = this.round.best();
    const { distance, bonus } = this.round.sim();
    const x = (best - bonus) * 10 - distance;
    if (best === 0 || x < -60 || x > HORIZON + 20) return [];
    return [
      box(x, 26, 0, 2, 2, 70, P.metalDark),
      box(x + 2, 27, 54, 18, 0, 14, P.gold),
      box(x + 6, 27, 59, 10, 0, 4, P.bad),
    ];
  });

  /** Stretched on the way up, pressed flat for a moment on landing: the feet stay where they are. */
  protected readonly runner = computed(() => {
    const { air, rise } = this.round.sim();
    const squash = this.round.juice().squash;
    const tall = rise > 0 ? 1.06 : 1 - 0.14 * squash;
    return { translate: `0px ${-air}px`, scale: `${(2 - tall).toFixed(3)} ${tall.toFixed(3)}` };
  });
  protected readonly shade = computed(() => 11 - Math.min(5, this.round.sim().air / 10));
}
