import { escapeHtml } from './report-html';

export interface Logo {
  readonly viewBox: string;
  readonly width: number;
  readonly height: number;
  /** Shapes without any color, so whoever places the logo fills it. */
  readonly body: string;
}

const SVG = 'http://www.w3.org/2000/svg';
const SHAPES = new Set(['path', 'polygon', 'polyline', 'rect', 'circle', 'ellipse', 'line']);
/** Illustrator wraps the drawing in a `switch` beside a `foreignObject` with its editing data. */
const GROUPS = new Set(['g', 'switch']);
const GEOMETRY = new Set([
  'd',
  'points',
  'x',
  'y',
  'width',
  'height',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x1',
  'y1',
  'x2',
  'y2',
  'transform',
  'fill-rule',
  'clip-rule',
]);

/** The shapes of a logo file; editor data, styles, colors and anything that could run are left behind. */
export function readLogo(source: string): Logo | null {
  if (!source.trim()) return null;
  const root = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
  if (
    root.namespaceURI !== SVG ||
    root.localName !== 'svg' ||
    root.getElementsByTagName('parsererror').length > 0
  ) {
    return null;
  }
  const box = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [, , width, height] = box;
  const body = shapes(root);
  if (box.length !== 4 || box.some(Number.isNaN) || !(width > 0 && height > 0) || !body) return null;
  return { viewBox: box.join(' '), width, height, body };
}

function shapes(parent: Element): string {
  return [...parent.children]
    .map((child) => {
      if (child.namespaceURI !== SVG) return '';
      if (GROUPS.has(child.localName)) {
        const inner = shapes(child);
        return inner ? `<g${geometry(child)}>${inner}</g>` : '';
      }
      return SHAPES.has(child.localName) ? `<${child.localName}${geometry(child)}/>` : '';
    })
    .join('');
}

function geometry(element: Element): string {
  return [...element.attributes]
    .filter((attribute) => !attribute.namespaceURI && GEOMETRY.has(attribute.localName))
    .map((attribute) => ` ${attribute.localName}="${escapeHtml(attribute.value)}"`)
    .join('');
}
