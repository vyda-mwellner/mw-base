import { TestBed } from '@angular/core/testing';

import { Sound, Tune } from '../sound';
import { Toasts } from '../toasts';
import { ToastStack } from './toast-stack';

class HeardSound {
  readonly played: Tune[] = [];
  before: Tune | null = null;

  lately(): Tune | null {
    return this.before;
  }

  play(tune: Tune): void {
    this.played.push(tune);
  }
}

describe('ToastStack', () => {
  let sound: HeardSound;
  let toasts: Toasts;

  beforeEach(() => {
    sound = new HeardSound();
    TestBed.configureTestingModule({ providers: [{ provide: Sound, useValue: sound }] });
    toasts = TestBed.inject(Toasts);
    TestBed.createComponent(ToastStack);
    TestBed.tick();
  });

  it('gives every new toast the voice of its tone', () => {
    toasts.success('Gespeichert');
    TestBed.tick();
    toasts.error('Kaputt');
    TestBed.tick();

    expect(sound.played).toEqual(['saved', 'denied']);
  });

  it('keeps quiet when the same text only starts its time again', () => {
    toasts.success('Gespeichert');
    TestBed.tick();
    toasts.success('Gespeichert');
    TestBed.tick();

    expect(sound.played).toEqual(['saved']);
  });

  it('sounds once for toasts that come together', () => {
    toasts.success('Stufe 3', 'Stufe erreicht');
    toasts.success('Erstes Abzeichen', 'Abzeichen');
    TestBed.tick();

    expect(sound.played).toEqual(['saved']);
  });

  it('keeps quiet right after a sound that already spoke for it, not after a tick', () => {
    sound.before = 'done';
    toasts.success('Atemübung eingetragen');
    TestBed.tick();
    sound.before = 'blip';
    toasts.success('Gespeichert');
    TestBed.tick();

    expect(sound.played).toEqual(['saved']);
  });
});
