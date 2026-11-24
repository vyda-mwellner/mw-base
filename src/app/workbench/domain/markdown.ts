import { Marked, marked, MarkedToken, Tokens } from 'marked';

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/;
// GFM's tag filter plus base, embed, link, meta and object: raw HTML may stay, but not run code or restyle the app.
const FILTERED =
  /<(\/?)(base|embed|iframe|link|meta|noembed|noframes|object|plaintext|script|style|textarea|title|xmp)(?![a-z0-9-])/gi;
const DIAGRAM = /<div class="diagram" data-diagram="(\d+)"><\/div>/g;
const NO_DIAGRAMS: ReadonlyMap<string, string> = new Map();

const isMermaid = (token: Tokens.Code): boolean => token.lang?.split(/\s/)[0] === 'mermaid';

/**
 * Markdown as GitHub renders it, without its frontmatter. A mermaid block whose source has a drawing in
 * `diagrams` shows the drawing, any other stays a code block.
 */
export function renderMarkdown(markdown: string, diagrams = NO_DIAGRAMS): string {
  const drawings: string[] = [];
  const parser =
    diagrams.size === 0
      ? marked
      : new Marked({
          renderer: {
            code(token) {
              const drawing = isMermaid(token) ? diagrams.get(token.text) : undefined;
              if (drawing === undefined) return false;
              drawings.push(drawing);
              return `<div class="diagram" data-diagram="${drawings.length - 1}"></div>`;
            },
          },
        });
  const html = parser.parse(markdown.replace(FRONTMATTER, ''), { gfm: true, async: false }) as string;
  // The drawings go in after the filter: mermaid styles every one of them with a <style> of its own.
  return html.replace(FILTERED, '&lt;$1$2').replace(DIAGRAM, (tag, index: string) => {
    const drawing = drawings[+index];
    return drawing === undefined ? tag : `<div class="diagram">${drawing}</div>`;
  });
}

/** The sources of the mermaid blocks, each once, in the order they appear. */
export function mermaidSources(markdown: string): string[] {
  const sources = new Set<string>();
  marked.walkTokens(lex(markdown), (generic) => {
    const token = generic as MarkedToken;
    if (token.type === 'code' && isMermaid(token)) sources.add(token.text);
  });
  return [...sources];
}

interface MarkdownStats {
  readonly lines: number;
  /** Second level headings at the top level, the chapters a table of contents would list. */
  readonly sections: number;
  /** Prose only: code blocks and link targets are left out. */
  readonly words: number;
  readonly readingMinutes: number;
  readonly tasks: number;
  readonly doneTasks: number;
}

const WORD = /[\p{L}\p{N}]+(?:['\u2019-][\p{L}\p{N}]+)*/gu;
const WORDS_PER_MINUTE = 222;

/** Counted on the tokens, so a "## " inside a code block is no section and an underlined heading is one. */
export function measureMarkdown(markdown: string): MarkdownStats {
  const tokens = lex(markdown);
  let words = 0;
  let tasks = 0;
  let doneTasks = 0;
  marked.walkTokens(tokens, (generic) => {
    const token = generic as MarkedToken;
    if ((token.type === 'text' && !token.tokens) || token.type === 'codespan') {
      words += token.text.match(WORD)?.length ?? 0;
    } else if (token.type === 'list_item' && token.task) {
      tasks++;
      doneTasks += token.checked ? 1 : 0;
    }
  });
  return {
    lines: markdown === '' ? 0 : markdown.replace(/\r?\n$/, '').split(/\r?\n/).length,
    sections: tokens.filter((token) => token.type === 'heading' && token.depth === 2).length,
    words,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)),
    tasks,
    doneTasks,
  };
}

function lex(markdown: string): MarkedToken[] {
  return marked.lexer(markdown.replace(FRONTMATTER, ''), { gfm: true }) as MarkedToken[];
}
