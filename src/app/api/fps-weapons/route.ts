// =============================================================================
// SC Labs — GET /api/fps-weapons
//
// Devuelve todas las armas FPS de la tabla `fps_weapons` (migración 061).
// Sin filtros server-side — el dataset es chico (~300 rows) y la página
// hace todo el filter/search/sort client-side. Cache 5 min.
// =============================================================================

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const revalidate = 300;

export async function GET() {
  try {
    const rows: any[] = await sql.unsafe(`
      SELECT
        name,
        type,
        magazine,
        bullet_speed       AS "bulletSpeed",
        alpha_damage       AS "alphaDamage",
        max_firerate       AS "maxFirerate",
        max_dps            AS "maxDps",
        single_firerate    AS "singleFirerate",
        single_dps         AS "singleDps",
        burst_firerate     AS "burstFirerate",
        burst_dps          AS "burstDps",
        rapid_firerate     AS "rapidFirerate",
        rapid_dps          AS "rapidDps",
        volume_micro_scu   AS "volumeMicroScu"
      FROM fps_weapons
      ORDER BY name ASC
    `);

    // Postgres `numeric` se serializa como STRING por defecto en el driver
    // postgres.js — el front necesita Number para hacer comparaciones y sort.
    // Convertimos explícitamente cualquier valor numérico de string a Number;
    // dejamos null/undefined intactos. `name` y `type` son text → siguen
    // siendo string.
    const TEXT_FIELDS = new Set(["name", "type"]);
    const data = rows.map((r) => {
      const obj: any = {};
      for (const [k, v] of Object.entries(r)) {
        if (v === null || v === undefined) {
          obj[k] = null;
        } else if (TEXT_FIELDS.has(k)) {
          obj[k] = String(v);
        } else if (typeof v === "bigint") {
          obj[k] = Number(v);
        } else if (typeof v === "string") {
          const n = Number(v);
          obj[k] = Number.isFinite(n) ? n : null;
        } else {
          obj[k] = v;
        }
      }
      return obj;
    });

    return NextResponse.json(
      { weapons: data, total: data.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (err: any) {
    console.error("FPS weapons API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch FPS weapons", detail: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}
