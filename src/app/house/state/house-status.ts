import { computed, DestroyRef, inject, Injectable, resource, signal } from '@angular/core';

import { archiveView } from '../../archive/domain/backup-rows';
import { ArchiveState } from '../../archive/state/archive-state';
import { GAMES, scoreNote } from '../../arcade/domain/round';
import { Highscores } from '../../arcade/state/highscores';
import { type Facts, MOVEMENT_STEPS, type WorkdayColumn } from '../../building/facts';
import { hoursWorked, nextHoliday, periods, WORKDAY_HOURS } from '../../calendar/domain/calendar';
import { Vacations } from '../../calendar/state/vacations';
import { deployView } from '../../deploy/domain/house-view';
import { DeployState } from '../../deploy/state/deploy-state';
import { libraryView } from '../../library/domain/shelves';
import { LibraryState } from '../../library/state/library-state';
import { DojoState } from '../../dojo/state/dojo-state';
import { isoWeek, todayIso } from '../../engine/days';
import type { Gauge, Note } from '../../engine/model';
import { noticesOf } from '../../engine/plan';
import { seasonOf } from '../../engine/season';
import { quieted, Seen, seeing } from '../../engine/seen';
import { stageView } from '../../stages/domain/house-view';
import { ClusterState } from '../../stages/state/cluster-state';
import { DatabaseState } from '../../stages/state/database-state';
import { Store } from '../../ui/store';
import { dockerView } from '../../workshop/domain/house-view';
import { usageView } from '../../roof/domain/usage';
import { UsageState } from '../../roof/state/usage-state';
import { mailNote } from '../../workshop/domain/mail-rows';
import { newsNote, securityNote } from '../../news/domain/advisories';
import { releasesNote } from '../../news/domain/releases';
import { BREATHING_NOTE } from '../../relax/domain/breathing';
import { lastDays, movementNote, shares } from '../../relax/domain/movement';
import { MovementState } from '../../relax/state/movement-state';
import { ReleasesState } from '../../news/state/releases-state';
import { SecurityState } from '../../news/state/security-state';
import { mapNote } from '../../workshop/domain/map-rows';
import { LandscapeState } from '../../workshop/state/landscape-state';
import { serverView } from '../../workshop/domain/server-rows';
import { DevServerState } from '../../workshop/state/dev-server-state';
import { DockerState } from '../../workshop/state/docker-state';
import { MailState } from '../../workshop/state/mail-state';
import { type Farewell, farewell } from '../domain/farewell';
import { Brand } from './brand';

const SEEN_PATH = 'haus/gesehen.json';

/** What the house says about its things until the features behind them have moved in from the cockpit. */
const DEMO_NOTES: ReadonlyMap<string, Note> = new Map([
  ['empfang/markdown', { text: 'Enter oder drunter hochspringen öffnet den Schreibtisch', tone: null }],
]);

const inDays = (days: number): string => (days === 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} Tagen`);

/** Polls bring new arrays of the same content: equal data stays the same object, or every room is redrawn. */
const sameData = <T>(a: T, b: T): boolean => JSON.stringify(a) === JSON.stringify(b);

/** What the house knows and shows: the notes of its things, the facts its rooms draw, the gauges of the pipe. */
@Injectable({ providedIn: 'root' })
export class HouseStatus {
  private readonly store = inject(Store);
  private readonly scores = inject(Highscores);
  private readonly dojo = inject(DojoState);
  private readonly vacations = inject(Vacations);
  private readonly cluster = inject(ClusterState);
  private readonly database = inject(DatabaseState);
  private readonly deploy = inject(DeployState);
  private readonly docker = inject(DockerState);
  private readonly mail = inject(MailState);
  private readonly devServers = inject(DevServerState);
  private readonly library = inject(LibraryState);
  private readonly archive = inject(ArchiveState);
  private readonly landscape = inject(LandscapeState);
  private readonly releases = inject(ReleasesState);
  private readonly security = inject(SecurityState);
  private readonly movement = inject(MovementState);
  private readonly usage = inject(UsageState);
  private readonly brand = inject(Brand);
  private readonly seenDoc = resource({ loader: () => this.store.read<Seen>(SEEN_PATH) });
  private readonly seen = computed<Seen>(() => (this.seenDoc.hasValue() ? this.seenDoc.value() : null) ?? {});
  private readonly day = signal(todayIso());
  readonly today = this.day.asReadonly();

  readonly periods = computed(() => periods(this.day(), this.vacations.list()));
  readonly holiday = computed(() => nextHoliday(this.day()));

  /** Read at the moment it is asked for: the hours worked go on even while nothing else changes. */
  farewell(): Farewell {
    return farewell({
      now: new Date(),
      movement: this.movement.today(),
      usage: this.usage.days(),
      vacations: this.vacations.list(),
    });
  }

  /** Minute by minute, for the days on the restart sign and the hours on the solar panels. */
  private readonly now = signal(Date.now());
  private readonly stages = computed(() =>
    stageView({
      tones: this.cluster.stageTones(),
      incidents: this.cluster.incidents(),
      targets: this.cluster.allForwardTargets(),
      running: this.cluster.runningForwards(),
      connections: this.database.connections(),
      now: this.now(),
    }),
  );
  private readonly deploys = computed(() => deployView(this.deploy.deploys(), this.deploy.releases()));
  private readonly chest = computed(() =>
    archiveView(this.archive.plan()?.entries ?? null, this.archive.lastRun(), this.now()),
  );
  private readonly meter = computed(() =>
    usageView(this.usage.days(), this.usage.error(), new Date(this.now())),
  );
  private readonly shelves = computed(() => libraryView(this.library.categories(), this.library.error()));
  private readonly servers = computed(() => serverView(this.devServers.servers(), this.devServers.error()));
  private readonly stacks = computed(() =>
    dockerView({ stacks: this.docker.stacks(), error: this.docker.error(), busy: this.docker.busy() }),
  );

  private readonly raw = signal<ReadonlyMap<string, Note>>(DEMO_NOTES);
  private readonly dojoNote = computed<Note>(() => ({ text: this.dojo.note(), tone: null }));
  /** Record and task of the day under every game of the break room. */
  private readonly gameNotes = computed(() =>
    GAMES.map((game): [string, Note] => [
      `pausenraum/${game}`,
      {
        text: scoreNote(game, this.scores.best(game), this.scores.target(game), this.scores.solved(game)),
        tone: null,
      },
    ]),
  );
  private readonly workdaysNote = computed<Note>(() => {
    const [quarter] = this.periods();
    const { name, days } = this.holiday();
    return {
      text: `${quarter.label}: noch ${quarter.workdays.left} Tage netto · ${name} ${inDays(days)}`,
      tone: null,
    };
  });
  /** Every note as its source says it, before what was seen quiets it. */
  private readonly told = computed(
    () =>
      new Map([
        ...this.raw(),
        ...this.stages().notes,
        ...this.deploys().notes,
        ['werkstatt/container', this.stacks().note],
        ['werkstatt/postfach', mailNote(this.mail.mails(), this.mail.error())],
        ['werkstatt/devserver', this.servers().note],
        ['werkstatt/landkarte', mapNote(this.landscape.snapshot(), this.landscape.error(), this.now())],
        [
          'empfang/nachrichten',
          newsNote(
            securityNote(this.security.fresh(), this.security.visitedOn(this.day()), this.security.error()),
            releasesNote(this.releases.issues(), this.releases.error()),
          ),
        ],
        ['bibliothek/vault', this.shelves().note],
        ['dachboden/backup', this.chest().note],
        ['dachboden/verbrauch', this.meter().note],
        ['dachterrasse/atmen', BREATHING_NOTE],
        ['dachterrasse/kilometerstand', movementNote(this.movement.today())],
        ['bibliothek/dojo', this.dojoNote()],
        ...this.gameNotes(),
        ['empfang/arbeitstage', this.workdaysNote()],
      ]),
  );
  /** By `<room id>/<thing id>`. A note of something new that was jumped at has lost its tone. */
  readonly notes = computed(() => quieted(this.told(), this.seen()));
  readonly notices = computed(() => noticesOf(this.notes()));
  /** The line in the island while nothing calls for attention. */
  readonly calm = computed(() => `KW ${isoWeek(this.day())} · alles ruhig`);
  /** What a sheet is loading or working on right now. */
  readonly working = signal<string | null>(null);
  /** What takes over the island with a running bar: a sheet's work, or a setup run that goes on in the background. */
  readonly activity = computed(() => this.working() ?? this.stacks().activity);

  readonly facts = computed<Facts>(
    () => {
      const today = this.day();
      const workdays = this.periods().map(({ label, share, workdays }): WorkdayColumn => ({
        label,
        share,
        ...workdays,
      }));
      return {
        live: this.stacks().live,
        alarm: this.stacks().alarm,
        record: this.scores.best('stapler'),
        scores: GAMES.map((game) => ({
          game,
          best: this.scores.best(game),
          solved: this.scores.solved(game),
        })),
        mails: this.mail.mails()?.length ?? 0,
        week: isoWeek(today),
        workdays,
        keys: this.stages().keys,
        servers: this.servers().servers,
        dojo: this.dojo.share(),
        envs: this.stages().envs,
        forwards: this.stages().forwards,
        databases: this.stages().databases,
        trains: this.deploys().trains,
        books: this.shelves().books,
        inbox: this.shelves().inbox,
        backedUp: this.chest().backedUp,
        flows: this.chest().flows,
        usage: this.meter().share,
        // Rounded to what the board can draw, so a walk does not build the rooms anew every second.
        movement: shares(lastDays(this.movement.log(), today, 7)).map(
          (share) => Math.round(share * MOVEMENT_STEPS) / MOVEMENT_STEPS,
        ),
        solar: hoursWorked(new Date(this.now())) / WORKDAY_HOURS,
        season: seasonOf(today),
        brand: this.brand.name(),
      };
    },
    { equal: sameData },
  );

  readonly gauges = computed<Gauge[]>(
    () => {
      const [quarter, year] = this.periods();
      const { days } = this.holiday();
      const { prodCalm } = this.stages();
      return [
        { label: 'Meldungen', value: String(this.notices().length) },
        { label: quarter.label, value: `${quarter.workdays.left} AT`, share: quarter.share },
        { label: year.label, value: `${year.workdays.left} AT`, share: year.share },
        { label: 'Feiertag', value: days === 0 ? 'heute' : `${days} T` },
        { label: 'PROD ruhig', value: prodCalm === null ? '--' : `${prodCalm} T` },
      ];
    },
    { equal: sameData },
  );

  constructor() {
    const timer = setInterval(() => {
      this.day.set(todayIso());
      this.now.set(Date.now());
    }, 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** A jump at a thing: a note of something new there counts as seen. True if there was one. */
  async see(key: string): Promise<boolean> {
    if (this.notes().get(key)?.tone !== 'info') return false;
    const seen = seeing(this.seen(), this.told(), key);
    await this.store.write(SEEN_PATH, seen);
    this.seenDoc.set(seen);
    return true;
  }

  /** Puts a note on a thing, or takes it off with null. */
  note(key: string, note: Note | null): void {
    this.raw.update((notes) => {
      const next = new Map(notes);
      if (note) next.set(key, note);
      else next.delete(key);
      return next;
    });
  }
}
