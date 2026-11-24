import { CLOCK, DAY_MONTH, NUMBER, plural } from '../../core/format';
import type { Note } from '../../engine/model';
import type { Mail } from '../model/mail';

const NO_SUBJECT = '(ohne Betreff)';
const LONG = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeStyle: 'medium' });
const ONE_DECIMAL = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

interface MailRow {
  readonly id: string;
  readonly subject: string;
  readonly note: string;
  /** Empty without attachments. */
  readonly attachments: string;
}

export const subjectOf = (mail: Mail): string => mail.subject || NO_SUBJECT;

/** Today only the time, any other day the date before it. */
function when(date: number | null, now: number): string {
  if (date === null) return 'ohne Datum';
  const sameDay = new Date(date).toDateString() === new Date(now).toDateString();
  return sameDay ? CLOCK.format(date) : `${DAY_MONTH.format(date)} ${CLOCK.format(date)}`;
}

export function mailRow(mail: Mail, now: number): MailRow {
  const recipients = mail.to.length > 0 ? mail.to : mail.mailboxes;
  const more = recipients.length > 1 ? ` +${recipients.length - 1}` : '';
  return {
    id: mail.id,
    subject: subjectOf(mail),
    note: `an ${recipients[0] ?? 'niemand'}${more} · ${when(mail.date, now)}`,
    attachments: mail.attachments.length === 0 ? '' : plural(mail.attachments.length, 'Anhang', 'Anhänge'),
  };
}

/** Subject, sender, recipients and mailboxes, case insensitive. */
export function matches(mail: Mail, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return [mail.subject, mail.from, ...mail.to, ...mail.cc, ...mail.mailboxes].some((text) =>
    text.toLowerCase().includes(needle),
  );
}

export function mailFields(mail: Mail): { label: string; value: string }[] {
  return [
    { label: 'Von', value: mail.from },
    { label: 'An', value: mail.to.join(', ') },
    { label: 'Cc', value: mail.cc.join(', ') },
    { label: 'Datum', value: mail.date === null ? '' : LONG.format(mail.date) },
    { label: 'Postfach', value: mail.mailboxes.join(', ') },
  ].filter((field) => field.value !== '');
}

export function size(bytes: number): string {
  if (bytes < 1024) return `${NUMBER.format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${ONE_DECIMAL.format(bytes / 1024)} KB`;
  return `${ONE_DECIMAL.format(bytes / 1024 / 1024)} MB`;
}

/**
 * The line on the mailbox in the workshop. New mail is news until the mailbox was jumped at, and again once
 * a newer one comes in. Greenmail that does not answer is no alarm: its stack may just be off.
 */
export function mailNote(mails: readonly Mail[] | null, error: string | null): Note {
  if (error !== null) return { text: 'Greenmail antwortet nicht', tone: null };
  if (mails === null) return { text: 'Wird gelesen', tone: null };
  if (mails.length === 0) return { text: 'Keine Mails', tone: null };
  return { text: `${plural(mails.length, 'Mail', 'Mails')}, neueste: ${subjectOf(mails[0])}`, tone: 'info' };
}
