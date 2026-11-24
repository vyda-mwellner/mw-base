import { Injectable } from '@angular/core';

import { call } from '../../core/ipc';
import type { Category, NoteContent } from '../model/note';

@Injectable({ providedIn: 'root' })
export class LibraryApi {
  notes(): Promise<Category[]> {
    return call<Category[]>('vault_notes');
  }

  note(path: string): Promise<NoteContent> {
    return call<NoteContent>('vault_note', { path });
  }
}
