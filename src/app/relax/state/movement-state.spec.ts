import { TestBed } from '@angular/core/testing';

import type { Motion } from '../../engine/walk';
import { Store } from '../../ui/store';
import { MovementState } from './movement-state';

const at = (x: number): Motion => ({
  x,
  level: 1,
  facing: 1,
  legs: [],
  air: 0,
  rise: 0,
  speed: 0,
  aboard: false,
  depth: 0,
});

describe('MovementState', () => {
  let write: ReturnType<typeof vi.fn<(path: string, value: unknown) => Promise<void>>>;
  let state: MovementState;

  beforeEach(() => {
    vi.useFakeTimers();
    write = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [{ provide: Store, useValue: { read: async () => null, write } }],
    });
    state = TestBed.inject(MovementState);
  });

  afterEach(() => vi.useRealTimers());

  it('counts every second of a walk but writes the file only once walking has paused', () => {
    state.record(at(0), at(40));
    vi.advanceTimersByTime(1000);
    state.record(at(40), at(80));
    vi.advanceTimersByTime(1000);

    expect(state.today()?.px).toBe(80);
    expect(write).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('writes at once when asked, with what was gathered in the last second', async () => {
    state.record(at(0), at(40));
    await state.save();

    expect(state.today()?.px).toBe(40);
    expect(write).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_000);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
