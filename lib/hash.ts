/** 32-bit FNV-1a. Fast, deterministic, good enough for ids and jitter. */
export function fnv1a(input: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Stable id that does not reveal the Stripe object id to the browser. */
export function opaqueId(input: string): string {
  const a = fnv1a(input).toString(16).padStart(8, "0");
  const b = fnv1a(input, 0x9e3779b9).toString(16).padStart(8, "0");
  return a + b;
}

/** Deterministic number in [0, 1) derived from a string. */
export function unitHash(input: string): number {
  return fnv1a(input) / 0x1_0000_0000;
}
