import { computed, inject, Injectable, resource } from '@angular/core';

import { Store } from '../../ui/store';
import type { Vacation } from '../domain/calendar';
import { withoutVacation, withVacation } from '../domain/vacation-input';

interface VacationFile {
  readonly vacations: readonly Vacation[];
}

const VACATIONS_PATH = 'kalender/urlaub.json';

/** The days off, kept in the data folder: they take the workdays of mine down to what is really left. */
@Injectable({ providedIn: 'root' })
export class Vacations {
  private readonly store = inject(Store);
  private readonly doc = resource({ loader: () => this.store.read<VacationFile>(VACATIONS_PATH) });

  readonly list = computed<readonly Vacation[]>(
    () => (this.doc.hasValue() ? this.doc.value()?.vacations : null) ?? [],
  );
  readonly loading = this.doc.isLoading;

  /** Puts a vacation on the list, in place of `old` when one is being changed. */
  enter(vacation: Vacation, old: Vacation | null = null): Promise<void> {
    const kept = old ? withoutVacation(this.list(), old) : this.list();
    return this.save(withVacation(kept, vacation));
  }

  remove(vacation: Vacation): Promise<void> {
    return this.save(withoutVacation(this.list(), vacation));
  }

  private async save(vacations: readonly Vacation[]): Promise<void> {
    const file: VacationFile = { vacations };
    await this.store.write(VACATIONS_PATH, file);
    this.doc.set(file);
  }
}
