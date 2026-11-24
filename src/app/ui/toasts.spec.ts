import { TOASTS, Toasts } from './toasts';

describe('Toasts', () => {
  let toasts: Toasts;
  const texts = (): string[] => toasts.list().map((toast) => toast.text);

  beforeEach(() => {
    vi.useFakeTimers();
    toasts = new Toasts();
  });

  afterEach(() => vi.useRealTimers());

  it('shows the newest first and no more than fit', () => {
    for (const text of ['eins', 'zwei', 'drei', 'vier']) toasts.success(text);

    expect(texts()).toEqual(['vier', 'drei', 'zwei']);
  });

  it('goes by itself after its time, an error only once it is put away', () => {
    toasts.success('gespeichert');
    toasts.error('kaputt');
    vi.advanceTimersByTime(TOASTS.lifetimeMs + TOASTS.closingMs);
    vi.advanceTimersByTime(60 * 60_000);

    expect(texts()).toEqual(['kaputt']);
  });

  it('puts the newest error away and says whether there was one', () => {
    toasts.error('alt');
    toasts.info('Hinweis');
    toasts.error('neu');

    expect(toasts.dismissError()).toBe(true);
    vi.advanceTimersByTime(TOASTS.closingMs);
    expect(texts()).toEqual(['Hinweis', 'alt']);

    expect(toasts.dismissError()).toBe(true);
    vi.advanceTimersByTime(TOASTS.closingMs);
    expect(toasts.dismissError()).toBe(false);
    expect(texts()).toEqual(['Hinweis']);
  });

  it('starts the time of the same text anew instead of showing it twice', () => {
    toasts.success('Gespeichert');
    vi.advanceTimersByTime(TOASTS.lifetimeMs - 100);
    toasts.success('Gespeichert');
    vi.advanceTimersByTime(200);

    expect(texts()).toEqual(['Gespeichert']);
    expect(toasts.list()[0].closing).toBe(false);
  });

  it('stands still while held and goes on once released', () => {
    toasts.info('lesen');
    const [toast] = toasts.list();
    toasts.hold(toast.id);
    vi.advanceTimersByTime(TOASTS.lifetimeMs * 3);

    expect(toasts.list()[0].closing).toBe(false);
    toasts.release(toast.id);
    vi.advanceTimersByTime(TOASTS.lifetimeMs);

    expect(toasts.list()[0].closing).toBe(true);
  });

  it('closes at once when dismissed, and is gone after its way out', () => {
    toasts.warning('achtung');
    toasts.dismiss(toasts.list()[0].id);

    expect(toasts.list()[0].closing).toBe(true);
    vi.advanceTimersByTime(TOASTS.closingMs);

    expect(texts()).toEqual([]);
  });
});
