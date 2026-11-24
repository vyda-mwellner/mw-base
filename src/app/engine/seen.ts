import type { Note } from './model';

/** Notes of something new he has jumped at, by `<room id>/<thing id>`: the text each one had then. */
export type Seen = Readonly<Record<string, string>>;

const isSeen = (note: Note, seen: string | undefined): boolean => note.tone === 'info' && note.text === seen;

/**
 * A note of something new that has been seen keeps its line but loses its tone, until its text changes.
 * A warning or a danger stays until what causes it is dealt with.
 */
export function quieted(notes: ReadonlyMap<string, Note>, seen: Seen): Map<string, Note> {
  return new Map(
    [...notes].map(([key, note]) => [key, isSeen(note, seen[key]) ? { ...note, tone: null } : note]),
  );
}

/** What is kept once `key` has been seen: the note itself, and of the others those that still say the same. */
export function seeing(seen: Seen, notes: ReadonlyMap<string, Note>, key: string): Seen {
  const kept = Object.entries(seen).filter(([other, text]) => {
    const note = notes.get(other);
    return note !== undefined && isSeen(note, text);
  });
  return Object.fromEntries([...kept, [key, notes.get(key)?.text ?? '']]);
}
