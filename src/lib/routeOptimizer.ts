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

export interface PriceOption {
  station: string;
  system: string;
  price: number;
}

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
  /**
   * Full list of { station, system, price } rows for this commodity, sorted
   * best → worst. Populated from Trade's commodity_prices table so the
   * optimiser can detect stations where multiple commodities sell well.
   */
  priceOptions?: PriceOption[];
}

/**
 * A group of RouteStops that share the same sell station. Multiple
 * commodities at the same stop = one visit, N commodity WOs.
 */
export interface AggregatedStop {
  key: string;
  station: string | null;
  system: string | null;
  body: string;
  items: RouteStop[];
  subtotalScu: number;
  subtotalValue: number;
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

// ─── Unification & cross-commodity optimiser ───────────────────────────────

/**
 * Key used to aggregate stops into station-level groups. Case-insensitive,
 * falls back to "?" when either field is missing.
 */
function stationKey(station: string | null, system: string | null): string {
  return `${(station || "?").toLowerCase()}|${(system || "?").toLowerCase()}`;
}

/**
 * Cross-commodity optimiser.
 *
 * Starting from a list of RouteStops (each already carrying its top-1 sell
 * station in `station` and the full price list in `priceOptions`), tries to
 * redirect individual commodities toward stations that are shared with other
 * selected commodities — provided that switching still gets us at least
 * `threshold` of the commodity's top-1 price (default 90%).
 *
 * Example: Titanium top1 = Area18 (2500), Agricium top1 = Lorville (3000).
 * If Titanium also fetches ≥ 2250 at Lorville, both get routed to Lorville
 * and the route collapses from 2 stops to 1.
 *
 * The function does NOT mutate the input array — it returns new RouteStop
 * objects with `station` / `system` / `pricePerScu` / `totalValue` adjusted
 * when a better shared station was found.
 */
export function unifyBestStations(
  stops: RouteStop[],
  threshold = 0.9,
): RouteStop[] {
  if (stops.length <= 1) return [...stops];

  // Map each stop index → Map<station, { price, system }> including its top-1.
  const priceAt: Array<Map<string, { price: number; system: string }>> = stops.map(
    (s) => {
      const m = new Map<string, { price: number; system: string }>();
      for (const opt of s.priceOptions || []) {
        m.set(opt.station, { price: opt.price, system: opt.system });
      }
      if (s.station && s.pricePerScu && !m.has(s.station)) {
        m.set(s.station, { price: s.pricePerScu, system: s.system || "" });
      }
      return m;
    },
  );

  const topPrice = stops.map((s) => s.pricePerScu || 0);

  // Which stations show up in ≥ 2 distinct stops' price lists?
  const stationCount = new Map<string, number>();
  for (const m of priceAt) {
    for (const st of m.keys()) {
      stationCount.set(st, (stationCount.get(st) || 0) + 1);
    }
  }

  const result = stops.map((s) => ({ ...s }));

  for (let i = 0; i < result.length; i++) {
    const stop = result[i];
    const min = topPrice[i] * threshold;
    if (min <= 0) continue;

    // Current station's sibling count (how many other stops sell here ≥ threshold)
    const currentSiblings = (() => {
      if (!stop.station) return 0;
      let n = 0;
      for (let j = 0; j < result.length; j++) {
        if (j === i) continue;
        const info = priceAt[j].get(stop.station);
        if (info && info.price >= topPrice[j] * threshold) n++;
      }
      return n;
    })();

    let bestStation: string | null = stop.station;
    let bestSiblings = currentSiblings;
    let bestPrice = stop.pricePerScu || 0;
    let bestSystem = stop.system || "";

    for (const [st, count] of stationCount) {
      if (count < 2) continue;
      const info = priceAt[i].get(st);
      if (!info) continue;
      if (info.price < min) continue;

      // Count siblings at this station that also meet their own threshold
      let siblings = 0;
      for (let j = 0; j < result.length; j++) {
        if (j === i) continue;
        const jInfo = priceAt[j].get(st);
        if (jInfo && jInfo.price >= topPrice[j] * threshold) siblings++;
      }
      if (siblings <= 0) continue;

      // Prefer more siblings, then higher price, then keep current
      if (
        siblings > bestSiblings ||
        (siblings === bestSiblings && info.price > bestPrice)
      ) {
        bestStation = st;
        bestSiblings = siblings;
        bestPrice = info.price;
        bestSystem = info.system || stop.system || "";
      }
    }

    if (bestStation && bestStation !== stop.station) {
      result[i] = {
        ...stop,
        station: bestStation,
        system: bestSystem,
        pricePerScu: bestPrice,
        totalValue: bestPrice * stop.scu,
      };
    }
  }

  return result;
}

/**
 * Groups RouteStops by sell station and sorts the resulting groups via the
 * same system → body → station ordering used by `optimizeRoute`. Items
 * without a station end up in a trailing "unknown" bucket.
 *
 * Pair with `unifyBestStations` first for the full Fase B flow:
 *   unifyBestStations(stops) → aggregateStops(...)
 */
export function aggregateStops(stops: RouteStop[]): AggregatedStop[] {
  const groups = new Map<string, AggregatedStop>();
  for (const s of stops) {
    const key = stationKey(s.station, s.system);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(s);
      existing.subtotalScu += s.scu || 0;
      existing.subtotalValue += s.totalValue || 0;
    } else {
      groups.set(key, {
        key,
        station: s.station,
        system: s.system,
        body: inferBody(s.station, s.system),
        items: [s],
        subtotalScu: s.scu || 0,
        subtotalValue: s.totalValue || 0,
      });
    }
  }

  const withStation: AggregatedStop[] = [];
  const withoutStation: AggregatedStop[] = [];
  for (const g of groups.values()) {
    if (g.station && g.system) withStation.push(g);
    else withoutStation.push(g);
  }

  withStation.sort((a, b) => {
    const sysA = (a.system || "?").toLowerCase();
    const sysB = (b.system || "?").toLowerCase();
    if (sysA !== sysB) return sysA.localeCompare(sysB);
    const bodyA = a.body.toLowerCase();
    const bodyB = b.body.toLowerCase();
    if (bodyA !== bodyB) return bodyA.localeCompare(bodyB);
    return (a.station || "").toLowerCase().localeCompare((b.station || "").toLowerCase());
  });

  return [...withStation, ...withoutStation];
}

/**
 * End-to-end Fase B optimiser: unify shared stations first, then group.
 */
export function unifyAndAggregate(
  stops: RouteStop[],
  threshold = 0.9,
): AggregatedStop[] {
  return aggregateStops(unifyBestStations(stops, threshold));
}
