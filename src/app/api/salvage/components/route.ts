// =============================================================================
// SC Labs — GET /api/salvage/components
//
// Devuelve los componentes de salvage (SalvageHead + SalvageModifier)
// desde la tabla `weapon_salvage`. Usada por el ComponentPicker del
// LoadoutBuilder para los brazos de Vulture / Fortune / Salvation / Reclaimer.
//
// Query params opcionales:
//   ?type=Head              → filtra sub_type=Head
//   ?type=Modifier          → filtra sub_type=Modifier
//   ?kind=Tractor|Scraper   → sólo para sub_type=Modifier
//   ?size=1                 → filtra por size exacto
//   ?includeTemplates=0     → excluye class_name con _Template o <= PLACEHOLDER =>
//                              (default: 0, es decir excluidos)
//   ?gameVersion=...        → override; default toma el registro `online=true`
//                              en game_versions (única fuente de verdad)
//
// Contexto: hasta la migración 056 los items de salvage eran hardcode dentro
// de src/app/api/ships/[id]/route.ts. Este endpoint los expone para que el
// picker del child slot filtre Tractor vs Scraper contra la BD real.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { resolveEffectiveGv } from "@/lib/onlineVersions";

export const revalidate = 300;

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl;
    const type = url.searchParams.get("type");              // Head | Modifier
    const kind = url.searchParams.get("kind");              // Tractor | Scraper
    const size = url.searchParams.get("size");
    const gameVersion = url.searchParams.get("gameVersion");
    const includeTemplates = url.searchParams.get("includeTemplates") === "1";

    // Fase GV-Online: si vino gameVersion en query string, validamos contra
    // las versions online. Si la pedida está offline, caemos al default online.
    let version = await resolveEffectiveGv(gameVersion);
    if (!version) {
      // Fallback (cache fail-open o sin filas online): query antigua
      const fallback: any[] = await sql.unsafe(
        `SELECT version FROM game_versions ORDER BY version DESC LIMIT 1`,
      );
      version = fallback[0]?.version ?? null;
    }
    if (!version) {
      return NextResponse.json(
        { error: "No hay game_versions configuradas" },
        { status: 500 },
      );
    }

    const where: string[] = ["game_version = $1"];
    const args: any[] = [version];

    if (type === "Head" || type === "Modifier") {
      args.push(type);
      where.push(`sub_type = $${args.length}`);
    }
    if (kind === "Tractor" || kind === "Scraper") {
      args.push(kind);
      where.push(`modifier_kind = $${args.length}`);
    }
    if (size !== null && size !== "" && !Number.isNaN(Number(size))) {
      args.push(Number(size));
      where.push(`size = $${args.length}`);
    }
    if (!includeTemplates) {
      where.push(`class_name NOT ILIKE '%_Template%'`);
      where.push(`(name IS NULL OR name NOT ILIKE '%PLACEHOLDER%')`);
    }

    const rows: any[] = await sql.unsafe(
      `SELECT
         id, class_name, item_name, name, description,
         manufacturer_id, sub_type, modifier_kind,
         size, grade,
         salvage_speed_multiplier AS "salvageSpeedMultiplier",
         radius_multiplier        AS "radiusMultiplier",
         extraction_efficiency    AS "extractionEfficiency",
         mass, width, height, length, scu,
         game_version            AS "gameVersion"
       FROM weapon_salvage
       WHERE ${where.join(" AND ")}
       ORDER BY sub_type DESC, modifier_kind NULLS LAST, size ASC, name ASC`,
      args,
    );

    const data = rows.map((r: any) => {
      const obj: any = {};
      for (const [k, v] of Object.entries(r)) {
        obj[k] = typeof v === "bigint" ? Number(v) : v;
      }
      return obj;
    });

    return NextResponse.json(
      { data, total: data.length, gameVersion: version },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (err: any) {
    console.error("Salvage components API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch salvage components", detail: err.message },
      { status: 500 },
    );
  }
}
