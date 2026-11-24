import type { Note } from './model';
import { quieted, seeing } from './seen';

const notes = new Map<string, Note>([
  ['serverraum/zeitung', { text: '2 neue Meldungen', tone: 'info' }],
  ['bibliothek/regal', { text: '40 Notizen, 3 im Eingang', tone: 'info' }],
  ['finanzraum/abos', { text: '1 Abo zu buchen: Netflix', tone: 'warning' }],
]);

describe('quieted', () => {
  it('takes the tone from a note of something new that was seen with the same text', () => {
    const quiet = quieted(notes, { 'serverraum/zeitung': '2 neue Meldungen' });

    expect(quiet.get('serverraum/zeitung')).toEqual({ text: '2 neue Meldungen', tone: null });
    expect(quiet.get('bibliothek/regal')?.tone).toBe('info');
  });

  it('raises it again once its text has changed', () => {
    expect(quieted(notes, { 'serverraum/zeitung': '1 neue Meldung' }).get('serverraum/zeitung')?.tone).toBe(
      'info',
    );
  });

  it('never quiets a warning', () => {
    const quiet = quieted(notes, { 'finanzraum/abos': '1 Abo zu buchen: Netflix' });

    expect(quiet.get('finanzraum/abos')?.tone).toBe('warning');
  });
});

describe('seeing', () => {
  it('keeps the text of the note now seen and of those that still say the same, and forgets the rest', () => {
    const before = { 'serverraum/zeitung': '1 neue Meldung', 'bibliothek/regal': '40 Notizen, 3 im Eingang' };

    expect(seeing(before, notes, 'serverraum/zeitung')).toEqual({
      'serverraum/zeitung': '2 neue Meldungen',
      'bibliothek/regal': '40 Notizen, 3 im Eingang',
    });
    expect(seeing({ 'eingang/wetter': 'Sonne bis 16:40 Uhr' }, notes, 'bibliothek/regal')).toEqual({
      'bibliothek/regal': '40 Notizen, 3 im Eingang',
    });
  });
});
