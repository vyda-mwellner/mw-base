import type { Outcome } from './deck';
import { keysOf } from './keys';
import { textOf, type VimLesson } from './lessons';

export type VimMode = 'normal' | 'insert' | 'replace' | 'visual' | 'visual line' | 'visual block';

/** What the editor holds after a key. */
export interface Snapshot {
  readonly text: string;
  readonly head: number;
  readonly mode: VimMode;
  /** Where a lesson that turns on the editor's height wants the cursor, once the editor has worked it out. */
  readonly goal?: number;
}

/** `typed` while the text is not there yet, `escape` once it is but the editor is still in another mode. */
type Progress = 'typed' | 'escape' | 'done';

export const parOf = (lesson: VimLesson): number => keysOf(lesson.keys).length;

/** Texts are the same if they only differ in empty lines at the end, which the vim mode leaves after dG. */
export const sameText = (a: string, b: string): boolean => a.replace(/\n+$/, '') === b.replace(/\n+$/, '');

export function progressOf(lesson: VimLesson, snapshot: Snapshot): Progress {
  const goal = textOf(lesson.after);
  const cursor = lesson.screen ? (snapshot.goal ?? -1) : goal.cursor;
  if (!sameText(snapshot.text, goal.text)) return 'typed';
  if (cursor !== null && snapshot.head !== cursor) return 'typed';
  return snapshot.mode === 'normal' ? 'done' : 'escape';
}

export function outcomeOf(keys: number, par: number, helped: boolean): Outcome {
  if (helped) return 'helped';
  return keys <= par ? 'clean' : 'solved';
}

interface DiffLine {
  readonly sign: '-' | '+' | ' ';
  readonly text: string;
}

/** Every line of `before` and `after` in order: those that stay, those that go, those that come. */
export function diffOf(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const common = a.map(() => b.map(() => 0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i][j] =
        a[i] === b[j]
          ? 1 + (common[i + 1]?.[j + 1] ?? 0)
          : Math.max(common[i + 1]?.[j] ?? 0, common[i][j + 1] ?? 0);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ sign: ' ', text: a[i++] });
      j++;
    } else if (i < a.length && (j >= b.length || (common[i + 1]?.[j] ?? 0) >= (common[i][j + 1] ?? 0))) {
      lines.push({ sign: '-', text: a[i++] });
    } else {
      lines.push({ sign: '+', text: b[j++] });
    }
  }
  return lines;
}
