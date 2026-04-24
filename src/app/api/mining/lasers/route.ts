// =============================================================================
// AL FILO — GET /api/mining/lasers
//
// Returns all mining lasers from the weapon_mining table.
// Used by the Mining Loadout Calculator.
//
// Migrado de mining_lasers → weapon_mining (migración 054). weapon_mining es
// el superset con más data (power/cooling/emissions). Las columnas
// compat (resistance, instability, throttle_rate, etc.) fueron pobladas
// desde mining_lasers por seed matcheando por name prefix.
//
// Deduplicación: weapon_mining tiene variantes por ship (ej. Arbor MH1 tiene
// Template, GRIN_Arbor, MPUV_Arm, Test_Active). Para la UI del Loadout
// Calculator solo queremos 1 fila por laser "canonical", asi que excluimos
// class_names con _Template/_Test/_Test_Active y usamos DISTINCT ON (name)
// con el class_name canonical (ej. _GRIN_Arbor_S1).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const revalidate = 300;

export async function GET(request: NextRequest) {
  try {
    const rows: any[] = await sql.unsafe(`
      SELECT DISTINCT ON (name)
        id,
        name,
        manufacturer_id AS manufacturer,
        size,
        mining_laser_power AS "miningPower",
        resistance,
        instability,
        optimal_range  AS "optimalRange",
        maximum_range  AS "maxRange",
        throttle_rate  AS "throttleRate",
        throttle_min   AS "throttleMin",
        heat_output    AS "heatOutput",
        shatter_damage AS "shatterDamage",
        module_slots   AS "moduleSlots"
      FROM weapon_mining
      WHERE class_name NOT ILIKE '%_Template%'
        AND class_name NOT ILIKE '%_Test%'
      ORDER BY name ASC, class_name ASC
    `, []);

    // Convert BigInt/Decimal to number for JSON serialization
    const data = rows.map((r: any) => {
      const obj: any = {};
      for (const [k, v] of Object.entries(r)) {
        obj[k] = typeof v === "bigint" ? Number(v) : v;
      }
      return obj;
    });

    return NextResponse.json(
      { data, total: data.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err: any) {
    console.error("Mining lasers API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch mining lasers", detail: err.message },
      { status: 500 }
    );
  }
}
