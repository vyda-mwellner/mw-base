import { DestroyRef, Injectable, signal } from '@angular/core';

import type { Tool } from '../engine/model';

/**
 * What a button in a report does, by its `data-action`, with the `data-*` values of the button. `copy` needs
 * none: it copies the text block it stands next to.
 */
type ReportActions = Readonly<Record<string, (data: DOMStringMap) => void>>;

/** A choice of a report to turn without leaving it, such as the weeks a query looks back: `pick` runs it again. */
export interface Dial {
  readonly label: string;
  readonly options: readonly string[];
  readonly value: string;
  readonly pick: (value: string) => void;
}

interface Fact {
  readonly label: string;
  readonly value: string;
}

/** A note to read: Markdown with figures above it, and what a link in it to another note does. */
interface NotePage {
  readonly kind: 'note';
  readonly title: string;
  readonly markdown: string;
  readonly facts: readonly Fact[];
  readonly follow: (href: string) => void;
}

/** A drawing the app made, to look at and to copy as a picture. */
interface PicturePage {
  readonly kind: 'picture';
  readonly title: string;
  /** A whole SVG the app built itself, with its own size and nothing it loads from outside. */
  readonly svg: string;
}

/** What lies open on the workbench: a report the app built, a note, a drawing, or one of its tools. */
type DeskPage =
  | {
      readonly kind: 'report';
      readonly title: string;
      readonly body: string;
      readonly actions: ReportActions;
      readonly dials: readonly Dial[];
    }
  | NotePage
  | PicturePage
  | { readonly kind: Tool };

/** What the house hands on to the desk on screen: Escape out of a field, W and S through its stops. */
export interface DeskKeys {
  leaveField(): void;
  walk(event: KeyboardEvent): void;
}

/** What is too wide for the panel opens on the workbench, a layer over the whole window. The house closes it with Escape. */
@Injectable({ providedIn: 'root' })
export class Workbench {
  readonly desk = signal<DeskPage | null>(null);
  private readonly onScreen = signal<DeskKeys | null>(null);
  /** The desk on screen, null while none is. It loads on first use, so the house reaches it through here. */
  readonly keys = this.onScreen.asReadonly();

  /** Called by the desk as it appears; it is let go again with the desk. */
  attach(keys: DeskKeys, until: DestroyRef): void {
    this.onScreen.set(keys);
    until.onDestroy(() => this.onScreen.update((current) => (current === keys ? null : current)));
  }

  /** `body` is HTML the app built itself; values in it go through `escapeHtml`. */
  report(
    title: string,
    body: string,
    actions: ReportActions = {},
    dials: readonly Dial[] = [],
  ): Promise<void> {
    this.desk.set({ kind: 'report', title, body, actions, dials });
    return Promise.resolve();
  }

  note(page: Omit<NotePage, 'kind'>): Promise<void> {
    this.desk.set({ kind: 'note', ...page });
    return Promise.resolve();
  }

  picture(title: string, svg: string): Promise<void> {
    this.desk.set({ kind: 'picture', title, svg });
    return Promise.resolve();
  }

  tool(view: Tool): Promise<void> {
    this.desk.set({ kind: view });
    return Promise.resolve();
  }

  close(): void {
    this.desk.set(null);
  }
}
