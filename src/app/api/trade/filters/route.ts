export const dynamic = "force-dynamic";
// =============================================================================
// SC LABS — /api/trade/filters v2
// Returns dropdown data for the trade route calculator.
// Tries commodity_prices first; falls back to old UEX tables if missing.
// =============================================================================

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { secureHeaders } from "@/lib/api-security";

export const revalidate = 600; // 10 min cache

async function tryQuery(query: string, params: any[] = []) {
  try {
    return await sql.unsafe(query, params);
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // Ships with cargo > 0 (unchanged)
    const vehicles: any[] = await sql.unsafe(
      `SELECT name, MAX(cargo_capacity) as cargo
       FROM ships WHERE cargo_capacity > 0
       GROUP BY name
       ORDER BY MAX(cargo_capacity) DESC`,
      [],
    );

    // Try commodity_prices first (new table from CSV data)
    let systems: any[] | null = await tryQuery(
      `SELECT DISTINCT system FROM commodity_prices ORDER BY system`,
    );
    let stations: any[] | null = systems
      ? await tryQuery(
          `SELECT DISTINCT station, system FROM commodity_prices ORDER BY system, station`,
        )
      : null;
    let commodities: any[] | null = systems
      ? await tryQuery(
          `SELECT DISTINCT
             cp.commodity_abbr as abbr,
             COALESCE(tc.name, cp.commodity_abbr) as name,
             COALESCE(tc.kind, '') as kind
           FROM commodity_prices cp
           LEFT JOIN trade_commodities tc ON tc.code = cp.commodity_abbr
           ORDER BY COALESCE(tc.name, cp.commodity_abbr)`,
        )
      : null;

    const useCommodityPrices = systems && stations && commodities;

    // Fallback: old UEX tables
    if (!useCommodityPrices) {
      console.warn("[/api/trade/filters] commodity_prices unavailable, falling back to UEX tables");

      const sysRows: any[] = await sql.unsafe(
        `SELECT id, name FROM trade_star_systems ORDER BY name`,
        [],
      );
      const termRows: any[] = await sql.unsafe(
        `SELECT id, nickname, name, planet_name, star_system_name
         FROM trade_terminals WHERE is_available = 1
         ORDER BY star_system_name, planet_name, name`,
        [],
      );
      const comRows: any[] = await sql.unsafe(
        `SELECT id, name, code, kind FROM trade_commodities
         WHERE is_available = 1 ORDER BY name`,
        [],
      );

      return NextResponse.json(
        {
          vehicles: vehicles.map((v) => ({
            name: v.name,
            cargo: Math.round(Number(v.cargo)),
          })),
          systems: sysRows.map((s) => s.name),
          stations: termRows.map((t) => ({
            name: t.nickname || t.name,
            system: t.star_system_name || "",
          })),
          commodities: comRows.map((c) => ({
            abbr: c.code,
            name: c.name,
            kind: c.kind || "",
          })),
          _source: "uex_tables",
        },
        { headers: secureHeaders() },
      );
    }

    // commodity_prices path
    return NextResponse.json(
      {
        vehicles: vehicles.map((v) => ({
          name: v.name,
          cargo: Math.round(Number(v.cargo)),
        })),
        systems: systems!.map((s) => s.system),
        stations: stations!.map((s) => ({
          name: s.station,
          system: s.system,
        })),
        commodities: commodities!.map((c) => ({
          abbr: c.abbr,
          name: c.name,
          kind: c.kind,
        })),
        _source: "commodity_prices",
      },
      { headers: secureHeaders() },
    );
  } catch (error) {
    console.error("[API /trade/filters] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener filtros" },
      { status: 500, headers: secureHeaders() },
    );
  }
}
