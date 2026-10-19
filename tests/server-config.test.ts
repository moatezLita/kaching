import { test } from "node:test";
import assert from "node:assert/strict";
import { accessDecision, parseHq, parseSince } from "../lib/server-config";

test("demo data is always viewable", () => {
  assert.equal(accessDecision({ live: false, token: undefined, provided: null, production: true }), "ok");
});

test("real sales in production need a configured token and a matching key", () => {
  assert.equal(accessDecision({ live: true, token: undefined, provided: null, production: true }), "token-not-configured");
  assert.equal(accessDecision({ live: true, token: "s3cret", provided: null, production: true }), "denied");
  assert.equal(accessDecision({ live: true, token: "s3cret", provided: "nope", production: true }), "denied");
  assert.equal(accessDecision({ live: true, token: "s3cret", provided: "s3cret", production: true }), "ok");
});

test("local dev without a token just works", () => {
  assert.equal(accessDecision({ live: true, token: undefined, provided: null, production: false }), "ok");
});

test("a token set locally is still enforced", () => {
  assert.equal(accessDecision({ live: true, token: "s3cret", provided: null, production: false }), "denied");
});

test("since is clamped to the last week, defaulting to the last 24h", () => {
  const now = 1_760_000_000;
  assert.equal(parseSince(String(now - 3600), now), now - 3600);
  assert.equal(parseSince(null, now), now - 86400);
  assert.equal(parseSince("", now), now - 86400);
  assert.equal(parseSince("abc", now), now - 86400);
  assert.equal(parseSince(String(now + 60), now), now - 86400, "future");
  assert.equal(parseSince("0", now), now - 86400, "would page all of history");
});

test("HQ parsing ignores junk", () => {
  assert.deepEqual(parseHq("48.85, 2.35"), { lat: 48.85, lng: 2.35 });
  assert.equal(parseHq(""), null);
  assert.equal(parseHq("48.85"), null);
  assert.equal(parseHq("100,2"), null);
  assert.equal(parseHq("a,b"), null);
});
