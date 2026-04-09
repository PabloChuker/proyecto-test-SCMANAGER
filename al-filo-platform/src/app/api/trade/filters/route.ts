export const dynamic = "force-dynamic";
// =============================================================================
// SC LABS — /api/trade/filters
// Returns dropdown data for the trade route calculator filters:
// vehicles (ships with cargo), terminals, orbits (planets), star systems.
// =============================================================================

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { secureHeaders } from "@/lib/api-security";

export const revalidate = 600; // 10 min cache

export async function GET() {
  try {
    // Ships with cargo > 0 (deduplicated by name, take max cargo)
    const vehicles: any[] = await sql.unsafe(
      `SELECT name, MAX(cargo_capacity) as cargo
       FROM ships WHERE cargo_capacity > 0
       GROUP BY name
       ORDER BY MAX(cargo_capacity) DESC`,
      [],
    );

    // All terminals grouped by system
    const terminals: any[] = await sql.unsafe(
      `SELECT id, nickname, name, planet_name, star_system_name
       FROM trade_terminals
       WHERE is_available = 1
       ORDER BY star_system_name, planet_name, name`,
      [],
    );

    // Distinct orbits (planets)
    const orbits: any[] = await sql.unsafe(
      `SELECT DISTINCT planet_name, star_system_name
       FROM trade_terminals
       WHERE planet_name IS NOT NULL AND planet_name != ''
       ORDER BY star_system_name, planet_name`,
      [],
    );

    // Star systems
    const systems: any[] = await sql.unsafe(
      `SELECT id, name FROM trade_star_systems ORDER BY name`,
      [],
    );

    // Commodities for filter
    const commodities: any[] = await sql.unsafe(
      `SELECT id, name, code, kind FROM trade_commodities
       WHERE is_available = 1
       ORDER BY name`,
      [],
    );

    return NextResponse.json({
      vehicles: vehicles.map((v) => ({
        name: v.name,
        cargo: Math.round(Number(v.cargo)),
      })),
      terminals: terminals.map((t) => ({
        id: t.id,
        label: t.nickname || t.name,
        planet: t.planet_name || "",
        system: t.star_system_name || "",
      })),
      orbits: orbits.map((o) => ({
        planet: o.planet_name,
        system: o.star_system_name,
      })),
      systems: systems.map((s) => ({ id: s.id, name: s.name })),
      commodities: commodities.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        kind: c.kind,
      })),
    }, { headers: secureHeaders() });
  } catch (error) {
    console.error("[API /trade/filters] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener filtros" },
      { status: 500, headers: secureHeaders() },
    );
  }
}
