import { Component, computed, input, output } from '@angular/core';

import { thingKey } from '../../engine/plan';
import type { Notice } from '../../engine/model';

@Component({
  selector: 'app-island',
  templateUrl: './island.html',
  styleUrl: './island.scss',
})
export class Island {
  readonly notices = input.required<readonly Notice[]>();
  /** Shown while there is no notice. */
  readonly calm = input.required<string>();
  /** What is being worked on right now: it takes the place of everything else, with a bar running under it. */
  readonly working = input<string | null>(null);
  readonly open = input(false);
  /** The row the cursor is on while the list is open. */
  readonly cursor = input(0);
  /** A row was clicked: go to its thing. */
  readonly picked = output<Notice>();

  protected readonly busy = computed(() => this.working() !== null);
  protected readonly rows = computed(() =>
    this.notices().map((notice) => ({ key: thingKey(notice.room, notice.thing), notice })),
  );
  protected readonly top = computed(() => this.notices()[0] ?? null);
  protected readonly more = computed(() => Math.max(0, this.notices().length - 1));
  protected readonly quiet = computed(() => this.notices().length === 0);
  protected readonly expanded = computed(() => this.open() && !this.quiet());
  protected readonly current = computed(() => Math.min(this.cursor(), this.notices().length - 1));
}
