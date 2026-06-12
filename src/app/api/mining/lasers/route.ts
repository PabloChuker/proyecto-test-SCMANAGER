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
    // Sitio.3 (2026-06-12): el DISTINCT ON sin filtro de game_version elegía
    // la fila por orden alfabético de class_name — mezclaba stats de 4.7.0 con
    // 4.8.0 según el láser. Priorizamos la GV online y, como module_slots solo
    // está poblado en GVs viejas (gap del datadumper), lo completamos con
    // COALESCE sobre la última fila que lo tenga. manufacturer ahora es el
    // NOMBRE real (join a manufacturers), no un uuid crudo.
    const rows: any[] = await sql.unsafe(`
      WITH online AS (SELECT version FROM game_versions WHERE online = true LIMIT 1)
      SELECT DISTINCT ON (wm.name)
        wm.id,
        wm.name,
        COALESCE(mf.name, wm.manufacturer_id::text) AS manufacturer,
        wm.size,
        wm.mining_laser_power AS "miningPower",
        wm.resistance,
        wm.instability,
        wm.optimal_range  AS "optimalRange",
        wm.maximum_range  AS "maxRange",
        wm.throttle_rate  AS "throttleRate",
        wm.throttle_min   AS "throttleMin",
        wm.heat_output    AS "heatOutput",
        wm.shatter_damage AS "shatterDamage",
        COALESCE(wm.module_slots, (
          SELECT wm2.module_slots FROM weapon_mining wm2
          WHERE wm2.class_name = wm.class_name AND wm2.module_slots IS NOT NULL
          ORDER BY wm2.game_version DESC LIMIT 1
        )) AS "moduleSlots"
      FROM weapon_mining wm
      LEFT JOIN manufacturers mf ON mf.id = wm.manufacturer_id
      WHERE wm.class_name NOT ILIKE '%_Template%'
        AND wm.class_name NOT ILIKE '%_Test%'
      ORDER BY wm.name ASC,
        (wm.game_version = (SELECT version FROM online)) DESC,
        wm.game_version DESC,
        wm.class_name ASC
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
