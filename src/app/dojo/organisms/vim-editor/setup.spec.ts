import { EditorView } from '@codemirror/view';
import { Vim } from '@replit/codemirror-vim';

import { keysOf } from '../../domain/keys';
import { LESSONS, textOf, type VimLesson } from '../../domain/lessons';
import { isProjectFile } from '../../domain/project';
import { progressOf, sameText } from '../../domain/session';
import { load, screenGoal, snapshotOf, type VimEditorHandle } from './setup';

const NAMED_KEYS = [
  '<Esc>',
  '<CR>',
  '<BS>',
  '<C-r>',
  '<C-v>',
  '<C-o>',
  '<C-i>',
  '<C-d>',
  '<C-u>',
  '<C-f>',
  '<C-b>',
  '<C-a>',
  '<C-x>',
] as const;

// jsdom lays nothing out: measuring a text range has to give something, and a line down is a line down.
const NOWHERE = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
Object.assign(Range.prototype, { getClientRects: () => [], getBoundingClientRect: () => NOWHERE });

const VIM_LESSONS = LESSONS.filter((lesson): lesson is VimLesson => lesson.kind === 'vim');

/** The editor as the dojo shows it, give or take: lines of 20 pixels, 24 of them on the screen. */
const LINE = 20;
const SHOWN = 24;

function editorFor(lesson: VimLesson): { view: EditorView; cm: VimEditorHandle } {
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({ parent });
  const start = textOf(lesson.before);
  const cm = load(
    view,
    { key: lesson.id, file: lesson.file, lesson, text: start.text, cursor: start.cursor ?? 0 },
    false,
    () => undefined,
  );
  let top = 0;
  // The editor scrolls the cursor into sight, as CodeMirror does after every key.
  const scrolled = () => {
    const line = cm.getCursor().line;
    top = Math.min(Math.max(top, (line - SHOWN + 1) * LINE), line * LINE);
    return top;
  };
  Object.assign(cm, {
    findPosV: (from: { line: number; ch: number }, amount: number, unit: string) => ({
      line: from.line + amount * (unit === 'page' ? SHOWN : 1),
      ch: from.ch,
    }),
    getScrollInfo: () => ({ left: 0, top: scrolled(), clientHeight: SHOWN * LINE, clientWidth: 600 }),
    defaultTextHeight: () => LINE,
    charCoords: (pos: { line: number; ch: number }) => ({
      left: pos.ch * 8,
      right: pos.ch * 8 + 8,
      top: pos.line * LINE,
      bottom: (pos.line + 1) * LINE,
    }),
    coordsChar: (coords: { top: number }) => ({ line: Math.floor(coords.top / LINE), ch: 0 }),
    scrollTo: (_x: number | null, y: number | null) => {
      if (y !== null) top = y;
    },
  });
  return { view, cm };
}

/** Plays keys as a person would: letters typed in insert mode and in the prompt of : and / are text. */
function play(view: EditorView, cm: VimEditorHandle, notation: string): void {
  let register = false;
  for (const key of keysOf(notation)) {
    const typing = cm.state.vim?.insertMode && key.length === 1 && !register;
    register = key === '<C-r>' && Boolean(cm.state.vim?.insertMode);
    const prompt = view.dom.querySelector<HTMLInputElement>('.cm-panels input');
    if (prompt) {
      if (key === '<CR>') {
        prompt.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true } as KeyboardEventInit),
        );
      } else {
        prompt.value += key;
        prompt.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
      }
    } else if (typing && cm.state.overwrite) {
      cm.overWriteSelection(key);
    } else if (typing) {
      view.dispatch({ ...view.state.replaceSelection(key), userEvent: 'input.type' });
    } else {
      Vim.handleKey(cm, key, 'user');
    }
  }
}

describe('vim lessons', () => {
  afterEach(() => document.body.replaceChildren());

  for (const lesson of VIM_LESSONS) {
    it(`${lesson.id} is reached by its own solution`, () => {
      expect(isProjectFile(lesson.file), 'file in the project').toBe(true);
      expect(textOf(lesson.before).cursor, 'cursor at the start').not.toBeNull();
      for (const key of keysOf(lesson.keys)) {
        if (key.length > 1) expect(NAMED_KEYS as readonly string[]).toContain(key);
      }
      const { view, cm } = editorFor(lesson);
      const head = snapshotOf(view, cm).head;
      const aim = lesson.screen ? screenGoal(view, cm, lesson) : null;
      if (lesson.screen) {
        expect(aim, 'the keys go somewhere').not.toBeNull();
        expect(snapshotOf(view, cm).head, 'taken back').toBe(head);
        const lines = view.state.doc.lines;
        expect(view.state.doc.lineAt(aim!).number, 'not stopped by the end of the file').toBeLessThan(lines);
        expect(view.state.doc.lineAt(aim!).number, 'not stopped by its start').toBeGreaterThan(1);
      }
      const goal = lesson.screen ? aim! : undefined;
      expect(progressOf(lesson, { ...snapshotOf(view, cm), goal }), 'not solved before a key').toBe('typed');
      play(view, cm, lesson.keys);
      const snapshot = snapshotOf(view, cm);
      const wanted = textOf(lesson.after);
      if (!sameText(snapshot.text, wanted.text)) expect(snapshot.text).toBe(wanted.text);
      if (wanted.cursor !== null) expect(snapshot.head).toBe(wanted.cursor);
      if (lesson.screen) expect(snapshot.head).toBe(aim);
      expect(progressOf(lesson, { ...snapshot, goal }), 'solved by its keys').toBe('done');
      view.destroy();
    });
  }
});
