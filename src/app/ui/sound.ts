import { Injectable } from '@angular/core';

import { onShellEvent } from '../core/ipc';

export type Tune =
  | 'step'
  | 'jump'
  | 'land'
  | 'doors-open'
  | 'doors-close'
  | 'door-open'
  | 'door-close'
  | 'ride-start'
  | 'ride-stop'
  | 'blip'
  | 'chime'
  | 'fail'
  | 'tick'
  | 'open'
  | 'close'
  | 'breathe-in'
  | 'breathe-out'
  | 'done'
  | 'perfect'
  | 'near'
  | 'catch'
  | 'bust'
  | 'level'
  | 'record'
  | 'pop'
  | 'rustle'
  | 'splash'
  | 'saved'
  | 'denied';

/** Every sound at once: the gains below are what each one has against the others. */
const VOLUME = 0.96;
/** How loud the motor of the lift is at full speed, against the other sounds. */
const MOTOR_VOLUME = 0.893;
/** The open air is only just there: enough to tell outside from inside. */
const AIR_VOLUME = 0.059;
/** A context that plays nothing still keeps the audio device and a thread of its own busy: it rests after this. */
const REST_MS = 15_000;
/** Seconds of white noise every swish, hum and breeze is cut from. */
const NOISE_SECONDS = 2;

interface Motor {
  set(load: number, at: number): void;
  stop(at: number): void;
}

/** Every sound is made up on the spot from oscillators and noise; there are no audio files. */
@Injectable({ providedIn: 'root' })
export class Sound {
  private context: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private rest: ReturnType<typeof setTimeout> | null = null;
  private motor: Motor | null = null;
  private air: { stop(at: number): void } | null = null;
  private outside = false;
  private muted = false;
  private awake = false;
  private last: { readonly tune: Tune; readonly at: number } | null = null;

  constructor() {
    // Before the tunes of a key are asked for: the capture phase comes ahead of every handler in the app.
    const wake = (): void => void (this.awake = true);
    document.addEventListener('keydown', wake, { once: true, capture: true });
    document.addEventListener('pointerdown', wake, { once: true, capture: true });
    // A context can stay bound to a headset that is gone and play into nothing; a new one takes the device in use.
    onShellEvent('sound-output-changed', () => this.restart());
  }

  /** Muted, nothing new starts and what was going on by itself ends. */
  mute(muted: boolean): void {
    this.muted = muted;
    if (muted) this.silence();
    else this.breeze(this.outside);
  }

  /** The open air: a soft rush for as long as the figure is under the sky. */
  breeze(outside: boolean): void {
    this.outside = outside;
    const audio = outside && !this.muted ? this.audio() : null;
    if (audio) this.air ??= this.startAir(audio);
    else this.calm();
  }

  /** The tune that was heard last, if it started less than `within` milliseconds ago. */
  lately(within: number): Tune | null {
    return this.last && performance.now() - this.last.at < within ? this.last.tune : null;
  }

  play(tune: Tune): void {
    const audio = this.muted ? null : this.audio();
    if (!audio) return;
    this.last = { tune, at: performance.now() };
    this.restLater();
    const now = audio.currentTime;
    switch (tune) {
      case 'step':
        // The deep part alone is lost on laptop speakers; the knock above it is what they play.
        this.tone(audio, now, 0.08, 'sine', 150, 60, 0.3);
        this.noise(audio, now, 0.045, 0.14, 520, 220);
        break;
      case 'jump':
        this.tone(audio, now, 0.14, 'square', 280, 620, 0.04);
        break;
      case 'land':
        this.tone(audio, now, 0.09, 'sine', 130, 60, 0.09);
        break;
      case 'doors-open':
        this.noise(audio, now, 0.52, 0.05, 700, 2400);
        this.tone(audio, now + 0.5, 0.06, 'sine', 95, 70, 0.07);
        break;
      case 'doors-close':
        this.noise(audio, now, 0.52, 0.05, 2400, 700);
        this.tone(audio, now + 0.5, 0.07, 'sine', 80, 55, 0.09);
        break;
      case 'door-open':
        this.tone(audio, now, 0.05, 'square', 190, 150, 0.04);
        this.tone(audio, now + 0.05, 0.16, 'triangle', 210, 330, 0.05);
        break;
      case 'door-close':
        this.tone(audio, now, 0.1, 'sine', 120, 55, 0.14);
        this.noise(audio, now, 0.04, 0.05, 500, 200);
        break;
      case 'ride-start':
        this.clunk(audio, now);
        break;
      case 'blip':
        this.tone(audio, now, 0.07, 'square', 520, 700, 0.05);
        break;
      case 'chime':
        this.tone(audio, now, 0.09, 'square', 660, 660, 0.05);
        this.tone(audio, now + 0.09, 0.16, 'square', 990, 990, 0.05);
        break;
      case 'fail':
        this.tone(audio, now, 0.4, 'sawtooth', 220, 55, 0.08);
        break;
      case 'tick':
        this.tone(audio, now, 0.04, 'square', 880, 880, 0.03);
        break;
      case 'open':
        this.noise(audio, now, 0.16, 0.05, 500, 1800);
        break;
      case 'close':
        this.noise(audio, now, 0.14, 0.05, 1600, 450);
        break;
      case 'breathe-in':
        this.tone(audio, now, 3.6, 'sine', 174, 261, 0.06);
        break;
      case 'breathe-out':
        this.tone(audio, now, 6.6, 'sine', 261, 174, 0.06);
        break;
      case 'done':
        this.tone(audio, now, 0.18, 'sine', 660, 660, 0.07);
        this.tone(audio, now + 0.18, 0.2, 'sine', 880, 880, 0.07);
        this.tone(audio, now + 0.38, 0.5, 'sine', 1320, 1320, 0.07);
        break;
      case 'ride-stop':
        this.clunk(audio, now);
        this.tone(audio, now + 0.05, 0.22, 'sine', 880, 880, 0.07);
        this.tone(audio, now + 0.24, 0.34, 'sine', 660, 660, 0.07);
        break;
      case 'perfect':
        this.tone(audio, now, 0.06, 'square', 784, 784, 0.05);
        this.tone(audio, now + 0.06, 0.14, 'square', 1175, 1175, 0.05);
        break;
      case 'near':
        this.noise(audio, now, 0.09, 0.05, 900, 2600);
        this.tone(audio, now + 0.03, 0.08, 'square', 880, 1320, 0.04);
        break;
      case 'catch':
        this.noise(audio, now, 0.03, 0.08, 1400, 700);
        this.tone(audio, now, 0.08, 'square', 587, 880, 0.05);
        break;
      case 'bust':
        this.tone(audio, now, 0.18, 'square', 196, 98, 0.06);
        break;
      case 'level':
        this.tone(audio, now, 0.07, 'square', 523, 523, 0.045);
        this.tone(audio, now + 0.07, 0.07, 'square', 659, 659, 0.045);
        this.tone(audio, now + 0.14, 0.14, 'square', 784, 784, 0.045);
        break;
      case 'pop':
        this.noise(audio, now, 0.04, 0.07, 2600, 1200);
        this.tone(audio, now, 0.09, 'square', 740, 1480, 0.045);
        break;
      case 'splash':
        this.noise(audio, now, 0.35, 0.12, 1400, 300);
        this.tone(audio, now, 0.12, 'sine', 220, 90, 0.06);
        break;
      case 'rustle':
        this.noise(audio, now, 0.42, 0.05, 1800, 900);
        this.noise(audio, now + 0.12, 0.3, 0.04, 2400, 1200);
        break;
      case 'saved':
        this.noise(audio, now, 0.03, 0.06, 1800, 900);
        this.tone(audio, now, 0.07, 'triangle', 784, 784, 0.08);
        this.tone(audio, now + 0.07, 0.14, 'triangle', 1175, 1175, 0.08);
        break;
      case 'denied':
        this.tone(audio, now, 0.1, 'square', 330, 330, 0.05);
        this.tone(audio, now + 0.1, 0.2, 'square', 220, 220, 0.05);
        break;
      case 'record':
        this.tone(audio, now, 0.1, 'square', 523, 523, 0.05);
        this.tone(audio, now + 0.1, 0.1, 'square', 659, 659, 0.05);
        this.tone(audio, now + 0.2, 0.1, 'square', 784, 784, 0.05);
        this.tone(audio, now + 0.3, 0.34, 'square', 1047, 1047, 0.05);
        break;
    }
  }

  /** A note for the `step`th hit of a row: each one a whole tone above the last, up to an octave and a half. */
  combo(step: number): void {
    const audio = this.muted ? null : this.audio();
    if (!audio) return;
    this.restLater();
    const pitch = 523 * 2 ** (Math.min(9, Math.max(0, step - 1)) / 6);
    this.tone(audio, audio.currentTime, 0.06, 'square', pitch, pitch, 0.05);
    this.tone(audio, audio.currentTime + 0.06, 0.12, 'square', pitch * 1.5, pitch * 1.5, 0.05);
  }

  /** The motor of the lift at `load`, from 0 standing to 1 at full speed: it is heard rising and falling with it. */
  drive(load: number): void {
    const audio = this.muted ? null : this.audio();
    if (!audio) return;
    if (load <= 0) return this.silence();
    this.motor ??= this.startMotor(audio);
    this.motor.set(load, audio.currentTime);
  }

  private restart(): void {
    if (!this.context) return;
    void this.context.close();
    this.context = null;
    this.noiseBuffer = null;
    this.motor = null;
    this.air = null;
    this.breeze(this.outside);
  }

  private silence(): void {
    if (this.context) this.motor?.stop(this.context.currentTime);
    this.motor = null;
    this.calm();
  }

  private calm(): void {
    if (this.context) this.air?.stop(this.context.currentTime);
    this.air = null;
    this.restLater();
  }

  /** Once nothing has played for a while and neither motor nor breeze runs, the context is suspended. */
  private restLater(): void {
    if (this.rest !== null) clearTimeout(this.rest);
    this.rest = setTimeout(() => {
      this.rest = null;
      if (this.context?.state === 'running' && !this.motor && !this.air) void this.context.suspend();
    }, REST_MS);
  }

  /** One buffer of white noise per context: filling a new one with random numbers at every step is wasted work. */
  private whiteNoise(audio: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const buffer = audio.createBuffer(1, audio.sampleRate * NOISE_SECONDS, audio.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  // A browser only lets a page make sound after a key or a click. A tune before that would be kept back and
  // played together with the first one that is allowed.
  private audio(): AudioContext | null {
    if (typeof AudioContext === 'undefined' || !this.awake) return null;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
    return this.context;
  }

  private tone(
    audio: AudioContext,
    at: number,
    seconds: number,
    type: OscillatorType,
    from: number,
    to: number,
    gain: number,
  ): void {
    const oscillator = audio.createOscillator();
    const volume = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(to, at + seconds);
    volume.gain.setValueAtTime(gain * VOLUME, at);
    volume.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    oscillator.connect(volume).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + seconds);
  }

  /** White noise through a band that moves from one frequency to another: a swish. */
  private noise(
    audio: AudioContext,
    at: number,
    seconds: number,
    gain: number,
    from: number,
    to: number,
  ): void {
    const source = audio.createBufferSource();
    const band = audio.createBiquadFilter();
    const volume = audio.createGain();
    source.buffer = this.whiteNoise(audio);
    band.type = 'bandpass';
    band.frequency.setValueAtTime(from, at);
    band.frequency.exponentialRampToValueAtTime(to, at + seconds);
    volume.gain.setValueAtTime(gain * VOLUME, at);
    volume.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    source.connect(band).connect(volume).connect(audio.destination);
    // From somewhere in the buffer, so two swishes in a row are not the same noise.
    source.start(at, Math.random() * Math.max(0, NOISE_SECONDS - seconds), seconds);
  }

  /** The lift locks in or out of a floor. */
  private clunk(audio: AudioContext, at: number): void {
    this.tone(audio, at, 0.12, 'sine', 120, 55, 0.16);
    this.noise(audio, at, 0.05, 0.05, 420, 180);
  }

  /**
   * A hoist motor: a soft hum with the note an octave above, a higher tone small speakers can play, the whir
   * of the gear and a low rumble. Everything is rounded off above 1.2 kHz, nothing in it buzzes.
   */
  private startMotor(audio: AudioContext): Motor {
    const out = audio.createGain();
    const soften = audio.createBiquadFilter();
    out.gain.value = 0;
    soften.type = 'lowpass';
    soften.frequency.value = 1200;
    soften.connect(out).connect(audio.destination);

    const voice = (type: OscillatorType, gain: number): OscillatorNode => {
      const oscillator = audio.createOscillator();
      const volume = audio.createGain();
      oscillator.type = type;
      volume.gain.value = gain;
      oscillator.connect(volume).connect(soften);
      oscillator.start();
      return oscillator;
    };
    const hum = voice('triangle', 0.1);
    const octave = voice('triangle', 0.05);
    const tone = voice('sine', 0.014);

    const buffer = this.whiteNoise(audio);
    const band = (type: BiquadFilterType, frequency: number, gain: number): BiquadFilterNode => {
      const source = audio.createBufferSource();
      const filter = audio.createBiquadFilter();
      const volume = audio.createGain();
      source.buffer = buffer;
      source.loop = true;
      filter.type = type;
      filter.frequency.value = frequency;
      volume.gain.value = gain;
      source.connect(filter).connect(volume).connect(soften);
      source.start();
      sources.push(source);
      return filter;
    };
    const sources: AudioScheduledSourceNode[] = [hum, octave, tone];
    const whir = band('bandpass', 300, 0.035);
    band('lowpass', 160, 0.05);

    return {
      set: (load, at) => {
        const note = 46 + 50 * load;
        hum.frequency.setTargetAtTime(note, at, 0.06);
        octave.frequency.setTargetAtTime(note * 2.01, at, 0.06);
        tone.frequency.setTargetAtTime(note * 4, at, 0.06);
        whir.frequency.setTargetAtTime(260 + 420 * load, at, 0.06);
        out.gain.setTargetAtTime(Math.sqrt(load) * MOTOR_VOLUME * VOLUME, at, 0.06);
      },
      stop: (at) => {
        out.gain.setTargetAtTime(0, at, 0.05);
        for (const source of sources) source.stop(at + 0.4);
      },
    };
  }

  /** Noise with everything bright taken out, swelling and sinking a little: wind that is hardly there. */
  private startAir(audio: AudioContext): { stop(at: number): void } {
    const source = audio.createBufferSource();
    const soften = audio.createBiquadFilter();
    const swell = audio.createOscillator();
    const depth = audio.createGain();
    const out = audio.createGain();
    source.buffer = this.whiteNoise(audio);
    source.loop = true;
    soften.type = 'lowpass';
    soften.frequency.value = 520;
    soften.Q.value = 0.3;
    swell.frequency.value = 0.11;
    depth.gain.value = 160;
    swell.connect(depth).connect(soften.frequency);
    out.gain.value = 0;
    out.gain.setTargetAtTime(AIR_VOLUME * VOLUME, audio.currentTime, 1.2);
    source.connect(soften).connect(out).connect(audio.destination);
    source.start();
    swell.start();
    return {
      stop: (at) => {
        out.gain.setTargetAtTime(0, at, 0.6);
        source.stop(at + 4);
        swell.stop(at + 4);
      },
    };
  }
}
