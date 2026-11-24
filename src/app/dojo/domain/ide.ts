import type { Outcome } from './deck';
import type { IdeLesson, Lesson, LineEdit } from './lessons';
import { fileText, membersOf, offsetOf, testOf, wordAt, type Hit } from './project';

/** A file on the screen, with the cursor where it stands; `key` changes whenever it is put there anew. */
export interface Screen {
  readonly key: string;
  readonly file: string;
  readonly text: string;
  readonly cursor: number;
}

/** A line of a tool window: where it points, and what stands there. */
interface ToolRow {
  readonly key: string;
  readonly place: string;
  readonly text: string;
  readonly tone?: 'ok';
}

/** A tool window at the bottom, like Find, Run or Terminal. */
export interface ToolWindow {
  readonly title: string;
  readonly rows: readonly ToolRow[];
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A file from the project, the cursor at the start of a line. */
export function screenAt(file: string, line: number, key: string): Screen {
  const text = fileText(file);
  return { key, file, text, cursor: offsetOf(text, line) };
}

/** Where an IntelliJ lesson starts: its file, with its own text if it brings one, the cursor on its word. */
export function startOf(lesson: IdeLesson, key: string): Screen | null {
  const start = lesson.start;
  if (!start) return null;
  const text = start.lines ? start.lines.join('\n') : fileText(start.file);
  const at = start.at ? wordAt(text, start.at) : -1;
  return { key, file: start.file, text, cursor: Math.max(0, at) };
}

/** The line an offset of a text is on, counted from 1. */
export const lineAt = (text: string, offset: number): number => text.slice(0, offset).split('\n').length;

/** Next or Previous Method: the member of the file after or before a line. */
export function memberFrom(file: string, line: number, step: 1 | -1): Hit | null {
  const members = step > 0 ? membersOf(file) : membersOf(file).reverse();
  return members.find((member) => (member.line - line) * step > 0) ?? null;
}

/** An edit of IntelliJ on the cursor's line; the cursor keeps its column on the line it ends up on. */
export function editedAt(text: string, head: number, edit: LineEdit): { text: string; cursor: number } {
  const lines = text.split('\n');
  const at = lineAt(text, head) - 1;
  const next = [...lines];
  let column = head - text.lastIndexOf('\n', head - 1) - 1;
  let line = at;
  const last = at + 1 >= lines.length;
  switch (edit) {
    case 'duplicate':
      next.splice(at, 0, lines[at]);
      line = at + 1;
      break;
    case 'delete':
      next.splice(at, 1);
      line = Math.min(at, next.length - 1);
      break;
    case 'down':
      if (last) break;
      [next[at], next[at + 1]] = [lines[at + 1], lines[at]];
      line = at + 1;
      break;
    case 'join': {
      if (last) break;
      const tail = lines[at + 1].trimStart();
      column = lines[at].trimEnd().length;
      next.splice(at, 2, `${lines[at].trimEnd()}${/^[.,)\]]/.test(tail) ? '' : ' '}${tail}`);
      break;
    }
  }
  const before = next.slice(0, line).reduce((sum, each) => sum + each.length + 1, 0);
  return { text: next.join('\n'), cursor: before + Math.min(column, next[line]?.length ?? 0) };
}

/** Rename: the word as a whole word, everywhere in the text. */
export const renamedIn = (text: string, from: string, to: string): string =>
  text.replace(new RegExp(`\\b${escaped(from)}\\b`, 'g'), to);

/** Go to Test: the test class of the file, at its declaration. */
export function testScreen(file: string, key: string): Screen | null {
  const test = testOf(file);
  if (!test) return null;
  const line = membersOf(test).find((member) => member.text.endsWith('Test'))?.line ?? 1;
  return screenAt(test, line, key);
}

export const hitsWindow = (title: string, hits: readonly Hit[]): ToolWindow => ({
  title,
  rows: hits.map((hit) => ({
    key: `${hit.file}:${hit.line}`,
    place: `${hit.file}:${hit.line}`,
    text: hit.text.trim(),
  })),
});

/** Run: the test under the cursor passes, or all of them when the cursor is on none. */
export function runWindow(at: string | undefined): ToolWindow {
  const tests = membersOf('OrderServiceTest.kt').filter((member) => member.text.includes(' '));
  const run = tests.filter((test) => !at || test.text.startsWith(at));
  const shown = run.length > 0 ? run : tests;
  return {
    title: 'Run: OrderServiceTest',
    rows: [
      ...shown.map((test, index) => ({
        key: test.text,
        place: '✓',
        text: `${test.text}   ${12 + index * 3} ms`,
        tone: 'ok' as const,
      })),
      {
        key: 'sum',
        place: '',
        text: `Tests passed: ${shown.length} of ${shown.length}`,
        tone: 'ok' as const,
      },
    ],
  };
}

export const TERMINAL: ToolWindow = {
  title: 'Terminal: Local',
  rows: [
    { key: 'command', place: 'shop %', text: './gradlew test' },
    { key: 'result', place: '', text: 'BUILD SUCCESSFUL in 4s', tone: 'ok' },
    { key: 'tasks', place: '', text: '7 actionable tasks: 7 executed' },
    { key: 'prompt', place: 'shop %', text: '' },
  ],
};

/** Commit: the files the round changed so far, as modified. */
export const commitWindow = (files: readonly string[]): ToolWindow => ({
  title: `Commit: ${files.length} ${files.length === 1 ? 'Datei' : 'Dateien'} geändert`,
  rows: files.length
    ? files.map((file) => ({ key: file, place: 'M', text: file }))
    : [{ key: 'none', place: '', text: 'Keine Änderungen' }],
});

const VERDICTS: Readonly<Record<Outcome, string>> = {
  clean: 'sauber',
  solved: 'gelöst',
  helped: 'mit Hilfe',
  skipped: 'übersprungen',
};

const germanDate = (day: string): string => day.split('-').reverse().join('.');

/** The round as IntelliJ would show a markdown file: a table of the lessons and the card index. */
export function roundReport(
  day: string,
  lessons: readonly { readonly lesson: Lesson; readonly outcome: Outcome | null }[],
  totals: { readonly solved: number; readonly met: number; readonly total: number },
  boxes: readonly number[],
): string {
  const rows = lessons.map(({ lesson, outcome }, index) => [
    String(index + 1),
    lesson.kind === 'vim' ? `Vim · ${lesson.topic}` : `IntelliJ · ${lesson.action}`,
    `\`${lesson.kind === 'vim' ? lesson.keys : lesson.chord}\``,
    outcome ? VERDICTS[outcome] : 'offen',
  ]);
  const head = ['#', 'Aufgabe', 'Tasten', 'Ergebnis'];
  const widths = head.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => row[column].length)),
  );
  const line = (cells: readonly string[]) =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`;
  return [
    `# Dojo-Runde vom ${germanDate(day)}`,
    '',
    `${totals.solved} gelöst · ${totals.met} von ${totals.total} Aufgaben kennengelernt`,
    '',
    line(head),
    line(widths.map((width) => '-'.repeat(width))),
    ...rows.map(line),
    '',
    '## Karteikasten',
    '',
    ...boxes.map((count, index) => `- Kasten ${index + 1}: ${count}`),
    '',
  ].join('\n');
}
