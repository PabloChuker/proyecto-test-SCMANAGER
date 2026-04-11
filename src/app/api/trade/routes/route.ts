export const dynamic = "force-dynamic";
// =============================================================================
// SC LABS — /api/trade/routes v2
// Calculates profitable trade routes with advanced filtering.
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

const SORT_MAP: Record<string, string> = {
  profit: "profit",
  roi: "roi",
  profit_per_scu: "profit_per_scu",
};

interface RouteQueryParams {
  cargo_scu: number;
  max_investment: number | null;
  id_commodity: number | null;
  system_start: number | null;
  system_end: number | null;
  orbit_start: string;
  orbit_end: string;
  terminal_start: number | null;
  terminal_end: number | null;
  min_profit: number;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "ASC" | "DESC";
}

function parseParam(val: string | null): number | null {
  if (!val) return null;
  const n = parseInt(val, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

async function handleQuery(p: RouteQueryParams) {
  const page = validateInt(p.page, 1, 1, 1000);
  const limit = validateInt(p.limit, 20, 1, 200);
  const cargo = validateInt(p.cargo_scu, 100, 1, 1000000);
  const minProfit = Math.max(0, p.min_profit || 0);
  const sortBy = validateSortColumn(p.sortBy, SORT_MAP, "profit");
  const sortOrder = validateSortDir(p.sortOrder);
  const sortCol = SORT_MAP[sortBy] || "profit";
  const orbitStart = sanitizeString(p.orbit_start, 100);
  const orbitEnd = sanitizeString(p.orbit_end, 100);

  // Build parameterized query
  const params: any[] = [cargo]; // $1 = cargo_scu
  let idx = 2;
  const conds = [
    "bp.price_buy > 0",
    "sp.price_sell > 0",
    "bp.status_buy > 0",
    "sp.status_sell > 0",
    "bp.id_terminal != sp.id_terminal",
    "sp.price_sell > bp.price_buy", // only profitable
  ];

  // Optional filters
  if (p.id_commodity) {
    conds.push(`tc.id = $${idx}`);
    params.push(validateInt(p.id_commodity, 0, 0, 999999));
    idx++;
  }
  if (p.system_start) {
    conds.push(`bt.id_star_system = $${idx}`);
    params.push(validateInt(p.system_start, 0, 0, 999999));
    idx++;
  }
  if (p.system_end) {
    conds.push(`st.id_star_system = $${idx}`);
    params.push(validateInt(p.system_end, 0, 0, 999999));
    idx++;
  }
  if (orbitStart) {
    conds.push(`bt.planet_name = $${idx}`);
    params.push(orbitStart);
    idx++;
  }
  if (orbitEnd) {
    conds.push(`st.planet_name = $${idx}`);
    params.push(orbitEnd);
    idx++;
  }
  if (p.terminal_start) {
    conds.push(`bp.id_terminal = $${idx}`);
    params.push(validateInt(p.terminal_start, 0, 0, 999999));
    idx++;
  }
  if (p.terminal_end) {
    conds.push(`sp.id_terminal = $${idx}`);
    params.push(validateInt(p.terminal_end, 0, 0, 999999));
    idx++;
  }
  if (p.max_investment && p.max_investment > 0) {
    conds.push(`(bp.price_buy * $1) <= $${idx}`);
    params.push(p.max_investment);
    idx++;
  }

  const where = "WHERE " + conds.join(" AND ");

  const rows: any[] = await sql.unsafe(
    `SELECT
      tc.id as cid, tc.name as cname, tc.code as ccode, tc.kind as ckind,
      bt.id as bt_id, bt.nickname as bt_nick, bt.name as bt_name,
      bt.star_system_name as bt_sys, bt.planet_name as bt_planet,
      st.id as st_id, st.nickname as st_nick, st.name as st_name,
      st.star_system_name as st_sys, st.planet_name as st_planet,
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

  // Apply min profit filter client-side (simpler than another param)
  const filtered = minProfit > 0
    ? rows.filter((r) => Number(r.profit) >= minProfit)
    : rows;

  const total = filtered.length;
  const offset = (page - 1) * limit;
  const slice = filtered.slice(offset, offset + limit);

  return {
    routes: slice.map((r) => ({
      commodity: { id: r.cid, name: r.cname, code: r.ccode, kind: r.ckind },
      buyTerminal: { id: r.bt_id, name: r.bt_nick || r.bt_name, system: r.bt_sys, planet: r.bt_planet },
      sellTerminal: { id: r.st_id, name: r.st_nick || r.st_name, system: r.st_sys, planet: r.st_planet },
      priceBuy: Number(r.price_buy),
      priceSell: Number(r.price_sell),
      profitPerScu: Number(r.profit_per_scu),
      totalProfit: Number(r.profit),
      roi: Number(r.roi),
      investment: cargo * Number(r.price_buy),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    cargoScu: cargo,
  };
}

export async function GET(request: NextRequest) {
  try {
    const s = new URL(request.url).searchParams;
    const result = await handleQuery({
      cargo_scu: parseInt(s.get("cargo_scu") || "100", 10),
      max_investment: parseParam(s.get("max_investment")),
      id_commodity: parseParam(s.get("id_commodity")),
      system_start: parseParam(s.get("system_start")),
      system_end: parseParam(s.get("system_end")),
      orbit_start: s.get("orbit_start") || "",
      orbit_end: s.get("orbit_end") || "",
      terminal_start: parseParam(s.get("terminal_start")),
      terminal_end: parseParam(s.get("terminal_end")),
      min_profit: parseFloat(s.get("min_profit") || "0"),
      page: parseInt(s.get("page") || "1", 10),
      limit: parseInt(s.get("limit") || "30", 10),
      sortBy: s.get("sortBy") || "profit",
      sortOrder: (s.get("sortOrder") === "asc" ? "ASC" : "DESC") as "ASC" | "DESC",
    });
    return NextResponse.json(result, { headers: secureHeaders() });
  } catch (error) {
    console.error("[API /trade/routes GET]", error);
    return NextResponse.json({ error: "Error al calcular rutas" }, { status: 500, headers: secureHeaders() });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await parsePostBody<Record<string, any>>(request);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400, headers: secureHeaders() });
    const result = await handleQuery({
      cargo_scu: body.cargo_scu || 100,
      max_investment: body.max_investment || null,
      id_commodity: body.id_commodity || null,
      system_start: body.system_start || null,
      system_end: body.system_end || null,
      orbit_start: body.orbit_start || "",
      orbit_end: body.orbit_end || "",
      terminal_start: body.terminal_start || null,
      terminal_end: body.terminal_end || null,
      min_profit: body.min_profit || 0,
      page: body.page || 1,
      limit: body.limit || 30,
      sortBy: body.sortBy || "profit",
      sortOrder: (body.sortOrder === "ASC" ? "ASC" : "DESC") as "ASC" | "DESC",
    });
    return NextResponse.json(result, { headers: secureHeaders() });
  } catch (error) {
    console.error("[API /trade/routes POST]", error);
    return NextResponse.json({ error: "Error al calcular rutas" }, { status: 500, headers: secureHeaders() });
  }
}
