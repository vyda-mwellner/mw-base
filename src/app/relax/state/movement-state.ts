import { computed, inject, Injectable, signal } from '@angular/core';

import { todayIso } from '../../engine/days';
import type { Motion } from '../../engine/walk';
import { Store } from '../../ui/store';
import { addTo, coveredBetween, NO_MOVEMENT, type MovementDay, type MovementLog } from '../domain/movement';

const PATH = 'haus/bewegung.json';
/** The figure moves every frame: what it covers is gathered and handed on once a second, not sixty times. */
const FLUSH_MS = 1000;
/** The file is written once walking has paused this long, not with every second of a walk. */
const SAVE_MS = 5000;
/** Older days are dropped when the log is saved. */
const KEPT_DAYS = 90;

/** How far the figure walks and how many floors it rides, by day, kept in the data folder. */
@Injectable({ providedIn: 'root' })
export class MovementState {
  private readonly store = inject(Store);
  private readonly days = signal<MovementLog>({});
  private gathered: MovementDay = NO_MOVEMENT;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: ReturnType<typeof setTimeout> | null = null;

  readonly log = this.days.asReadonly();
  readonly today = computed(() => this.days()[todayIso()]);

  constructor() {
    // What was counted before the file came in stays on top of it.
    void this.store.read<MovementLog>(PATH).then((saved) => {
      if (!saved) return;
      this.days.update((counted) => {
        const merged: Record<string, MovementDay> = { ...saved };
        for (const [day, more] of Object.entries(counted)) merged[day] = addTo(merged[day], more);
        return merged;
      });
    });
    // Hidden, the window may be closed next: what is not written yet goes now.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.saving !== null) void this.save();
    });
  }

  /** Called for every change of the figure. */
  record(before: Motion, after: Motion): void {
    const covered = coveredBetween(before, after);
    if (covered.px === 0 && covered.floors === 0) return;
    this.gathered = addTo(this.gathered, covered);
    this.timer ??= setTimeout(() => this.flush(), FLUSH_MS);
  }

  private flush(): void {
    this.timer = null;
    const covered = this.gathered;
    this.gathered = NO_MOVEMENT;
    const day = todayIso();
    this.days.update((log) => ({ ...log, [day]: addTo(log[day], covered) }));
    if (this.saving !== null) clearTimeout(this.saving);
    this.saving = setTimeout(() => void this.save(), SAVE_MS);
  }

  /** Writes the log at once, with what was gathered in the last second; the house calls it before it quits. */
  save(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.flush();
    }
    if (this.saving !== null) clearTimeout(this.saving);
    this.saving = null;
    const kept = Object.fromEntries(Object.entries(this.days()).sort().slice(-KEPT_DAYS));
    return this.store.write(PATH, kept);
  }
}
