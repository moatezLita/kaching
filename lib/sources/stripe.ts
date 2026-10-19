import Stripe from "stripe";
import { chargeToSale, type Sale } from "../sale";
import type { SaleSource } from "./types";

/** Above this, the counter shows "5,000+" worth of dots rather than paging forever. */
const BACKFILL_CAP = 5000;
/**
 * Each poll re-lists the last two minutes and skips what it has seen. The
 * overlap absorbs clock skew between us and Stripe and catches charges that
 * were still processing on the previous poll.
 */
const POLL_WINDOW_SEC = 120;
const POLL_CAP = 1000;

/**
 * Polls Stripe with a read-only key. No webhook to register, which keeps setup
 * to one env var and works on serverless hosts where connections don't share
 * memory. One instance per open stream.
 */
export function createStripeSource(secretKey: string, opts: { showAmounts: boolean }): SaleSource {
  const stripe = new Stripe(secretKey, {
    maxNetworkRetries: 1,
    timeout: 15_000,
    appInfo: { name: "kaching" },
  });
  // Stripe charge id -> created, so a charge is emitted once per stream.
  const seen = new Map<string, number>();

  function take(charge: Stripe.Charge): Sale | null {
    if (seen.has(charge.id)) return null;
    const sale = chargeToSale(charge, opts);
    if (sale) seen.set(charge.id, charge.created);
    return sale;
  }

  return {
    mode: "stripe",
    pollIntervalMs: 3000,

    async backfill(sinceSec) {
      const sales: Sale[] = [];
      let truncated = false;
      let listed = 0;
      for await (const charge of stripe.charges.list({ created: { gte: sinceSec }, limit: 100 })) {
        if (listed++ >= BACKFILL_CAP) {
          truncated = true;
          break;
        }
        const sale = take(charge);
        if (sale) sales.push(sale);
      }
      // Stripe lists newest first.
      return { sales: sales.reverse(), truncated };
    },

    async poll() {
      const nowSec = Math.floor(Date.now() / 1000);
      const fresh: Sale[] = [];
      let listed = 0;
      for await (const charge of stripe.charges.list({ created: { gte: nowSec - POLL_WINDOW_SEC }, limit: 100 })) {
        if (listed++ >= POLL_CAP) break;
        const sale = take(charge);
        if (sale) fresh.push(sale);
      }
      // Anything older than the window can't be listed again, so stop remembering it.
      for (const [id, created] of seen) {
        if (created < nowSec - 2 * POLL_WINDOW_SEC) seen.delete(id);
      }
      return fresh.reverse();
    },
  };
}

/** A message safe to show on screen: never echoes the key. */
export function describeStripeError(err: unknown): { message: string; fatal: boolean } {
  const type = (err as { type?: string })?.type;
  if (type === "StripeAuthenticationError") {
    return { message: "Stripe rejected the key. Check STRIPE_SECRET_KEY.", fatal: true };
  }
  if (type === "StripePermissionError") {
    return { message: "This Stripe key can't read charges. Give the restricted key \"Charges: Read\".", fatal: true };
  }
  if (type === "StripeRateLimitError") {
    return { message: "Stripe is rate limiting us, slowing down.", fatal: false };
  }
  return { message: "Couldn't reach Stripe, retrying.", fatal: false };
}
