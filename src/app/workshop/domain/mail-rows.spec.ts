import { describe, expect, it } from 'vitest';

import type { Mail } from '../model/mail';
import { mailFields, mailNote, mailRow, matches, size } from './mail-rows';

const NOW = new Date(2026, 10, 23, 15, 0).getTime();
const mail = (overrides: Partial<Mail> = {}): Mail => ({
  id: 'abc@example.org',
  mailboxes: ['max@example.org'],
  subject: 'Auftrag für Schaden 123',
  from: 'Support <support@example.org>',
  to: ['max@example.org'],
  cc: [],
  date: new Date(2026, 10, 23, 14, 5).getTime(),
  html: '<p>Hallo</p>',
  attachments: [],
  ...overrides,
});

describe('mailRow', () => {
  it('names the first recipient, how many more there are, and only the time for today', () => {
    const row = mailRow(mail({ to: ['a@example.org', 'b@example.org', 'c@example.org'] }), NOW);

    expect(row.note).toBe('an a@example.org +2 · 14:05');
    expect(row.attachments).toBe('');
  });

  it('puts the date before the time of an older mail and falls back to the mailbox without To', () => {
    const row = mailRow(
      mail({ to: [], mailboxes: ['bcc@example.org'], date: new Date(2026, 9, 20, 9, 30).getTime() }),
      NOW,
    );

    expect(row.note).toBe('an bcc@example.org · 20.10. 09:30');
  });

  it('gives a mail without subject a stand-in and counts the attachments', () => {
    const attachment = { name: 'a.pdf', contentType: 'application/pdf', size: 5 };
    const row = mailRow(mail({ subject: '', attachments: [attachment, attachment] }), NOW);

    expect(row.subject).toBe('(ohne Betreff)');
    expect(row.attachments).toBe('2 Anhänge');
  });
});

describe('matches', () => {
  it('finds a mail by subject, sender or any address, ignoring case', () => {
    expect(matches(mail(), 'schaden')).toBe(true);
    expect(matches(mail(), 'SUPPORT@')).toBe(true);
    expect(matches(mail(), 'max@')).toBe(true);
    expect(matches(mail(), 'rechnung')).toBe(false);
    expect(matches(mail(), '  ')).toBe(true);
  });
});

describe('mailFields', () => {
  it('leaves out what the mail does not have', () => {
    expect(mailFields(mail({ date: null })).map((field) => field.label)).toEqual(['Von', 'An', 'Postfach']);
  });
});

describe('size', () => {
  it('counts bytes, then kilobytes and megabytes with one decimal', () => {
    expect(size(512)).toBe('512 B');
    expect(size(1536)).toBe('1,5 KB');
    expect(size(3 * 1024 * 1024)).toBe('3 MB');
  });
});

describe('mailNote', () => {
  it('tells of new mail with the newest subject, and of none without a tone', () => {
    expect(mailNote([mail(), mail({ id: 'b', subject: 'Alt' })], null)).toEqual({
      text: '2 Mails, neueste: Auftrag für Schaden 123',
      tone: 'info',
    });
    expect(mailNote([], null)).toEqual({ text: 'Keine Mails', tone: null });
  });

  it('raises no alarm when Greenmail is off', () => {
    expect(mailNote(null, 'Greenmail antwortet nicht unter http://localhost:8282')).toEqual({
      text: 'Greenmail antwortet nicht',
      tone: null,
    });
  });
});
