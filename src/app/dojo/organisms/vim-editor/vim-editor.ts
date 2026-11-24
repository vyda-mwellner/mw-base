import {
  afterRenderEffect,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { cursorDocEnd, cursorDocStart, cursorPageDown, cursorPageUp } from '@codemirror/commands';
import { EditorSelection } from '@codemirror/state';
import { EditorView, type Command } from '@codemirror/view';
import { Vim } from '@replit/codemirror-vim';

import {
  chordOf,
  COMMAND_KEYS,
  DOUBLE_SHIFT,
  isModifier,
  ShiftTwice,
  type DojoCommand,
} from '../../domain/keys';
import type { Caret } from '../../domain/lessons';
import type { Snapshot } from '../../domain/session';
import { load, lock, screenGoal, snapshotOf, type Page, type VimEditorHandle } from './setup';

const OWNERS = new WeakMap<EditorView, (command: DojoCommand) => void>();
/** The dojo's keys as ex commands too, for whoever types :q out of habit. */
const EX_COMMANDS: readonly (readonly [name: string, prefix: string, command: DojoCommand])[] = [
  ['quit', 'q', 'quit'],
  ['wq', 'wq', 'quit'],
  ['tipp', 'tipp', 'hint'],
  ['neu', 'neu', 'again'],
  ['weiter', 'weiter', 'skip'],
];
let defined = false;

const CARETS: Readonly<Record<Exclude<Caret, 'word'>, Command>> = {
  pageDown: cursorPageDown,
  pageUp: cursorPageUp,
  textStart: cursorDocStart,
  textEnd: cursorDocEnd,
};

// Ex commands are known to every vim at once, so each one asks the editor it was typed in who it belongs to.
function defineCommands(): void {
  if (defined) return;
  defined = true;
  for (const [name, prefix, command] of EX_COMMANDS) {
    Vim.defineEx(name, prefix, (cm: VimEditorHandle) => OWNERS.get(cm.cm6)?.(command));
  }
}

/** A code editor with vim keys: it shows a page, tells what it holds after every key and hands shortcuts on. */
@Component({
  selector: 'app-vim-editor',
  templateUrl: './vim-editor.html',
  styleUrl: './vim-editor.scss',
})
export class VimEditor {
  readonly page = input.required<Page>();
  readonly locked = input(false);
  /** IntelliJ's turn: keys with ⌃, ⌥ or ⌘, function keys and Shift twice are shortcuts, not vim. */
  readonly shortcuts = input(false);
  /** The lesson is over: Enter goes on instead of moving the cursor down. */
  readonly waiting = input(false);
  /** The round is over: Esc leaves, as everywhere in the house. */
  readonly over = input(false);

  readonly changed = output<Snapshot>();
  /** A key that counts towards the par. */
  readonly pressed = output<void>();
  readonly chord = output<string>();
  readonly command = output<DojoCommand>();

  private readonly mount = viewChild.required<ElementRef<HTMLElement>>('mount');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly twice = new ShiftTwice();
  private view: EditorView | null = null;
  private cm: VimEditorHandle | null = null;
  /** While a page is put in, its history and setup are no keys of his. */
  private loading = false;
  private shown: Page | null = null;
  /** Where a screen lesson wants the cursor; until it is known, the first key works it out. */
  private goal: number | undefined;

  constructor() {
    defineCommands();
    // In the capture phase, so a shortcut never reaches vim and ⌘ never reaches the window.
    const key = (event: KeyboardEvent) => this.key(event);
    this.host.addEventListener('keydown', key, true);
    inject(DestroyRef).onDestroy(() => {
      this.host.removeEventListener('keydown', key, true);
      this.view?.destroy();
    });
    afterRenderEffect(() => {
      const page = this.page();
      untracked(() => this.show(page));
    });
    afterRenderEffect(() => {
      const locked = this.locked();
      untracked(() => this.view && lock(this.view, locked));
    });
  }

  focus(): void {
    this.view?.focus();
  }

  /** What a shortcut of IntelliJ does with the cursor: a page on, to the end, the word picked. */
  caret(to: Caret): void {
    const view = this.view;
    if (!view) return;
    if (to !== 'word') {
      CARETS[to](view);
      return;
    }
    const word = view.state.wordAt(view.state.selection.main.head);
    if (word) view.dispatch({ selection: EditorSelection.range(word.from, word.to), scrollIntoView: true });
  }

  private show(page: Page): void {
    if (!this.view) {
      this.view = new EditorView({ parent: this.mount().nativeElement });
      OWNERS.set(this.view, (command) => this.command.emit(command));
    }
    this.loading = true;
    const cm = load(this.view, page, this.locked(), () => this.report());
    this.loading = false;
    cm.on('vim-mode-change', () => this.report());
    this.cm = cm;
    this.shown = page;
    this.goal = undefined;
    this.report();
    this.view.focus();
    // The height of a line is only known once the editor has measured the new page.
    if (page.lesson?.screen) {
      this.view.requestMeasure({
        read: () => null,
        write: () => queueMicrotask(() => this.shown === page && this.aim()),
      });
    }
  }

  private aim(): void {
    const lesson = this.shown?.lesson;
    if (!lesson?.screen || this.goal !== undefined || !this.view || !this.cm) return;
    this.loading = true;
    this.goal = screenGoal(this.view, this.cm, lesson) ?? undefined;
    this.loading = false;
    this.report();
  }

  private report(): void {
    if (this.loading || !this.view || !this.cm) return;
    this.changed.emit({ ...snapshotOf(this.view, this.cm), goal: this.goal });
  }

  private key(event: KeyboardEvent): void {
    const command = COMMAND_KEYS[chordOf(event) ?? ''];
    if (command) {
      event.preventDefault();
      event.stopPropagation();
      this.command.emit(command);
      return;
    }
    const plain = !event.ctrlKey && !event.altKey && !event.metaKey;
    const waits = this.waiting() && plain && event.key === 'Enter';
    const leaves = this.over() && plain && event.key === 'Escape';
    if (waits || leaves) {
      event.preventDefault();
      event.stopPropagation();
      this.command.emit(waits ? 'next' : 'quit');
      return;
    }
    if (this.shortcuts()) {
      const chord = this.twice.press(event) ? DOUBLE_SHIFT : chordOf(event);
      if (chord) {
        event.preventDefault();
        event.stopPropagation();
        this.chord.emit(chord);
        return;
      }
    } else if (event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!isModifier(event)) {
      this.aim();
      this.pressed.emit();
    }
  }
}
