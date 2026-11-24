import type { RepoDeploy } from '../model/deploy';
import { deployView } from './house-view';

const repo = (name: string, waitingForTest: number | null, waitingForProd: number | null): RepoDeploy => ({
  name,
  group: 'neu',
  kind: 'backend',
  units: [name],
  envs: [],
  waitingForTest,
  waitingForProd,
  github: null,
});

describe('deployView', () => {
  it('puts the three repos with the most commits on their way on the tracks', () => {
    const view = deployView([repo('a', 1, 0), repo('b', 4, 2), repo('c', null, null), repo('d', 0, 3)], []);

    expect(view.trains).toEqual([6, 3, 1]);
    expect(view.notes.get('buero/gleisplan')?.text).toBe('5 Commits warten auf TEST, 5 auf PROD');
  });

  it('counts the tickets of every release step and says nothing before the first read', () => {
    const view = deployView(
      [],
      [
        { from: 'dev', to: 'test', tickets: [], untracked: [] },
        {
          from: 'test',
          to: 'prod',
          tickets: [{ key: 'PS-1', url: '', summary: '', repos: [], authors: [] }],
          untracked: [],
        },
      ],
    );

    expect(view.notes.get('buero/releases')?.text).toBe(
      'DEV nach TEST: 0 Tickets · TEST nach PROD: 1 Ticket',
    );
    expect(view.notes.has('buero/gleisplan')).toBe(false);
  });
});
