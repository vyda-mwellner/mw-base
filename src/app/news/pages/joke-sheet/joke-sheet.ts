import { Component, computed, inject } from '@angular/core';

import { DAY_MONTH } from '../../../core/format';
import { HouseStatus } from '../../../house/state/house-status';
import { toDate } from '../../../engine/days';
import { jokeOf } from '../../domain/jokes';

@Component({
  templateUrl: './joke-sheet.html',
  styleUrl: './joke-sheet.scss',
})
export class JokeSheet {
  private readonly status = inject(HouseStatus);

  protected readonly day = computed(() => DAY_MONTH.format(toDate(this.status.today())));
  protected readonly joke = computed(() => {
    const [setup, punchline] = jokeOf(this.status.today()).split('\n');
    return { setup, punchline };
  });
}
