import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney, toMajor } from "../lib/money";
import { isBigSale, summarize, timeAgo } from "../lib/stats";
import type { Sale } from "../lib/sale";

test("minor units follow Stripe's currency rules", () => {
  assert.equal(toMajor(4900, "usd"), 49);
  assert.equal(toMajor(500, "JPY"), 500);
  assert.equal(toMajor(1500, "kwd"), 1.5);
});

test("formatting drops cents once the total is large", () => {
  assert.equal(formatMoney(4900, "usd", "en-US"), "$49.00");
  assert.equal(formatMoney(1_234_500, "eur", "en-US"), "€12,345");
  assert.equal(formatMoney(500, "jpy", "en-US"), "¥500");
});

test("an unknown currency code still renders instead of throwing", () => {
  assert.equal(formatMoney(1000, "zzzz", "en-US"), "10.00 ZZZZ");
});

const sale = (amount: number | null, currency: string): Sale => ({
  id: Math.random().toString(36),
  created: 0,
  country: null,
  countryName: null,
  lat: null,
  lng: null,
  amount,
  currency,
});

test("the headline currency is the one with the most sales, not the biggest sum", () => {
  const t = summarize([sale(100, "eur"), sale(200, "eur"), sale(900_000, "usd")]);
  assert.equal(t.primary, "eur");
  assert.equal(t.byCurrency.eur.sum, 300);
  assert.equal(t.count, 3);
});

test("hidden amounts still count as sales", () => {
  const t = summarize([sale(null, "usd"), sale(null, "usd")]);
  assert.equal(t.count, 2);
  assert.equal(t.primary, null);
});

test("big sale threshold is about 100 units, adjusted for zero-decimal currencies", () => {
  assert.equal(isBigSale(sale(9_900, "usd")), false);
  assert.equal(isBigSale(sale(19_900, "usd")), true);
  assert.equal(isBigSale(sale(5_000, "jpy")), false);
  assert.equal(isBigSale(sale(15_000, "jpy")), true);
  assert.equal(isBigSale(sale(null, "usd")), false);
});

test("time ago", () => {
  assert.equal(timeAgo(1000, 1010), "just now");
  assert.equal(timeAgo(1000, 1000 + 300), "5m ago");
  assert.equal(timeAgo(1000, 1000 + 7300), "2h ago");
});
