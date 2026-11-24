import type { AppInfo, AppKind, Edge, Snapshot } from '../model/landscape';
import { landscapePlan, planSvg, type Plan, type PlanCard } from './landscape-plan';

function app(id: string, group: string, kind: AppKind, more: Partial<AppInfo> = {}): AppInfo {
  return {
    id,
    label: id,
    group,
    kind,
    repo: id,
    path: id,
    missing: false,
    ports: [],
    tech: [],
    loc: null,
    facts: [],
    modules: [],
    git: null,
    unresolved: [],
    ...more,
  };
}

const call = (from: string, to: string): Edge => ({ from, to, kind: 'call', via: [] });

const SNAPSHOT: Snapshot = {
  generatedAt: Date.UTC(2026, 10, 2, 9, 30),
  groups: [
    { id: 'shared', label: 'Gemeinsam', side: true },
    { id: 'web', label: 'Web', side: false },
    { id: 'legacy', label: 'Alt', side: false },
  ],
  apps: [
    app('db', 'shared', 'infra'),
    app('login', 'shared', 'infra'),
    app('mailer', 'shared', 'service'),
    app('shop', 'web', 'frontend', { ports: [4200] }),
    app('admin', 'web', 'frontend'),
    app('api', 'web', 'backend'),
    app('desk', 'legacy', 'frontend', { missing: true }),
    app('core', 'legacy', 'backend'),
  ],
  edges: [
    call('shop', 'api'),
    call('shop', 'core'),
    call('admin', 'api'),
    call('desk', 'api'),
    call('shop', 'login'),
    { from: 'admin', to: 'desk', kind: 'link', via: [] },
    call('api', 'db'),
    call('core', 'db'),
    call('api', 'core'),
    call('api', 'mailer'),
  ],
};

const cardOf = (plan: Plan, id: string): PlanCard => plan.cards.find((card) => card.id === id)!;
const laneOf = (plan: Plan, label: string) => plan.lanes.find((lane) => lane.label === label)!;

describe('landscapePlan', () => {
  const plan = landscapePlan(SNAPSHOT);

  it('puts the GUIs left, the backends beside them and the shared groups right', () => {
    expect(['shop', 'api', 'db'].map((id) => cardOf(plan, id).column)).toEqual([0, 1, 2]);
    expect(cardOf(plan, 'shop').x).toBeLessThan(cardOf(plan, 'api').x);
    expect(cardOf(plan, 'api').x).toBeLessThan(cardOf(plan, 'db').x);
    expect(cardOf(plan, 'mailer').column).toBe(2);
  });

  it('gives every group a lane with its GUIs and backends, each lane in another color than the one above', () => {
    const [web, legacy] = [laneOf(plan, 'Web'), laneOf(plan, 'Alt')];
    const inside = (id: string, lane: typeof web) =>
      cardOf(plan, id).y > lane.y && cardOf(plan, id).y < lane.y + lane.height;

    expect(plan.lanes.map((lane) => lane.label)).toEqual(['Web', 'Alt', 'Gemeinsam']);
    expect(['shop', 'admin', 'api'].every((id) => inside(id, web))).toBe(true);
    expect(['desk', 'core'].every((id) => inside(id, legacy))).toBe(true);
    expect(web.fill).not.toEqual(legacy.fill);
  });

  it('reaches the single shared lane down as far as the lanes of the groups', () => {
    const shared = laneOf(plan, 'Gemeinsam');
    const legacy = laneOf(plan, 'Alt');

    expect(shared.y).toBeLessThan(laneOf(plan, 'Web').y);
    expect(shared.y + shared.height).toBe(legacy.y + legacy.height);
  });

  it('draws the calls, but neither those into the infrastructure nor the links between apps', () => {
    expect(plan.edges.map((edge) => `${edge.from}>${edge.to}`)).toEqual([
      'shop>api',
      'shop>core',
      'admin>api',
      'desk>api',
      'api>core',
      'api>mailer',
    ]);
  });

  it('bends a call between two backends out on their right and ends it short of the card for the arrow', () => {
    const [api, core] = [cardOf(plan, 'api'), cardOf(plan, 'core')];
    const d = plan.edges.find((edge) => edge.from === 'api' && edge.to === 'core')!.d;

    expect(d).toMatch(new RegExp(`^M ${api.x + api.width} `));
    expect(d).toMatch(new RegExp(` ${core.x + core.width + 3} [\\d.]+$`));
  });

  it('lists the versions with how long they are supported, Nx left out, in rows as wide as the card', () => {
    const drawn = landscapePlan(
      {
        ...SNAPSHOT,
        apps: SNAPSHOT.apps.map((each) =>
          each.id === 'shop'
            ? { ...each, tech: ['Angular 21.2.10', 'Nx 21.0.0', 'Node 18'] }
            : each.id === 'api'
              ? {
                  ...each,
                  tech: ['Spring Boot 3.5.2', 'Kotlin 2.0.20', 'Java 17', 'Gradle 8.14.3', 'Postgres 16'],
                }
              : each,
        ),
      },
      (tech) => (tech.startsWith('Angular') ? 'ok' : tech.startsWith('Node') ? 'danger' : null),
    );

    expect(cardOf(drawn, 'shop').versions).toEqual([
      [
        { text: 'Angular 21.2.10', support: 'ok' },
        { text: 'Node 18', support: 'danger' },
      ],
    ]);
    expect(cardOf(drawn, 'api').versions).toHaveLength(2);
    expect(cardOf(drawn, 'api').height).toBeGreaterThan(cardOf(drawn, 'core').height);
  });

  it('breaks a long name at a space and cuts what still does not fit', () => {
    const named: Snapshot = {
      ...SNAPSHOT,
      apps: [
        ...SNAPSHOT.apps,
        app('files', 'shared', 'infra', { label: 'Ablage für Dokumente der Mandanten im Archiv' }),
        app('store', 'shared', 'infra', { label: 'Dokumentenablageverwaltungssystem' }),
      ],
    };
    const drawn = landscapePlan(named);

    expect(cardOf(drawn, 'files').lines).toEqual(['Ablage für Dokumente', 'der Mandanten im Archiv']);
    expect(cardOf(drawn, 'store').lines).toEqual([expect.stringMatching(/^Dokumentenablage.*…$/)]);
  });

  it('marks a repo that is not checked out instead of listing its versions', () => {
    expect(cardOf(plan, 'desk')).toMatchObject({ missing: true, versions: [] });
    expect(plan.missing).toBe(true);
  });

  it('dates the drawing with the day of the scan, without the time', () => {
    expect(plan.stand).toBe('Scan vom 02.11.2026');
  });
});

describe('planSvg', () => {
  it('is one picture with its own size, dashed where a repo is not checked out', () => {
    const plan = landscapePlan(SNAPSHOT);
    const svg = planSvg(plan);

    expect(svg).toMatch(
      new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" width="${plan.width}" height="${plan.height}"`),
    );
    expect(svg).toContain('stroke-dasharray="4 3"');
    expect(svg).toContain('gestrichelt: nicht ausgecheckt');
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('says that the versions are those of the checkouts, not of PROD, and whom to ask', () => {
    const svg = planSvg(landscapePlan(SNAPSHOT));

    expect(svg).toContain('ob sie schon auf PROD laufen, sagt das Bild nicht');
    expect(svg).toContain('Quelle: Michael');
  });

  it('escapes what comes from the scan', () => {
    const plan = landscapePlan({
      ...SNAPSHOT,
      apps: SNAPSHOT.apps.map((each) =>
        each.id === 'api' ? { ...each, label: 'A&B <neu>', tech: ['Spring <Boot> 3'] } : each,
      ),
    });

    expect(planSvg(plan)).toContain('A&amp;B &lt;neu&gt;');
    expect(planSvg(plan)).toContain('Spring &lt;Boot&gt; 3');
  });
});
