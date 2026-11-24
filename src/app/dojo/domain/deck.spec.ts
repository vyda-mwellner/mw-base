import { answered, graded, parseDojo, ROUND_SIZE, roundOf, type Card, type DojoFile } from './deck';
import { lessonById, LESSONS } from './lessons';

const EMPTY_DOJO: DojoFile = { cards: {}, solved: {}, round: null };

const DAY = '2026-11-20';
const kindOf = (id: string) => lessonById(id)!.kind;
const all = (kind: 'vim' | 'ide') =>
  LESSONS.filter((lesson) => lesson.kind === kind).map((lesson) => lesson.id);
const cardsFor = (ids: readonly string[], card: Card): Record<string, Card> =>
  Object.fromEntries(ids.map((id) => [id, card]));

describe('dojo card index', () => {
  it('starts with the first lessons, every third one a shortcut', () => {
    const round = roundOf({}, DAY);

    expect(round).toHaveLength(ROUND_SIZE);
    expect(round.map(kindOf)).toEqual(['vim', 'vim', 'ide', 'vim', 'vim', 'ide', 'vim', 'vim', 'ide', 'vim']);
    expect(round.slice(0, 2)).toEqual(['vim-j', 'vim-j-2']);
  });

  it('brings due lessons first and still a few new ones when many are due', () => {
    const vim = all('vim');
    const ide = all('ide');
    const cards = {
      ...cardsFor(vim.slice(0, 20), { box: 1, due: DAY }),
      ...cardsFor(ide.slice(0, 10), { box: 1, due: DAY }),
    };

    const round = roundOf(cards, DAY);

    expect(round.filter((id) => !cards[id]).sort()).toEqual([vim[20], vim[21], ide[10]].sort());
    expect(round.slice(0, 2).every((id) => cards[id])).toBe(true);
  });

  it('leaves out lessons that are not due while there are new ones', () => {
    const cards = cardsFor(all('vim').slice(0, 5), { box: 3, due: '2026-11-27' });

    expect(roundOf(cards, DAY).some((id) => cards[id])).toBe(false);
  });

  it('fills a round with lessons not yet due once all are known', () => {
    const cards = cardsFor(
      LESSONS.map((lesson) => lesson.id),
      { box: 5, due: '2026-12-20' },
    );

    expect(roundOf(cards, DAY)).toHaveLength(ROUND_SIZE);
  });

  it('moves a clean lesson up a box and starts it over after help', () => {
    expect(graded(undefined, 'clean', DAY)).toEqual({ box: 1, due: '2026-11-21' });
    expect(graded({ box: 2, due: DAY }, 'clean', DAY)).toEqual({ box: 3, due: '2026-11-27' });
    expect(graded({ box: 5, due: DAY }, 'clean', DAY)).toEqual({ box: 5, due: '2026-12-20' });
    expect(graded({ box: 3, due: DAY }, 'solved', DAY)).toEqual({ box: 3, due: '2026-11-27' });
    expect(graded({ box: 4, due: DAY }, 'helped', DAY)).toEqual({ box: 1, due: '2026-11-21' });
  });

  it('counts a solved lesson for the day, a skipped one not', () => {
    const ids = roundOf({}, DAY);
    const file: DojoFile = { ...EMPTY_DOJO, round: { day: DAY, ids, outcomes: [] } };

    const once = answered(file, ids[0], 'clean', DAY);
    const twice = answered(once, ids[1], 'skipped', DAY);

    expect(twice.solved[DAY]).toBe(1);
    expect(twice.round?.outcomes).toEqual(['clean', 'skipped']);
    expect(Object.keys(twice.cards)).toEqual([ids[0], ids[1]]);
  });

  it('ignores an answer for a lesson that is not the current one', () => {
    const ids = roundOf({}, DAY);
    const file: DojoFile = { ...EMPTY_DOJO, round: { day: DAY, ids, outcomes: [] } };

    expect(answered(file, ids[1], 'clean', DAY)).toBe(file);
  });

  it('reads back what it wrote and drops what it does not know', () => {
    const ids = roundOf({}, DAY);
    const file = answered({ ...EMPTY_DOJO, round: { day: DAY, ids, outcomes: [] } }, ids[0], 'clean', DAY);

    expect(parseDojo(JSON.parse(JSON.stringify(file)))).toEqual(file);
    expect(
      parseDojo({
        cards: { 'vim-gone': { box: 1, due: DAY }, 'vim-j': { box: 9, due: DAY } },
        solved: { nope: 3 },
        round: { day: DAY, ids: ['vim-gone'], outcomes: [] },
      }),
    ).toEqual(EMPTY_DOJO);
  });
});
