// =============================================================================
// SC LABS — GET /api/ttk-target?id=...
//
// Devuelve los datos minimal de un ship para el TTK Calculator del LoadoutBuilder:
// shieldHp, hullHp, deflection (physical/energy), dmgMult (per type),
// resistances + absorptions del shield primary (min/max para interpolar por
// pip ratio). Usa el primer SHIELD del default loadout para los resists/abs.
//
// Se separa de /api/ships/[id] porque el response de allá es muy grande (toda
// la nave + power network + componentes hidratados) y para un dropdown que
// puede cambiar mucho conviene una respuesta de ~1KB.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { secureHeaders } from "@/lib/api-security";

export const revalidate = 300;

const num = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!id.trim()) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    // Resolvemos el ship por class_name o id (similar a /api/ships/[id]).
    const ship: any[] = await sql.unsafe(
      `SELECT s.id, s.class_name, s.name,
              s.deflection_physical, s.deflection_energy, s.deflection_distortion,
              CASE WHEN EXISTS(SELECT 1 FROM ship_flight_stats fs WHERE fs.ship_id = s.id)
                   THEN 0 ELSE 1 END AS has_satellites
         FROM ships s
        WHERE s.class_name = $1
           OR s.class_name ILIKE $1
           OR s.id::text = $1
           OR s.name ILIKE $1
        ORDER BY has_satellites ASC
        LIMIT 1`,
      [id],
    );
    if (ship.length === 0) {
      return NextResponse.json({ error: "ship not found" }, { status: 404 });
    }
    const sh = ship[0];

    // Resistances ship-level (deflect + dmgMult).
    const res: any[] = await sql.unsafe(
      `SELECT * FROM ship_resistances WHERE ship_id = $1 LIMIT 1`,
      [String(sh.id)],
    );
    const rr = res[0] ?? {};

    // W.16d (2026-05-04) — FIX: las columnas `shield_hp_total` y `hull_hp` NO
    // existen en `ship_fuel` (eran un copy-paste mental de otra parte del código).
    // El endpoint estaba devolviendo 500 silencioso para todas las naves → widget
    // sin datos. Corrigiendo a las fuentes reales:
    //   • Shield HP total → ship_power_reference.total_shield_hp (suma de los
    //     shields activos del default loadout, ya pre-computado por el ingest).
    //   • Hull HP → ship_resistances.armor_hp.
    // Fallback: si total_shield_hp es null, sumamos pool_hp de todos los shields
    // del default loadout (al menos para naves recién importadas).
    const power: any[] = await sql.unsafe(
      `SELECT total_shield_hp FROM ship_power_reference WHERE ship_id = $1 LIMIT 1`,
      [String(sh.id)],
    );
    let shieldHpTotal = num(power[0]?.total_shield_hp);
    if (shieldHpTotal == null) {
      const sumShields: any[] = await sql.unsafe(
        `SELECT COALESCE(SUM(sh2.pool_hp), 0) AS sum_pool_hp
           FROM ship_hardpoints hp
           JOIN shields sh2 ON sh2.class_name = hp.default_item_class
          WHERE hp.ship_id = $1`,
        [String(sh.id)],
      );
      shieldHpTotal = num(sumShields[0]?.sum_pool_hp) ?? 0;
    }
    const fu = { shield_hp_total: shieldHpTotal, hull_hp: null as number | null };

    // Primer SHIELD del default loadout para resists/abs.
    const shieldRow: any[] = await sql.unsafe(
      `SELECT sh.physical_resistance_min,  sh.physical_resistance_max,
              sh.energy_resistance_min,    sh.energy_resistance_max,
              sh.distortion_resistance_min, sh.distortion_resistance_max,
              sh.physical_absorption_min,  sh.physical_absorption_max,
              sh.energy_absorption_min,    sh.energy_absorption_max,
              sh.distortion_absorption_min, sh.distortion_absorption_max
         FROM ship_hardpoints hp
         JOIN shields sh ON sh.class_name = hp.default_item_class
        WHERE hp.ship_id = $1
        LIMIT 1`,
      [String(sh.id)],
    );
    const sd = shieldRow[0] ?? {};

    const ship_class_name = String(sh.class_name ?? "");
    const ship_name = String(sh.name ?? sh.class_name ?? "");

    return NextResponse.json(
      {
        shipId: sh.id,
        className: ship_class_name,
        name: ship_name,
        shieldHp: num(fu.shield_hp_total) ?? 0,
        hullHp: num(fu.hull_hp) ?? num(rr.armor_hp) ?? 0,
        deflectionPhysical: num(sh.deflection_physical),
        deflectionEnergy: num(sh.deflection_energy),
        dmgMultPhysical: num(rr.dmg_mult_physical),
        dmgMultEnergy: num(rr.dmg_mult_energy),
        dmgMultDistortion: num(rr.dmg_mult_distortion),
        shieldResistMin: {
          physical: num(sd.physical_resistance_min),
          energy: num(sd.energy_resistance_min),
          distortion: num(sd.distortion_resistance_min),
        },
        shieldResistMax: {
          physical: num(sd.physical_resistance_max),
          energy: num(sd.energy_resistance_max),
          distortion: num(sd.distortion_resistance_max),
        },
        shieldAbsMin: {
          physical: num(sd.physical_absorption_min),
          energy: num(sd.energy_absorption_min),
          distortion: num(sd.distortion_absorption_min),
        },
        shieldAbsMax: {
          physical: num(sd.physical_absorption_max),
          energy: num(sd.energy_absorption_max),
          distortion: num(sd.distortion_absorption_max),
        },
      },
      {
        headers: {
          ...secureHeaders(),
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (e: any) {
    console.error("[/api/ttk-target]", e?.message ?? e);
    return NextResponse.json(
      { error: "ttk-target failed", detail: e?.message ?? "unknown" },
      { status: 500 },
    );
  }
}
