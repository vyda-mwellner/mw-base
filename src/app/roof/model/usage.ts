/** What Claude Code cost on one day, as ccusage reads it from the local session logs. */
export interface UsageDay {
  /** `YYYY-MM-DD`. */
  readonly period: string;
  /** US dollars, at the prices ccusage ships with. */
  readonly totalCost: number;
  readonly totalTokens: number;
  readonly modelBreakdowns: readonly { readonly modelName: string; readonly cost: number }[];
}
