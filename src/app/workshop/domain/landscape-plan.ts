import type { Tone } from '../../engine/model';
import { escapeHtml } from '../../workbench/domain/report-html';
import { FONT } from '../../workbench/domain/paper';
import type { AppInfo, Snapshot } from '../model/landscape';

// Dark against the rule in paper.ts: the picture of the cockpit, in this look, is already in the wiki.
const PAGE = '#141615';
const SURFACE = '#131514';
const INK = '#e4e7e6';
const MUTED = '#9a9f9d';
const LINE = '#303433';
const CAPTION = '#5eacc6';
const LANE_FILLS = [
  { color: '#52c98d', opacity: 0.26 },
  { color: '#3198bb', opacity: 0.24 },
];
const SIDE_FILL = { color: MUTED, opacity: 0.19 };
const DOTS: Readonly<Record<Tone | 'ok', string>> = {
  ok: '#3c8a63',
  warning: '#e0a23c',
  danger: '#e86a62',
  info: MUTED,
};
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";
const DAY = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });
const SOURCE = 'Quelle: Michael';

const MARGIN = 20;
const HEADER = 24;
const CAPTION_ROW = 20;
const COLUMN_WIDTHS = [230, 340, 250] as const;
const CURVE_ROOM = 150;
const LANE_PAD = 14;
const LANE_WIDTH = 2 * LANE_PAD + COLUMN_WIDTHS[0] + CURVE_ROOM + COLUMN_WIDTHS[1];
const SIDE_X = MARGIN + LANE_WIDTH + CURVE_ROOM;
const COLUMN_X = [
  MARGIN + LANE_PAD,
  MARGIN + LANE_PAD + COLUMN_WIDTHS[0] + CURVE_ROOM,
  SIDE_X + LANE_PAD,
] as const;
const LANE_TOP = 8;
const LANE_TITLE = 16;
const LANE_GAP = 12;
const CARD_GAP = 6;
const CARD_PAD = 12;
const CARD_PAD_Y = 9;
const HEAD_LINE = 17;
const META_LINE = 16;
const DOT_GAP = 12;
const VERSION_GAP = 10;
const ARROW_GAP = 3;
const LABEL_SIZE = 13;
const META_SIZE = 12;
/** Widths in units of the font size, wide enough that a text never runs out of its box. */
const BOLD_CHAR = 0.6;
const PLAIN_CHAR = 0.52;
const MONO_CHAR = 0.6;

type Column = 0 | 1 | 2;
type Support = Tone | 'ok' | null;

export interface PlanVersion {
  readonly text: string;
  readonly support: Support;
}

export interface PlanCard {
  readonly id: string;
  readonly lines: readonly string[];
  readonly ports: string;
  /** Versions in rows as wide as the card; empty where the repo is not checked out. */
  readonly versions: readonly (readonly PlanVersion[])[];
  readonly column: Column;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly missing: boolean;
}

interface PlanLane {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fill: { readonly color: string; readonly opacity: number };
}

interface PlanEdge {
  readonly from: string;
  readonly to: string;
  readonly d: string;
}

interface PlanText {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

/** The scan as the cockpit drew it: the GUIs left, their backends beside them, the shared infrastructure right. */
export interface Plan {
  readonly width: number;
  readonly height: number;
  readonly stand: string;
  readonly captions: readonly PlanText[];
  readonly lanes: readonly PlanLane[];
  readonly cards: readonly PlanCard[];
  readonly edges: readonly PlanEdge[];
  readonly missing: boolean;
  /** Where the legend of the dots and the note under it start. */
  readonly foot: number;
}

const round = (value: number): number => Math.round(value * 10) / 10;
const widthOf = (text: string, size: number, char: number): number => text.length * size * char;

/** One line into the width, cut with an ellipsis where it does not fit. */
function cut(text: string, width: number): string {
  if (widthOf(text, LABEL_SIZE, BOLD_CHAR) <= width) return text;
  const room = Math.max(1, Math.floor(width / (LABEL_SIZE * BOLD_CHAR)) - 1);
  return `${text.slice(0, room).trimEnd()}…`;
}

/** A name into the width: whole, else split at the space nearest the middle, each half cut if need be. */
function wrap(label: string, width: number): string[] {
  if (widthOf(label, LABEL_SIZE, BOLD_CHAR) <= width) return [label];
  const spaces = [...label.matchAll(/ /g)].map((match) => match.index);
  if (spaces.length === 0) return [cut(label, width)];
  const middle = spaces.reduce((best, at) =>
    Math.abs(at - label.length / 2) < Math.abs(best - label.length / 2) ? at : best,
  );
  return [label.slice(0, middle), label.slice(middle + 1)].map((half) => cut(half, width));
}

const versionWidth = (version: PlanVersion): number => DOT_GAP + widthOf(version.text, META_SIZE, PLAIN_CHAR);

/** The versions in rows, as many in a row as fit. */
function rows(versions: readonly PlanVersion[], width: number): PlanVersion[][] {
  const result: PlanVersion[][] = [];
  let used = 0;
  for (const version of versions) {
    const row = result[result.length - 1];
    const need = versionWidth(version);
    if (row && used + VERSION_GAP + need <= width) {
      row.push(version);
      used += VERSION_GAP + need;
    } else {
      result.push([version]);
      used = need;
    }
  }
  return result;
}

/** A column of cards from `top`; returns them and where the column ends. */
function stack(
  apps: readonly AppInfo[],
  column: Column,
  top: number,
  support: (tech: string) => Support,
): { cards: PlanCard[]; bottom: number } {
  const width = COLUMN_WIDTHS[column];
  const inner = width - 2 * CARD_PAD;
  const cards: PlanCard[] = [];
  let y = top;
  for (const app of apps) {
    const ports = app.ports.join(' · ');
    const portsWidth = ports ? widthOf(ports, META_SIZE, MONO_CHAR) + 8 : 0;
    const lines = wrap(app.label, inner - portsWidth);
    const versions = app.missing
      ? []
      : rows(
          app.tech
            .filter((tech) => !tech.startsWith('Nx '))
            .map((text) => ({ text, support: support(text) })),
          inner,
        );
    const metaRows = app.missing ? 1 : versions.length;
    const height = 2 * CARD_PAD_Y + lines.length * HEAD_LINE + metaRows * META_LINE;
    cards.push({
      id: app.id,
      lines,
      ports,
      versions,
      column,
      x: COLUMN_X[column],
      y,
      width,
      height,
      missing: app.missing,
    });
    y += height + CARD_GAP;
  }
  return { cards, bottom: cards.length > 0 ? y - CARD_GAP : top };
}

type Side = 'left' | 'right';

/**
 * Like the cockpit: lines sharing a side of a card each get their own spot there, ordered by the other end. The
 * calls into the infrastructure are left out, almost every backend has them and they would cover the rest.
 */
function edgesOf(snapshot: Snapshot, cards: readonly PlanCard[]): PlanEdge[] {
  const boxes = new Map(cards.map((card) => [card.id, card]));
  const infra = new Set(snapshot.apps.filter((app) => app.kind === 'infra').map((app) => app.id));
  const calls = snapshot.edges.filter(
    (edge) =>
      edge.kind === 'call' &&
      edge.from !== edge.to &&
      boxes.has(edge.from) &&
      boxes.has(edge.to) &&
      !infra.has(edge.to),
  );
  const middle = (card: PlanCard): number => card.y + card.height / 2;
  const sidesOf = (from: PlanCard, to: PlanCard): { from: Side; to: Side } => {
    if (from.column < to.column) return { from: 'right', to: 'left' };
    if (from.column > to.column) return { from: 'left', to: 'right' };
    const side: Side = from.column === 2 ? 'left' : 'right';
    return { from: side, to: side };
  };
  const drawn = calls.map((edge) => {
    const from = boxes.get(edge.from)!;
    const to = boxes.get(edge.to)!;
    return { edge, from, to, sides: sidesOf(from, to) };
  });

  const ends = new Map<string, { index: number; role: 'from' | 'to'; other: number }[]>();
  const add = (key: string, end: { index: number; role: 'from' | 'to'; other: number }): void =>
    void ends.set(key, [...(ends.get(key) ?? []), end]);
  drawn.forEach(({ edge, from, to, sides }, index) => {
    add(`${edge.from}:${sides.from}`, { index, role: 'from', other: middle(to) });
    add(`${edge.to}:${sides.to}`, { index, role: 'to', other: middle(from) });
  });
  const anchors = new Map<string, number>();
  for (const list of ends.values()) {
    list.sort((a, b) => a.other - b.other);
    list.forEach((end, position) => {
      const box = end.role === 'from' ? drawn[end.index].from : drawn[end.index].to;
      anchors.set(`${end.index}:${end.role}`, box.y + (box.height * (position + 1)) / (list.length + 1));
    });
  }

  const edgeX = (card: PlanCard, side: Side, gap: number): number =>
    side === 'right' ? card.x + card.width + gap : card.x - gap;
  return drawn.map(({ edge, from, to, sides }, index) => {
    const start = { x: edgeX(from, sides.from, 0), y: anchors.get(`${index}:from`)! };
    const end = { x: edgeX(to, sides.to, ARROW_GAP), y: anchors.get(`${index}:to`)! };
    const reach =
      from.column === to.column
        ? Math.min(110, 46 + Math.abs(end.y - start.y) * 0.12)
        : Math.max(30, Math.abs(end.x - start.x) * 0.45);
    const out = sides.from === 'right' ? 1 : -1;
    const into = sides.to === 'right' ? 1 : -1;
    return {
      from: edge.from,
      to: edge.to,
      d:
        `M ${round(start.x)} ${round(start.y)} C ${round(start.x + out * reach)} ${round(start.y)}, ` +
        `${round(end.x + into * reach)} ${round(end.y)}, ${round(end.x)} ${round(end.y)}`,
    };
  });
}

/** The cards of a lane under its title, and the lane around them. */
function lane(
  label: string,
  columns: readonly (readonly [readonly AppInfo[], Column])[],
  x: number,
  top: number,
  support: (tech: string) => Support,
): { lane: Omit<PlanLane, 'fill'>; cards: PlanCard[] } {
  const contentTop = top + LANE_TOP + LANE_TITLE + CARD_GAP;
  const stacks = columns.map(([apps, column]) => stack(apps, column, contentTop, support));
  const bottom = Math.max(...stacks.map((each) => each.bottom)) + LANE_TOP;
  const width = columns.length > 1 ? LANE_WIDTH : COLUMN_WIDTHS[2] + 2 * LANE_PAD;
  return {
    lane: { label, x, y: top, width, height: bottom - top },
    cards: stacks.flatMap((each) => each.cards),
  };
}

/** `support` tells how long a version as the scan names it, `Java 21`, is supported; null where nobody knows. */
export function landscapePlan(snapshot: Snapshot, support: (tech: string) => Support = () => null): Plan {
  const ofGroup = (id: string): AppInfo[] => snapshot.apps.filter((app) => app.group === id);
  const captionTop = MARGIN + HEADER;
  const cards: PlanCard[] = [];

  const groupLanes: PlanLane[] = [];
  let y = captionTop + CAPTION_ROW;
  for (const group of snapshot.groups.filter((each) => !each.side)) {
    const apps = ofGroup(group.id);
    if (apps.length === 0) continue;
    const laid = lane(
      group.label,
      [
        [apps.filter((app) => app.kind === 'frontend'), 0],
        [apps.filter((app) => app.kind !== 'frontend'), 1],
      ],
      MARGIN,
      y,
      support,
    );
    cards.push(...laid.cards);
    groupLanes.push({ ...laid.lane, fill: LANE_FILLS[groupLanes.length % LANE_FILLS.length] });
    y += laid.lane.height + LANE_GAP;
  }
  const groupsBottom = Math.max(y - LANE_GAP, ...groupLanes.map((each) => each.y + each.height));

  // The shared groups stand beside all others, from the row of the column titles on.
  const sideLanes: PlanLane[] = [];
  let sideY = captionTop;
  for (const group of snapshot.groups.filter((each) => each.side)) {
    const apps = ofGroup(group.id);
    if (apps.length === 0) continue;
    const laid = lane(group.label, [[apps, 2]], SIDE_X, sideY, support);
    cards.push(...laid.cards);
    sideLanes.push({ ...laid.lane, fill: SIDE_FILL });
    sideY += laid.lane.height + LANE_GAP;
  }
  // A single shared lane reaches down as far as the others, as in the cockpit.
  if (sideLanes.length === 1 && sideLanes[0].y + sideLanes[0].height < groupsBottom)
    sideLanes[0] = { ...sideLanes[0], height: groupsBottom - sideLanes[0].y };

  const lanes = [...groupLanes, ...sideLanes];
  const foot = Math.max(groupsBottom, ...lanes.map((each) => each.y + each.height)) + 26;
  return {
    width: SIDE_X + COLUMN_WIDTHS[2] + 2 * LANE_PAD + MARGIN,
    height: foot + 20 + MARGIN,
    stand: `Scan vom ${DAY.format(snapshot.generatedAt)}`,
    captions: [
      { text: 'GUIs', x: MARGIN, y: captionTop + 12 },
      { text: 'Backends und Dienste', x: COLUMN_X[1], y: captionTop + 12 },
    ],
    lanes,
    cards,
    edges: edgesOf(snapshot, cards),
    missing: cards.some((card) => card.missing),
    foot,
  };
}

const text = (content: string, x: number, y: number, attributes: string): string =>
  `<text x="${round(x)}" y="${round(y)}" ${attributes}>${escapeHtml(content)}</text>`;

/** One text, so the spacing is the renderer's: each item behind a dot in the color of its support. */
function dotted(items: readonly PlanVersion[], x: number, y: number, gap: number, tail = ''): string {
  const spans = items.map(({ text: label, support }, index) => {
    const color = support ? `fill="${DOTS[support]}"` : `fill="${MUTED}" fill-opacity="0.4"`;
    return `<tspan${index > 0 ? ` dx="${gap}"` : ''} ${color}>●</tspan> ${escapeHtml(label)}`;
  });
  const end = tail ? `<tspan dx="${gap}">${escapeHtml(tail)}</tspan>` : '';
  return `<text x="${round(x)}" y="${round(y)}" font-size="${META_SIZE}" fill="${MUTED}">${spans.join('')}${end}</text>`;
}

function cardSvg(card: PlanCard): string {
  const left = card.x + CARD_PAD;
  const first = card.y + CARD_PAD_Y + 13;
  const head = card.lines.map((line, index) =>
    text(line, left, first + index * HEAD_LINE, `font-size="${LABEL_SIZE}" font-weight="700" fill="${INK}"`),
  );
  const ports = card.ports
    ? text(
        card.ports,
        card.x + card.width - CARD_PAD,
        first,
        `font-size="${META_SIZE}" font-family="${MONO}" fill="${INK}" text-anchor="end"`,
      )
    : '';
  const metaTop = first + card.lines.length * HEAD_LINE;
  const meta = card.missing
    ? [text('nicht ausgecheckt', left, metaTop, `font-size="${META_SIZE}" fill="${MUTED}"`)]
    : card.versions.map((row, index) => dotted(row, left, metaTop + index * META_LINE, VERSION_GAP));
  const dash = card.missing ? ' stroke-dasharray="4 3"' : '';
  return [
    `<rect x="${round(card.x)}" y="${round(card.y)}" width="${card.width}" height="${card.height}" rx="10" fill="${SURFACE}" stroke="${LINE}"${dash}/>`,
    ...head,
    ports,
    ...meta,
  ].join('');
}

const ARROW =
  `<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">` +
  `<path d="M 0 0 L 10 5 L 0 10 z" fill="${MUTED}" fill-opacity="0.6"/></marker>`;

const SUPPORT_LEGEND: readonly PlanVersion[] = [
  { text: 'Support läuft', support: 'ok' },
  { text: 'Support endet bald', support: 'warning' },
  { text: 'ohne Support', support: 'danger' },
  { text: 'unbekannt', support: null },
];

function footSvg(plan: Plan): string {
  return (
    dotted(SUPPORT_LEGEND, MARGIN, plan.foot, 18, plan.missing ? 'gestrichelt: nicht ausgecheckt' : '') +
    text(
      'Versionen nach dem lokalen Stand der Repos beim Scan - ob sie schon auf PROD laufen, sagt das Bild nicht.',
      MARGIN,
      plan.foot + 20,
      `font-size="${META_SIZE}" fill="${INK}"`,
    ) +
    text(
      SOURCE,
      plan.width - MARGIN,
      plan.foot + 20,
      `font-size="${META_SIZE}" fill="${MUTED}" text-anchor="end"`,
    )
  );
}

/** The plan as one SVG that needs nothing around it: on the workbench and drawn into a PNG it looks the same. */
export function planSvg(plan: Plan): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${plan.width}" height="${plan.height}" viewBox="0 0 ${plan.width} ${plan.height}" font-family="${FONT}" role="img" aria-label="Landkarte">`,
    `<defs>${ARROW}</defs>`,
    `<rect width="${plan.width}" height="${plan.height}" fill="${PAGE}"/>`,
    text(
      plan.stand,
      plan.width - MARGIN,
      MARGIN + 14,
      `font-size="${META_SIZE}" fill="${MUTED}" text-anchor="end"`,
    ),
    ...plan.captions.map((caption) =>
      text(
        caption.text.toUpperCase(),
        caption.x,
        caption.y,
        `font-size="${META_SIZE}" font-weight="700" fill="${CAPTION}" letter-spacing="0.5"`,
      ),
    ),
    ...plan.lanes.map(
      (lane) =>
        `<rect x="${round(lane.x)}" y="${round(lane.y)}" width="${round(lane.width)}" height="${round(lane.height)}" rx="12" fill="${lane.fill.color}" fill-opacity="${lane.fill.opacity}"/>` +
        text(
          lane.label,
          lane.x + LANE_PAD,
          lane.y + LANE_TOP + 12,
          `font-size="${LABEL_SIZE}" font-weight="700" fill="${INK}"`,
        ),
    ),
    ...plan.edges.map(
      (edge) =>
        `<path d="${edge.d}" fill="none" stroke="${MUTED}" stroke-opacity="0.6" stroke-width="1.4" marker-end="url(#arrow)"/>`,
    ),
    ...plan.cards.map(cardSvg),
    footSvg(plan),
    '</svg>',
  ].join('');
}
