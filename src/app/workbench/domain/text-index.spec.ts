import { describe, expect, it } from 'vitest';

import { findMatches } from './find';
import { TextIndex } from './text-index';

const HTML =
  '<h2 id="start">Start</h2>\n<p>Ein <strong>fett</strong>er Satz.</p>\n<h2 id="ende">Ende</h2>\n<p>Letzter Satz</p>';

function live(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('TextIndex', () => {
  it('reads the text of the html and breaks the line between blocks', () => {
    expect(TextIndex.fromHtml(HTML).text).toBe('Start\n\n\nEin fetter Satz.\n\n\nEnde\n\n\nLetzter Satz');
  });

  it('names the heading a position belongs to', () => {
    const index = TextIndex.fromHtml(HTML);
    expect(index.headingAt(index.text.indexOf('fetter'))).toBe('Start');
    expect(index.headingAt(index.text.indexOf('Letzter'))).toBe('Ende');
  });

  it('turns matches into ranges of the live dom, also across inline elements', () => {
    const index = TextIndex.fromHtml(HTML);
    const ranges = index.ranges(live(HTML), findMatches(index.text, 'fetter'));
    expect(ranges.map((range) => range.toString())).toEqual(['fetter']);
  });

  it('marks nothing when the live dom does not match the html', () => {
    const index = TextIndex.fromHtml(HTML);
    expect(index.ranges(live('<p>anders</p>'), findMatches(index.text, 'satz'))).toEqual([]);
  });

  it('finds the labels of a drawn diagram, but not its stylesheet', () => {
    const html =
      '<div class="diagram"><svg><style>.label{fill:red}</style><text>Auftrag</text><text>label</text></svg></div>';
    const index = TextIndex.fromHtml(html);

    expect(index.text).toBe('Auftrag\nlabel');
    expect(index.ranges(live(html), findMatches(index.text, 'label')).map(String)).toEqual(['label']);
  });
});
