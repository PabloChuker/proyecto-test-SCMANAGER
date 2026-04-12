export const dynamic = "force-dynamic";
// =============================================================================
// SC LABS — /api/trade/commodities v2
//
// Lists commodities with aggregated buy/sell prices from commodity_prices.
// Falls back to old trade_commodities table if commodity_prices is unavailable.
//
// GET ?search=&kind=&is_raw=&page=&limit=&sortBy=&sortOrder=
// GET ?detail=AGRI  → returns per-station prices for one commodity
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  sanitizeString,
  validateInt,
  validateSortColumn,
  validateSortDir,
  secureHeaders,
} from "@/lib/api-security";

export const revalidate = 300;

async function hasCommodityPrices(): Promise<boolean> {
  try {
    await sql.unsafe(`SELECT 1 FROM commodity_prices LIMIT 1`, []);
    return true;
  } catch {
    return false;
  }
}

// ─── Detail endpoint: per-station prices for one commodity ───────────────────
async function handleDetail(code: string) {
  const abbr = sanitizeString(code, 20).toUpperCase();
  if (!abbr) {
    return NextResponse.json({ error: "Missing commodity code" }, { status: 400, headers: secureHeaders() });
  }

  const rows: any[] = await sql.unsafe(
    `SELECT station, system, direction, price
     FROM commodity_prices
     WHERE commodity_abbr = $1
     ORDER BY direction, price DESC`,
    [abbr],
  );

  // Group by station — merge buy/sell into one row per station
  const stationMap: Record<string, { station: string; system: string; priceBuy: number; priceSell: number }> = {};
  for (const r of rows) {
    const key = r.station;
    if (!stationMap[key]) {
      stationMap[key] = { station: r.station, system: r.system, priceBuy: 0, priceSell: 0 };
    }
    if (r.direction === "buy") {
      // Station buys from player → player sells here
      stationMap[key].priceBuy = Number(r.price);
    } else {
      // Station sells to player → player buys here
      stationMap[key].priceSell = Number(r.price);
    }
  }

  const stations = Object.values(stationMap).sort((a, b) => {
    // Sort by highest buy price first (best selling locations)
    return (b.priceBuy || 0) - (a.priceBuy || 0);
  });

  return NextResponse.json({ stations }, { headers: secureHeaders() });
}

// ─── List: aggregate commodities from commodity_prices ───────────────────────
const SORT_MAP: Record<string, string> = {
  name: "name",
  price_buy: "price_buy",
  price_sell: "price_sell",
  kind: "kind",
};

async function handleListNew(params: {
  search: string; kind: string; is_raw: number | null;
  page: number; limit: number; sortBy: string; sortOrder: "ASC" | "DESC";
}) {
  const search = sanitizeString(params.search, 100);
  const kind = sanitizeString(params.kind, 100);
  const page = validateInt(params.page, 1, 1, 1000);
  const limit = validateInt(params.limit, 50, 1, 500);
  const sortBy = validateSortColumn(params.sortBy, SORT_MAP, "name");
  const sortOrder = validateSortDir(params.sortOrder);

  // Main query: aggregate from commodity_prices, enrich from trade_commodities
  const rows: any[] = await sql.unsafe(
    `SELECT
       cp.commodity_abbr as code,
       COALESCE(tc.name, cp.commodity_abbr) as name,
       COALESCE(tc.kind, '') as kind,
       COALESCE(tc.is_raw, 0) as is_raw,
       COALESCE(tc.is_refined, 0) as is_refined,
       COALESCE(tc.is_mineral, 0) as is_mineral,
       COALESCE(tc.is_illegal, 0) as is_illegal,
       COALESCE(tc.is_harvestable, 0) as is_harvestable,
       COALESCE(tc.is_buyable, 0) as is_buyable,
       COALESCE(tc.is_sellable, 0) as is_sellable,
       ROUND(AVG(CASE WHEN cp.direction = 'sell' THEN cp.price END))::int as price_buy,
       ROUND(AVG(CASE WHEN cp.direction = 'buy'  THEN cp.price END))::int as price_sell
     FROM commodity_prices cp
     LEFT JOIN trade_commodities tc ON tc.code = cp.commodity_abbr
     GROUP BY cp.commodity_abbr, tc.name, tc.kind, tc.is_raw, tc.is_refined,
              tc.is_mineral, tc.is_illegal, tc.is_harvestable, tc.is_buyable, tc.is_sellable
     ORDER BY COALESCE(tc.name, cp.commodity_abbr)`,
    [],
  );

  // Client-side filtering (simpler for text search + kind + is_raw)
  let filtered = rows;
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(
      (r) => r.name.toLowerCase().includes(s) || r.code.toLowerCase().includes(s),
    );
  }
  if (kind) {
    const k = kind.toLowerCase();
    filtered = filtered.filter((r) => (r.kind || "").toLowerCase().includes(k));
  }
  if (params.is_raw === 1) {
    filtered = filtered.filter((r) => r.is_raw === 1);
  } else if (params.is_raw === 0) {
    filtered = filtered.filter((r) => r.is_raw !== 1);
  }

  // Sort
  const sortCol = sortBy;
  filtered.sort((a, b) => {
    const av = a[sortCol] ?? "";
    const bv = b[sortCol] ?? "";
    if (typeof av === "number" && typeof bv === "number") {
      return sortOrder === "ASC" ? av - bv : bv - av;
    }
    const cmp = String(av).localeCompare(String(bv));
    return sortOrder === "ASC" ? cmp : -cmp;
  });

  const total = filtered.length;
  const offset = (page - 1) * limit;
  const slice = filtered.slice(offset, offset + limit);

  // Distinct kinds for filter dropdown
  const kinds = [...new Set(rows.map((r) => r.kind).filter(Boolean))].sort();

  return NextResponse.json(
    {
      commodities: slice.map((c) => ({
        id: c.code, // use abbr as ID since we don't have numeric IDs
        name: c.name,
        code: c.code,
        kind: c.kind,
        priceBuy: c.price_buy ? Number(c.price_buy) : null,
        priceSell: c.price_sell ? Number(c.price_sell) : null,
        isRaw: c.is_raw === 1,
        isRefined: c.is_refined === 1,
        isMineral: c.is_mineral === 1,
        isBuyable: c.is_buyable === 1,
        isSellable: c.is_sellable === 1,
        isIllegal: c.is_illegal === 1,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      kinds,
      _source: "commodity_prices",
    },
    { headers: secureHeaders() },
  );
}

// ─── Fallback: old trade_commodities table ───────────────────────────────────
async function handleListOld(params: {
  search: string; kind: string; is_raw: number | null;
  page: number; limit: number; sortBy: string; sortOrder: "ASC" | "DESC";
}) {
  const search = sanitizeString(params.search, 100);
  const kind = sanitizeString(params.kind, 100);
  const page = validateInt(params.page, 1, 1, 1000);
  const limit = validateInt(params.limit, 50, 1, 500);
  const sortBy = validateSortColumn(params.sortBy, SORT_MAP, "name");
  const sortOrder = validateSortDir(params.sortOrder);
  const sortCol = `tc.${SORT_MAP[sortBy] || "name"}`;

  const conditions: string[] = [];
  const queryParams: any[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`tc.name ILIKE $${idx}`);
    queryParams.push(`%${search}%`);
    idx++;
  }
  if (kind) {
    conditions.push(`tc.kind ILIKE $${idx}`);
    queryParams.push(`%${kind}%`);
    idx++;
  }
  if (params.is_raw === 1) {
    conditions.push(`tc.is_raw = 1`);
  } else if (params.is_raw === 0) {
    conditions.push(`tc.is_raw = 0`);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const countResult: any[] = await sql.unsafe(
    `SELECT COUNT(*)::int as total FROM trade_commodities tc ${where}`,
    queryParams,
  );
  const total = countResult[0]?.total ?? 0;

  const offset = (page - 1) * limit;
  const commodities: any[] = await sql.unsafe(
    `SELECT tc.id, tc.name, tc.code, tc.kind, tc.price_buy, tc.price_sell,
            tc.is_raw, tc.is_refined, tc.is_mineral, tc.is_illegal,
            tc.is_harvestable, tc.is_buyable, tc.is_sellable
     FROM trade_commodities tc ${where}
     ORDER BY ${sortCol} ${sortOrder} NULLS LAST
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...queryParams, limit, offset],
  );

  const kinds: any[] = await sql.unsafe(
    `SELECT DISTINCT kind FROM trade_commodities WHERE kind IS NOT NULL ORDER BY kind ASC`,
    [],
  );

  return NextResponse.json(
    {
      commodities: commodities.map((c) => ({
        id: c.code || c.id,
        name: c.name,
        code: c.code,
        kind: c.kind,
        priceBuy: c.price_buy != null ? Number(c.price_buy) : null,
        priceSell: c.price_sell != null ? Number(c.price_sell) : null,
        isRaw: c.is_raw === 1,
        isRefined: c.is_refined === 1,
        isMineral: c.is_mineral === 1,
        isBuyable: c.is_buyable === 1,
        isSellable: c.is_sellable === 1,
        isIllegal: c.is_illegal === 1,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      kinds: kinds.map((k) => k.kind).filter(Boolean),
      _source: "trade_commodities",
    },
    { headers: secureHeaders() },
  );
}

// ─── GET handler ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const s = new URL(request.url).searchParams;

    // Detail mode: per-station prices for one commodity
    const detail = s.get("detail");
    if (detail) return handleDetail(detail);

    // List mode
    const params = {
      search: s.get("search") || "",
      kind: s.get("kind") || "",
      is_raw: s.get("is_raw") ? parseInt(s.get("is_raw")!, 10) : null,
      page: parseInt(s.get("page") || "1", 10),
      limit: parseInt(s.get("limit") || "50", 10),
      sortBy: s.get("sortBy") || "name",
      sortOrder: (s.get("sortOrder") === "desc" ? "DESC" : "ASC") as "ASC" | "DESC",
    };

    const useNew = await hasCommodityPrices();
    if (useNew) return handleListNew(params);

    console.warn("[/api/trade/commodities] commodity_prices unavailable, using trade_commodities");
    return handleListOld(params);
  } catch (error) {
    console.error("[API /trade/commodities GET]", error);
    return NextResponse.json(
      { error: "Error al obtener commodities" },
      { status: 500, headers: secureHeaders() },
    );
  }
}
