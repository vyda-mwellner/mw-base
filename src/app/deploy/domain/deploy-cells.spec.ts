import { describe, expect, it } from 'vitest';
import { EnvDeploy, RepoDeploy } from '../model/deploy';
import { countCell, row, tagCell } from './deploy-cells';

const deploy = (patch: Partial<EnvDeploy>): EnvDeploy => ({
  env: 'prod',
  tag: 'build-prod-530',
  since: Date.UTC(2026, 9, 19, 14, 19),
  active: true,
  nextTag: null,
  deviations: [],
  ...patch,
});

describe('tagCell', () => {
  it('shortens a build of the own branch to its number', () => {
    const cell = tagCell(deploy({}));

    expect(cell.text).toBe('530');
    expect(cell.foreign).toBe(false);
    expect(cell.since).not.toBe('');
  });

  it('keeps a build of another branch whole and marks it', () => {
    const cell = tagCell(deploy({ tag: 'build-test-4' }));

    expect(cell).toMatchObject({ text: 'build-test-4', foreign: true });
  });

  it('shows the tag that waits for the release merge and the commented-out unit', () => {
    const cell = tagCell(deploy({ nextTag: 'build-prod-531', active: false }));

    expect(cell.next).toBe('531');
    expect(cell.inactive).toBe(true);
    expect(cell.title).toContain('Merge nach prod fehlt');
    expect(cell.title).toContain('auskommentiert');
  });

  it('counts the units of the repo that run something else and names them in the title', () => {
    const cell = tagCell(
      deploy({
        deviations: [
          { unit: 'signup-gui', tag: 'build-prod-529', active: true },
          { unit: 'admin-gui', tag: 'build-prod-530', active: false },
        ],
      }),
    );

    expect(cell.text).toBe('530');
    expect(cell.deviating).toBe('2 abweichend');
    expect(cell.title).toContain('signup-gui: build-prod-529');
    expect(cell.title).toContain('admin-gui: build-prod-530, auskommentiert');
    expect(tagCell(deploy({})).deviating).toBeNull();
  });

  it('leaves tags like latest as they are', () => {
    expect(tagCell(deploy({ tag: 'latest' })).text).toBe('latest');
    expect(tagCell(deploy({ tag: null })).text).toBe('-');
  });
});

describe('countCell', () => {
  it('marks waiting commits and explains a missing branch', () => {
    expect(countCell(2, 'dev', 'test', 'shop-gui')).toMatchObject({ text: '2', pending: true });
    expect(countCell(0, 'dev', 'test', 'shop-gui').pending).toBe(false);
    expect(countCell(null, 'test', 'prod', 'ps-ocr-api')).toMatchObject({ text: '-', pending: false });
  });
});

describe('row', () => {
  it('names the repo and lists its gitops units in the title', () => {
    const deploy: RepoDeploy = {
      name: 'shop-gui',
      group: 'Neusystem',
      kind: 'frontend',
      units: ['admin-gui', 'signup-gui'],
      envs: [],
      waitingForTest: 0,
      waitingForProd: 0,
      github: 'https://github.com/acme/shop-gui',
    };

    expect(row(deploy)).toMatchObject({
      name: 'shop-gui',
      kindLabel: 'GUI',
      unitTitle: 'gitops: admin-gui, signup-gui',
      github: 'https://github.com/acme/shop-gui',
      githubLabel: 'shop-gui auf GitHub öffnen',
    });
  });
});
