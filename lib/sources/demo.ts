import { chargeToSale, type ChargeLike, type Sale } from "../sale";
import type { DemoRate } from "../server-config";
import type { SaleSource } from "./types";

// Roughly what a global SaaS sees: US-heavy, then Europe, then everyone else.
const COUNTRY_WEIGHTS: [string, number][] = [
  ["US", 30], ["GB", 8], ["DE", 7], ["FR", 6], ["CA", 5], ["IN", 4], ["AU", 4],
  ["NL", 3], ["BR", 3], ["JP", 3], ["ES", 3], ["IT", 3], ["SE", 2], ["CH", 2],
  ["SG", 2], ["MX", 2], ["PL", 2], ["KR", 2], ["BE", 1], ["IE", 1], ["AT", 1],
  ["DK", 1], ["NO", 1], ["FI", 1], ["PT", 1], ["NZ", 1], ["ZA", 1], ["NG", 1],
  ["AR", 1], ["AE", 1], ["IL", 1], ["TR", 1], ["ID", 1], ["PH", 1], ["MA", 1],
];
const TOTAL_WEIGHT = COUNTRY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
const PRICES = [900, 1900, 2900, 2900, 4900, 4900, 4900, 9900, 9900, 19900, 49900];

/** Average milliseconds between two sales. */
const MEAN_GAP_MS: Record<DemoRate, number> = { slow: 9000, normal: 3500, fast: 900 };

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function pickCountry(): string {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const [code, w] of COUNTRY_WEIGHTS) {
    r -= w;
    if (r < 0) return code;
  }
  return "US";
}

export function createDemoSource(opts: { showAmounts: boolean; rate: DemoRate; currency?: string }): SaleSource {
  const currency = opts.currency ?? "usd";
  let n = 0;
  const fake = (created: number): Sale =>
    chargeToSale(
      {
        id: `demo_${created}_${n++}_${Math.random().toString(36).slice(2, 8)}`,
        created,
        amount: pick(PRICES),
        currency,
        paid: true,
        status: "succeeded",
        billing_details: { address: { country: pickCountry() } },
      } satisfies ChargeLike,
      opts,
    )!;

  const pollIntervalMs = 400;
  return {
    mode: "demo",
    pollIntervalMs,

    async backfill(sinceSec) {
      const nowSec = Math.floor(Date.now() / 1000);
      const count = 25 + Math.floor(Math.random() * 40);
      const times = Array.from({ length: count }, () => sinceSec + Math.floor(Math.random() * (nowSec - sinceSec)));
      return { sales: times.sort((a, b) => a - b).map(fake), truncated: false };
    },

    async poll() {
      // Poisson arrivals: each tick has a small, constant chance of a sale.
      return Math.random() < pollIntervalMs / MEAN_GAP_MS[opts.rate] ? [fake(Math.floor(Date.now() / 1000))] : [];
    },
  };
}
