import countries from "world-countries";

export interface CountryInfo {
  name: string;
  lat: number;
  lng: number;
  /** Radius in degrees within which dots get scattered, scaled to the country's size. */
  spread: number;
}

function spreadFor(areaKm2: number): number {
  const sideDeg = Math.sqrt(Math.max(areaKm2, 1)) / 111; // ~111 km per degree
  return Math.min(6, Math.max(0.15, sideDeg * 0.3));
}

const byCode = new Map<string, CountryInfo>(
  countries.map((c) => [
    c.cca2,
    { name: c.name.common, lat: c.latlng[0], lng: c.latlng[1], spread: spreadFor(c.area) },
  ]),
);

export function countryInfo(code: string | null | undefined): CountryInfo | null {
  if (!code) return null;
  return byCode.get(code.toUpperCase()) ?? null;
}
