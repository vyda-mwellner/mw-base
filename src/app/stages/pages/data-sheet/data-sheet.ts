import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';

import { CLOCK } from '../../../core/format';
import { Brand } from '../../../house/state/brand';
import { HouseStatus } from '../../../house/state/house-status';
import { arm } from '../../../ui/key-walk/key-walk';
import { copySvgAsPng } from '../../../ui/png';
import { injectSheetKeys } from '../../../ui/sheet-keys';
import { injectTask } from '../../../ui/task';
import { Workbench, type Dial } from '../../../workbench/workbench';
import { chartPicture, queryReport } from '../../domain/reports';
import type { LinkTargets, ParamValues, QueryDefinition } from '../../model/database';
import { DatabaseState, Run } from '../../state/database-state';

/** A choice has its first option to start with; a typed param has nothing until someone types it. */
const needsInput = (query: QueryDefinition): boolean => query.params.some((param) => param.kind !== 'choice');
const capitalized = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

/**
 * The predefined queries: a connection, its password while it is locked, then Enter on a query runs it and lays the
 * result on the workbench, where its choices turn. A query that needs typing opens its field under its row first.
 */
@Component({
  templateUrl: './data-sheet.html',
  styleUrl: './data-sheet.scss',
})
export class DataSheet {
  private readonly database = inject(DatabaseState);
  private readonly status = inject(HouseStatus);
  private readonly brand = inject(Brand);
  private readonly workbench = inject(Workbench);
  private readonly task = injectTask();
  // Its own task: a copy while the next query of a dial runs would be dropped by the shared one.
  private readonly copying = injectTask();
  private readonly injector = inject(Injector);
  private readonly passwordField = viewChild<ElementRef<HTMLInputElement>>('passwordField');
  private readonly inputs = viewChild<ElementRef<HTMLElement>>('inputs');

  protected readonly password = signal('');
  /** The query whose field is open under its row. */
  protected readonly entering = signal<string | null>(null);
  protected readonly busy = this.task.busy;
  protected readonly configError = this.database.configError;
  protected readonly loading = this.database.isLoadingDefinitions;
  protected readonly running = this.database.isRunning;
  protected readonly connections = computed(() =>
    this.database.connections().map((connection) => ({
      id: connection.id,
      label: connection.locked ? `${connection.label} (gesperrt)` : connection.label,
    })),
  );
  protected readonly connection = this.database.selectedConnection;
  protected readonly connectionNote = computed(() => {
    const connection = this.connection();
    if (!connection) return '';
    const where = `${connection.user}@${connection.host}:${connection.port}/${connection.database}`;
    if (!connection.requiresPassword) return where;
    if (connection.locked) return `${where} · gesperrt`;
    return `${where} · offen bis ${CLOCK.format(connection.unlockedUntil ?? 0)}`;
  });
  protected readonly locked = computed(() => this.connection()?.locked ?? false);
  protected readonly canLock = computed(() => {
    const connection = this.connection();
    return !!connection && connection.requiresPassword && !connection.locked;
  });
  protected readonly areas = computed(() =>
    this.database.areas().map((area) => ({
      name: area.name,
      queries: area.queries.map((query) => ({
        query,
        note: query.description ?? `${query.sections.length} Abschnitte`,
        input: needsInput(query),
        open: query.id === this.entering(),
      })),
    })),
  );
  protected readonly fields = computed(() =>
    (this.database.selectedQuery()?.params ?? [])
      .filter((param) => param.kind !== 'choice')
      .map((param) => ({ param, value: this.database.params()[param.name] ?? '' })),
  );
  protected readonly last = computed(() => {
    const run = this.database.last();
    return run ? `${CLOCK.format(run.ranAt)}` : null;
  });

  /** The first query of the connection that declares a param is the one a linked cell of that param opens. */
  private readonly linkTargets = computed(() => {
    const targets: Record<string, string> = {};
    for (const query of this.database.areas().flatMap((area) => area.queries))
      for (const param of query.params) targets[param.name] ??= query.title;
    return targets as LinkTargets;
  });

  constructor() {
    injectSheetKeys(() => [
      { keys: ['Q'], label: 'Verbindung' },
      ...(this.locked() ? [{ keys: ['E'], label: 'Passwort' }] : []),
      ...(this.canLock() ? [{ keys: ['L'], label: 'Sperren' }] : []),
      ...(this.last() ? [{ keys: ['F'], label: 'Letztes Ergebnis' }] : []),
    ]);
  }

  protected selectConnection(id: string): void {
    this.database.selectConnection(id);
    this.password.set('');
    this.entering.set(null);
  }

  protected unlock(): Promise<void> {
    const connection = this.connection();
    if (!connection) return Promise.resolve();
    return this.task.run(async () => {
      await this.database.unlock(connection.id, this.password());
      this.password.set('');
      return `${connection.label} entsperrt`;
    });
  }

  protected lock(): Promise<void> {
    const connection = this.connection();
    if (!connection) return Promise.resolve();
    return this.task.run(async () => {
      await this.database.lock(connection.id);
      return `${connection.label} gesperrt`;
    });
  }

  /** Enter on a query: it runs at once, or its field opens first. While locked, the password comes first. */
  protected pick(query: QueryDefinition): Promise<void> {
    if (this.locked()) {
      this.focus(this.passwordField()?.nativeElement);
      return Promise.resolve();
    }
    this.database.selectQuery(query.id);
    if (!needsInput(query)) {
      this.entering.set(null);
      return this.run();
    }
    this.entering.set(query.id);
    afterNextRender(() => this.focus(this.inputs()?.nativeElement.querySelector('input')), {
      injector: this.injector,
    });
    return Promise.resolve();
  }

  protected change(name: string, value: string): void {
    this.database.changeParam(name, value);
  }

  protected run(): Promise<void> {
    return this.task.run(async () => {
      const query = this.database.selectedQuery();
      this.status.working.set(`${query?.title ?? 'Abfrage'} läuft`);
      try {
        const run = await this.database.runSelectedQuery();
        this.entering.set(null);
        await this.show(run);
      } finally {
        this.status.working.set(null);
      }
    });
  }

  protected showLast(): Promise<void> {
    const run = this.database.last();
    return run ? this.show(run) : Promise.resolve();
  }

  private focus(field: HTMLInputElement | null | undefined): void {
    if (!field) return;
    field.focus();
    arm(field);
    field.select();
  }

  private follow(param: string | undefined, value: string | undefined): void {
    const query = this.database
      .areas()
      .flatMap((area) => area.queries)
      .find((each) => each.params.some((declared) => declared.name === param));
    if (!query || !param || value === undefined) return;
    this.database.selectQuery(query.id);
    this.database.changeParam(param, value);
    void this.run();
  }

  /** The same query again with another value of one of its choices, on the connection it ran on. */
  private turn(run: Run, name: string, value: string): void {
    if (this.running()) return;
    this.database.selectConnection(run.request.connectionId);
    this.database.selectQuery(run.request.queryId);
    this.database.changeParam(name, value);
    // The dial moves at once; the result it belongs to follows when the database has answered.
    void this.show(run, { ...run.request.params, [name]: value });
    void this.run();
  }

  private show(run: Run, chosen: ParamValues = run.request.params): Promise<void> {
    const query = this.database
      .areas()
      .flatMap((area) => area.queries)
      .find((each) => each.id === run.request.queryId);
    const connection =
      this.database.connections().find((each) => each.id === run.request.connectionId)?.label ??
      run.request.connectionId;
    if (!query) return Promise.resolve();
    const dials: Dial[] = query.params
      .filter((param) => param.kind === 'choice')
      .map((param) => ({
        label: capitalized(param.name),
        options: param.options,
        value: chosen[param.name] ?? param.options[0] ?? '',
        pick: (option) => this.turn(run, param.name, option),
      }));
    return this.workbench.report(
      query.title,
      queryReport(query, connection, run.results, run.ranAt, run.request.params, this.linkTargets()),
      {
        link: (data) => this.follow(data['param'], data['value']),
        png: (data) =>
          void this.copyChart(
            chartPicture(query, Number(data['section']), {
              results: run.results,
              connection,
              ranAt: run.ranAt,
              params: run.request.params,
              brand: { name: this.brand.name(), colors: this.brand.colors(), logo: this.brand.logo() },
            }),
          ),
      },
      dials,
    );
  }

  private copyChart(svg: string | null): Promise<void> {
    if (!svg) return Promise.resolve();
    return this.copying.run(async () => {
      await copySvgAsPng(svg);
      return 'Diagramm als Bild kopiert';
    });
  }
}
