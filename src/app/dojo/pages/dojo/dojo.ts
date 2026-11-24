import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import { injectSheetKeys, type KeyHint } from '../../../ui/sheet-keys';
import { Sound } from '../../../ui/sound';
import { errorText, injectTask } from '../../../ui/task';
import { Toasts } from '../../../ui/toasts';
import type { Outcome, Round } from '../../domain/deck';
import { capsOf, chordOf, COMMAND_KEYS, type DojoCommand } from '../../domain/keys';
import {
  commitWindow,
  editedAt,
  hitsWindow,
  lineAt,
  memberFrom,
  renamedIn,
  roundReport,
  runWindow,
  screenAt,
  startOf,
  TERMINAL,
  testScreen,
  type Screen,
  type ToolWindow,
} from '../../domain/ide';
import {
  LESSONS,
  textOf,
  type IdeEffect,
  type IdeLesson,
  type Lesson,
  type VimLesson,
} from '../../domain/lessons';
import { declarationOf, FILE_NAMES, fileText, membersOf, search, TREE, usagesOf } from '../../domain/project';
import { outcomeOf, parOf, progressOf, type Snapshot, type VimMode } from '../../domain/session';
import { FieldPopup } from '../../organisms/field-popup/field-popup';
import { FindPopup, type Found } from '../../organisms/find-popup/find-popup';
import { GotoPopup } from '../../organisms/goto-popup/goto-popup';
import { extensionOf, type Page } from '../../organisms/vim-editor/setup';
import { VimEditor } from '../../organisms/vim-editor/vim-editor';
import { DojoState } from '../../state/dojo-state';

/** What one lesson has seen so far. */
interface Turn {
  readonly keys: number;
  readonly helped: boolean;
  /** Bumped by :neu, which starts the text again. */
  readonly attempt: number;
  readonly misses: number;
  readonly note: string;
  readonly popup: Popup | null;
  /** A shortcut has put another file or text on the screen than the lesson started with. */
  readonly moved: boolean;
}
type Popup = 'goto' | 'structure' | 'find' | 'rename' | 'line';
/** The shortcuts that open a popup first; the lesson is over once the popup has served. */
const POPUP_OF: Readonly<Partial<Record<IdeEffect['kind'], Popup>>> = {
  open: 'goto',
  structure: 'structure',
  find: 'find',
  rename: 'rename',
  line: 'line',
};
const FRESH: Turn = { keys: 0, helped: false, attempt: 0, misses: 0, note: '', popup: null, moved: false };

/** A lesson that is over, kept on the screen until Enter, while the round in the file has moved on. */
interface Held {
  readonly slot: string;
  readonly lesson: Lesson;
  readonly outcome: Outcome;
  readonly keys: number;
}

const MODES: Readonly<Record<VimMode, string>> = {
  normal: 'NORMAL',
  insert: 'INSERT',
  replace: 'REPLACE',
  visual: 'VISUAL',
  'visual line': 'V-LINE',
  'visual block': 'V-BLOCK',
};
const LANGUAGES: Readonly<Record<string, string>> = {
  kt: 'Kotlin',
  ts: 'TypeScript',
  html: 'HTML',
  yml: 'YAML',
  sql: 'SQL',
  md: 'Markdown',
};
const HEADLINES: Readonly<Record<Outcome, string>> = {
  clean: 'Sauber gelöst',
  solved: 'Gelöst',
  helped: 'Gelöst mit Hilfe',
  skipped: 'Übersprungen',
};
const ACTIONS: ReadonlyMap<string, string> = new Map(
  LESSONS.flatMap((lesson) => (lesson.kind === 'ide' ? [[lesson.chord, lesson.action] as const] : [])),
);
const QUIT_KEY: KeyHint = { keys: ['⌃Q'], label: 'beenden' };
const SKIP_KEY: KeyHint = { keys: ['⌃S'], label: 'überspringen' };
const LESSON_KEYS: readonly KeyHint[] = [
  QUIT_KEY,
  { keys: ['⌃L'], label: 'Lösung' },
  { keys: ['⌃N'], label: 'von vorn' },
  SKIP_KEY,
];
/** The shortcut stands in the task, so there is no solution to ask for and no text to start again. */
const SHORTCUT_KEYS: readonly KeyHint[] = [QUIT_KEY, SKIP_KEY];
const RESULT_KEYS: readonly KeyHint[] = [{ keys: ['Enter'], label: 'weiter' }, QUIT_KEY];
/** Only after the round Esc leaves: right after a lesson it is still the Esc of vim, pressed once too often. */
const DONE_KEYS: readonly KeyHint[] = [
  { keys: ['Enter'], label: 'noch eine Runde' },
  { keys: ['Esc'], label: 'zurück' },
];
const RENAME_HINT = 'Enter benennt um, Esc bricht ab';
const LINE_HINT = 'Zeile oder Zeile:Spalte, Enter springt, Esc bricht ab';
const INTRO =
  'Esc beendet in Vim das Schreiben, nicht das Dojo. Raus geht es mit ⌃Q, die Tasten stehen unten.';
const FIRST_FILE = 'OrderService.kt';
/** Where keys belong to what has the focus, not to the house. */
const POPUPS = 'app-vim-editor, app-goto-popup, app-find-popup, app-field-popup';

const slotOf = (round: Round): string => `${round.day}|${round.ids.join(',')}|${round.outcomes.length}`;

const pageOf = (screen: Screen): Page => ({
  key: `screen:${screen.key}`,
  file: screen.file,
  lesson: null,
  text: screen.text,
  cursor: screen.cursor,
});

/** A text with `code` in backticks, in pieces. */
const piecesOf = (text: string) =>
  text.split('`').map((part, index) => ({ text: part, code: index % 2 === 1 }));

/** The block over the screen, in the pieces of the house's menus: plaque, label, hint, note, button. */
interface Banner {
  readonly tone: Outcome | 'open';
  readonly title: string;
  readonly chord: readonly string[];
  readonly chordLabel: string;
  readonly aside: string;
  readonly say: ReturnType<typeof piecesOf>;
  readonly hint: string;
  readonly hintTone: 'warning' | 'info' | null;
  readonly tip: string;
  /** The button's label; empty while a lesson runs. */
  readonly go: string;
}
const QUIET: Omit<Banner, 'title' | 'say'> = {
  tone: 'open',
  chord: [],
  chordLabel: '',
  aside: '',
  hint: '',
  hintTone: null,
  tip: '',
  go: '',
};

/** The dojo on the second screen in the office: vim lessons and IntelliJ shortcuts in an editor like IntelliJ. */
@Component({
  imports: [VimEditor, GotoPopup, FindPopup, FieldPopup],
  templateUrl: './dojo.html',
  styleUrl: './dojo.scss',
  host: {
    '(keydown)': 'keyDown($event)',
    '(document:keydown)': 'commandKey($event)',
    '(document:focusin)': 'focusIn($event)',
  },
})
export class Dojo {
  protected readonly state = inject(DojoState);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly router = inject(Router);
  private readonly sound = inject(Sound);
  private readonly toasts = inject(Toasts);
  private readonly task = injectTask();

  private readonly editor = viewChild(VimEditor);

  private readonly held = signal<Held | null>(null);
  private readonly snapshot = signal<Snapshot | null>(null);
  private readonly screen = signal<Screen>(screenAt(FIRST_FILE, 1, FIRST_FILE));
  private readonly tool = signal<ToolWindow | null>(null);
  private readonly treeOpen = signal(true);
  /** Hide All Tool Windows: the project view and the window at the bottom are gone until it is pressed again. */
  private readonly hidden = signal(false);

  protected readonly lesson = computed(() => this.held()?.lesson ?? this.state.current());
  private readonly slot = computed(() => this.held()?.slot ?? slotOf(this.state.round()));
  private readonly turn = linkedSignal<string, Turn>({ source: this.slot, computation: () => FRESH });

  protected readonly stage = computed(() => {
    if (!this.state.loaded()) return 'loading';
    if (this.held()) return 'result';
    return this.state.current() ? 'lesson' : 'done';
  });
  protected readonly waiting = computed(() => this.stage() === 'result' || this.stage() === 'done');
  protected readonly over = computed(() => this.stage() === 'done');
  protected readonly locked = computed(() => this.stage() !== 'lesson' || this.lesson()?.kind !== 'vim');
  protected readonly shortcuts = computed(
    () => this.stage() === 'lesson' && this.lesson()?.kind === 'ide' && !this.turn().popup,
  );

  /** The round as a markdown file, once it is over. */
  private readonly report = computed(() =>
    roundReport(
      this.state.round().day,
      this.state.lessons(),
      { solved: this.state.solvedToday(), met: this.state.met(), total: this.state.total },
      this.state.boxes(),
    ),
  );

  protected readonly page = computed<Page>(
    () => {
      if (this.stage() === 'done') {
        const round = this.state.round();
        return {
          key: `report:${slotOf(round)}`,
          file: `runde-${round.day}.md`,
          lesson: null,
          text: this.report(),
          cursor: 0,
        };
      }
      const lesson = this.lesson();
      if (lesson?.kind === 'vim') {
        const start = textOf(lesson.before);
        return {
          key: `${this.slot()}#${this.turn().attempt}`,
          file: lesson.file,
          lesson,
          text: start.text,
          cursor: start.cursor ?? 0,
        };
      }
      const start = lesson && !this.turn().moved ? startOf(lesson, `${this.slot()}:start`) : null;
      return pageOf(start ?? this.screen());
    },
    { equal: (a, b) => a.key === b.key },
  );

  /** The file an IntelliJ lesson that opens one asks for: the one the next vim lesson is in, or another one. */
  private readonly target = computed(() => {
    const shown = this.page().file;
    const next = this.state.ahead().find((lesson): lesson is VimLesson => lesson.kind === 'vim');
    if (next && next.file !== shown) return next.file;
    return FILE_NAMES.find((file) => file !== shown) ?? shown;
  });

  /** The files of the round so far, the latest first, as tabs and in Recent Files. */
  private readonly recent = computed(() => {
    const met = this.state
      .lessons()
      .slice(0, this.state.round().outcomes.length + 1)
      .flatMap(({ lesson }) => (lesson.kind === 'vim' ? [lesson.file] : []))
      .reverse();
    return [...new Set([this.page().file, ...met, ...FILE_NAMES])];
  });
  protected readonly tabs = computed(() =>
    this.recent()
      .slice(0, 4)
      .map((file) => ({ file, on: file === this.page().file, ext: extensionOf(file) })),
  );
  protected readonly tree = computed(() =>
    this.treeOpen() && !this.hidden()
      ? TREE.map((row) => ({
          ...row,
          here: row.file === this.page().file,
          folder: row.file === null,
          ext: row.file ? extensionOf(row.file) : null,
        }))
      : null,
  );
  /** The icons down the left edge, lit for the tool windows that are open. */
  protected readonly stripe = computed(() => {
    const tool = this.toolWindow()?.title ?? '';
    return [
      { name: 'project', on: this.tree() !== null, low: false },
      { name: 'commit', on: tool.startsWith('Commit'), low: false },
      { name: 'structure', on: this.turn().popup === 'structure', low: false },
      { name: 'find', on: tool.startsWith('Find') || tool.startsWith('Usages'), low: true },
      { name: 'run', on: tool.startsWith('Run'), low: false },
      { name: 'terminal', on: tool.startsWith('Terminal'), low: false },
    ];
  });
  protected readonly toolWindow = computed(() => (this.hidden() ? null : this.tool()));

  protected readonly popup = computed(() => {
    const lesson = this.lesson();
    const popup = this.turn().popup;
    if (this.held() || !popup || lesson?.kind !== 'ide') return null;
    if (popup === 'find') return { kind: 'find' as const };
    if (popup === 'rename') {
      const name = lesson.start?.at ?? '';
      return {
        kind: 'field' as const,
        title: `Rename ${name}`,
        label: 'Neuer Name',
        value: name,
        hint: RENAME_HINT,
      };
    }
    if (popup === 'line') {
      return {
        kind: 'field' as const,
        title: 'Go to Line:Column',
        label: 'Zeile',
        value: this.status().place,
        hint: LINE_HINT,
      };
    }
    if (popup === 'structure') {
      const entries = membersOf(this.page().file).map((member) => member.text);
      return { kind: 'goto' as const, title: `File Structure: ${this.page().file}`, entries };
    }
    const entries =
      lesson.chord === '⌘E' ? [...new Set([...this.recent().slice(1, 5), this.target()])] : FILE_NAMES;
    return { kind: 'goto' as const, title: lesson.action, entries };
  });

  /** What IntelliJ would open on a shortcut that does nothing more on this screen. */
  protected readonly reaction = computed(() => {
    const held = this.held();
    if (held?.lesson.kind !== 'ide' || held.lesson.does || held.outcome === 'skipped') return null;
    return { title: held.lesson.action, text: held.lesson.task };
  });

  protected readonly dots = computed(() => {
    const at = this.state.round().outcomes.length;
    return this.state.lessons().map((each, index) => ({
      index,
      state: each.outcome ?? (index === at ? 'now' : 'open'),
    }));
  });
  protected readonly position = computed(() => {
    const { ids, outcomes } = this.state.round();
    return `${Math.min(ids.length, outcomes.length + (this.held() ? 0 : 1))} / ${ids.length}`;
  });
  protected readonly positionLabel = computed(() => `Aufgabe ${this.position()}`);

  /** What the lesson asks for, how it went, or how the round went. */
  protected readonly banner = computed<Banner>(() => {
    const stage = this.stage();
    if (stage === 'loading') return { ...QUIET, title: 'Dojo', say: piecesOf('Karteikasten wird gelesen') };
    const solved = this.state.solvedToday();
    if (stage === 'done') {
      return {
        ...QUIET,
        title: 'Runde geschafft',
        say: piecesOf(`${solved} gelöst, ${this.state.met()} von ${this.state.total} Aufgaben kennengelernt`),
        tip: `Karteikasten ${this.state
          .boxes()
          .map((count, index) => `${index + 1}: ${count}`)
          .join(' · ')}`,
        go: 'Noch eine Runde',
      };
    }
    const lesson = this.lesson()!;
    const held = this.held();
    const vim = lesson.kind === 'vim';
    const chord = vim
      ? { chord: [], chordLabel: '' }
      : { chord: capsOf(lesson.chord), chordLabel: `Shortcut ${lesson.chord}` };
    if (held) {
      return {
        ...QUIET,
        ...chord,
        tone: held.outcome,
        title: HEADLINES[held.outcome],
        aside:
          vim && held.outcome !== 'skipped' ? `${held.keys} ${held.keys === 1 ? 'Taste' : 'Tasten'}` : '',
        say: piecesOf(vim ? `Bestwert ${parOf(lesson)}: \`${lesson.keys}\`` : lesson.action),
        tip: lesson.tip,
        go: 'Weiter',
      };
    }
    const turn = this.turn();
    const task =
      lesson.kind === 'ide' && lesson.does?.kind === 'open'
        ? `${lesson.task} Öffne dann \`${this.target()}\`.`
        : lesson.task;
    const reveal = vim && turn.helped ? `Lösung: ${lesson.keys}` : '';
    const intro = this.state.met() === 0 && this.state.round().outcomes.length === 0 ? INTRO : '';
    return {
      ...QUIET,
      ...chord,
      title: vim ? `Vim · ${lesson.topic}` : `IntelliJ · ${lesson.action}`,
      aside: vim ? `Bestwert ${parOf(lesson)}` : '',
      say: piecesOf(task),
      hint: turn.note || reveal || intro,
      hintTone: turn.note ? 'warning' : reveal ? 'info' : null,
    };
  });

  protected readonly status = computed(() => {
    const snapshot = this.snapshot();
    const lesson = this.lesson();
    const page = this.page();
    const text = snapshot?.text ?? page.text;
    const head = Math.min(snapshot?.head ?? 0, text.length);
    const before = text.slice(0, head);
    const line = before.split('\n').length;
    const column = head - before.lastIndexOf('\n');
    return {
      mode: MODES[snapshot?.mode ?? 'normal'],
      keys:
        lesson?.kind === 'vim'
          ? `Tasten ${this.held()?.keys ?? this.turn().keys} · Bestwert ${parOf(lesson)}`
          : '',
      language: LANGUAGES[extensionOf(page.file)] ?? '',
      place: `${line}:${column}`,
      indent: ['kt', 'sql'].includes(extensionOf(page.file)) ? '4 spaces' : '2 spaces',
    };
  });

  constructor() {
    injectSheetKeys(() => {
      const stage = this.stage();
      if (stage === 'result') return RESULT_KEYS;
      if (stage === 'done') return DONE_KEYS;
      return this.lesson()?.kind === 'ide' ? SHORTCUT_KEYS : LESSON_KEYS;
    }, true);
    // The editor keeps the focus throughout, so its Enter and ⌃ keys always arrive.
    afterRenderEffect(() => {
      const stage = this.stage();
      const popup = this.turn().popup;
      untracked(() => {
        if (stage !== 'loading' && !popup) this.editor()?.focus();
      });
    });
  }

  /** Keys typed in the editor or a popup are theirs, the house must not walk or close on them. */
  protected keyDown(event: KeyboardEvent): void {
    if (event.target instanceof Element && event.target.closest(POPUPS)) {
      event.stopPropagation();
    }
  }

  protected changed(snapshot: Snapshot): void {
    this.snapshot.set(snapshot);
    const lesson = this.lesson();
    if (this.stage() !== 'lesson' || lesson?.kind !== 'vim') return;
    const progress = progressOf(lesson, snapshot);
    if (progress === 'done') {
      const turn = this.turn();
      this.finish(outcomeOf(turn.keys, parOf(lesson), turn.helped));
    } else {
      const note = progress === 'escape' ? 'Der Text stimmt. Jetzt noch Esc.' : '';
      this.turn.update((turn) => (turn.note === note ? turn : { ...turn, note }));
    }
  }

  protected pressed(): void {
    if (this.stage() === 'lesson' && this.lesson()?.kind === 'vim') {
      this.turn.update((turn) => ({ ...turn, keys: turn.keys + 1 }));
    }
  }

  protected chord(chord: string): void {
    const lesson = this.lesson();
    if (this.stage() !== 'lesson' || lesson?.kind !== 'ide') return;
    if (chord !== lesson.chord) {
      this.miss(ACTIONS.get(chord) ? `${chord} ist ${ACTIONS.get(chord)}.` : `${chord} ist es nicht.`);
      return;
    }
    this.act(lesson);
  }

  /** What the right shortcut does on the screen; one that opens a popup is done once the popup has served. */
  private act(lesson: IdeLesson): void {
    const does = lesson.does;
    const at = lesson.start?.at ?? '';
    const opens = does && POPUP_OF[does.kind];
    if (opens) {
      this.sound.play('blip');
      this.turn.update((turn) => ({ ...turn, popup: opens, note: '' }));
      return;
    }
    switch (does?.kind) {
      case 'usages':
        this.tool.set(hitsWindow(`Usages of ${at}`, usagesOf(at)));
        break;
      case 'declaration': {
        const hit = declarationOf(at);
        if (hit) this.show(screenAt(hit.file, hit.line, `${this.slot()}:${hit.file}`));
        break;
      }
      case 'method': {
        const file = this.page().file;
        const member = memberFrom(file, lineAt(this.page().text, this.head()), does.step);
        if (member) this.show(screenAt(file, member.line, `${this.slot()}:${member.text}`));
        break;
      }
      case 'caret':
        this.editor()?.caret(does.to);
        break;
      case 'edit': {
        const page = this.page();
        this.show({
          key: `${this.slot()}:edit`,
          file: page.file,
          ...editedAt(page.text, this.head(), does.edit),
        });
        break;
      }
      case 'test': {
        const test = testScreen(this.page().file, `${this.slot()}:test`);
        if (test) this.show(test);
        break;
      }
      case 'rewrite': {
        const file = this.page().file;
        this.show({ key: `${this.slot()}:rewrite`, file, text: fileText(file), cursor: 0 });
        break;
      }
      case 'window':
        this.tool.set(
          does.window === 'run'
            ? runWindow(at)
            : does.window === 'terminal'
              ? TERMINAL
              : commitWindow(this.changedFiles()),
        );
        break;
      case 'project':
        if (this.hidden()) {
          this.hidden.set(false);
          this.treeOpen.set(true);
        } else {
          this.treeOpen.update((open) => !open);
        }
        break;
      case 'hide':
        this.hidden.update((hidden) => !hidden);
        break;
    }
    this.finish(this.ideOutcome());
  }

  /** The files the round has worked on so far: what Commit lists as changed. */
  private changedFiles(): string[] {
    const done = this.state.round().outcomes.length;
    const files = this.state
      .lessons()
      .slice(0, done)
      .flatMap(({ lesson }) => (lesson.kind === 'vim' ? [lesson.file] : []));
    return [...new Set(files)];
  }

  /** A file or a member picked in the popup that lists them. */
  protected picked(entry: string): void {
    const lesson = this.lesson();
    if (lesson?.kind !== 'ide') return;
    if (this.turn().popup === 'structure') {
      const file = this.page().file;
      const member = membersOf(file).find((each) => each.text === entry);
      if (member) this.show(screenAt(file, member.line, `${this.slot()}:${entry}`));
      const wanted = lesson.does?.kind === 'structure' ? lesson.does.member : entry;
      if (entry === wanted) this.finish(this.ideOutcome());
      else this.miss(`Das ist ${entry}, gesucht ist ${wanted}.`);
      return;
    }
    // The target follows the file on the screen, so it is taken before that changes.
    const target = this.target();
    this.show(screenAt(entry, 1, `${this.slot()}:${entry}`));
    if (entry === target) this.finish(this.ideOutcome());
    else this.miss(`Das ist ${entry}, gesucht ist ${target}.`);
  }

  /** A match picked in Find in Files: it opens, and the find window lists them all. */
  protected found({ hit, query }: Found): void {
    const lesson = this.lesson();
    if (lesson?.kind !== 'ide') return;
    this.tool.set(hitsWindow(`Find: "${query}"`, search(query)));
    this.show(screenAt(hit.file, hit.line, `${this.slot()}:${hit.file}:${hit.line}`));
    const wanted = lesson.does?.kind === 'find' ? lesson.does : null;
    if (!wanted || (hit.file === wanted.file && query.toLowerCase().includes(wanted.query.toLowerCase()))) {
      this.finish(this.ideOutcome());
    } else {
      this.miss(`Gesucht ist ${wanted.query} in ${wanted.file}.`);
    }
  }

  /** Where the cursor stands in the file on the screen. */
  private head(): number {
    return this.snapshot()?.head ?? this.page().cursor;
  }

  protected entered(value: string): void {
    if (this.turn().popup === 'line') this.wentTo(value);
    else this.renamed(value);
  }

  /** A line typed into Go to Line: the cursor goes there, whichever it is. */
  private wentTo(value: string): void {
    const lesson = this.lesson();
    if (lesson?.kind !== 'ide' || lesson.does?.kind !== 'line') return;
    const page = this.page();
    const typed = Number(/^\d+/.exec(value)?.[0] ?? 0);
    if (typed < 1) {
      this.miss(`Gesucht ist Zeile ${lesson.does.line}.`);
      return;
    }
    const line = Math.min(typed, page.text.split('\n').length);
    this.show(screenAt(page.file, line, `${this.slot()}:${page.file}:${line}`));
    if (line === lesson.does.line) this.finish(this.ideOutcome());
    else this.miss(`Das ist Zeile ${line}, gesucht ist ${lesson.does.line}.`);
  }

  private renamed(name: string): void {
    const lesson = this.lesson();
    if (lesson?.kind !== 'ide' || lesson.does?.kind !== 'rename') return;
    const from = lesson.start?.at ?? '';
    if (name !== lesson.does.to) {
      this.miss(`Gesucht ist ${lesson.does.to}, nicht ${name || 'nichts'}.`);
      return;
    }
    const page = this.page();
    this.show({
      key: `${this.slot()}:rename`,
      file: page.file,
      text: renamedIn(page.text, from, name),
      cursor: page.cursor,
    });
    this.finish(this.ideOutcome());
  }

  protected closePopup(): void {
    this.turn.update((turn) => ({ ...turn, popup: null }));
  }

  /** Puts a file on the screen in place of the one the lesson started with. */
  private show(screen: Screen): void {
    this.screen.set(screen);
    this.turn.update((turn) => ({ ...turn, moved: true }));
  }

  private miss(note: string): void {
    this.sound.play('bust');
    this.turn.update((turn) => ({ ...turn, popup: null, misses: turn.misses + 1, note }));
  }

  /** The bar's keys where the editor does not have the focus, after a click on the button, say. */
  protected commandKey(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    const plain = !event.ctrlKey && !event.altKey && !event.metaKey;
    const command =
      plain && event.key === 'Enter' && this.waiting() ? 'next' : COMMAND_KEYS[chordOf(event) ?? ''];
    if (!command) return;
    event.preventDefault();
    this.command(command);
  }

  /** The keys belong in the editor; opened straight away, the house puts the focus on its sheet after us. */
  protected focusIn(event: FocusEvent): void {
    const target = event.target;
    if (this.stage() === 'loading' || this.turn().popup) return;
    if (target instanceof Node && target !== this.host && target.contains(this.host)) this.editor()?.focus();
  }

  protected command(command: DojoCommand): void {
    if (command === 'next') {
      this.next();
      return;
    }
    if (command === 'quit') {
      void this.router.navigate(['bibliothek']);
      return;
    }
    if (this.stage() !== 'lesson') return;
    if (command === 'skip') this.finish('skipped');
    else if (this.lesson()?.kind !== 'vim') return;
    else if (command === 'hint') this.turn.update((turn) => ({ ...turn, helped: true }));
    else this.turn.update((turn) => ({ ...turn, attempt: turn.attempt + 1, keys: 0, note: '' }));
  }

  /** On from a lesson that is over, or into another round once the day's is done. */
  protected next(): void {
    if (this.stage() === 'result') {
      this.held.set(null);
      return;
    }
    if (this.stage() === 'done') void this.task.run(() => this.state.again());
  }

  private ideOutcome(): Outcome {
    return this.turn().misses > 0 ? 'solved' : 'clean';
  }

  private finish(outcome: Outcome): void {
    const lesson = this.lesson();
    if (!lesson) return;
    const slot = this.slot();
    const snapshot = this.snapshot();
    if (lesson.kind === 'vim' && snapshot) {
      this.screen.set({ key: slot, file: lesson.file, text: snapshot.text, cursor: snapshot.head });
    }
    const start = lesson.kind === 'ide' && !this.turn().moved ? startOf(lesson, `${slot}:start`) : null;
    // What the lesson started with stays on the screen for the next one.
    if (start) this.screen.set(start);
    this.held.set({ slot, lesson, outcome, keys: this.turn().keys });
    this.sound.play(outcome === 'clean' ? 'perfect' : outcome === 'skipped' ? 'close' : 'pop');
    this.state.answer(outcome).catch((error: unknown) => this.toasts.error(errorText(error)));
  }
}
