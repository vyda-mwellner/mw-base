import { describe, expect, it } from 'vitest';

import { findMatches } from './find';

describe('findMatches', () => {
  it('finds every occurrence regardless of case and accents', () => {
    const text = 'Über die Brücke, dann uber die Strasse';
    expect(findMatches(text, 'uber').map((match) => text.slice(match.start, match.end))).toEqual([
      'Über',
      'uber',
    ]);
  });

  it('keeps the offsets of the original text when folding changes its length', () => {
    const text = '😀 한 İnfo und Info';
    const matches = findMatches(text, 'info');
    expect(matches.map((match) => text.slice(match.start, match.end))).toEqual(['İnfo', 'Info']);
  });

  it('finds nothing for an empty query', () => {
    expect(findMatches('Text', '  ')).toEqual([]);
  });

  it('does not count overlapping occurrences twice', () => {
    expect(findMatches('aaaa', 'aa')).toHaveLength(2);
  });
});
