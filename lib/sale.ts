import { countryInfo } from "./countries";
import { opaqueId, unitHash } from "./hash";

/** What the browser receives. Deliberately minimal: no names, emails, ids or cities. */
export interface Sale {
  id: string;
  /** Unix seconds. */
  created: number;
  /** ISO 3166-1 alpha-2, or null when Stripe gave us no location. */
  country: string | null;
  countryName: string | null;
  lat: number | null;
  lng: number | null;
  /** Minor units. Null when the server is configured to hide amounts. */
  amount: number | null;
  currency: string;
}

/** The slice of a Stripe Charge we read. Stripe.Charge satisfies it. */
export interface ChargeLike {
  id: string;
  created: number;
  amount: number;
  amount_captured?: number | null;
  currency: string;
  paid: boolean;
  status: string;
  billing_details?: { address?: { country?: string | null } | null } | null;
  payment_method_details?: { card?: { country?: string | null } | null } | null;
}

export function isSuccessful(charge: ChargeLike): boolean {
  return charge.paid && charge.status === "succeeded";
}

/** Billing country first (where the customer is), card issuer country as a fallback. */
export function chargeCountry(charge: ChargeLike): string | null {
  return (
    charge.billing_details?.address?.country ??
    charge.payment_method_details?.card?.country ??
    null
  );
}

/**
 * Scatter a point inside a disc around the country's centre, so a country with
 * 40 sales shows 40 dots instead of one, and no dot points at a real address.
 * Deterministic per sale, so reconnects don't make dots jump.
 */
export function jitter(lat: number, lng: number, spreadDeg: number, seed: string) {
  const r = spreadDeg * Math.sqrt(unitHash(seed + ":r"));
  const theta = 2 * Math.PI * unitHash(seed + ":t");
  const jLat = Math.max(-85, Math.min(85, lat + r * Math.sin(theta)));
  const lngScale = Math.max(0.2, Math.cos((jLat * Math.PI) / 180));
  const jLng = ((((lng + (r * Math.cos(theta)) / lngScale) + 540) % 360) + 360) % 360 - 180;
  return { lat: Math.round(jLat * 100) / 100, lng: Math.round(jLng * 100) / 100 };
}

export function chargeToSale(charge: ChargeLike, opts: { showAmounts: boolean }): Sale | null {
  if (!isSuccessful(charge)) return null;
  const id = opaqueId(charge.id);
  const code = chargeCountry(charge);
  const info = countryInfo(code);
  const point = info ? jitter(info.lat, info.lng, info.spread, id) : null;
  const amount = charge.amount_captured || charge.amount;
  return {
    id,
    created: charge.created,
    country: info ? code!.toUpperCase() : null,
    countryName: info?.name ?? null,
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    amount: opts.showAmounts ? amount : null,
    currency: charge.currency.toLowerCase(),
  };
}
