import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { DIAGRAM_RENDERER, type DiagramRenderer, mermaidDrawings } from './diagrams';

const block = (source: string) => '```mermaid\n' + source + '\n```\n';

function fakeMermaid() {
  return {
    initialize: vi.fn(),
    parse: vi.fn(async (text: string) =>
      text.startsWith('flowchart') ? { diagramType: 'flowchart' } : false,
    ),
    render: vi.fn(async (_id: string, text: string) => ({
      svg: `<svg width="100%" style="max-width: 1600px;"><text>${text}</text></svg>`,
      diagramType: 'flowchart',
    })),
  };
}

function setup(markdown: string) {
  const mermaid = fakeMermaid();
  const load = vi.fn(() => Promise.resolve(mermaid as unknown as DiagramRenderer));
  TestBed.configureTestingModule({ providers: [{ provide: DIAGRAM_RENDERER, useValue: load }] });
  const text = signal(markdown);
  const drawings = TestBed.runInInjectionContext(() => mermaidDrawings(text));
  const settle = () => TestBed.inject(ApplicationRef).whenStable();
  return { mermaid, load, text, drawings, settle };
}

describe('mermaidDrawings', () => {
  it('draws what mermaid can parse and leaves the rest without a drawing', async () => {
    const { drawings, settle } = setup(block('flowchart LR') + block('kein diagramm'));
    await settle();

    expect([...drawings().keys()]).toEqual(['flowchart LR']);
    expect(drawings().get('flowchart LR')).toContain('<text>flowchart LR</text>');
  });

  it('lets a wide drawing shrink with the pane only as far as its labels stay legible', async () => {
    const { drawings, settle } = setup(block('flowchart LR'));
    await settle();

    expect(drawings().get('flowchart LR')).toContain('min-width: 1100px');
  });

  it('does not load mermaid for a text without a diagram', async () => {
    const { load, drawings, settle } = setup('## Nur Text');
    await settle();

    expect(load).not.toHaveBeenCalled();
    expect(drawings().size).toBe(0);
  });

  it('draws a diagram once, however often the prose around it changes', async () => {
    const { mermaid, text, drawings, settle } = setup(block('flowchart LR'));
    await settle();

    text.set('Neuer Absatz\n\n' + block('flowchart LR'));
    await settle();
    text.set('Noch einer\n\n' + block('flowchart LR'));
    await settle();

    expect(mermaid.render).toHaveBeenCalledTimes(1);
    expect(drawings().has('flowchart LR')).toBe(true);
  });

  it('keeps the drawings so far while a changed diagram is drawn', async () => {
    const { mermaid, text, drawings, settle } = setup(block('flowchart LR'));
    await settle();
    expect(drawings().has('flowchart LR')).toBe(true);
    let finish: () => void = () => undefined;
    mermaid.render.mockImplementationOnce(
      (_id, source) =>
        new Promise(
          (resolve) => (finish = () => resolve({ svg: `<svg>${source}</svg>`, diagramType: 'flowchart' })),
        ),
    );

    text.set(block('flowchart LR') + block('flowchart TD'));
    TestBed.tick();
    await vi.waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
    expect([...drawings().keys()]).toEqual(['flowchart LR']);

    finish();
    await settle();
    expect([...drawings().keys()]).toEqual(['flowchart LR', 'flowchart TD']);
  });
});
