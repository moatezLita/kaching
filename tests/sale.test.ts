import { test } from "node:test";
import assert from "node:assert/strict";
import { chargeToSale, jitter, type ChargeLike } from "../lib/sale";

const base: ChargeLike = {
  id: "ch_123",
  created: 1_760_000_000,
  amount: 4900,
  amount_captured: 4900,
  currency: "EUR",
  paid: true,
  status: "succeeded",
  billing_details: { address: { country: "fr" } },
  payment_method_details: { card: { country: "DE" } },
};

test("a paid charge becomes a sale placed in its billing country", () => {
  const sale = chargeToSale(base, { showAmounts: true })!;
  assert.equal(sale.country, "FR");
  assert.equal(sale.countryName, "France");
  assert.equal(sale.amount, 4900);
  assert.equal(sale.currency, "eur");
  // Within France's scatter radius of its centre (46, 2).
  assert.ok(Math.abs(sale.lat! - 46) < 3 && Math.abs(sale.lng! - 2) < 5);
});

test("the Stripe charge id never reaches the browser", () => {
  const sale = chargeToSale(base, { showAmounts: true })!;
  assert.notEqual(sale.id, base.id);
  assert.ok(!JSON.stringify(sale).includes("ch_123"));
  assert.equal(sale.id, chargeToSale(base, { showAmounts: true })!.id, "stable across reconnects");
});

test("failed, pending and unpaid charges are not sales", () => {
  assert.equal(chargeToSale({ ...base, status: "failed", paid: false }, { showAmounts: true }), null);
  assert.equal(chargeToSale({ ...base, status: "pending" }, { showAmounts: true }), null);
  assert.equal(chargeToSale({ ...base, paid: false }, { showAmounts: true }), null);
});

test("falls back to the card's country, then to no location at all", () => {
  const card = chargeToSale({ ...base, billing_details: { address: { country: null } } }, { showAmounts: true })!;
  assert.equal(card.country, "DE");

  const nowhere = chargeToSale({ ...base, billing_details: null, payment_method_details: null }, { showAmounts: true })!;
  assert.equal(nowhere.country, null);
  assert.equal(nowhere.lat, null);
  assert.equal(nowhere.amount, 4900, "still counts towards the total");
});

test("an unknown country code doesn't put a dot at 0,0", () => {
  const sale = chargeToSale({ ...base, billing_details: { address: { country: "XX" } } }, { showAmounts: true })!;
  assert.equal(sale.lat, null);
  assert.equal(sale.country, null);
});

test("SHOW_AMOUNTS=false strips the amount server-side", () => {
  assert.equal(chargeToSale(base, { showAmounts: false })!.amount, null);
});

test("uses the captured amount when it differs from the authorised one", () => {
  assert.equal(chargeToSale({ ...base, amount: 5000, amount_captured: 4000 }, { showAmounts: true })!.amount, 4000);
});

test("jitter stays on the globe, near the centre, and is deterministic", () => {
  for (let i = 0; i < 500; i++) {
    const p = jitter(80, 179, 6, `seed-${i}`);
    assert.ok(p.lat >= -85 && p.lat <= 85, `lat ${p.lat}`);
    assert.ok(p.lng >= -180 && p.lng < 180, `lng ${p.lng}`);
  }
  for (let i = 0; i < 200; i++) {
    const p = jitter(46, 2, 2, `s${i}`);
    assert.ok(Math.hypot(p.lat - 46, (p.lng - 2) * Math.cos((46 * Math.PI) / 180)) <= 2.05);
  }
  assert.deepEqual(jitter(10, 20, 3, "same"), jitter(10, 20, 3, "same"));
});
