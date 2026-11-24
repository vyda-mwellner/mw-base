/** A top-level folder of the knowledge vault, a shelf in the library. */
export interface Category {
  /** The folder name, like `systems`. */
  readonly id: string;
  readonly notes: readonly Note[];
}

export interface Note {
  /** Relative to the vault and `/` separated. */
  readonly path: string;
  /** The folders between category and file, like `shop-backend` in `systems/shop-backend/notizen.md`. */
  readonly folder: string;
  readonly title: string;
  readonly date: string | null;
  readonly status: string | null;
  readonly tags: readonly string[];
}

export interface NoteContent extends Note {
  /** The frontmatter besides date, status and tags, like `repo` and `stand` of a system overview. */
  readonly fields: readonly { readonly key: string; readonly value: string }[];
  readonly body: string;
}
