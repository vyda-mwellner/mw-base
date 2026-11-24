import { capsOf, chordOf, keysOf, ShiftTwice } from './keys';
import { lessonById, type VimLesson } from './lessons';
import { diffOf, outcomeOf, parOf, progressOf } from './session';

const press = (init: KeyboardEventInit & { code: string }) => new KeyboardEvent('keydown', init);

describe('dojo session', () => {
  const dd = lessonById('vim-dd') as VimLesson;
  const j = lessonById('vim-j') as VimLesson;

  it('counts a named key as one', () => {
    expect(keysOf('ciwtotal<Esc>')).toHaveLength(9);
    expect(keysOf('3<<')).toEqual(['3', '<', '<']);
    expect(parOf(dd)).toBe(2);
  });

  it('is done once the text is right and the editor is back in normal mode', () => {
    const text = 'fun place(order: Order): Order {\n    return repo.save(order)\n}';

    expect(progressOf(dd, { text, head: 0, mode: 'normal' })).toBe('done');
    expect(progressOf(dd, { text, head: 0, mode: 'insert' })).toBe('escape');
    expect(progressOf(dd, { text: `${text}!`, head: 0, mode: 'normal' })).toBe('typed');
  });

  it('wants the cursor on the goal when the lesson marks one', () => {
    const text = 'data class Order(\n    val id: Long,\n    val customer: String,\n    val total: Int,\n)';

    expect(progressOf(j, { text, head: text.indexOf('total'), mode: 'normal' })).toBe('done');
    expect(progressOf(j, { text, head: text.indexOf('customer'), mode: 'normal' })).toBe('typed');
  });

  it('grades by the par and by help', () => {
    expect(outcomeOf(2, 2, false)).toBe('clean');
    expect(outcomeOf(5, 2, false)).toBe('solved');
    expect(outcomeOf(1, 2, true)).toBe('helped');
  });

  it('tells the lines that stay, go and come', () => {
    expect(diffOf('a\nb\nc', 'a\nX\nc')).toEqual([
      { sign: ' ', text: 'a' },
      { sign: '-', text: 'b' },
      { sign: '+', text: 'X' },
      { sign: ' ', text: 'c' },
    ]);
    expect(diffOf('a\nb', 'a\nb\nc').map((line) => line.sign)).toEqual([' ', ' ', '+']);
  });

  it('names a shortcut as IntelliJ prints it', () => {
    expect(chordOf(press({ key: 'e', code: 'KeyE', metaKey: true }))).toBe('⌘E');
    expect(chordOf(press({ key: 'F', code: 'KeyF', metaKey: true, shiftKey: true }))).toBe('⇧⌘F');
    expect(chordOf(press({ key: '¬', code: 'KeyL', metaKey: true, altKey: true }))).toBe('⌥⌘L');
    expect(chordOf(press({ key: 'F6', code: 'F6', shiftKey: true }))).toBe('⇧F6');
    expect(chordOf(press({ key: 'z', code: 'KeyY', metaKey: true }))).toBe('⌘Z');
    expect(chordOf(press({ key: 'j', code: 'KeyJ' }))).toBeNull();
    expect(chordOf(press({ key: 'Meta', code: 'MetaLeft', metaKey: true }))).toBeNull();
  });

  it('splits a shortcut into the keys to press', () => {
    expect(capsOf('⌥⌘L')).toEqual(['⌥', '⌘', 'L']);
    expect(capsOf('⇧⌘F12')).toEqual(['⇧', '⌘', 'F12']);
    expect(capsOf('⇧⇧')).toEqual(['⇧', '⇧']);
  });

  it('hears Shift twice only with nothing in between', () => {
    const twice = new ShiftTwice();
    const shift = (timeStamp: number) => ({ key: 'Shift', repeat: false, timeStamp }) as KeyboardEvent;

    expect(twice.press(shift(1000))).toBe(false);
    expect(twice.press(shift(1200))).toBe(true);
    expect(twice.press(shift(1300))).toBe(false);
    expect(twice.press({ key: 'a', timeStamp: 1350 } as KeyboardEvent)).toBe(false);
    expect(twice.press(shift(1400))).toBe(false);
  });
});
