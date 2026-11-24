import {
  afterRenderEffect,
  computed,
  DestroyRef,
  inject,
  linkedSignal,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';

import { findMatches } from '../domain/find';
import { TextIndex } from '../domain/text-index';

const ALL = 'lw-find';
const CURRENT = 'lw-find-current';
const HIGHLIGHTS = typeof CSS !== 'undefined' && 'highlights' in CSS;

interface HtmlFinder {
  query: WritableSignal<string>;
  /** How many matches there are. */
  total: Signal<number>;
  active: WritableSignal<number>;
}

// Only scrolls when the match is out of sight, so stepping through matches on one screen keeps the page still.
function reveal(range: Range): void {
  const scroller = range.startContainer.parentElement?.closest('.wb-body');
  if (!scroller) return;
  const match = range.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  const hidden = match.top < view.top + view.height / 6 || match.bottom > view.bottom - view.height / 6;
  if (hidden) scroller.scrollBy({ top: match.top - view.top - view.height / 3 });
}

// Call from a field initializer: it needs the injection context for its render effect.
export function htmlFinder(html: () => string, content: () => HTMLElement | undefined): HtmlFinder {
  const query = signal('');
  // Built only while there is something to look for: a preview that changes as it is typed needs none.
  const index = computed(() => (query() ? TextIndex.fromHtml(html()) : null));
  const matches = computed(() => {
    const found = index();
    return found ? findMatches(found.text, query()) : [];
  });
  const total = computed(() => matches().length);
  const active = linkedSignal({ source: matches, computation: () => 0 });

  // The CSS Highlight API marks the matches without touching the DOM Angular rendered.
  afterRenderEffect(() => {
    const root = content();
    const found = index();
    const ranges = root && found ? found.ranges(root, matches()) : [];
    const current = ranges[active()];
    if (HIGHLIGHTS) {
      CSS.highlights.set(ALL, new Highlight(...ranges));
      CSS.highlights.set(CURRENT, current ? new Highlight(current) : new Highlight());
    }
    if (current) reveal(current);
  });
  inject(DestroyRef).onDestroy(() => {
    if (!HIGHLIGHTS) return;
    CSS.highlights.delete(ALL);
    CSS.highlights.delete(CURRENT);
  });

  return { query, total, active };
}
