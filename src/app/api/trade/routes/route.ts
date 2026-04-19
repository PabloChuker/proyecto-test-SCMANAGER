export const dynamic = "force-dynamic";
// =============================================================================
// SC LABS — /api/trade/routes v3
// Calculates profitable trade routes.
// Tries commodity_prices first; falls back to old UEX tables if missing.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  sanitizeString,
  validateInt,
  validateSortColumn,
  validateSortDir,
  parsePostBody,
  secureHeaders,
} from "@/lib/api-security";

export const revalidate = 300;

const SORT_MAP_NEW: Record<string, string> = {
  profit: "total_profit",
  roi: "roi",
  profit_per_scu: "profit_per_scu",
};

const SORT_MAP_OLD: Record<string, string> = {
  profit: "profit",
  roi: "roi",
  profit_per_scu: "profit_per_scu",
};

interface RouteQueryParams {
  cargo_capacity: number;
  max_investment: number | null;
  commodity: string;
  system_start: string;
  system_end: string;
  station_start: string;
  station_end: string;
  min_profit: number;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "ASC" | "DESC";
}

// ─── Check if commodity_prices table exists ──────────────────────────────────
async function hasCommodityPrices(): Promise<boolean> {
  try {
    await sql.unsafe(
      `SELECT 1 FROM commodity_prices LIMIT 1`,
      [],
    );
    return true;
  } catch {
    return false;
  }
}

// ─── New path: commodity_prices table ────────────────────────────────────────
async function handleQueryNew(p: RouteQueryParams) {
  const page = validateInt(p.page, 1, 1, 1000);
  const limit = validateInt(p.limit, 20, 1, 200);
  const cargo = validateInt(p.cargo_capacity, 100, 1, 1000000);
  const minProfit = Math.max(0, p.min_profit || 0);
  const sortBy = validateSortColumn(p.sortBy, SORT_MAP_NEW, "profit");
  const sortOrder = validateSortDir(p.sortOrder);
  const sortCol = SORT_MAP_NEW[sortBy] || "total_profit";

  const params: any[] = [cargo];
  let idx = 2;
  const conds = [
    "bp.direction = 'buy'",
    "sp.direction = 'sell'",
    "bp.price > 0",
    "sp.price > 0",
    "sp.price > bp.price",
    "bp.station != sp.station",
  ];

  const commodity = sanitizeString(p.commodity, 20);
  const systemStart = sanitizeString(p.system_start, 50);
  const systemEnd = sanitizeString(p.system_end, 50);
  const stationStart = sanitizeString(p.station_start, 100);
  const stationEnd = sanitizeString(p.station_end, 100);

  if (commodity) { conds.push(`bp.commodity_abbr = $${idx}`); params.push(commodity); idx++; }
  if (systemStart) { conds.push(`bp.system = $${idx}`); params.push(systemStart); idx++; }
  if (systemEnd) { conds.push(`sp.system = $${idx}`); params.push(systemEnd); idx++; }
  if (stationStart) { conds.push(`bp.station = $${idx}`); params.push(stationStart); idx++; }
  if (stationEnd) { conds.push(`sp.station = $${idx}`); params.push(stationEnd); idx++; }
  if (p.max_investment && p.max_investment > 0) {
    conds.push(`(bp.price * $1) <= $${idx}`); params.push(p.max_investment); idx++;
  }

  const where = "WHERE " + conds.join(" AND ");

  const rows: any[] = await sql.unsafe(
    `SELECT
      bp.commodity_abbr,
      COALESCE(tc.name, bp.commodity_abbr) as commodity_name,
      COALESCE(tc.kind, '') as commodity_kind,
      bp.station as buy_station, bp.system as buy_system, bp.price as buy_price,
      sp.station as sell_station, sp.system as sell_system, sp.price as sell_price,
      (sp.price - bp.price) as profit_per_scu,
      (sp.price - bp.price) * $1 as total_profit,
      CASE WHEN bp.price > 0
           THEN ((sp.price - bp.price)::float / bp.price) * 100
           ELSE 0 END as roi
     FROM commodity_prices bp
     JOIN commodity_prices sp ON sp.commodity_abbr = bp.commodity_abbr AND sp.direction = 'sell'
     LEFT JOIN trade_commodities tc ON tc.code = bp.commodity_abbr
     ${where}
     ORDER BY ${sortCol} ${sortOrder}
     LIMIT 5000`,
    params,
  );

  const filtered = minProfit > 0 ? rows.filter((r) => Number(r.total_profit) >= minProfit) : rows;
  const total = filtered.length;
  const offset = (page - 1) * limit;
  const slice = filtered.slice(offset, offset + limit);

  return {
    routes: slice.map((r) => ({
      commodity: { abbr: r.commodity_abbr, name: r.commodity_name, kind: r.commodity_kind },
      buyStation: { name: r.buy_station, system: r.buy_system },
      sellStation: { name: r.sell_station, system: r.sell_system },
      priceBuy: Number(r.buy_price),
      priceSell: Number(r.sell_price),
      profitPerScu: Number(r.profit_per_scu),
      totalProfit: Number(r.total_profit),
      roi: Number(r.roi),
      investment: cargo * Number(r.buy_price),
    })),
    total, page, limit,
    totalPages: Math.ceil(total / limit),
    cargoScu: cargo,
  };
}

// ─── Fallback: old UEX tables ────────────────────────────────────────────────
async function handleQueryOld(p: RouteQueryParams) {
  const page = validateInt(p.page, 1, 1, 1000);
  const limit = validateInt(p.limit, 20, 1, 200);
  const cargo = validateInt(p.cargo_capacity, 100, 1, 1000000);
  const minProfit = Math.max(0, p.min_profit || 0);
  const sortBy = validateSortColumn(p.sortBy, SORT_MAP_OLD, "profit");
  const sortOrder = validateSortDir(p.sortOrder);
  const sortCol = SORT_MAP_OLD[sortBy] || "profit";

  const params: any[] = [cargo];
  let idx = 2;
  const conds = [
    "bp.price_buy > 0",
    "sp.price_sell > 0",
    "bp.status_buy > 0",
    "sp.status_sell > 0",
    "bp.id_terminal != sp.id_terminal",
    "sp.price_sell > bp.price_buy",
  ];

  const commodity = sanitizeString(p.commodity, 20);
  const systemStart = sanitizeString(p.system_start, 50);
  const systemEnd = sanitizeString(p.system_end, 50);
  const stationStart = sanitizeString(p.station_start, 100);
  const stationEnd = sanitizeString(p.station_end, 100);

  // In fallback mode, commodity filter uses code match
  if (commodity) { conds.push(`tc.code = $${idx}`); params.push(commodity); idx++; }
  // System filter by name
  if (systemStart) { conds.push(`bt.star_system_name = $${idx}`); params.push(systemStart); idx++; }
  if (systemEnd) { conds.push(`st.star_system_name = $${idx}`); params.push(systemEnd); idx++; }
  // Station filter by name
  if (stationStart) { conds.push(`(bt.nickname = $${idx} OR bt.name = $${idx})`); params.push(stationStart); idx++; }
  if (stationEnd) { conds.push(`(st.nickname = $${idx} OR st.name = $${idx})`); params.push(stationEnd); idx++; }
  if (p.max_investment && p.max_investment > 0) {
    conds.push(`(bp.price_buy * $1) <= $${idx}`); params.push(p.max_investment); idx++;
  }

  const where = "WHERE " + conds.join(" AND ");

  const rows: any[] = await sql.unsafe(
    `SELECT
      tc.code as commodity_abbr, tc.name as commodity_name, tc.kind as commodity_kind,
      bt.nickname as buy_nick, bt.name as buy_name, bt.star_system_name as buy_system,
      st.nickname as sell_nick, st.name as sell_name, st.star_system_name as sell_system,
      bp.price_buy, sp.price_sell,
      (sp.price_sell - bp.price_buy) as profit_per_scu,
      (sp.price_sell * $1 - bp.price_buy * $1) as profit,
      CASE WHEN bp.price_buy > 0
           THEN ((sp.price_sell - bp.price_buy)::float / bp.price_buy) * 100
           ELSE 0 END as roi
     FROM trade_commodities tc
     JOIN trade_prices bp ON bp.id_commodity = tc.id
     JOIN trade_terminals bt ON bt.id = bp.id_terminal
     JOIN trade_prices sp ON sp.id_commodity = tc.id
     JOIN trade_terminals st ON st.id = sp.id_terminal
     ${where}
     ORDER BY ${sortCol} ${sortOrder}
     LIMIT 5000`,
    params,
  );

  const filtered = minProfit > 0 ? rows.filter((r) => Number(r.profit) >= minProfit) : rows;
  const total = filtered.length;
  const offset = (page - 1) * limit;
  const slice = filtered.slice(offset, offset + limit);

  return {
    routes: slice.map((r) => ({
      commodity: { abbr: r.commodity_abbr, name: r.commodity_name, kind: r.commodity_kind || "" },
      buyStation: { name: r.buy_nick || r.buy_name, system: r.buy_system },
      sellStation: { name: r.sell_nick || r.sell_name, system: r.sell_system },
      priceBuy: Number(r.price_buy),
      priceSell: Number(r.price_sell),
      profitPerScu: Number(r.profit_per_scu),
      totalProfit: Number(r.profit),
      roi: Number(r.roi),
      investment: cargo * Number(r.price_buy),
    })),
    total, page, limit,
    totalPages: Math.ceil(total / limit),
    cargoScu: cargo,
  };
}

// ─── Unified handler ─────────────────────────────────────────────────────────
async function handleQuery(p: RouteQueryParams) {
  const useNew = await hasCommodityPrices();
  if (useNew) {
    return handleQueryNew(p);
  }
  console.warn("[/api/trade/routes] commodity_prices unavailable, falling back to UEX tables");
  return handleQueryOld(p);
}

// ─── HTTP handlers ───────────────────────────────────────────────────────────
function parseParams(s: URLSearchParams): RouteQueryParams {
  return {
    cargo_capacity: parseInt(s.get("cargo_capacity") || "100", 10),
    max_investment: s.get("max_investment") ? parseInt(s.get("max_investment")!, 10) : null,
    commodity: s.get("commodity") || "",
    system_start: s.get("system_start") || "",
    system_end: s.get("system_end") || "",
    station_start: s.get("station_start") || "",
    station_end: s.get("station_end") || "",
    min_profit: parseFloat(s.get("min_profit") || "0"),
    page: parseInt(s.get("page") || "1", 10),
    limit: parseInt(s.get("limit") || "30", 10),
    sortBy: s.get("sortBy") || "profit",
    sortOrder: (s.get("sortOrder") === "asc" ? "ASC" : "DESC") as "ASC" | "DESC",
  };
}

export async function GET(request: NextRequest) {
  try {
    const result = await handleQuery(parseParams(new URL(request.url).searchParams));
    return NextResponse.json(result, { headers: secureHeaders() });
  } catch (error) {
    console.error("[API /trade/routes GET]", error);
    return NextResponse.json(
      { error: "Error al calcular rutas" },
      { status: 500, headers: secureHeaders() },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await parsePostBody<Record<string, any>>(request);
    if (!body)
      return NextResponse.json({ error: "Invalid body" }, { status: 400, headers: secureHeaders() });
    const result = await handleQuery({
      cargo_capacity: body.cargo_capacity || 100,
      max_investment: body.max_investment || null,
      commodity: body.commodity || "",
      system_start: body.system_start || "",
      system_end: body.system_end || "",
      station_start: body.station_start || "",
      station_end: body.station_end || "",
      min_profit: body.min_profit || 0,
      page: body.page || 1,
      limit: body.limit || 30,
      sortBy: body.sortBy || "profit",
      sortOrder: (body.sortOrder === "ASC" ? "ASC" : "DESC") as "ASC" | "DESC",
    });
    return NextResponse.json(result, { headers: secureHeaders() });
  } catch (error) {
    console.error("[API /trade/routes POST]", error);
    return NextResponse.json(
      { error: "Error al calcular rutas" },
      { status: 500, headers: secureHeaders() },
    );
  }
}
