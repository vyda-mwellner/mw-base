import { emit } from '@tauri-apps/api/event';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';

import { Sound } from './sound';

/** A node that takes every call, every chain and every setting, and does nothing. */
function inert(): object {
  const node: object = new Proxy(() => node, {
    get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : node),
  });
  return node;
}

/** Stands in for the browser's AudioContext and notes which nodes it was asked for. */
class FakeContext {
  static readonly made: FakeContext[] = [];
  readonly asked: string[] = [];
  readonly close = vi.fn(async () => undefined);
  readonly state = 'running';
  readonly currentTime = 0;
  readonly sampleRate = 48000;
  readonly destination = inert();

  constructor() {
    FakeContext.made.push(this);
    return new Proxy(this, {
      get: (target, key, receiver) => {
        if (Reflect.has(target, key)) return Reflect.get(target, key, receiver);
        target.asked.push(String(key));
        return () => inert();
      },
    });
  }
}

describe('Sound', () => {
  const shell = globalThis as { isTauri?: boolean };
  let sound: Sound;
  const outputChanged = (): Promise<void> => emit('sound-output-changed');

  beforeEach(() => {
    FakeContext.made.length = 0;
    vi.stubGlobal('AudioContext', FakeContext);
    shell.isTauri = true;
    mockIPC(() => undefined, { shouldMockEvents: true });
    sound = new Sound();
    document.dispatchEvent(new KeyboardEvent('keydown'));
  });

  afterEach(() => {
    clearMocks();
    delete shell.isTauri;
    vi.unstubAllGlobals();
  });

  it('plays on a new context once the sound output changed, and closes the old one', async () => {
    sound.play('tick');
    await outputChanged();
    sound.play('tick');

    const [old, current] = FakeContext.made;
    expect(FakeContext.made).toHaveLength(2);
    expect(old.close).toHaveBeenCalled();
    expect(current.asked).toContain('createOscillator');
  });

  it('brings the open air back on the new device right away', async () => {
    sound.breeze(true);
    await outputChanged();

    expect(FakeContext.made).toHaveLength(2);
    expect(FakeContext.made[1].asked).toContain('createBufferSource');
  });

  it('cuts every swish from one buffer of noise instead of filling a new one each time', () => {
    sound.play('open');
    sound.play('close');
    sound.play('step');

    expect(FakeContext.made[0].asked.filter((call) => call === 'createBuffer')).toHaveLength(1);
  });

  it('lets the context rest once nothing has played for a while, but not while the breeze goes on', () => {
    vi.useFakeTimers();
    try {
      sound.breeze(true);
      sound.play('tick');
      vi.advanceTimersByTime(20_000);
      expect(FakeContext.made[0].asked).not.toContain('suspend');

      sound.breeze(false);
      vi.advanceTimersByTime(20_000);
      expect(FakeContext.made[0].asked).toContain('suspend');
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts nothing when the output changes before the first sound', async () => {
    await outputChanged();

    expect(FakeContext.made).toHaveLength(0);
  });
});
