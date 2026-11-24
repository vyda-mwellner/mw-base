import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';

import { isoWeek } from '../../../engine/days';
import { HouseStatus } from '../../../house/state/house-status';
import { arm } from '../../../ui/key-walk/key-walk';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { injectTask } from '../../../ui/task';
import { Vacation, vacationDays } from '../../domain/calendar';
import { readVacation, showDay, typedVacation } from '../../domain/vacation-input';
import { Vacations } from '../../state/vacations';

const WEEKDAY = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const;

const shortDay = (iso: string): string => showDay(iso).slice(0, 6);
const inDays = (days: number): string => (days === 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} Tagen`);
const dayCount = (days: number): string => (days === 1 ? '1 Tag' : `${days} Tage`);

/** The workdays left in quarter and year, the next holiday, and the vacations that take days off them. */
@Component({
  templateUrl: './workdays-sheet.html',
  styleUrl: './workdays-sheet.scss',
})
export class WorkdaysSheet {
  private readonly status = inject(HouseStatus);
  private readonly vacations = inject(Vacations);
  private readonly task = injectTask();
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('span');

  protected readonly draft = signal('');
  protected readonly editing = signal<Vacation | null>(null);
  protected readonly busy = this.task.busy;

  protected readonly week = computed(() => isoWeek(this.status.today()));
  protected readonly periods = computed(() =>
    this.status.periods().map((period) => {
      const percent = Math.floor(period.share * 100);
      return {
        ...period.workdays,
        label: period.label,
        title: `${period.label} · ${shortDay(period.first)} - ${shortDay(period.last)}`,
        percent: `${percent} %`,
        aria: `${period.label}: ${percent} % vorbei`,
        fill: `${percent}%`,
        away: period.workdays.mine - period.workdays.left,
      };
    }),
  );
  protected readonly holiday = computed(() => {
    const { name, date, days } = this.status.holiday();
    return {
      title: `${name}, ${WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()]} ${showDay(date)}`,
      distance: inDays(days),
    };
  });
  protected readonly rows = computed(() => {
    const today = this.status.today();
    return this.vacations.list().map((vacation) => ({
      key: `${vacation.from}/${vacation.to}`,
      vacation,
      label: typedVacation(vacation),
      change: `${typedVacation(vacation)} ändern`,
      drop: `${typedVacation(vacation)} entfernen`,
      note: vacation.to < today ? 'vorbei' : `${dayCount(vacationDays(vacation))} Mo - Do`,
      editing: this.editing() === vacation,
    }));
  });
  /** What the field would enter, while something is typed: the span read from it, or why it cannot be read. */
  protected readonly preview = computed(() => {
    const text = this.draft();
    if (!text.trim()) return null;
    const read = readVacation(text, this.status.today());
    if (typeof read === 'string') return { tone: 'warning', text: read };
    return { tone: 'ok', text: `${typedVacation(read)} · ${dayCount(vacationDays(read))} Mo - Do` };
  });

  constructor() {
    injectSheetKeys(() => [
      { keys: ['Q'], label: 'Neuer Urlaub' },
      { keys: ['X'], label: 'entfernen' },
    ]);
  }

  /** Enter on a vacation puts it into the field, to change it there. */
  protected edit(vacation: Vacation): void {
    this.editing.set(vacation);
    this.draft.set(typedVacation(vacation));
    const input = this.field().nativeElement;
    input.value = this.draft();
    input.focus();
    arm(input);
  }

  protected cancel(): void {
    this.editing.set(null);
    this.draft.set('');
  }

  protected save(): Promise<void> {
    return this.task.run(async () => {
      const read = readVacation(this.draft(), this.status.today());
      if (typeof read === 'string') throw new Error(read);
      const old = this.editing();
      await this.vacations.enter(read, old);
      this.cancel();
      return old ? `Urlaub geändert: ${typedVacation(read)}` : `Urlaub eingetragen: ${typedVacation(read)}`;
    });
  }

  protected remove(vacation: Vacation): Promise<void> {
    return this.task.run(async () => {
      await this.vacations.remove(vacation);
      if (this.editing() === vacation) this.cancel();
      return `Urlaub entfernt: ${typedVacation(vacation)}`;
    });
  }
}
