import { minorUnitDivisor } from "./money";
import type { Sale } from "./sale";

export interface Totals {
  count: number;
  /** currency -> { sum in minor units, number of sales } */
  byCurrency: Record<string, { sum: number; n: number }>;
  /** The currency most sales were made in; the headline number uses it. */
  primary: string | null;
}

export function summarize(sales: Iterable<Sale>): Totals {
  const byCurrency: Totals["byCurrency"] = {};
  let count = 0;
  for (const s of sales) {
    count++;
    if (s.amount === null) continue;
    const slot = (byCurrency[s.currency] ??= { sum: 0, n: 0 });
    slot.sum += s.amount;
    slot.n++;
  }
  let primary: string | null = null;
  for (const [cur, { n }] of Object.entries(byCurrency)) {
    if (primary === null || n > byCurrency[primary].n) primary = cur;
  }
  return { count, byCurrency, primary };
}

/** Sales worth ~100 units of their currency get the bigger celebration. */
export function isBigSale(sale: Sale): boolean {
  if (sale.amount === null) return false;
  const divisor = minorUnitDivisor(sale.currency);
  // Zero-decimal currencies (JPY, KRW...) are worth far less per unit.
  const threshold = divisor === 1 ? 10_000 : 100;
  return sale.amount / divisor >= threshold;
}

export function timeAgo(createdSec: number, nowSec: number): string {
  const d = Math.max(0, nowSec - createdSec);
  if (d < 45) return "just now";
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  return `${Math.floor(d / 3600)}h ago`;
}

export function startOfLocalDay(now = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}
