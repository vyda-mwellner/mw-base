import { measureMarkdown, mermaidSources, renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders GitHub markdown: tables, task lists, strikethrough', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] fertig\n\n~~weg~~');

    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<del>weg</del>');
  });

  it('leaves the frontmatter out', () => {
    expect(renderMarkdown('---\ntitle: Beitrag\n---\n## Start')).toBe('<h2>Start</h2>\n');
  });

  it('keeps raw HTML but takes the teeth out of script, iframe and their like', () => {
    const html = renderMarkdown('<b>fett</b>\n\n<script>alert(1)</script>\n\n<iframe src="x"></iframe>');

    expect(html).toContain('<b>fett</b>');
    expect(html).toContain('&lt;script>alert(1)&lt;/script>');
    expect(html).toContain('&lt;iframe');
  });

  it('shows a mermaid block that has a drawing as the drawing, with its style, and any other as code', () => {
    const drawing = '<svg><style>#m{fill:red}</style><text>a</text></svg>';
    const html = renderMarkdown(
      '```mermaid\nflowchart LR\n  a\n```\n\n```mermaid\nneu\n```\n\n<style>p{}</style>',
      new Map([['flowchart LR\n  a', drawing]]),
    );

    expect(html).toContain(`<div class="diagram">${drawing}</div>`);
    expect(html).toContain('<code class="language-mermaid">neu');
    expect(html).toContain('&lt;style>p{}');
  });
});

describe('mermaidSources', () => {
  it('lists every mermaid source once, also inside lists, and no other code', () => {
    const text =
      '```mermaid title\nflowchart LR\n```\n\n- Punkt\n\n  ```mermaid\n  pie\n  ```\n\n```kotlin\nval a = 1\n```\n\n```mermaid\nflowchart LR\n```';

    expect(mermaidSources(text)).toEqual(['flowchart LR', 'pie']);
  });
});

describe('measureMarkdown', () => {
  it('counts the second level headings at the top as sections, not the ones in code or quotes', () => {
    const text =
      '# Titel\n\n## Eins\n\nZwei\n---\n\n```\n## kein Abschnitt\n```\n\n> ## Zitat\n\n### Unterpunkt\n';

    expect(measureMarkdown(text).sections).toBe(2);
  });

  it('counts lines like an editor, a final line break opens no extra line', () => {
    expect(measureMarkdown('eins\r\nzwei\n\nvier\n').lines).toBe(4);
    expect(measureMarkdown('').lines).toBe(0);
  });

  it('counts the words of the prose without code blocks, link targets and frontmatter', () => {
    const text =
      "---\ntitle: Notiz\n---\n## Docker-Compose läuft\n\nSiehe [die Doku](https://example.org/a/b) und `setup.sh`, it's 2 Minuten.\n\n```\nnicht mitgezählt\n```";

    expect(measureMarkdown(text).words).toBe(11);
  });

  it('turns the words into whole reading minutes, at least one once there are words', () => {
    expect(measureMarkdown('').readingMinutes).toBe(0);
    expect(measureMarkdown('Wort').readingMinutes).toBe(1);
    expect(measureMarkdown(Array(444).fill('Wort').join(' ')).readingMinutes).toBe(2);
    expect(measureMarkdown(Array(445).fill('Wort').join(' ')).readingMinutes).toBe(3);
  });

  it('counts open and done tasks, nested ones included', () => {
    expect(measureMarkdown('- [x] fertig\n- [ ] offen\n  - [x] auch fertig\n- kein Task')).toMatchObject({
      tasks: 3,
      doneTasks: 2,
    });
  });
});
