export interface Connection {
  id: string;
  label: string;
  host: string;
  port: number;
  database: string;
  user: string;
  production: boolean;
  requiresPassword: boolean;
  /** Epoch millis, null while locked. */
  unlockedUntil: number | null;
}

export interface ConnectionStatus extends Connection {
  locked: boolean;
}

export type ChartKind = 'bar' | 'hbar' | 'stacked' | 'line' | 'stat' | 'record' | 'text' | 'table';

type ParamKind = 'text' | 'uuid' | 'choice';

export interface QueryParam {
  name: string;
  kind: ParamKind;
  /** Only for choice params, the first one is the default. */
  options: string[];
}

/** A cell of `column` opens the query that has a param named `param`, with the cell value filled in. */
interface QueryLink {
  column: string;
  param: string;
}

/** Param name to the title of the query a linked cell opens. */
export type LinkTargets = Record<string, string>;

export interface QuerySection {
  title: string | null;
  chart: ChartKind;
  x: string | null;
  y: string[];
  /** Column whose values become one series each, for rows shaped like (x, series, y). */
  series: string | null;
  info: string | null;
  links: QueryLink[];
  sql: string;
}

export interface QueryDefinition {
  id: string;
  area: string;
  title: string;
  description: string | null;
  /** Connection ids the query is meant for, empty means all. */
  connections: string[];
  params: QueryParam[];
  sections: QuerySection[];
}

export interface QueryArea {
  name: string;
  queries: QueryDefinition[];
}

export type ParamValues = Record<string, string>;

export interface Column {
  name: string;
  typeName: string;
}

export type CellValue = string | number | boolean | null | object;

export interface QueryResult {
  columns: Column[];
  rows: CellValue[][];
  truncated: boolean;
  durationMs: number;
}

export interface SectionResult {
  result: QueryResult | null;
  error: string | null;
}
