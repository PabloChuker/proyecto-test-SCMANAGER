export const dynamic = "force-dynamic";
// =============================================================================
// SC LABS — /api/trade/filters v2
// Returns dropdown data for the trade route calculator.
// Pulls systems, stations, and commodities from commodity_prices.
// Vehicles still come from the ships table.
// =============================================================================

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { secureHeaders } from "@/lib/api-security";

export const revalidate = 600; // 10 min cache

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

    // Distinct systems from commodity_prices
    const systems: any[] = await sql.unsafe(
      `SELECT DISTINCT system FROM commodity_prices ORDER BY system`,
      [],
    );

    // Distinct stations with their system
    const stations: any[] = await sql.unsafe(
      `SELECT DISTINCT station, system
       FROM commodity_prices
       ORDER BY system, station`,
      [],
    );

    // Distinct commodities — enrich with trade_commodities name when available
    const commodities: any[] = await sql.unsafe(
      `SELECT DISTINCT
         cp.commodity_abbr as abbr,
         COALESCE(tc.name, cp.commodity_abbr) as name,
         COALESCE(tc.kind, '') as kind
       FROM commodity_prices cp
       LEFT JOIN trade_commodities tc ON tc.code = cp.commodity_abbr
       ORDER BY COALESCE(tc.name, cp.commodity_abbr)`,
      [],
    );

    return NextResponse.json(
      {
        vehicles: vehicles.map((v) => ({
          name: v.name,
          cargo: Math.round(Number(v.cargo)),
        })),
        systems: systems.map((s) => s.system),
        stations: stations.map((s) => ({
          name: s.station,
          system: s.system,
        })),
        commodities: commodities.map((c) => ({
          abbr: c.abbr,
          name: c.name,
          kind: c.kind,
        })),
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
