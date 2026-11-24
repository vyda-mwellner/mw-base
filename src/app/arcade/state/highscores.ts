import { computed, inject, Injectable, resource, signal } from '@angular/core';

import { todayIso } from '../../engine/days';
import { Store } from '../../ui/store';
import { Game, GAMES } from '../domain/round';
import { targetOf } from '../domain/task';

/** The tasks of a day, set from the records as they stood before its first round, and the games that met theirs. */
interface Tasks {
  readonly day: string;
  readonly targets: Readonly<Partial<Record<Game, number>>>;
  readonly done: readonly Game[];
}

interface ScoreFile extends Readonly<Partial<Record<Game, number>>> {
  readonly tasks?: Tasks;
}

/** What the round that just ended did for the record and for the task of the day. */
export interface Outcome {
  readonly beaten: boolean;
  readonly solved: boolean;
}

const SCORES_PATH = 'haus/rekorde.json';

/** The best result of every game and the tasks of the day. */
@Injectable({ providedIn: 'root' })
export class Highscores {
  private readonly store = inject(Store);
  // Set again when a round ends: a day that turned while the app was open is noticed then.
  private readonly today = signal(todayIso());
  private readonly doc = resource({ loader: () => this.store.read<ScoreFile>(SCORES_PATH) });

  readonly scores = computed<ScoreFile>(() => (this.doc.hasValue() ? this.doc.value() : null) ?? {});

  // Until the first round of a day is over, its tasks follow the records; from then on they stay as they were.
  private readonly tasks = computed<Tasks>(() => {
    const day = this.today();
    const kept = this.scores().tasks;
    if (kept?.day === day) return kept;
    return {
      day,
      targets: Object.fromEntries(GAMES.map((game) => [game, targetOf(game, this.best(game), day)])),
      done: [],
    };
  });
  readonly tasksToday = computed(() => this.tasks().done.length);

  best(game: Game): number {
    return this.scores()[game] ?? 0;
  }

  target(game: Game): number {
    return this.tasks().targets[game] ?? targetOf(game, this.best(game), this.tasks().day);
  }

  solved(game: Game): boolean {
    return this.tasks().done.includes(game);
  }

  /** Writes down the round that just ended: its score if it beat the best one, and the task if it met it. */
  async record(game: Game, score: number): Promise<Outcome> {
    this.today.set(todayIso());
    const tasks = this.tasks();
    const outcome = {
      beaten: score > this.best(game),
      solved: !this.solved(game) && score >= this.target(game),
    };
    const scores: ScoreFile = {
      ...this.scores(),
      ...(outcome.beaten ? { [game]: score } : {}),
      tasks: outcome.solved ? { ...tasks, done: [...tasks.done, game] } : tasks,
    };
    await this.store.write(SCORES_PATH, scores);
    this.doc.set(scores);
    return outcome;
  }
}
