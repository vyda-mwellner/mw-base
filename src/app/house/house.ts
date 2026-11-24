import { NgTemplateOutlet } from '@angular/common';
import {
  afterEveryRender,
  afterRenderEffect,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { invoke, isTauri } from '@tauri-apps/api/core';

import type { Notice, Place, Room, Thing, Tool } from '../engine/model';
import { spotOf, thingKey, thingNear, walkMax } from '../engine/plan';
import { cuesOf, inYard, isOutside, liftLoad } from '../engine/walk';
import { BuildingScene, OWN_CAR } from '../scene/building-scene/building-scene';
import { Island } from '../scene/island/island';
import { arm, enterAt, isArmed, keyOf, KeyWalk, writes } from '../ui/key-walk/key-walk';
import { KeyHint, SheetKeys } from '../ui/sheet-keys';
import { Sound } from '../ui/sound';
import { injectTask } from '../ui/task';
import { ToastStack } from '../ui/toast-stack/toast-stack';
import { MovementState } from '../relax/state/movement-state';
import { Toasts } from '../ui/toasts';
import { WorkbenchDesk } from '../workbench/organisms/desk/desk';
import { Workbench } from '../workbench/workbench';
import GUIDE from './guide.md';
import { Daylight } from './state/daylight';
import { Figure } from './state/figure';
import { HouseStatus } from './state/house-status';
import { BACK, RoomMenu } from './state/room-menu';
import { Settings } from './state/settings';
import { Weather } from './state/weather';
import { Whereabouts } from './state/whereabouts';

const PICK_KEYS: KeyHint = { keys: ['W', 'S'], label: 'wählen' };
const ROOM_KEYS: readonly KeyHint[] = [
  PICK_KEYS,
  { keys: ['Enter'], label: 'öffnen' },
  { keys: ['Q'], label: 'Meldungen' },
];
/** Befehl, on the workbench from wherever no field or game has the keys. */
const COMMAND_KEY: KeyHint = { keys: ['B'], label: 'Befehl' };
/** The guide to the house, on the workbench from wherever B works. */
const INFO_KEY: KeyHint = { keys: ['I'], label: 'Info' };
/** What works wherever the figure can walk: in the house and in a room. */
const WALKING_KEYS: readonly KeyHint[] = [
  { keys: ['A', 'D'], label: 'laufen' },
  { keys: ['Leertaste'], label: 'springen' },
  { keys: ['T'], label: 'Ton' },
  COMMAND_KEY,
  INFO_KEY,
];
const SCROLL_KEYS: KeyHint = { keys: ['↑', '↓'], label: 'blättern' };
const DESK_KEYS: readonly KeyHint[] = [
  { keys: ['⌘', 'F'], label: 'suchen' },
  SCROLL_KEYS,
  { keys: ['Esc'], label: 'zurück' },
];
/** A report or a note has buttons and links to walk to. */
const WALKED_DESK_KEYS: readonly KeyHint[] = [PICK_KEYS, ...DESK_KEYS];
/** The list of notices under the island: a way to any of them. */
const NOTICE_KEYS: readonly KeyHint[] = [
  PICK_KEYS,
  { keys: ['Enter'], label: 'hingehen' },
  { keys: ['Esc', 'Q'], label: 'schließen' },
];
const MARKDOWN_KEYS: readonly KeyHint[] = [{ keys: ['Q'], label: 'einfügen' }, PICK_KEYS, ...DESK_KEYS];
const NOTICES_KEY: KeyHint = { keys: ['Q'], label: 'Meldungen' };
const FAREWELL_KEY: KeyHint = { keys: ['Enter'], label: 'Feierabend' };
const PICTURE_KEYS: readonly KeyHint[] = [
  { keys: ['Q'], label: 'als Bild kopieren' },
  SCROLL_KEYS,
  { keys: ['Esc'], label: 'zurück' },
];
const FIELD_KEYS: readonly KeyHint[] = [{ keys: ['Esc'], label: 'fertig' }];
const COMMAND_DESK_KEYS: readonly KeyHint[] = [
  { keys: ['Enter'], label: 'ausführen' },
  { keys: ['Esc'], label: 'zurück' },
];
const TOOL_TITLES: Readonly<Record<Tool, string>> = {
  markdown: 'Markdown',
  befehl: 'Befehl',
  feierabend: 'Feierabend',
};
const CHANGE_KEYS: KeyHint = { keys: ['A', 'D'], label: 'ändern' };
const WALK_KEYS: Readonly<Record<string, 1 | -1>> = { a: -1, d: 1 };
/** Esc this often in the house, each press within `QUIT_GAP` ms of the last, quits the app. */
const QUIT_PRESSES = 4;
const QUIT_GAP = 1000;

const within = (target: EventTarget | null, selector: string): boolean =>
  target instanceof Element && target.closest(selector) !== null;

/** The device: the island on top, the building under it, and the sheet of whatever is open. */
@Component({
  imports: [NgTemplateOutlet, RouterOutlet, BuildingScene, Island, ToastStack, WorkbenchDesk],
  templateUrl: './house.html',
  styleUrl: './house.scss',
  host: {
    '(document:keydown)': 'keyDown($event)',
    '(document:keyup)': 'keyUp($event)',
    '(document:focusin)': 'focusMoved()',
    '(document:focusout)': 'focusMoved()',
    '(document:pointerdown)': 'pointed($event)',
  },
})
export class House {
  private readonly router = inject(Router);
  protected readonly figure = inject(Figure);
  protected readonly status = inject(HouseStatus);
  protected readonly daylight = inject(Daylight);
  protected readonly weather = inject(Weather);
  protected readonly settings = inject(Settings);
  private readonly sound = inject(Sound);
  private readonly keyHints = inject(SheetKeys);
  private readonly task = injectTask();
  protected readonly workbench = inject(Workbench);
  private readonly toasts = inject(Toasts);
  private readonly movement = inject(MovementState);

  protected readonly menu = inject(RoomMenu);
  protected readonly place = inject(Whereabouts).place;
  private readonly sheet = viewChild<ElementRef<HTMLElement>>('sheet');
  private sheetKeys = new KeyWalk();
  /** Where the cursor stood in each sheet when it was closed, by the URL of the sheet. */
  private readonly cursors = new Map<string, number>();
  private sheetUrl = '';
  private escapes = 0;
  private lastEscape = -Infinity;
  /** An Esc counts once it has been let go: whatever comes while it is held, marked as a repeat or not, is no press. */
  private escapeHeld = false;

  protected readonly noticesOpen = signal(false);
  /** The notice the cursor is on while the list is open. */
  protected readonly noticeAt = signal(0);
  protected readonly popped = signal<{ readonly key: string; readonly count: number } | null>(null);
  private readonly focused = signal<Element | null>(null);
  /** The focused field is open: the keys are its own. */
  private readonly armed = signal(false);
  private readonly enterDoes = computed(() => (this.armed(), enterAt(this.focused())));
  /** What Enter does in a form: what its `data-enter` says, saving where it says nothing. */
  private readonly sendLabel = computed(
    () => this.focused()?.closest<HTMLElement>('form')?.dataset['enter'] ?? 'speichern',
  );
  private readonly noticesShown = computed(() => this.noticesOpen() && this.status.notices().length > 0);

  /** The open thing takes the whole window instead of the strip under the room. */
  protected readonly full = computed(() => this.place().thing?.full === true);

  /** At the top what the open thing does, in a room what is in it. */
  protected readonly head = computed(() => {
    const { room, thing } = this.place();
    if (!thing) return { title: room?.label ?? '', keys: ROOM_KEYS };
    if (this.keyHints.own()) return { title: thing.label, keys: [] };
    return {
      title: thing.label,
      keys: [
        ...this.keyHints.hints(),
        ...(this.enterDoes() === 'send' ? [{ keys: ['Enter'], label: this.sendLabel() }] : []),
      ],
    };
  });

  /** What lies open on the workbench, for the island; null while it is put away. */
  protected readonly deskTitle = computed(() => {
    const page = this.workbench.desk();
    if (!page) return null;
    return `Schreibtisch · ${'title' in page ? page.title : TOOL_TITLES[page.kind]}`;
  });

  /** In the house Q joins the keys while there are notices, Enter while the figure stands at the car. */
  private readonly houseKeys = computed((): readonly KeyHint[] => [
    WALKING_KEYS[0],
    WALKING_KEYS[1],
    ...(this.atCar() ? [FAREWELL_KEY] : []),
    ...(this.status.notices().length > 0 ? [NOTICES_KEY] : []),
    ...WALKING_KEYS.slice(2),
  ]);

  /** At the bottom how to get about: walking in house and room, the cursor in an open thing. */
  protected readonly baseKeys = computed(() => {
    const desk = this.workbench.desk();
    if (desk?.kind === 'befehl') return COMMAND_DESK_KEYS;
    if (desk && writes(this.focused())) return FIELD_KEYS;
    if (desk?.kind === 'picture') return PICTURE_KEYS;
    if (desk?.kind === 'feierabend') return this.farewellKeys();
    if (desk?.kind === 'report' && desk.dials.length > 0)
      return [{ keys: ['A', 'D'], label: desk.dials[0].label }, ...WALKED_DESK_KEYS];
    if (desk) return desk.kind === 'markdown' ? MARKDOWN_KEYS : WALKED_DESK_KEYS;
    if (this.noticesShown()) return NOTICE_KEYS;
    if (!this.place().room) return this.houseKeys();
    if (!this.place().thing) return WALKING_KEYS;
    // A sheet that takes every key, the dojo, has its own keys down here: they are how to get about in it.
    if (this.keyHints.own()) return this.keyHints.hints();
    if (this.game()) return [];
    if (this.armed())
      return [{ keys: this.enterDoes() === 'close' ? ['Enter', 'Esc'] : ['Esc'], label: 'fertig' }];
    const at = this.focused();
    return [
      PICK_KEYS,
      SCROLL_KEYS,
      ...(at?.matches('select') ? [CHANGE_KEYS] : []),
      ...(this.enterDoes() === 'open'
        ? [{ keys: ['Enter'], label: writes(at) ? 'schreiben' : 'ändern' }]
        : []),
      COMMAND_KEY,
      INFO_KEY,
    ];
  });
  /** On a button Enter presses it, anywhere else on Feierabend it drives off. */
  private readonly farewellKeys = computed((): readonly KeyHint[] => [
    { keys: ['Enter'], label: this.focused()?.matches('button') ? 'drücken' : 'losfahren' },
    PICK_KEYS,
    { keys: ['Esc'], label: 'zurück' },
  ]);
  /** A sheet that names W, a game, has taken the keys for itself. */
  private readonly game = computed(() => this.keyHints.hints().some((hint) => hint.keys.includes('W')));
  /** The dojo keeps Escape for Vim: the close button names the key that does leave it. */
  protected readonly closeKey = computed(() => (this.keyHints.own() ? '⌃Q' : 'Esc'));

  protected readonly tones = computed(
    () => new Map(this.status.notices().map((notice) => [thingKey(notice.room, notice.thing), notice.tone])),
  );

  private readonly outdoors = computed(() => isOutside(this.figure.pose()));
  private readonly atCar = computed(() => {
    const pose = this.figure.pose();
    return inYard(pose) && pose.x >= OWN_CAR.from && pose.x <= OWN_CAR.to;
  });

  /** A walking key is held down: the figure goes where the keys say, not where the URL points. */
  private striding = false;

  constructor() {
    // The figure walks frame by frame outside of any signal graph; the URL only tells it where to.
    let shown = this.place();
    effect(() => {
      const place = this.place();
      untracked(() => {
        this.follow(place);
        if (shown.thing) this.cursors.set(this.sheetUrl, this.sheetKeys.position);
        if (place.thing && place.thing !== shown.thing) this.sound.play('open');
        else if (!place.thing && shown.thing) this.sound.play('close');
        shown = place;
      });
    });
    // A notice that was not there before rings once.
    let raised = 0;
    effect(() => {
      const count = this.status.notices().length;
      untracked(() => {
        if (count > raised) this.sound.play('chime');
        raised = count;
      });
    });
    // What the figure does is heard: each new pose is compared with the one before.
    let before = this.figure.pose();
    effect(() => {
      const after = this.figure.pose();
      untracked(() => {
        for (const cue of cuesOf(before, after)) this.sound.play(cue);
        if (before.speed !== after.speed) this.sound.drive(liftLoad(after));
        if (before.rise > 0 && after.rise <= 0) this.reachUp();
        before = after;
      });
    });
    // A list left open while the last notice went would spring open by itself with the next one.
    effect(() => {
      if (this.status.notices().length === 0) untracked(() => this.noticesOpen.set(false));
    });
    effect(() => this.sound.mute(!this.settings.sound()));
    effect(() => this.sound.breeze(this.outdoors()));
    // Walking out of the room on screen leaves it: the view goes back to the whole house.
    effect(() => {
      const room = this.figure.room();
      untracked(() => {
        const shown = this.place().room;
        if (this.striding && shown && room !== shown) void this.router.navigate(['/']);
      });
    });
    // An open thing takes the keys: with the sheet focused, the arrow keys scroll it and walk into it.
    afterRenderEffect(() => {
      if (!this.place().thing) return;
      this.sheetUrl = this.router.url;
      this.sheetKeys = new KeyWalk(this.cursors.get(this.sheetUrl));
      this.sheet()?.nativeElement.focus({ preventScroll: true });
    });
    afterEveryRender(() => {
      const sheet = this.sheet()?.nativeElement;
      if (sheet && this.place().thing) this.sheetKeys.recover(sheet);
    });
  }

  protected toggleSound(): void {
    void this.task.run(async () => {
      await this.settings.toggleSound();
      return this.settings.sound() ? 'Ton an' : 'Ton aus';
    });
  }

  private enterRoom(room: Room): void {
    void this.router.navigate([room.id]);
  }

  /** A thing with a tool opens the workbench, the others open their sheet. */
  private openThing(thing: Thing): void {
    const room = this.place().room;
    if (thing.tool) this.openTool(thing.tool);
    else if (room) void this.router.navigate([room.id, thing.id]);
  }

  private openTool(tool: Tool): void {
    this.sound.play('open');
    void this.task.run(() => this.workbench.tool(tool));
  }

  private openGuide(): void {
    this.sound.play('open');
    void this.task.run(() =>
      this.workbench.note({ title: 'Hausführer', markdown: GUIDE, facts: [], follow: () => undefined }),
    );
  }

  /** Out of a page inside a thing one level up, out of a thing into its room, out of a room into the house. */
  protected back(): void {
    const { room, thing } = this.place();
    const path = this.router.url.split(/[?#]/, 1)[0].split('/').filter(Boolean).map(decodeURIComponent);
    void this.router.navigate(thing && room ? path.slice(0, Math.max(1, path.length - 1)) : ['/']);
  }

  protected keyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    // An error waits until it is seen: the first Escape puts it away, unless a field has the keys.
    if (event.key === 'Escape' && !isArmed(document.activeElement) && this.toasts.dismissError()) {
      event.preventDefault();
      return;
    }
    if (this.workbench.desk()) {
      this.deskKey(event);
      return;
    }
    if (this.noticesShown()) {
      this.noticeKey(event);
      return;
    }
    const place = this.place();
    const sheet = this.sheet()?.nativeElement;
    // Ahead of the sheet: a shut field under the cursor would take the letter for itself and do nothing with it.
    const letter = keyOf(event);
    if (
      (letter === 'b' || letter === 'i') &&
      !this.keyHints.own() &&
      !this.game() &&
      !isArmed(document.activeElement)
    ) {
      event.preventDefault();
      if (letter === 'b') this.openTool('befehl');
      else this.openGuide();
      return;
    }
    if (place.thing && sheet && this.walkSheet(event, sheet)) return;
    if (event.key === 'Escape') {
      if (place.room) {
        this.back();
        return;
      }
      if (this.escapeHeld) return;
      this.escapeHeld = true;
      const now = performance.now();
      this.escapes = now - this.lastEscape <= QUIT_GAP ? this.escapes + 1 : 1;
      this.lastEscape = now;
      if (this.escapes >= QUIT_PRESSES && isTauri()) void this.quit();
      return;
    }
    if (place.thing || within(event.target, 'input, select, textarea')) return;
    const key = keyOf(event);
    switch (key) {
      case 'a':
      case 'd':
        this.striding = true;
        this.figure.stride(WALK_KEYS[key]!, walkMax(this.figure.pose().level));
        break;
      case 'w':
      case 's':
        if (place.room) {
          this.menu.move(key === 's' ? 1 : -1);
          this.sound.play('tick');
        } else this.figure.ride(key === 's' ? -1 : 1);
        break;
      case ' ':
        if (within(event.target, 'button, a')) return;
        this.figure.jump();
        break;
      case 'Enter':
        if (within(event.target, 'button, a')) return;
        this.enter();
        break;
      case 'q':
        if (this.status.notices().length === 0) return;
        this.noticeAt.set(0);
        this.noticesOpen.set(true);
        this.sound.play('open');
        break;
      case 't':
        this.toggleSound();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  /** W and S move through the open list, Enter goes to the thing of a notice, Escape or Q closes it. */
  private noticeKey(event: KeyboardEvent): void {
    const key = keyOf(event);
    const notices = this.status.notices();
    if (key === 'Escape' || key === 'q') {
      this.noticesOpen.set(false);
      this.sound.play('close');
    } else if (key === 'w' || key === 's') {
      const step = key === 's' ? 1 : -1;
      this.noticeAt.update(
        (at) => (Math.min(at, notices.length - 1) + step + notices.length) % notices.length,
      );
      this.sound.play('tick');
    } else if (key === 'Enter') {
      const notice = notices[Math.min(this.noticeAt(), notices.length - 1)];
      if (notice) this.goToNotice(notice);
    } else {
      return;
    }
    event.preventDefault();
  }

  /** Straight to the thing a notice is about: the figure walks there while its sheet already opens. */
  protected goToNotice(notice: Notice): void {
    this.noticesOpen.set(false);
    if (notice.thing.tool) this.openTool(notice.thing.tool);
    else void this.router.navigate([notice.room.id, notice.thing.id]);
  }

  /** The workbench has the keys to itself: Escape leaves a field first, the next one puts it away. */
  private deskKey(event: KeyboardEvent): void {
    const kind = this.workbench.desk()?.kind;
    const key = keyOf(event);
    // Held down, the Enter that opened Feierabend would repeat into it and close the app at once.
    if (key === 'Enter' && kind === 'feierabend' && !event.repeat && !within(event.target, 'button')) {
      event.preventDefault();
      if (isTauri()) void this.quit();
      return;
    }
    const walks = kind === 'report' || kind === 'note' || kind === 'markdown' || kind === 'feierabend';
    if ((key === 'w' || key === 's') && walks) {
      this.workbench.keys()?.walk(event);
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    const at = document.activeElement;
    // Befehl has nothing beside its field to scroll to: Escape puts it away at once.
    const leave = this.workbench.desk()?.kind !== 'befehl';
    if (leave && at instanceof HTMLElement && at.matches('input, textarea, select')) {
      this.workbench.keys()?.leaveField();
      return;
    }
    this.workbench.close();
    this.sound.play('close');
    const sheet = this.sheet()?.nativeElement;
    if (sheet) this.sheetKeys.resume(sheet);
  }

  /** The steps of the last seconds are only kept in memory until the log is written. */
  private async quit(): Promise<void> {
    await this.movement.save();
    await invoke('quit');
  }

  /** A cursor that moved ticks, a value that turned blips. */
  private walkSheet(event: KeyboardEvent, sheet: HTMLElement): boolean {
    const at = document.activeElement;
    const value = at instanceof HTMLSelectElement ? at.selectedIndex : null;
    const used = this.sheetKeys.handle(event, sheet);
    const now = document.activeElement;
    if (now !== at) this.sound.play('tick');
    else if (now instanceof HTMLSelectElement && now.selectedIndex !== value) this.sound.play('blip');
    else if (isArmed(now) !== this.armed()) this.sound.play('blip');
    this.armed.set(isArmed(now));
    return used;
  }

  protected focusMoved(): void {
    this.focused.set(document.activeElement);
    this.armed.set(isArmed(document.activeElement));
  }

  /** A click into a field to type in opens it, as Enter would. */
  protected pointed(event: PointerEvent): void {
    if (event.target instanceof HTMLElement && writes(event.target) && !isArmed(event.target))
      arm(event.target);
  }

  protected keyUp(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.escapeHeld = false;
    if (!this.striding || !WALK_KEYS[keyOf(event)]) return;
    this.striding = false;
    this.figure.halt();
    this.menu.pickNear();
  }

  /** At the top of a jump: a tool opens, else a note of something new over it is seen and bursts. */
  private reachUp(): void {
    const room = this.figure.room();
    if (!room) return;
    const thing = thingNear(room, this.figure.pose().x);
    if (!thing) return;
    if (thing.tool) return this.openTool(thing.tool);
    const key = thingKey(room, thing);
    void this.status.see(key).then((seen) => {
      if (!seen) return;
      this.popped.update((last) => ({ key, count: (last?.count ?? 0) + 1 }));
      this.sound.play('pop');
    });
  }

  private enter(): void {
    const here = this.figure.room();
    const thing = this.menu.selectedThing();
    if (!this.place().room) {
      if (here) this.enterRoom(here);
      else if (this.atCar()) this.openTool('feierabend');
    } else if (thing) {
      this.openThing(thing);
    } else if (this.menu.selected() === BACK) {
      this.back();
    }
  }

  private follow(place: Place): void {
    const spot = spotOf(place);
    if (!spot) return;
    if (!place.thing && this.figure.room() === place.room) return;
    this.figure.goTo(spot);
  }
}
