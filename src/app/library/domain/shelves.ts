import type { Note as HouseNote } from '../../engine/model';
import type { Category, Note, NoteContent } from '../model/note';

/** What the vault skill sets on a note it wrote from a guess, until someone checked it. */
const UNCHECKED = 'ungeprüft';

interface ShelfRow {
  readonly path: string;
  readonly title: string;
  readonly note: string;
  readonly unchecked: boolean;
}

interface Shelf {
  readonly id: string;
  readonly rows: ShelfRow[];
}

/** Title, folder and tags, case insensitive. */
export function matches(note: Note, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return [note.title, note.folder, ...note.tags].some((text) => text.toLowerCase().includes(needle));
}

/** Every shelf with the notes that match; a shelf without one only while nothing is filtered. */
export function shelves(categories: readonly Category[], term: string): Shelf[] {
  return categories
    .map((category) => ({
      id: category.id,
      rows: category.notes
        .filter((note) => matches(note, term))
        .map((note) => ({
          path: note.path,
          title: note.title,
          note: [note.folder, note.date, note.status].filter(Boolean).join(' · ') || category.id,
          unchecked: note.status === UNCHECKED,
        })),
    }))
    .filter((shelf) => shelf.rows.length > 0 || !term.trim());
}

/** The frontmatter of a note as figures above it on the workbench. */
export function noteFacts(note: NoteContent): { label: string; value: string }[] {
  return [
    { label: 'Datum', value: note.date ?? '' },
    { label: 'Status', value: note.status ?? '' },
    { label: 'Tags', value: note.tags.join(', ') },
    ...note.fields.map((field) => ({ label: field.key, value: field.value })),
  ].filter((fact) => fact.value !== '');
}

/** A link in a note to another one, relative to the note it stands in; null for anything that is no note. */
export function linkedNote(from: string, href: string): string | null {
  const [target] = href.split('#', 1);
  if (!target || /^[a-z]+:/i.test(target) || !target.endsWith('.md')) return null;
  const parts = target.startsWith('/') ? [] : from.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

/** What the bookcases in the library show: a book per note, a letter in the tray per unchecked one. */
interface LibraryView {
  readonly books: number;
  readonly inbox: number;
  readonly note: HouseNote;
}

export function libraryView(categories: readonly Category[] | null, error: string | null): LibraryView {
  const notes = (categories ?? []).flatMap((category) => category.notes);
  const unchecked = notes.filter((note) => note.status === UNCHECKED).length;
  const note: HouseNote =
    error !== null
      ? { text: error, tone: null }
      : categories === null
        ? { text: 'Wird gelesen', tone: null }
        : { text: `${notes.length} Notizen, ${unchecked} ungeprüft`, tone: null };
  return { books: notes.length, inbox: unchecked, note };
}
