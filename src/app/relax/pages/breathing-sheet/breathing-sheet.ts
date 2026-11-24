import { Component, computed, DestroyRef, inject, signal } from '@angular/core';

import { Sound } from '../../../ui/sound';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { Toasts } from '../../../ui/toasts';
import { BREATH, breathAt, type BreathPhase } from '../../domain/breathing';

const TICK_MS = 100;
const SAY: Readonly<Record<BreathPhase, string>> = { in: 'Einatmen', out: 'Ausatmen', hold: 'Halten' };

/** Breathing on the lounger of the roof terrace: a circle that grows while breathing in and shrinks while breathing out. */
@Component({
  templateUrl: './breathing-sheet.html',
  styleUrl: './breathing-sheet.scss',
})
export class BreathingSheet {
  private readonly sound = inject(Sound);
  private readonly toasts = inject(Toasts);
  private readonly startedAt = signal<number | null>(null);
  private readonly now = signal(0);
  private timer: ReturnType<typeof setInterval> | undefined;
  private heard: BreathPhase | null = null;

  private readonly moment = computed(() => {
    const start = this.startedAt();
    return start === null ? null : breathAt(this.now() - start);
  });
  protected readonly running = computed(() => this.startedAt() !== null);
  protected readonly phase = computed(() => this.moment()?.phase ?? null);
  protected readonly say = computed(() => {
    const moment = this.moment();
    return moment ? SAY[moment.phase] : 'Bereit';
  });
  protected readonly left = computed(() => this.moment()?.left ?? null);
  protected readonly round = computed(() => {
    const moment = this.moment();
    return moment
      ? `Runde ${moment.round} von ${BREATH.rounds}`
      : `${BREATH.rounds} Runden, gut zweieinhalb Minuten`;
  });
  protected readonly action = computed(() => (this.running() ? 'Aufhören' : 'Starten'));

  constructor() {
    injectSheetKeys(() => [{ keys: ['Q'], label: this.action() }]);
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected toggle(): void {
    if (this.running()) this.stop();
    else this.start();
  }

  private start(): void {
    const at = performance.now();
    this.now.set(at);
    this.startedAt.set(at);
    this.heard = null;
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    this.now.set(performance.now());
    const moment = this.moment();
    if (!moment) return;
    if (moment.done) {
      this.stop();
      this.sound.play('done');
      this.toasts.success('Atemübung geschafft');
      return;
    }
    if (moment.phase !== this.heard) {
      this.heard = moment.phase;
      if (moment.phase !== 'hold') this.sound.play(moment.phase === 'in' ? 'breathe-in' : 'breathe-out');
    }
  }

  private stop(): void {
    clearInterval(this.timer);
    this.startedAt.set(null);
  }
}
