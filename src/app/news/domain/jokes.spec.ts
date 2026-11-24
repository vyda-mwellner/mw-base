import { describe, expect, it } from 'vitest';

import { addDays } from '../../engine/days';
import { JOKES, jokeOf } from './jokes';

describe('jokeOf', () => {
  it('tells another joke the next day', () => {
    expect(jokeOf('2026-11-26')).not.toBe(jokeOf('2026-11-25'));
  });

  it('tells every joke once before the first comes again', () => {
    const days = JOKES.map((_, index) => jokeOf(addDays('2026-11-25', index)));

    expect(new Set(days).size).toBe(JOKES.length);
    expect(jokeOf(addDays('2026-11-25', JOKES.length))).toBe(days[0]);
  });
});

describe('JOKES', () => {
  it('has a punchline on a line of its own under each question', () => {
    for (const joke of JOKES) expect(joke.split('\n'), joke).toHaveLength(2);
  });

  it('has each joke only once', () => {
    expect(new Set(JOKES).size).toBe(JOKES.length);
  });
});
