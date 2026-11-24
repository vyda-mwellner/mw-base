import { Component, computed } from '@angular/core';

import { injectSheetKeys } from '../../../ui/sheet-keys';
import { box, tone } from '../../../engine/oblique';
import { Solids } from '../../../scene/solids/solids';
import { P } from '../../../engine/palette';
import { BASE_WIDTH, drop, levelOf, newStack, scoreOf, slide, Stack } from '../../domain/stacker';
import { GameFrame, gameKeys } from '../../organisms/game-frame/game-frame';
import { GameFx } from '../../organisms/game-fx/game-fx';
import { UNITS } from '../../domain/round';
import { Fx, injectRound } from '../../state/round';

const HEIGHT = 12;
const DEPTH = 44;
/** The tower is drawn from this many blocks below the top; the rest has scrolled out of the picture. */
const SHOWN = 14;
const COLORS = ['#5b8def', '#4cc38a', '#f2c14e', '#f08a5d', '#e05a7a', '#a77bf3', '#58c4dd', '#c9d2df'];
const colorAt = (row: number): string => COLORS[row % COLORS.length];
/** The front of a block lies in the plane of the screen: its top edge is this far up. */
const topOf = (row: number): number => -(row + 1) * HEIGHT;

function events(before: Stack, after: Stack, fx: Fx): void {
  const row = before.slabs.length;
  if (after.spared > before.spared) {
    fx.popup(0, topOf(row) - 8, 'Noch mal');
    fx.play('tick');
    return;
  }
  if (after.over) {
    fx.chunk({
      x: before.moving.x,
      y: topOf(row),
      w: before.moving.width,
      h: HEIGHT,
      color: colorAt(row),
      vx: before.direction * 40,
    });
    fx.impact({ trauma: 1, freeze: 0.08 });
    fx.play('fail');
    return;
  }
  if (after.slabs.length === before.slabs.length) return;
  const landed = after.slabs[row];
  const middle = landed.x + landed.width / 2;
  if (after.streak > 0) {
    fx.burst(landed.x, topOf(row), P.gold, 5);
    fx.burst(landed.x + landed.width, topOf(row), P.gold, 5);
    fx.popup(middle, topOf(row) - 8, after.streak > 1 ? `Perfekt x${after.streak}` : 'Perfekt', 'gold');
    fx.impact({ freeze: 0.05, flash: 0.35 });
    fx.combo(after.streak);
  } else {
    const cut = before.moving.width - landed.width;
    const left = before.moving.x < landed.x;
    fx.chunk({
      x: left ? before.moving.x : landed.x + landed.width,
      y: topOf(row),
      w: cut,
      h: HEIGHT,
      color: tone(colorAt(row), -0.2),
      vx: left ? -30 : 30,
    });
    fx.impact({ trauma: 0.45 });
    fx.play('blip');
  }
  if (levelOf(after) > levelOf(before)) fx.popup(middle, topOf(row) - 44, `Level ${levelOf(after)}`);
}

/** The cabinet in the break room: a block slides over the tower and falls on the key. */
@Component({
  imports: [Solids, GameFrame, GameFx],
  templateUrl: './stacker-game.html',
  styleUrl: './stacker-game.scss',
  host: { '(document:keydown)': 'round.keyDown($event)', '(document:keyup)': 'round.keyUp($event)' },
})
export class StackerGame {
  protected readonly unit = UNITS.stapler;
  protected readonly round = injectRound<Stack>({
    game: 'stapler',
    fresh: newStack,
    step: slide,
    press: drop,
    score: scoreOf,
    level: levelOf,
    over: (stack) => stack.over,
    events,
  });

  constructor() {
    injectSheetKeys(() => gameKeys(this.round.phase(), 'fallen lassen'));
  }

  protected readonly combo = computed(() => {
    const { streak } = this.round.sim();
    return streak > 1 ? `Perfekt x${streak}` : '';
  });
  protected readonly note = computed(() => {
    const { bestStreak } = this.round.sim();
    return bestStreak > 1 ? `Beste Serie: ${bestStreak} perfekt` : '';
  });
  /** How much of the width the tower still has, in blocks of the gauge beside it. */
  protected readonly width = computed(() => {
    const share = this.round.sim().moving.width / BASE_WIDTH;
    return Array.from({ length: 6 }, (_, pip) => share > pip / 6 + 0.01);
  });

  protected readonly parts = computed(() => {
    const { slabs, moving, over } = this.round.sim();
    const from = Math.max(0, slabs.length - SHOWN);
    const tower = slabs
      .slice(from)
      .map((slab, index) =>
        box(slab.x, 0, (from + index) * HEIGHT, slab.width, DEPTH, HEIGHT, colorAt(from + index)),
      );
    const sliding = box(
      moving.x,
      0,
      slabs.length * HEIGHT,
      moving.width,
      DEPTH,
      HEIGHT,
      colorAt(slabs.length),
    );
    return over ? tower : [...tower, sliding];
  });

  /** A line as high as the tower of the record stood: the block that lands over it beats it. */
  protected readonly recordLine = computed(() => {
    const best = this.round.best();
    return best > 0 ? topOf(best) : null;
  });

  /** The picture follows the tower up, so its top stays where it is. */
  protected readonly climb = computed(
    () => `0px ${Math.max(0, this.round.sim().slabs.length - SHOWN + 4) * HEIGHT}px`,
  );
}
