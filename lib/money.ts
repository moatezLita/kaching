// Stripe amounts are integers in the currency's minor unit. Most currencies
// have 2 decimals; these are the exceptions Stripe documents.
// https://docs.stripe.com/currencies#zero-decimal
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);
const THREE_DECIMAL = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

export function minorUnitDivisor(currency: string): number {
  const c = currency.toLowerCase();
  if (ZERO_DECIMAL.has(c)) return 1;
  if (THREE_DECIMAL.has(c)) return 1000;
  return 100;
}

export function toMajor(amountMinor: number, currency: string): number {
  return amountMinor / minorUnitDivisor(currency);
}

/** "$49.00", or "$12,345" once the cents stop mattering. */
export function formatMoney(amountMinor: number, currency: string, locale?: string): string {
  const major = toMajor(amountMinor, currency);
  const whole = Math.abs(major) >= 1000;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: whole ? 0 : undefined,
      maximumFractionDigits: whole ? 0 : undefined,
    }).format(major);
  } catch {
    // Unknown ISO code: still show something readable.
    return `${major.toFixed(2)} ${currency.toUpperCase()}`;
  }
}
