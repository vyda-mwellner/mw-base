import { describe, expect, it } from 'vitest';

import type { Category, Note } from '../model/note';
import { libraryView, linkedNote, noteFacts, shelves } from './shelves';

const note = (path: string, overrides: Partial<Note> = {}): Note => ({
  path,
  folder: '',
  title: path,
  date: null,
  status: null,
  tags: [],
  ...overrides,
});
const CATEGORIES: Category[] = [
  { id: 'career', notes: [] },
  {
    id: 'systems',
    notes: [
      note('systems/landkarte.md', { title: 'Landkarte', status: 'ungeprüft' }),
      note('systems/shop/uebersicht.md', {
        title: 'shop',
        folder: 'shop',
        date: '2026-10-30',
        tags: ['kotlin'],
      }),
    ],
  },
];

describe('shelves', () => {
  it('shows every shelf with folder, date and status of its notes, the unchecked ones marked', () => {
    const [career, systems] = shelves(CATEGORIES, '');

    expect(career.rows).toEqual([]);
    expect(systems.rows.map((row) => [row.title, row.note, row.unchecked])).toEqual([
      ['Landkarte', 'ungeprüft', true],
      ['shop', 'shop · 2026-10-30', false],
    ]);
  });

  it('keeps only the shelves with a match while filtering, by title, folder or tag', () => {
    expect(shelves(CATEGORIES, 'KOTLIN').map((shelf) => [shelf.id, shelf.rows.length])).toEqual([
      ['systems', 1],
    ]);
  });
});

describe('noteFacts', () => {
  it('puts date, status and tags first, then the other frontmatter', () => {
    const facts = noteFacts({
      ...note('a.md', { date: '2026-10-30', tags: ['a', 'b'] }),
      fields: [{ key: 'repo', value: '/x' }],
      body: '',
    });

    expect(facts).toEqual([
      { label: 'Datum', value: '2026-10-30' },
      { label: 'Tags', value: 'a, b' },
      { label: 'repo', value: '/x' },
    ]);
  });
});

describe('linkedNote', () => {
  it('resolves a link to another note relative to the one it stands in', () => {
    expect(linkedNote('systems/shop/notizen.md', 'uebersicht.md')).toBe('systems/shop/uebersicht.md');
    expect(linkedNote('systems/shop/notizen.md', '../landkarte.md#backends')).toBe('systems/landkarte.md');
    expect(linkedNote('systems/shop/notizen.md', '/domain/glossar.md')).toBe('domain/glossar.md');
  });

  it('takes nothing that is no note', () => {
    expect(linkedNote('a.md', 'https://example.org/b.md')).toBeNull();
    expect(linkedNote('a.md', 'bild.png')).toBeNull();
  });
});

describe('libraryView', () => {
  it('puts a book on the shelf per note and a letter in the tray per unchecked one', () => {
    expect(libraryView(CATEGORIES, null)).toEqual({
      books: 2,
      inbox: 1,
      note: { text: '2 Notizen, 1 ungeprüft', tone: null },
    });
  });
});
