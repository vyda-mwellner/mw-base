import { computed, inject, InjectionToken, linkedSignal, resource, type Signal } from '@angular/core';
import type { Mermaid } from 'mermaid';

import { mermaidSources } from '../domain/markdown';

export type DiagramRenderer = Pick<Mermaid, 'initialize' | 'parse' | 'render'>;

/** Only on the first diagram: mermaid and its layout engines are many times the size of the rest of the app. */
export const DIAGRAM_RENDERER = new InjectionToken<() => Promise<DiagramRenderer>>('DIAGRAM_RENDERER', {
  factory: () => () => import('mermaid').then((module) => module.default),
});

/** mermaid draws at 16 px and shrinks a wide diagram to the pane; below 11 px the labels are no longer legible. */
const MIN_SCALE = 11 / 16;
const NONE: ReadonlyMap<string, string> = new Map();

let renderCount = 0;

const sameSources = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((source, index) => source === b[index]);

/**
 * The drawings of the mermaid blocks in the markdown, by source. Each source is drawn once; until a new one is
 * drawn the drawings so far stay, so editing the prose around a diagram does not make it flicker. A source
 * mermaid cannot parse gets no drawing and stays a code block.
 *
 * Call from a field initializer: the resource needs the injection context.
 */
export function mermaidDrawings(markdown: () => string): Signal<ReadonlyMap<string, string>> {
  const load = inject(DIAGRAM_RENDERER);
  // null: mermaid cannot draw it
  const drawn = new Map<string, string | null>();
  const sources = computed(() => mermaidSources(markdown()), { equal: sameSources });

  const drawings = resource({
    params: () => (sources().length > 0 ? sources() : undefined),
    loader: async ({ params, abortSignal }) => {
      for (const source of drawn.keys()) if (!params.includes(source)) drawn.delete(source);
      const fresh = params.filter((source) => !drawn.has(source));
      if (fresh.length > 0) {
        const mermaid = await load();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: theme(),
        });
        for (const source of fresh) {
          if (abortSignal.aborted) break;
          drawn.set(source, await draw(mermaid, source));
        }
      }
      return new Map(params.flatMap((source) => (drawn.get(source) ? [[source, drawn.get(source)!]] : [])));
    },
  });

  return linkedSignal<ReadonlyMap<string, string> | undefined, ReadonlyMap<string, string>>({
    source: () => (drawings.hasValue() ? drawings.value() : undefined),
    computation: (latest, previous) => latest ?? previous?.value ?? NONE,
  });
}

async function draw(mermaid: DiagramRenderer, source: string): Promise<string | null> {
  try {
    if (!(await mermaid.parse(source, { suppressErrors: true }))) return null;
    const { svg } = await mermaid.render(`mermaid-${++renderCount}`, source);
    return legible(svg);
  } catch {
    return null;
  }
}

/** mermaid puts the drawn width into max-width; what does not fit at MIN_SCALE scrolls sideways. */
function legible(svg: string): string {
  const template = document.createElement('template');
  template.innerHTML = svg;
  const drawing = template.content.querySelector('svg');
  const width = parseFloat(drawing?.style.maxWidth ?? '');
  if (!drawing || !(width > 0)) return svg;
  drawing.style.minWidth = `${Math.round(width * MIN_SCALE)}px`;
  return template.innerHTML;
}

/** mermaid computes its shades from hex values and cannot read custom properties, so it gets the base tokens. */
function theme(): Record<string, string | boolean> {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    darkMode: true,
    background: token('--vl-card'),
    primaryColor: token('--gm-raised'),
    primaryTextColor: token('--vl-text'),
    primaryBorderColor: token('--gm-muted'),
    lineColor: token('--gm-muted'),
    textColor: token('--vl-text'),
    clusterBkg: token('--vl-page'),
    clusterBorder: token('--gm-frame'),
    edgeLabelBackground: token('--vl-card'),
    fontFamily: token('--vl-font-body'),
  };
}
