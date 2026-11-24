export interface TextMatch {
  start: number;
  end: number;
}

/** Case and accents do not count: Über finds uber. */
const fold = (value: string): string => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Folding can change the length of a character, so every folded position remembers where it came from.
function foldWithOrigin(text: string): { folded: string; origin: number[] } {
  let folded = '';
  const origin: number[] = [];
  let index = 0;
  for (const char of text) {
    const part = fold(char);
    for (let i = 0; i < part.length; i++) origin.push(index);
    folded += part;
    index += char.length;
  }
  origin.push(text.length);
  return { folded, origin };
}

export function findMatches(text: string, query: string): TextMatch[] {
  const needle = fold(query.trim());
  if (!needle) return [];
  const { folded, origin } = foldWithOrigin(text);
  const matches: TextMatch[] = [];
  for (let at = folded.indexOf(needle); at >= 0; at = folded.indexOf(needle, at + needle.length)) {
    matches.push({ start: origin[at]!, end: origin[at + needle.length]! });
  }
  return matches;
}
