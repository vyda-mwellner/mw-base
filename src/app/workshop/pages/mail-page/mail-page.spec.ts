import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkshopApi } from '../../data/workshop-api';
import type { Mail } from '../../model/mail';
import { MailPage } from './mail-page';

const MAIL: Mail = {
  id: 'abc@example.org',
  mailboxes: ['max@example.org', 'bcc@example.org'],
  subject: 'Auftrag 123',
  from: 'Support <support@example.org>',
  to: ['max@example.org'],
  cc: [],
  date: null,
  html: '<p>Hallo</p><script>alert(1)</script>',
  attachments: [{ name: 'auftrag.pdf', contentType: 'application/pdf', size: 2048 }],
};

describe('MailPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: WorkshopApi, useValue: { mails: vi.fn(async () => [MAIL]) } }],
    });
  });

  async function open(id: string) {
    const fixture = TestBed.createComponent(MailPage);
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows who sent the mail to which mailboxes and its attachments, the body in a frame without scripts', async () => {
    const root = await open('abc@example.org');

    expect(root.querySelector('.gm-plaque')?.textContent?.trim()).toBe('Auftrag 123');
    expect(root.querySelector('.mp-fields')?.textContent).toContain('max@example.org, bcc@example.org');
    expect(root.querySelector('.gm-rows .gm-note')?.textContent?.trim()).toBe('application/pdf · 2 KB');
    const frame = root.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-same-origin');
    expect(frame.getAttribute('srcdoc')).toContain('<p>Hallo</p>');
  });

  it('says so when the mail is gone, like after deleting all', async () => {
    const root = await open('weg@example.org');

    expect(root.querySelector('.gm-empty')?.textContent?.trim()).toBe('Diese Mail ist nicht mehr da.');
  });
});
