import { describe, expect, it } from 'vitest';
import { EnvDeploy, RepoDeploy } from '../model/deploy';
import { track } from './tracks';

const env = (patch: Partial<EnvDeploy> & Pick<EnvDeploy, 'env'>): EnvDeploy => ({
  tag: `build-${patch.env}-12`,
  since: null,
  active: true,
  nextTag: null,
  deviations: [],
  ...patch,
});

const repo = (patch: Partial<RepoDeploy>): RepoDeploy => ({
  name: 'orders-api',
  group: 'Neusystem',
  kind: 'backend',
  units: ['orders-api'],
  envs: [env({ env: 'dev' }), env({ env: 'test' }), env({ env: 'prod' })],
  waitingForTest: 3,
  waitingForProd: 0,
  github: null,
  ...patch,
});

describe('track', () => {
  it('puts the running build on each platform and the waiting commits as wagons in between', () => {
    const plan = track(repo({}));

    expect([plan.dev.text, plan.test.text, plan.prod.text]).toEqual(['12', '12', '12']);
    expect([plan.toTest.keys.length, plan.toProd.keys.length]).toEqual([3, 0]);
    expect(plan.toTest.title).toBe('3 Commits auf dev, die noch nicht auf test sind (ohne Merges)');
    expect(plan.kindLabel).toBe('Backend');
  });

  it('caps the wagons and counts the rest, an unknown count has none', () => {
    const plan = track(repo({ waitingForTest: 21, waitingForProd: null }));

    expect([plan.toTest.keys.length, plan.toTest.more]).toEqual([8, '+13']);
    expect([plan.toProd.keys.length, plan.toProd.more]).toEqual([0, '']);
    expect(plan.toProd.title).toContain('fehlt im Repo orders-api');
  });

  it('leaves a platform empty without a tag and marks a foreign, a commented-out and a deviating build', () => {
    const plan = track(
      repo({
        envs: [
          env({ env: 'dev', tag: null }),
          env({
            env: 'test',
            active: false,
            deviations: [{ unit: 'admin-gui', tag: null, active: true }],
          }),
          env({ env: 'prod', tag: 'build-test-4', nextTag: 'build-prod-13' }),
        ],
      }),
    );

    expect(plan.dev).toMatchObject({ empty: true, text: '-', title: 'Kein Tag für DEV in gitops' });
    expect(plan.test).toMatchObject({ text: '12', inactive: true, deviating: true, foreign: false });
    expect(plan.prod).toMatchObject({ text: 'build-test-4', foreign: true });
    expect(plan.incoming).toBe('13');
  });
});
