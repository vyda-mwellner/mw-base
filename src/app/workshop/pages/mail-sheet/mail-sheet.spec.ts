import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkshopApi } from '../../data/workshop-api';
import type { Mail } from '../../model/mail';
import { MailSheet } from './mail-sheet';

const mail = (id: string, subject: string): Mail => ({
  id,
  mailboxes: ['max@example.org'],
  subject,
  from: 'support@example.org',
  to: ['max@example.org'],
  cc: [],
  date: null,
  html: '',
  attachments: [],
});

describe('MailSheet', () => {
  let purgeMails: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    purgeMails = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: WorkshopApi,
          useValue: {
            mails: vi.fn(async () => [mail('1', 'Auftrag 123'), mail('2', 'Rechnung 7')]),
            purgeMails,
          },
        },
      ],
    });
  });

  async function open() {
    const fixture = TestBed.createComponent(MailSheet);
    await fixture.whenStable();
    return {
      root: fixture.nativeElement as HTMLElement,
      settle: () => TestBed.inject(ApplicationRef).whenStable(),
    };
  }

  const subjects = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('.gm-rows .gm-label')).map((label) => label.textContent?.trim());

  it('narrows the list to the mails that match the filter', async () => {
    const { root, settle } = await open();
    expect(subjects(root)).toEqual(['Auftrag 123', 'Rechnung 7']);

    const field = root.querySelector('input')!;
    field.value = 'rechnung';
    field.dispatchEvent(new Event('input'));
    await settle();

    expect(subjects(root)).toEqual(['Rechnung 7']);
    expect(root.querySelector('.gm-plaque-note')?.textContent?.trim()).toBe('1 von 2');
  });

  it('deletes all mails only on the second E', async () => {
    const { root, settle } = await open();
    const purge = root.querySelector<HTMLButtonElement>('[aria-keyshortcuts="e"]')!;

    purge.click();
    await settle();
    expect(purgeMails).not.toHaveBeenCalled();
    expect(purge.textContent?.trim()).toBe('Nochmal E: alle Mails löschen');

    purge.click();
    await settle();
    expect(purgeMails).toHaveBeenCalledTimes(1);
  });
});
