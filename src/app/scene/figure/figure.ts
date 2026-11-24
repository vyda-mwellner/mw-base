import { Component, computed, input } from '@angular/core';

import { Solids } from '../solids/solids';
import { FIGURE, layersOf } from '../../engine/figure';
import { facesFront, FigureMove, HELD_BEAT, poseAt } from '../../engine/poses';

/** Built from boxes, its feet at the origin. Standing it shows its front, walking its side. */
@Component({
  selector: '[app-figure]',
  imports: [Solids],
  templateUrl: './figure.html',
  styleUrl: './figure.scss',
})
export class FigureArt {
  readonly move = input<FigureMove>('stand');
  readonly facing = input<1 | -1>(1);
  /** How far the move has got: one beat is a repetition, or two steps. */
  readonly beat = input(0);

  private readonly still =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  protected readonly layers = computed(() => {
    const move = this.move();
    const front = facesFront(move);
    const ahead = front ? 1 : this.facing();
    const view = front ? FIGURE.front : ahead > 0 ? FIGURE.right : FIGURE.left;
    return layersOf(view, poseAt(move, this.still ? HELD_BEAT : this.beat()), ahead);
  });
}
