import { Injectable, signal } from '@angular/core';

type ToastTone = 'success' | 'info' | 'warning' | 'error';

interface Toast {
  readonly id: number;
  readonly tone: ToastTone;
  readonly text: string;
  readonly title?: string;
  /** On its way out: still drawn for `closingMs`, then gone. */
  readonly closing: boolean;
}

/** How long a toast stays, how many stand at once (three still leave a sheet readable), and how long one takes to go. */
export const TOASTS = { lifetimeMs: 6500, maxVisible: 3, closingMs: 300 } as const;

interface Clock {
  timer: ReturnType<typeof setTimeout> | null;
  left: number;
  since: number;
}

/** Short messages that go by themselves, errors once they are seen. `ui/toast-stack` draws them. */
@Injectable({ providedIn: 'root' })
export class Toasts {
  private readonly all = signal<readonly Toast[]>([]);
  /** Newest first. */
  readonly list = this.all.asReadonly();
  private nextId = 0;
  private readonly clocks = new Map<number, Clock>();

  success(text: string, title?: string): void {
    this.show('success', text, title);
  }

  info(text: string, title?: string): void {
    this.show('info', text, title);
  }

  warning(text: string, title?: string): void {
    this.show('warning', text, title);
  }

  error(text: string, title?: string): void {
    this.show('error', text, title);
  }

  dismiss(id: number): void {
    const toast = this.all().find((each) => each.id === id);
    if (!toast || toast.closing) return;
    this.stop(id);
    this.all.update((all) => all.map((each) => (each.id === id ? { ...each, closing: true } : each)));
    setTimeout(() => this.all.update((all) => all.filter((each) => each.id !== id)), TOASTS.closingMs);
  }

  /** Puts the newest error away. True if there was one. */
  dismissError(): boolean {
    const error = this.all().find((each) => each.tone === 'error' && !each.closing);
    if (error) this.dismiss(error.id);
    return error !== undefined;
  }

  /** The pointer rests on it: its time stands still until `release`. */
  hold(id: number): void {
    const clock = this.clocks.get(id);
    if (!clock?.timer) return;
    clearTimeout(clock.timer);
    clock.timer = null;
    clock.left -= Date.now() - clock.since;
  }

  release(id: number): void {
    const clock = this.clocks.get(id);
    if (clock && clock.timer === null) this.run(id, clock);
  }

  private show(tone: ToastTone, text: string, title: string | undefined): void {
    // An error stays until it is put away, as a game waits for a message to be read.
    const lifetime = tone === 'error' ? Infinity : TOASTS.lifetimeMs;
    // The same text again, a field saved on every change, only starts its time anew.
    const same = this.all().find((each) => each.tone === tone && each.text === text && !each.closing);
    if (same) return this.start(same.id, lifetime);
    const toast: Toast = { id: this.nextId++, tone, text, title, closing: false };
    const next = [toast, ...this.all()];
    for (const surplus of next.slice(TOASTS.maxVisible)) this.stop(surplus.id);
    this.all.set(next.slice(0, TOASTS.maxVisible));
    this.start(toast.id, lifetime);
  }

  private start(id: number, lifetime: number): void {
    const held = this.clocks.get(id)?.timer === null;
    this.stop(id);
    const clock: Clock = { timer: null, left: lifetime, since: 0 };
    this.clocks.set(id, clock);
    if (!held) this.run(id, clock);
  }

  private run(id: number, clock: Clock): void {
    clock.since = Date.now();
    if (clock.left === Infinity) return;
    clock.timer = setTimeout(() => this.dismiss(id), Math.max(0, clock.left));
  }

  private stop(id: number): void {
    const timer = this.clocks.get(id)?.timer;
    if (timer) clearTimeout(timer);
    this.clocks.delete(id);
  }
}
