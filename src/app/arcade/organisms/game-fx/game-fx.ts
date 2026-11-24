import { Component, computed, input } from '@angular/core';

import { fadeOf, Juice } from '../../domain/juice';

/** What a hit leaves on the playing field: specks, falling pieces, numbers that rise, a flash of light. */
@Component({
  selector: '[app-game-fx]',
  templateUrl: './game-fx.html',
  styleUrl: './game-fx.scss',
})
export class GameFx {
  readonly juice = input.required<Juice>();

  protected readonly flash = computed(() => this.juice().flash * 0.5);
  protected readonly particles = computed(() =>
    this.juice().particles.map((particle) => ({ ...particle, fade: fadeOf(particle) })),
  );
  protected readonly popups = computed(() =>
    this.juice().popups.map((popup) => ({ ...popup, fade: fadeOf(popup) })),
  );
}
