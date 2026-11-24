import type { ServerChange } from '../model/dev-server';
import type { StackChange } from '../model/docker';

interface CommandTarget {
  id: string;
  label: string;
  repo: string;
}

/** A folder of local-setup with a compose file. */
interface StackTarget {
  name: string;
  defaultStack: boolean;
}

export interface CommandContext {
  servers: CommandTarget[];
  favorites: string[];
  stacks: StackTarget[];
}

export interface Command {
  servers: ServerChange;
  stacks: StackChange;
}

interface ParsedCommand extends Command {
  /** Words that are no verb, no filler and no app, shown so a misheard name stands out. */
  unknown: string[];
  /** Apps were named, but no verb: starting or stopping stays a guess, so nothing happens. */
  verbMissing: boolean;
}

type Verb = 'start' | 'stop';

type Match =
  | { kind: 'app'; id: string }
  | { kind: 'repo'; repo: string }
  | { kind: 'stack'; name: string }
  | { kind: 'defaults' };

interface Clause {
  verb: Verb | null;
  /** "shop-gui starten": the verb came after its apps, so the next app opens a new clause. */
  verbFirst: boolean;
  matches: Match[];
  all: boolean;
  /** "container" or "stack" was said: "alle" then means the stacks, not the dev servers. */
  containers: boolean;
}

const VERBS = new Map<string, Verb>([
  ...['start', 'starte', 'starten', 'startet', 'startest', 'hochfahren', 'run', 'launch', 'statte'].map(
    (word): [string, Verb] => [word, 'start'],
  ),
  ...[
    'stop',
    'stopp',
    'stoppe',
    'stoppen',
    'stoppt',
    'beende',
    'beenden',
    'beendet',
    'runterfahren',
    'kill',
  ].map((word): [string, Verb] => [word, 'stop']),
]);

const ALL = new Set(['alle', 'alles', 'all']);

const CONTAINER_WORDS = new Set(['container', 'containers', 'stack', 'stacks', 'docker']);

/** The stacks `setup up` starts without arguments, DEFAULT_FOLDERS in setup.sh. */
const DEFAULT_WORDS = ['default', 'defaults', 'standard'];

const FILLERS = new Set([
  ...[
    'bitte',
    'mal',
    'und',
    'sowie',
    'auch',
    'noch',
    'jetzt',
    'gleich',
    'einfach',
    'doch',
    'kannst',
    'du',
    'mir',
  ],
  ...['die', 'den', 'das', 'der', 'dem', 'des', 'ein', 'eine', 'von', 'vom', 'in', 'im', 'aus', 'mit', 'für'],
  ...['app', 'apps', 'gui', 'guis', 'frontend', 'frontends', 'server', 'dev', 'please', 'and', 'the', 'of'],
]);

/** Speech-to-text writes "CT eins" as often as "CT1". */
const NUMBERS: Record<string, string> = { eins: '1', zwei: '2', drei: '3', one: '1', two: '2', three: '3' };

/** Spoken names run over several words: "shop gui", "p o s gui". */
const MAX_SPAN = 4;

/**
 * Reads a spoken command such as "starte bitte shopgui und ordergui", "starte alle apps in web-gui" or "starte den
 * mail container". A repo with several apps means its favorites, or all of its apps when none of them is one; "alle"
 * alone means the favorites when starting and every dev server when stopping, "alle container" the default stacks
 * when starting and every stack when stopping. Names match without spaces and hyphens, a long one with a typo or two,
 * and one that only sounds alike, as long as only one name comes that close.
 */
export function parseCommand(text: string, context: CommandContext): ParsedCommand {
  const index = buildIndex(context);
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => NUMBERS[word] ?? word);
  const clause = (verb: Verb | null): Clause => ({
    verb,
    verbFirst: true,
    matches: [],
    all: false,
    containers: false,
  });
  const clauses: Clause[] = [clause(null)];
  const unknown: string[] = [];
  const current = () => clauses[clauses.length - 1];

  let position = 0;
  while (position < words.length) {
    const word = words[position];
    const verb = VERBS.get(word);
    if (verb) {
      const open = current();
      if (open.verb === null) {
        open.verb = verb;
        open.verbFirst = open.matches.length === 0 && !open.all && !open.containers;
      } else {
        clauses.push(clause(verb));
      }
      position++;
      continue;
    }
    if (ALL.has(word) || CONTAINER_WORDS.has(word) || FILLERS.has(word)) {
      current().all ||= ALL.has(word);
      current().containers ||= CONTAINER_WORDS.has(word);
      position++;
      continue;
    }
    const found = match(words, position, index);
    if (!found) {
      unknown.push(word);
      position++;
      continue;
    }
    if (current().verb !== null && !current().verbFirst) {
      clauses.push(clause(null));
    }
    current().matches.push(found.match);
    position += found.length;
  }

  const wanted = {
    start: new Set<string>(),
    stop: new Set<string>(),
    up: new Set<string>(),
    down: new Set<string>(),
  };
  let verbMissing = false;
  for (const { verb, ...said } of clauses) {
    if (verb === null) {
      verbMissing ||= said.matches.length > 0 || said.containers;
      continue;
    }
    const { servers, stacks } = resolve(said, verb, context);
    servers.forEach((id) => (verb === 'start' ? wanted.start : wanted.stop).add(id));
    stacks.forEach((name) => (verb === 'start' ? wanted.up : wanted.down).add(name));
  }
  const ordered = (names: string[], picked: Set<string>, dropped = new Set<string>()) =>
    names.filter((name) => picked.has(name) && !dropped.has(name));
  const serverIds = context.servers.map((server) => server.id);
  const stackNames = context.stacks.map((stack) => stack.name);
  return {
    servers: { start: ordered(serverIds, wanted.start, wanted.stop), stop: ordered(serverIds, wanted.stop) },
    stacks: { up: ordered(stackNames, wanted.up, wanted.down), down: ordered(stackNames, wanted.down) },
    unknown,
    verbMissing,
  };
}

function resolve(
  clause: Omit<Clause, 'verb'>,
  verb: Verb,
  { servers, favorites, stacks }: CommandContext,
): { servers: string[]; stacks: string[] } {
  const isFavorite = (server: CommandTarget) => favorites.includes(server.id);
  const defaults = stacks.filter((stack) => stack.defaultStack).map((stack) => stack.name);
  if (clause.matches.length === 0) {
    if (clause.containers) {
      return { servers: [], stacks: verb === 'start' ? defaults : stacks.map((stack) => stack.name) };
    }
    const all = clause.all ? (verb === 'start' ? servers.filter(isFavorite) : servers) : [];
    return { servers: all.map((server) => server.id), stacks: [] };
  }
  const result = { servers: [] as string[], stacks: [] as string[] };
  for (const match of clause.matches) {
    switch (match.kind) {
      case 'app':
        result.servers.push(match.id);
        break;
      case 'repo': {
        const ofRepo = servers.filter((server) => server.repo === match.repo);
        const chosen = verb === 'start' && ofRepo.some(isFavorite) ? ofRepo.filter(isFavorite) : ofRepo;
        result.servers.push(...chosen.map((server) => server.id));
        break;
      }
      case 'stack':
        result.stacks.push(match.name);
        break;
      case 'defaults':
        result.stacks.push(...defaults);
        break;
    }
  }
  return result;
}

function match(
  words: string[],
  position: number,
  index: Map<string, Match>,
): { match: Match; length: number } | null {
  const spans: { key: string; length: number }[] = [];
  for (let length = Math.min(MAX_SPAN, words.length - position); length > 0; length--) {
    const span = words.slice(position, position + length);
    if (!span.some((word) => VERBS.has(word))) {
      spans.push({ key: span.join(''), length });
    }
  }
  for (const span of spans) {
    const exact = index.get(span.key);
    if (exact) {
      return { match: exact, length: span.length };
    }
  }
  for (const span of spans) {
    const close = closest(span.key, index);
    if (close) {
      return { match: close, length: span.length };
    }
  }
  for (const span of spans) {
    const alike = soundsLike(span.key, index);
    if (alike) {
      return { match: alike, length: span.length };
    }
  }
  return null;
}

/** Two typos in a long name, one in a short one, none below five letters; a tie between two apps is no match. */
function closest(key: string, index: Map<string, Match>): Match | null {
  if (key.length < 5) {
    return null;
  }
  const allowed = key.length >= 8 ? 2 : 1;
  let best: { distance: number; match: Match } | null = null;
  let tie = false;
  for (const [alias, candidate] of index) {
    if (alias.length < 5) {
      continue;
    }
    const distance = levenshtein(key, alias);
    if (distance > allowed || (best && distance > best.distance)) {
      continue;
    }
    if (best && distance === best.distance) {
      tie ||= !sameMatch(best.match, candidate);
      continue;
    }
    best = { distance, match: candidate };
    tie = false;
  }
  return best && !tie ? best.match : null;
}

/** For a name speech-to-text spelled the German way, "Poskuis" for "POS-GUIs", which no typo distance reaches. */
function soundsLike(key: string, index: Map<string, Match>): Match | null {
  const code = colognePhonetic(singular(key));
  if (key.length < 5 || code.length < 3) {
    return null;
  }
  let found: Match | null = null;
  for (const [alias, candidate] of index) {
    if (alias.length < 5 || colognePhonetic(singular(alias)) !== code) {
      continue;
    }
    if (found && !sameMatch(found, candidate)) {
      return null;
    }
    found = candidate;
  }
  return found;
}

function singular(word: string): string {
  return word.replace(/s$/, '');
}

function colognePhonetic(word: string): string {
  const letters = word
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 's')
    .replace(/[^a-z]/g, '');
  const digits = [...letters].map((letter, i) =>
    soundGroup(letters[i - 1] ?? '', letter, letters[i + 1] ?? '', i === 0),
  );
  const merged = digits.join('').replace(/(.)\1+/g, '$1');
  return merged.slice(0, 1) + merged.slice(1).replace(/0/g, '');
}

function soundGroup(previous: string, letter: string, next: string, first: boolean): string {
  if (/[aeijouy]/.test(letter)) return '0';
  if (letter === 'h') return '';
  if (letter === 'b') return '1';
  if (letter === 'p') return next === 'h' ? '3' : '1';
  if (/[dt]/.test(letter)) return /[csz]/.test(next) ? '8' : '2';
  if (/[fvw]/.test(letter)) return '3';
  if (/[gkq]/.test(letter)) return '4';
  if (letter === 'c') {
    const hard = first ? /[ahkloqrux]/.test(next) : /[ahkoqux]/.test(next) && !/[sz]/.test(previous);
    return hard ? '4' : '8';
  }
  if (letter === 'x') return /[ckq]/.test(previous) ? '8' : '48';
  if (letter === 'l') return '5';
  if (/[mn]/.test(letter)) return '6';
  if (letter === 'r') return '7';
  return '8';
}

function sameMatch(a: Match, b: Match): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Id and label of every app, the id without "-gui" and every single word of both that only one app has. A repo
 * with several apps and every stack are names of their own, ahead of the single words, behind the full app names.
 */
function buildIndex({ servers, stacks }: CommandContext): Map<string, Match> {
  const index = new Map<string, Match>();
  const words = new Map<string, Set<string>>();
  for (const server of servers) {
    for (const word of `${server.id} ${server.label}`.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      const reserved = FILLERS.has(word) || VERBS.has(word) || ALL.has(word) || CONTAINER_WORDS.has(word);
      if (word.length >= 3 && !reserved) {
        words.set(word, (words.get(word) ?? new Set()).add(server.id));
      }
    }
  }
  for (const [word, ids] of words) {
    if (ids.size === 1) {
      index.set(word, { kind: 'app', id: [...ids][0] });
    }
  }
  const repos = new Map<string, number>();
  servers.forEach((server) => repos.set(server.repo, (repos.get(server.repo) ?? 0) + 1));
  for (const [repo, count] of repos) {
    if (count > 1) {
      index.set(compact(repo), { kind: 'repo', repo });
    }
  }
  for (const stack of stacks) {
    index.set(compact(stack.name), { kind: 'stack', name: stack.name });
  }
  if (stacks.length > 0) {
    DEFAULT_WORDS.forEach((word) => index.set(word, { kind: 'defaults' }));
  }
  for (const server of servers) {
    const app: Match = { kind: 'app', id: server.id };
    [server.id, server.id.replace(/-gui$/, ''), server.label].forEach((name) =>
      index.set(compact(name), app),
    );
  }
  return index;
}

function compact(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length];
}
