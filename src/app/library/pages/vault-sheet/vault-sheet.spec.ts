import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Workbench } from '../../../workbench/workbench';
import { LibraryApi } from '../../data/library-api';
import type { NoteContent } from '../../model/note';
import { VaultSheet } from './vault-sheet';

const content = (path: string, title: string): NoteContent => ({
  path,
  folder: '',
  title,
  date: null,
  status: null,
  tags: [],
  fields: [],
  body: `# ${title}`,
});

describe('VaultSheet', () => {
  let note: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    note = vi.fn(async (path: string) =>
      content(path, path === 'domain/glossar.md' ? 'Glossar' : 'Landkarte'),
    );
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LibraryApi,
          useValue: {
            notes: vi.fn(async () => [
              { id: 'systems', notes: [{ ...content('systems/landkarte.md', 'Landkarte') }] },
            ]),
            note,
          },
        },
      ],
    });
  });

  it('lays a note on the workbench, and a link in it opens the note it points at', async () => {
    const fixture = TestBed.createComponent(VaultSheet);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const desk = TestBed.inject(Workbench).desk;

    root.querySelector<HTMLButtonElement>('.gm-row-main')!.click();
    await TestBed.inject(ApplicationRef).whenStable();
    const page = desk();
    expect(page).toMatchObject({ kind: 'note', title: 'Landkarte', markdown: '# Landkarte' });

    if (page?.kind === 'note') page.follow('../domain/glossar.md');
    await vi.waitFor(() => expect(desk()).toMatchObject({ title: 'Glossar' }));
    expect(note).toHaveBeenLastCalledWith('domain/glossar.md');
  });
});
