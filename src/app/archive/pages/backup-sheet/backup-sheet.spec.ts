import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { Store } from '../../../ui/store';
import { ArchiveApi } from '../../data/archive-api';
import { BackupSheet } from './backup-sheet';

describe('BackupSheet', () => {
  it('runs the plan on Q and keeps the run, so every entry shows how it went', async () => {
    const write = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: { read: vi.fn(async () => null), write } },
        {
          provide: ArchiveApi,
          useValue: {
            plan: vi.fn(async () => ({
              targetDir: '/drive',
              entries: [{ source: '~/.kube', target: '.kube', exclude: [] }],
            })),
            run: vi.fn(async () => [{ source: '~/.kube', copied: 3, unchanged: 1, error: null }]),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(BackupSheet);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const entryNote = () =>
      root.querySelectorAll('.gm-rows')[1].querySelector('.gm-note')?.textContent?.trim();
    expect(entryNote()).toBe('nach .kube · noch nicht gesichert');

    root.querySelector<HTMLButtonElement>('[aria-keyshortcuts="q"]')!.click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(write).toHaveBeenCalledWith(
      'haus/backup-lauf.json',
      expect.objectContaining({ outcomes: expect.any(Array) }),
    );
    expect(entryNote()).toBe('nach .kube · 3 kopiert, 1 unverändert');
  });
});
