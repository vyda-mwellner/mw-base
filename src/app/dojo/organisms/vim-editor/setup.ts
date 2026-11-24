import { history, undo } from '@codemirror/commands';
import { HighlightStyle, indentUnit, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { kotlin } from '@codemirror/legacy-modes/mode/clike';
import { typescript } from '@codemirror/legacy-modes/mode/javascript';
import { pgSQL } from '@codemirror/legacy-modes/mode/sql';
import { html } from '@codemirror/legacy-modes/mode/xml';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import {
  Compartment,
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  gutter,
  GutterMarker,
  highlightActiveLine,
  highlightActiveLineGutter,
  WidgetType,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { getCM, Vim, vim } from '@replit/codemirror-vim';

import { keysOf } from '../../domain/keys';
import { textOf, type VimLesson } from '../../domain/lessons';
import { diffOf, type Snapshot, type VimMode } from '../../domain/session';

/** The editor as the vim mode sees it. */
export type VimEditorHandle = NonNullable<ReturnType<typeof getCM>>;

/** Enough markdown for the round's report: headings, list marks, table bars and code. */
const markdown = StreamLanguage.define<null>({
  token(stream) {
    if (stream.sol() && stream.match(/^#+ .*/)) return 'heading';
    if (stream.sol() && stream.match(/^- /)) return 'keyword';
    if (stream.match(/^`[^`]*`/)) return 'string';
    if (stream.match(/^\|/)) return 'meta';
    stream.next();
    return null;
  },
});

const LANGUAGES: Readonly<
  Record<string, { readonly language: StreamLanguage<unknown>; readonly unit: string }>
> = {
  kt: { language: StreamLanguage.define(kotlin), unit: '    ' },
  ts: { language: StreamLanguage.define(typescript), unit: '  ' },
  html: { language: StreamLanguage.define(html), unit: '  ' },
  yml: { language: StreamLanguage.define(yaml), unit: '  ' },
  sql: { language: StreamLanguage.define(pgSQL), unit: '    ' },
  md: { language: markdown, unit: '  ' },
};

/** The colours of IntelliJ's dark theme. */
const HIGHLIGHT = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: '#cf8e6d' },
  { tag: [tags.string, tags.special(tags.string)], color: '#6aab73' },
  { tag: [tags.number, tags.atom, tags.bool], color: '#2aacb8' },
  { tag: tags.comment, color: '#7a7e85', fontStyle: 'italic' },
  { tag: tags.heading, color: '#cf8e6d', fontWeight: 'bold' },
  { tag: tags.meta, color: '#b3ae60' },
  { tag: [tags.typeName, tags.className], color: '#bcbec4' },
  { tag: tags.definition(tags.variableName), color: '#56a8f5' },
  { tag: tags.propertyName, color: '#c77dbb' },
  { tag: tags.tagName, color: '#d5b778' },
  { tag: tags.attributeName, color: '#bababa' },
  { tag: tags.special(tags.variableName), color: '#c77dbb' },
]);

const THEME = EditorView.theme(
  {
    '&': { height: '100%', color: '#bcbec4', backgroundColor: '#1e1f22', fontSize: '12.5px' },
    '.cm-scroller': { fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, monospace', lineHeight: '1.6' },
    '.cm-content': { caretColor: '#ced0d6' },
    '.cm-gutters': { backgroundColor: '#1e1f22', color: '#4b5059', border: 'none' },
    '.cm-gutterElement': { padding: '0 10px 0 8px' },
    '.dj-current': { color: '#a1a3ab' },
    '.cm-activeLine': { backgroundColor: '#26282e' },
    '.cm-activeLineGutter': { backgroundColor: '#26282e' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: '#214283 !important',
    },
    '.cm-fat-cursor': { background: '#ced0d6', color: '#1e1f22' },
    '&:not(.cm-focused) .cm-fat-cursor': {
      background: 'none',
      outline: '1px solid #ced0d6',
      color: 'transparent',
    },
    '.cm-searchMatch, .cm-searching': { backgroundColor: '#32593d', outline: '1px solid #3d7a4d' },
    '.dj-goal': { boxShadow: 'inset 0 -2px 0 #f2c55c', backgroundColor: 'rgb(242 197 92 / 0.22)' },
    '.dj-goal-line': { backgroundColor: 'rgb(242 197 92 / 0.1)' },
    '.dj-gone': {
      backgroundColor: 'rgb(224 108 117 / 0.14)',
      textDecoration: 'line-through rgb(224 108 117 / 0.7)',
    },
    '.dj-ghost': {
      padding: '0 2px 0 6px',
      whiteSpace: 'pre',
      backgroundColor: 'rgb(95 184 101 / 0.12)',
      color: '#8fcf93',
    },
    '.cm-panels': { backgroundColor: '#2b2d30', color: '#dfe1e5', borderTop: '1px solid #393b40' },
    '.cm-vim-panel': { padding: '2px 8px', fontFamily: 'ui-monospace, Menlo, monospace' },
    '.cm-vim-panel input': { color: '#dfe1e5', fontFamily: 'inherit' },
  },
  { dark: true },
);

class LineNumber extends GutterMarker {
  constructor(
    private readonly text: string,
    private readonly current: boolean,
  ) {
    super();
  }

  override eq(other: LineNumber): boolean {
    return other.text === this.text && other.current === this.current;
  }

  override toDOM(): Node {
    const span = document.createElement('span');
    span.textContent = this.text;
    if (this.current) span.className = 'dj-current';
    return span;
  }
}

/** The cursor line by its number, every other line by how far it is from there: what a count before j needs. */
const RELATIVE_NUMBERS = gutter({
  class: 'cm-lineNumbers',
  lineMarker(view, line) {
    const at = view.state.doc.lineAt(view.state.selection.main.head).number;
    const number = view.state.doc.lineAt(line.from).number;
    return new LineNumber(String(number === at ? number : Math.abs(number - at)), number === at);
  },
  lineMarkerChange: (update) => update.selectionSet || update.docChanged,
  initialSpacer: () => new LineNumber('99', false),
});

/** A line the lesson wants, shown where it will stand until it is there. */
class GhostLine extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }

  override eq(other: GhostLine): boolean {
    return other.text === this.text;
  }

  override toDOM(): HTMLElement {
    const line = document.createElement('div');
    line.className = 'dj-ghost';
    line.textContent = this.text || ' ';
    return line;
  }
}

/**
 * The goal in the editor, as IntelliJ shows changes: a mark on the character the cursor has to get to, or the
 * lines that go struck through and the lines that come in green where they belong.
 */
function goalMarks(lesson: VimLesson, doc: EditorState['doc']): Range<Decoration>[] {
  const start = textOf(lesson.before).text;
  const goal = textOf(lesson.after);
  if (start === goal.text) {
    return goal.cursor === null
      ? []
      : [Decoration.mark({ class: 'dj-goal' }).range(goal.cursor, goal.cursor + 1)];
  }
  const marks: Range<Decoration>[] = [];
  let line = 1;
  for (const { sign, text } of diffOf(start, goal.text)) {
    if (sign === '+') {
      const after = line > doc.lines;
      const ghost = Decoration.widget({ widget: new GhostLine(text), block: true, side: after ? 1 : -1 });
      marks.push(ghost.range(after ? doc.length : doc.line(line).from));
      continue;
    }
    if (sign === '-') marks.push(Decoration.line({ class: 'dj-gone' }).range(doc.line(line).from));
    line++;
  }
  return marks;
}

const SHOW_GOAL = StateEffect.define<DecorationSet>();

const GOAL = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (marks, transaction) => {
    const shown = transaction.effects.find((effect) => effect.is(SHOW_GOAL));
    return shown ? shown.value : marks.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** No change gets through while the editor is only for looking and moving about. */
const LOCK = new Compartment();
const LOCKED = EditorState.changeFilter.of(() => false);

/** Locking also takes the goal away: once a lesson is over, it would only stand beside what was done. */
export function lock(view: EditorView, locked: boolean): void {
  view.dispatch({
    effects: [LOCK.reconfigure(locked ? LOCKED : []), ...(locked ? [SHOW_GOAL.of(Decoration.none)] : [])],
  });
}

export const extensionOf = (file: string): string => file.slice(file.lastIndexOf('.') + 1);

/** A file on the screen: its text, where the cursor starts, and the lesson it belongs to, if any. */
export interface Page {
  readonly key: string;
  readonly file: string;
  readonly lesson: VimLesson | null;
  readonly text: string;
  readonly cursor: number;
}

function extensionsFor(page: Page, onUpdate: () => void): Extension[] {
  const kind = LANGUAGES[extensionOf(page.file)] ?? LANGUAGES['kt'];
  return [
    vim({ status: false }),
    EditorState.allowMultipleSelections.of(true),
    history(),
    RELATIVE_NUMBERS,
    highlightActiveLine(),
    highlightActiveLineGutter(),
    kind.language,
    indentUnit.of(kind.unit),
    EditorState.tabSize.of(kind.unit.length),
    syntaxHighlighting(HIGHLIGHT),
    THEME,
    GOAL,
    LOCK.of([]),
    EditorView.updateListener.of(onUpdate),
  ];
}

/** The smallest change that turns one text into the other, so an undo puts the cursor where the change was. */
function changeBetween(from: string, to: string): { from: number; to: number; insert: string } {
  let start = 0;
  while (start < from.length && start < to.length && from[start] === to[start]) start++;
  let end = 0;
  while (end < from.length - start && end < to.length - start && from.at(-1 - end) === to.at(-1 - end)) end++;
  return { from: start, to: from.length - end, insert: to.slice(start, to.length - end) };
}

/**
 * Puts a page into the editor with a vim of its own: the history a lesson asks for, then its setup keys. The
 * lock comes last, so that neither is kept out by it.
 */
export function load(view: EditorView, page: Page, locked: boolean, onUpdate: () => void): VimEditorHandle {
  const lesson = page.lesson;
  const first = lesson?.undoTo ? textOf(lesson.undoTo).text : page.text;
  const extensions = extensionsFor(page, onUpdate);
  // Registers, searches and jumps of the lesson before would lead into a text that is gone.
  Vim.resetVimGlobalState_();
  view.setState(
    EditorState.create({
      doc: first,
      selection: EditorSelection.cursor(Math.min(page.cursor, first.length)),
      extensions,
    }),
  );
  if (lesson?.undoTo) {
    view.dispatch({
      changes: changeBetween(first, page.text),
      selection: { anchor: page.cursor },
      userEvent: 'input',
    });
  }
  if (lesson?.redoTo) {
    view.dispatch({ changes: changeBetween(page.text, textOf(lesson.redoTo).text), userEvent: 'input' });
    undo(view);
    view.dispatch({ selection: { anchor: page.cursor } });
  }
  const cm = getCM(view)!;
  for (const key of keysOf(lesson?.setup ?? '')) Vim.handleKey(cm, key, 'user');
  // Only now the text is the one the lesson starts from, whatever history it was given.
  if (lesson)
    view.dispatch({ effects: SHOW_GOAL.of(Decoration.set(goalMarks(lesson, view.state.doc), true)) });
  // As IntelliJ does on a jump; the file before may have been scrolled anywhere.
  view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }) });
  if (locked) lock(view, true);
  return cm;
}

/** The line a screen lesson wants the cursor on, and the character it has to stand on. */
function aimAt(doc: EditorState['doc'], at: number): Range<Decoration>[] {
  const line = doc.lineAt(at);
  const marks = [Decoration.line({ class: 'dj-goal-line' }).range(line.from)];
  if (at < line.to) marks.push(Decoration.mark({ class: 'dj-goal' }).range(at, at + 1));
  return marks;
}

/**
 * Where the keys of a screen lesson take the cursor in this editor as it is laid out now, shown as the goal;
 * null while it shows too little for them to go anywhere. What they did is taken back.
 */
export function screenGoal(view: EditorView, cm: VimEditorHandle, lesson: VimLesson): number | null {
  const head = view.state.selection.main.head;
  const top = view.scrollDOM.scrollTop;
  const scroll = view.scrollSnapshot();
  for (const key of keysOf(lesson.keys)) Vim.handleKey(cm, key, 'user');
  const goal = view.state.selection.main.head;
  view.dispatch({ selection: EditorSelection.cursor(head), effects: scroll });
  view.scrollDOM.scrollTop = top;
  // The column and the last motion are what vim remembers of keys that are taken back.
  Object.assign(cm.state.vim ?? {}, { lastMotion: null, lastHPos: -1, lastHSPos: -1 });
  if (goal === head) return null;
  view.dispatch({ effects: SHOW_GOAL.of(Decoration.set(aimAt(view.state.doc, goal), true)) });
  return goal;
}

export function snapshotOf(view: EditorView, cm: VimEditorHandle): Snapshot {
  const state = cm.state.vim;
  const mode: VimMode = !state
    ? 'normal'
    : state.insertMode
      ? 'insert'
      : state.visualBlock
        ? 'visual block'
        : state.visualLine
          ? 'visual line'
          : state.visualMode
            ? 'visual'
            : 'normal';
  return { text: view.state.doc.toString(), head: view.state.selection.main.head, mode };
}
