import type { TextMatch } from './find';

// `text` is a label in a drawn diagram.
const BLOCKS =
  'p, li, dt, dd, td, th, pre, blockquote, h1, h2, h3, h4, h5, h6, figcaption, summary, div, text';
const HEADINGS = 'h1, h2, h3, h4, h5, h6';

interface Span {
  start: number;
  length: number;
}

interface Heading {
  start: number;
  text: string;
  element: Element;
}

// The stylesheet mermaid puts into every diagram is no text to find.
function textNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.localName === 'style' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  return nodes;
}

/**
 * The plain text of rendered HTML, built from the HTML string so it is ready before the DOM is.
 * Setting the same string as innerHTML yields the same text nodes in the same order, which is
 * how a match finds its way back into the live DOM.
 */
export class TextIndex {
  private constructor(
    readonly text: string,
    private readonly spans: Span[],
    private readonly headings: Heading[],
  ) {}

  static fromHtml(html: string): TextIndex {
    const template = document.createElement('template');
    template.innerHTML = html;
    let text = '';
    const spans: Span[] = [];
    const headings: Heading[] = [];
    let block: Element | null | undefined;
    for (const node of textNodes(template.content)) {
      const parent = node.parentElement;
      const owner = parent?.closest(BLOCKS) ?? null;
      // A line break between blocks keeps a search from matching across two paragraphs.
      if (spans.length > 0 && owner !== block) text += '\n';
      block = owner;
      const heading = parent?.closest(HEADINGS);
      if (heading && headings.at(-1)?.element !== heading) {
        headings.push({ start: text.length, text: heading.textContent?.trim() ?? '', element: heading });
      }
      spans.push({ start: text.length, length: node.data.length });
      text += node.data;
    }
    return new TextIndex(text, spans, headings);
  }

  headingAt(offset: number): string | undefined {
    return this.headings.filter((heading) => heading.start <= offset).at(-1)?.text || undefined;
  }

  ranges(root: Node, matches: TextMatch[]): Range[] {
    const nodes = textNodes(root);
    if (nodes.length !== this.spans.length) return [];
    let span = 0;
    return matches.flatMap((match) => {
      while (span < this.spans.length && match.start >= this.spans[span]!.start + this.spans[span]!.length)
        span++;
      let last = span;
      while (last < this.spans.length && match.end > this.spans[last]!.start + this.spans[last]!.length)
        last++;
      if (last >= this.spans.length) return [];
      const range = document.createRange();
      range.setStart(nodes[span]!, match.start - this.spans[span]!.start);
      range.setEnd(nodes[last]!, match.end - this.spans[last]!.start);
      return [range];
    });
  }
}
