import { describe, expect, it } from 'vitest';
import { Bucket, LogEntry, LogReport, Problem } from '../model/cluster';
import { entryRows, problemRow, summary, timeline } from './log-view';

const AT = Date.UTC(2026, 10, 3, 13, 5);

const problem: Problem = {
  level: 'error',
  exception: 'java.net.SocketTimeoutException',
  cause: 'Read timed out',
  frame: 'com.example.server.outbound.email.SmtpEmailService.sendHtmlMessage',
  logger: 'd.p.s.outbound.email.SmtpEmailService',
  message: 'Versand fehlgeschlagen',
  trace: [
    'java.net.SocketTimeoutException: Read timed out',
    '\tat java.base/sun.nio.ch.NioSocketImpl.timedRead',
  ],
  count: 780,
  first: AT - 3_600_000,
  last: AT,
  pods: ['orders-api-deployment-7d4b-mk29f'],
};

const entry = (level: LogEntry['level'], message: string): LogEntry => ({
  at: AT,
  pod: 'orders-api-deployment-7d4b96c6b8-mk29f',
  level,
  logger: 'd.p.s.Foo',
  message,
  trace: [],
});

describe('problemRow', () => {
  it('names the exception and the place in our code without their packages', () => {
    expect(problemRow(problem, 0)).toMatchObject({
      levelLabel: 'ERROR',
      count: '780×',
      title: 'SocketTimeoutException',
      titleFull: 'java.net.SocketTimeoutException',
      detail: 'Read timed out',
      frame: 'SmtpEmailService.sendHtmlMessage',
    });
    expect(problemRow(problem, 0).trace.split('\n')[0]).toBe('Versand fehlgeschlagen');
  });

  it('falls back to logger and message for a problem without exception', () => {
    const row = problemRow({ ...problem, exception: null, cause: null, frame: null }, 1);
    expect(row).toMatchObject({ title: 'SmtpEmailService', detail: 'Versand fehlgeschlagen', frame: null });
  });
});

describe('entryRows', () => {
  it('shows the newest first and filters by level', () => {
    const entries = [entry('info', 'gestartet'), entry('error', 'kaputt'), entry('warn', 'langsam')];
    expect(entryRows(entries, 'all').map((row) => row.message)).toEqual(['langsam', 'kaputt', 'gestartet']);
    expect(entryRows(entries, 'error').map((row) => [row.message, row.pod])).toEqual([['kaputt', 'mk29f']]);
  });
});

describe('timeline', () => {
  const bucket = (index: number, errors: number, warnings: number): Bucket => ({
    start: AT + index * 150_000,
    end: AT + (index + 1) * 150_000,
    errors,
    warnings,
  });

  it('gives each level its own lane and scale, a single entry stays visible', () => {
    const view = timeline([bucket(0, 0, 1), bucket(1, 200, 0), bucket(2, 1, 4)]);
    expect(view?.lanes.map((lane) => lane.label)).toEqual(['Fehler 201', 'Warnungen 5']);
    expect(view?.lanes[0].bars.map((bar) => bar.height)).toEqual([0, 100, 8]);
    expect(view?.lanes[1].bars.map((bar) => bar.height)).toEqual([25, 0, 100]);
    expect(view?.lanes[0].bars[1].title).toMatch(/: 200 Fehler$/);
  });

  it('draws nothing when the window holds neither errors nor warnings', () => {
    expect(timeline([bucket(0, 0, 0)])).toBeNull();
    expect(timeline([])).toBeNull();
  });
});

describe('summary', () => {
  it('counts entries, pods and problems', () => {
    const report: LogReport = {
      entries: 1234,
      errors: 803,
      warnings: 23,
      from: AT - 3_600_000,
      to: AT,
      pods: ['a', 'b'],
      problems: [],
      recent: [],
      timeline: [],
      cutTo: null,
    };
    expect(summary(report)).toMatch(/^1\.234 Einträge von 2 Pods · .* · 803 Fehler · 23 Warnungen$/);
    expect(summary({ ...report, entries: 0, from: null, to: null })).toBe('Keine Einträge im Zeitraum.');
    expect(summary({ ...report, cutTo: 50_000 })).toMatch(
      / · gekürzt auf die neuesten 50\.000 Zeilen je Pod$/,
    );
  });
});
