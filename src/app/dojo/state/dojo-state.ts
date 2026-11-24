import { computed, inject, Injectable, linkedSignal, resource, signal } from '@angular/core';

import { todayIso } from '../../engine/days';
import { Sound } from '../../ui/sound';
import { Store } from '../../ui/store';
import { Toasts } from '../../ui/toasts';
import {
  answered,
  boxesOf,
  parseDojo,
  ROUND_SIZE,
  roundOf,
  type DojoFile,
  type Outcome,
  type Round,
} from '../domain/deck';
import { lessonById, LESSONS, type Lesson } from '../domain/lessons';

const DOJO_PATH = 'haus/dojo.json';

/** The card index of the dojo in the office: which lessons are known how well, and today's round. */
@Injectable({ providedIn: 'root' })
export class DojoState {
  private readonly store = inject(Store);
  private readonly sound = inject(Sound);
  private readonly toasts = inject(Toasts);
  // Set again on every answer and every new round: a day that turned while the app was open is noticed then.
  private readonly today = signal(todayIso());

  private readonly doc = resource({ loader: () => this.store.read<unknown>(DOJO_PATH) });
  private readonly file = linkedSignal(() => parseDojo(this.doc.hasValue() ? this.doc.value() : null));
  private writing: Promise<void> = Promise.resolve();
  readonly loaded = computed(() => this.doc.hasValue());

  /** Today's round as it was kept; before its first lesson is over, one drawn from the card index. */
  readonly round = computed<Round>(() => {
    const day = this.today();
    const kept = this.file().round;
    return kept?.day === day ? kept : { day, ids: roundOf(this.file().cards, day), outcomes: [] };
  });
  readonly lessons = computed(() =>
    this.round().ids.map((id, index) => ({
      lesson: lessonById(id)!,
      outcome: this.round().outcomes[index] ?? null,
    })),
  );
  readonly current = computed<Lesson | null>(
    () => this.lessons()[this.round().outcomes.length]?.lesson ?? null,
  );
  /** The lessons still to come after the current one. */
  readonly ahead = computed(() =>
    this.lessons()
      .slice(this.round().outcomes.length + 1)
      .map((each) => each.lesson),
  );
  readonly solvedToday = computed(() => this.file().solved[this.today()] ?? 0);
  /** How far today got against a round, for the screen in the office: 0 to 1. */
  readonly share = computed(() => Math.min(1, this.solvedToday() / ROUND_SIZE));
  readonly met = computed(() => Object.keys(this.file().cards).length);
  readonly total = LESSONS.length;
  readonly boxes = computed(() => boxesOf(this.file().cards));
  /** One line for the room menu. */
  readonly note = computed(() => {
    const { ids, outcomes } = this.round();
    const known = `${this.met()} von ${this.total} kennengelernt`;
    return this.current()
      ? `Aufgabe ${outcomes.length + 1} von ${ids.length}, ${known}`
      : `Runde geschafft, ${known}`;
  });

  /** Puts the outcome of the current lesson down; the last one of a round rings. */
  async answer(outcome: Outcome): Promise<void> {
    const lesson = this.current();
    if (!lesson) return;
    // Taken before the day is read again, so the answer lands on the round it was given in.
    const round = this.round();
    this.today.set(todayIso());
    const next = answered({ ...this.file(), round }, lesson.id, outcome, this.today());
    await this.save(next);
    const done = next.round!;
    if (done.outcomes.length < done.ids.length) return;
    const solved = done.outcomes.filter((each) => each !== 'skipped').length;
    this.sound.play('done');
    this.toasts.success(`${solved} von ${done.ids.length} gelöst`, 'Dojo-Runde geschafft');
  }

  /** Another round after the one of the day is over: due lessons first, then new ones. */
  again(): Promise<void> {
    this.today.set(todayIso());
    const day = this.today();
    return this.save({ ...this.file(), round: { day, ids: roundOf(this.file().cards, day), outcomes: [] } });
  }

  /** In the order they were made, so a quick second answer never lands before the first. */
  private save(file: DojoFile): Promise<void> {
    this.file.set(file);
    const written = this.writing.then(() => this.store.write(DOJO_PATH, file));
    this.writing = written.catch(() => undefined);
    return written;
  }
}
