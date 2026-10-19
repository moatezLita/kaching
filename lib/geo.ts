import type { Feature, Geometry, Position } from "geojson";

function distinctPoints(ring: Position[]): number {
  return new Set(ring.map(([x, y]) => `${x},${y}`)).size;
}

/**
 * world-atlas has zero-area polygons (North Korea carries one made of four
 * identical points). h3, which lays out the hex dots, throws on them, so drop
 * them and keep the rest of the country.
 */
export function dropDegeneratePolygons<T extends Feature<Geometry | null>>(features: T[]): T[] {
  return features.flatMap((f) => {
    const g = f.geometry;
    if (g?.type === "Polygon") return distinctPoints(g.coordinates[0] ?? []) >= 3 ? [f] : [];
    if (g?.type === "MultiPolygon") {
      const polygons = g.coordinates.filter((p) => distinctPoints(p[0] ?? []) >= 3);
      return polygons.length ? [{ ...f, geometry: { ...g, coordinates: polygons } }] : [];
    }
    return [f];
  });
}
