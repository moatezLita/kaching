import { createHash, timingSafeEqual } from "node:crypto";

export type AccessDecision = "ok" | "denied" | "token-not-configured";

/**
 * Real sales are private. When a Stripe key is configured, the stream only
 * opens for a matching ?key=. Locally (not production) we let it through so
 * `npm run dev` works without ceremony. Demo data is always public.
 */
export function accessDecision(input: {
  live: boolean;
  token: string | undefined;
  provided: string | null;
  production: boolean;
}): AccessDecision {
  if (!input.live) return "ok";
  if (!input.token) return input.production ? "token-not-configured" : "ok";
  if (!input.provided) return "denied";
  return safeEqual(input.token, input.provided) ? "ok" : "denied";
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const WEEK = 7 * 24 * 3600;

/** The client sends its local midnight; clamp anything odd to the last 24h. */
export function parseSince(raw: string | null, nowSec: number): number {
  const n = raw === null || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(n) || n > nowSec || n < nowSec - WEEK) return nowSec - 24 * 3600;
  return Math.floor(n);
}

/** "48.85,2.35" -> {lat, lng}. Anything malformed is ignored rather than fatal. */
export function parseHq(raw: string | undefined): { lat: number; lng: number } | null {
  if (!raw) return null;
  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 2) return null;
  const [lat, lng] = parts;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export type DemoRate = "slow" | "normal" | "fast";

export function parseRate(raw: string | null): DemoRate {
  return raw === "slow" || raw === "fast" ? raw : "normal";
}
