import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { polygonToCells } from "h3-js";
import { feature } from "topojson-client";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { dropDegeneratePolygons } from "../lib/geo";

const atlas = JSON.parse(readFileSync("node_modules/world-atlas/countries-110m.json", "utf8"));
const countries = (feature(atlas, atlas.objects.countries) as unknown as FeatureCollection<Polygon | MultiPolygon>).features;

test("every country survives the hex layout once degenerate polygons are gone", () => {
  const cleaned = dropDegeneratePolygons(countries);
  assert.equal(cleaned.length, countries.length, "no country disappears from the map");
  for (const f of cleaned) {
    const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    // Same resolution and call the globe's hex layer makes; throws on bad input.
    for (const p of polygons) polygonToCells(p, 3, true);
  }
});

test("North Korea keeps its real outline", () => {
  const nk = dropDegeneratePolygons(countries).find((f) => f.id === "408")!;
  assert.ok(nk.geometry.type === "MultiPolygon" && nk.geometry.coordinates.length >= 1);
});
