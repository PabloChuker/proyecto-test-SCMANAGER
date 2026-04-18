// =============================================================================
// SC LABS — routeOptimizer
//
// Orders a list of sell stops so that the player minimises travel:
//   1. Group by star system (Stanton together, Pyro together)
//   2. Within a system, group by inferred body (Hurston / Crusader / …)
//      using station-name heuristics (HUR-L1, Lorville, …)
//   3. Within a body, sort by station name
//
// The DB exposes only { station, system, price } from the commodity_prices
// table — planet/body metadata lives in `trade_terminals` but we don't want
// to take an extra round-trip per inventory item. A heuristic on the station
// name covers ~95% of real SC locations.
// =============================================================================

export interface RouteStop {
  mineralId: string;
  mineralName: string;
  commodityCode: string;
  commodityName: string;
  scu: number;
  station: string | null;
  system: string | null;
  pricePerScu: number | null;
  /** scu × pricePerScu — cached so the modal can render totals cheaply. */
  totalValue: number;
}

// ─── Body inference ──────────────────────────────────────────────────────────

const LAGRANGE_PREFIX: Record<string, string> = {
  HUR: "Hurston",
  CRU: "Crusader",
  ARC: "ArcCorp",
  MIC: "microTech",
  PYR: "Pyro",
  TER: "Terra",
  NYX: "Nyx",
};

const CITY_MAP: { re: RegExp; body: string }[] = [
  // Hurston
  { re: /lorville|hdms-|hurston/i, body: "Hurston" },
  // ArcCorp
  { re: /area\s*18|baijini|lyria|wala|terminal\s*mills|arccorp/i, body: "ArcCorp" },
  // Crusader moons/stations
  { re: /orison|port\s*olisar|ruin\s*station|seraphim|grim\s*hex|hickes|shubin-sal|cellin|yela|daymar|magda|crusader/i, body: "Crusader" },
  // microTech
  { re: /new\s*babbage|port\s*tressler|shubin\s*sm|rayari\s*deltana|aberdeen|calliope|clio|euterpe|microtech/i, body: "microTech" },
  // Pyro
  { re: /ruin\s*station|checkmate|bloom|terminus|stanton\s*gateway|pyro\s*gateway|pyro/i, body: "Pyro System" },
];

export function inferBody(station: string | null, system: string | null): string {
  const s = (station || "").trim();
  if (!s) return system || "Other";

  // Lagrange stations: HUR-L1, CRU-L4, MIC-L2, etc.
  const lag = s.match(/^([A-Z]{3})-L[1-5]/i);
  if (lag) {
    const key = lag[1].toUpperCase();
    if (LAGRANGE_PREFIX[key]) return LAGRANGE_PREFIX[key];
  }

  // City / moon / outpost patterns
  for (const { re, body } of CITY_MAP) {
    if (re.test(s)) return body;
  }

  // Fallback: system name (keeps everything in the same bucket so Stanton
  // items don't interleave with Pyro items).
  return system || "Other";
}

// ─── Optimiser ───────────────────────────────────────────────────────────────

/**
 * Returns a new array with stops ordered by system → body → station.
 * Stops without station/system fall to the end of the list.
 */
export function optimizeRoute(stops: RouteStop[]): RouteStop[] {
  const withNoStation: RouteStop[] = [];
  const withStation: (RouteStop & { _sys: string; _body: string; _sta: string })[] = [];

  for (const s of stops) {
    if (!s.station || !s.system) {
      withNoStation.push(s);
      continue;
    }
    withStation.push({
      ...s,
      _sys: (s.system || "?").toLowerCase(),
      _body: inferBody(s.station, s.system).toLowerCase(),
      _sta: s.station.toLowerCase(),
    });
  }

  withStation.sort((a, b) => {
    if (a._sys !== b._sys) return a._sys.localeCompare(b._sys);
    if (a._body !== b._body) return a._body.localeCompare(b._body);
    return a._sta.localeCompare(b._sta);
  });

  // Strip helper fields before returning.
  const ordered = withStation.map(({ _sys, _body, _sta, ...rest }) => rest);
  return [...ordered, ...withNoStation];
}

/**
 * Convenience helper used by the preview modal to render parada
 * headers ("Stanton · Hurston · HUR-L1 Green Glade Station").
 */
export function describeStop(stop: RouteStop): {
  system: string;
  body: string;
  station: string;
} {
  return {
    system: stop.system || "—",
    body: inferBody(stop.station, stop.system),
    station: stop.station || "—",
  };
}
