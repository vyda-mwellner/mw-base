import { booleanAttribute, Component, computed, input } from '@angular/core';

import type { KeyHint } from '../../../ui/sheet-keys';
import { counted, type Unit } from '../../domain/round';
import type { GameState } from '../../state/round';

/** The one key of a game, named after what it does next; `move` is what it does in a round. */
export const gameKeys = (state: GameState, move: string): readonly KeyHint[] => [
  {
    keys: ['Leertaste', 'Enter', 'W'],
    label: state === 'playing' ? move : state === 'over' ? 'noch mal' : 'starten',
  },
];

/** An arcade screen: score, level and record in a bar on top, the playing field under it, and what to do next over it while nothing is running. */
@Component({
  selector: 'app-game-frame',
  templateUrl: './game-frame.html',
  styleUrl: './game-frame.scss',
})
export class GameFrame {
  readonly state = input.required<GameState>();
  readonly score = input.required<number>();
  readonly best = input.required<number>();
  readonly level = input(1);
  /** What is counted: blocks, metres. */
  readonly unit = input.required<Unit>();
  /** Shown before the first round. */
  readonly rule = input.required<string>();
  /** The round that just ended beat the best one. */
  readonly record = input(false, { transform: booleanAttribute });
  /** The round that just ended against the best one; empty for nothing to say. */
  readonly verdict = input('');
  /** What else the round had, under the verdict. */
  readonly note = input('');
  /** What is going on right now, beside the score: a row of hits. */
  readonly combo = input('');
  /** What the game asks of today, in the unit it counts in; 0 for no task. */
  readonly target = input(0);
  readonly solved = input(false, { transform: booleanAttribute });

  protected readonly over = computed(() => this.state() === 'over');
  protected readonly scoreUnit = computed(() => (this.score() === 1 ? this.unit().one : this.unit().many));
  protected readonly result = computed(() => counted(this.score(), this.unit()));
  protected readonly task = computed(() => counted(this.target(), this.unit()));
  protected readonly waiting = computed(() => this.state() !== 'playing');
}
