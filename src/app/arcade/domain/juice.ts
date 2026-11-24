export interface Particle {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly w: number;
  readonly h: number;
  readonly color: string;
  readonly age: number;
  readonly span: number;
}

export type PopupTone = 'plain' | 'gold' | 'bad';

export interface Popup {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly tone: PopupTone;
  readonly age: number;
  readonly span: number;
}

/** What a hit leaves behind on screen, in the units of the playing field; y grows downwards. */
export interface Juice {
  readonly clock: number;
  /** Seconds the simulation still stands, while the picture goes on. */
  readonly freeze: number;
  /** 0 to 1, each fading by itself. */
  readonly trauma: number;
  readonly flash: number;
  readonly squash: number;
  readonly particles: readonly Particle[];
  readonly popups: readonly Popup[];
}

export interface Impact {
  readonly freeze?: number;
  readonly trauma?: number;
  readonly flash?: number;
  readonly squash?: number;
}

export const CALM: Juice = {
  clock: 0,
  freeze: 0,
  trauma: 0,
  flash: 0,
  squash: 0,
  particles: [],
  popups: [],
};

/** The furthest the field is ever moved, and how long a shake, a flash and a squash take to fade. */
export const SHAKE = 3;
const FADE = { trauma: 0.24, flash: 0.14, squash: 0.12 } as const;
const GRAVITY = 420;
const POPUP_RISE = 34;
const POOL = { particles: 28, popups: 5 } as const;

const fade = (value: number, seconds: number, over: number): number => Math.max(0, value - seconds / over);

/** Back to `CALM` itself once everything has faded: an unchanged signal is what lets a still screen rest. */
export function settle(juice: Juice, seconds: number): Juice {
  const settled = {
    clock: juice.clock + seconds,
    freeze: Math.max(0, juice.freeze - seconds),
    trauma: fade(juice.trauma, seconds, FADE.trauma),
    flash: fade(juice.flash, seconds, FADE.flash),
    squash: fade(juice.squash, seconds, FADE.squash),
    particles: juice.particles
      .map((particle) => ({
        ...particle,
        x: particle.x + particle.vx * seconds,
        y: particle.y + particle.vy * seconds,
        vy: particle.vy + GRAVITY * seconds,
        age: particle.age + seconds,
      }))
      .filter((particle) => particle.age < particle.span),
    popups: juice.popups
      .map((popup) => ({ ...popup, y: popup.y - POPUP_RISE * seconds, age: popup.age + seconds }))
      .filter((popup) => popup.age < popup.span),
  };
  const faded =
    settled.freeze === 0 &&
    settled.trauma === 0 &&
    settled.flash === 0 &&
    settled.squash === 0 &&
    settled.particles.length === 0 &&
    settled.popups.length === 0;
  return faded ? CALM : settled;
}

const pooled = <T>(items: readonly T[], most: number): readonly T[] => items.slice(-most);

/** Specks flying apart from a point, upwards more than down. No dice: the same burst looks the same. */
export function burst(juice: Juice, x: number, y: number, color: string, count = 8, force = 80): Juice {
  const specks = Array.from({ length: count }, (_, index): Particle => {
    const angle = Math.PI * (1.1 + (0.8 * (index + 0.5)) / count);
    const speed = force * (0.6 + 0.4 * ((index * 7) % 5) * 0.25);
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 2 + (index % 2),
      h: 2 + (index % 2),
      color,
      age: 0,
      span: 0.32 + 0.04 * (index % 4),
    };
  });
  return { ...juice, particles: pooled([...juice.particles, ...specks], POOL.particles) };
}

/** One piece that falls out of the picture: what was cut off a block. */
export function chunk(
  juice: Juice,
  piece: Pick<Particle, 'x' | 'y' | 'w' | 'h' | 'color'> & { readonly vx?: number },
): Juice {
  const falling: Particle = { ...piece, vx: piece.vx ?? 0, vy: -30, age: 0, span: 0.9 };
  return { ...juice, particles: pooled([...juice.particles, falling], POOL.particles) };
}

export function popup(juice: Juice, x: number, y: number, text: string, tone: PopupTone = 'plain'): Juice {
  const next: Popup = { x, y, text, tone, age: 0, span: 0.7 };
  return { ...juice, popups: pooled([...juice.popups, next], POOL.popups) };
}

/** A stronger hit replaces a weaker one that is still fading, it does not add to it. */
export function impact(juice: Juice, hit: Impact): Juice {
  return {
    ...juice,
    freeze: Math.max(juice.freeze, hit.freeze ?? 0),
    trauma: Math.min(1, Math.max(juice.trauma, hit.trauma ?? 0)),
    flash: Math.min(1, Math.max(juice.flash, hit.flash ?? 0)),
    squash: Math.min(1, Math.max(juice.squash, hit.squash ?? 0)),
  };
}

/** Where the field stands while it shakes: the square of what is left of the hit, so it dies away fast. */
export function shakeOf(juice: Juice): readonly [number, number] {
  const reach = SHAKE * juice.trauma * juice.trauma;
  return [reach * Math.sin(juice.clock * 97), reach * Math.cos(juice.clock * 71)];
}

/** How much of a thing is left to see, 1 to 0: it fades over the last third of its time. */
export const fadeOf = (thing: { readonly age: number; readonly span: number }): number =>
  Math.min(1, (3 * (thing.span - thing.age)) / thing.span);

/** How many steps of `step` seconds fit into a frame, and what is carried over to the next one. */
export function fixedSteps(
  carry: number,
  seconds: number,
  step: number,
): { readonly count: number; readonly carry: number } {
  const total = carry + seconds;
  const count = Math.floor(total / step + 1e-9);
  return { count, carry: total - count * step };
}
