// =============================================================================
// SC Labs — GET /api/fps-weapons
//
// Devuelve todas las armas FPS para la página /tools/fps-weapons.
//
// REFACTOR 2026-04-27 (post-cambios DB de Garnok)
// -----------------------------------------------
//
// Antes este endpoint leía de la tabla `fps_weapons` (migración 061), que
// había sido alimentada con un Excel manual de Pablo (296 rows). El equipo
// de DBs creó después `fps_weapon_items` (migración 065) alimentada desde
// scunpacked con stats parseadas (397 rows, mucho más completas, incluyendo
// damage por tipo, spread, dps por tipo, manufacturer, raw_data JSONB, y la
// columna `ammo_speed` que Garnok pobló desde stdItem.Ammunition.Speed).
//
// Para no mantener dos tablas paralelas, el endpoint ahora lee de
// `fps_weapon_items`. La página /tools/fps-weapons sigue funcionando sin
// cambios porque mantenemos exactamente el mismo shape de respuesta — los
// modos single/burst/rapid se extraen del raw_data->Modes[] JSON.
//
// Plan de cleanup de la tabla vieja: cuando este endpoint esté validado en
// prod, aplicar la migración 066 que dropea `fps_weapons` (queda como
// archivo independiente con instrucciones).
// =============================================================================

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const revalidate = 300;

// Helper: parsea modes de raw_data->Modes[] y devuelve { single, burst, rapid }
// con { firerate, dps } por modo. Si un modo no existe, queda en null.
function extractModes(rawData: any): {
  singleFirerate: number | null;
  singleDps: number | null;
  burstFirerate: number | null;
  burstDps: number | null;
  rapidFirerate: number | null;
  rapidDps: number | null;
} {
  const empty = {
    singleFirerate: null, singleDps: null,
    burstFirerate: null, burstDps: null,
    rapidFirerate: null, rapidDps: null,
  };
  if (!rawData) return empty;

  // raw_data viene como JSONB del struct stdItem.Weapon. Los modos están en
  // stdItem.Weapon.Modes[] (cada uno con Name, RoundsPerMinute, DamagePerShot,
  // DamagePerSecond). Algunas armas tienen un solo modo, otras 2 o 3.
  let modes: any[] = [];
  if (Array.isArray(rawData.Modes)) {
    modes = rawData.Modes;
  } else if (rawData.Weapon && Array.isArray(rawData.Weapon.Modes)) {
    modes = rawData.Weapon.Modes;
  }

  const out = { ...empty };
  for (const m of modes) {
    if (!m || typeof m !== "object") continue;
    const name = String(m.Name ?? "").toLowerCase();
    const rpm = Number(m.RoundsPerMinute ?? m.rounds_per_minute ?? 0) || null;
    const dps = Number(m.DamagePerSecond ?? m.damage_per_second ?? 0) || null;
    if (name.includes("single")) {
      out.singleFirerate = rpm;
      out.singleDps = dps;
    } else if (name.includes("burst")) {
      out.burstFirerate = rpm;
      out.burstDps = dps;
    } else if (name.includes("rapid") || name.includes("auto") || name.includes("full")) {
      out.rapidFirerate = rpm;
      out.rapidDps = dps;
    }
  }
  return out;
}

// Helper: extrae volumen del raw_data si existe.
function extractVolume(rawData: any): number | null {
  if (!rawData) return null;
  // Buscar en lugares comunes: stdItem.Volume, Weapon.Volume, Volume directo, etc.
  const candidates = [
    rawData.Volume,
    rawData.volume,
    rawData.Weapon?.Volume,
    rawData.Ammunition?.Volume,
    rawData.Ammunition?.PerShot?.Volume,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

// Helper: mapea damage_class de fps_weapon_items al "type" que espera la UI.
// La UI usa esos strings para colorear badges (Ballistic, Energy (Laser), etc).
function mapDamageClass(dc: string | null, itemType: string | null): string {
  const s = (dc ?? "").trim();
  if (!s) {
    // Fallback al item_type si damage_class está vacío
    return itemType ?? "Unknown";
  }
  return s;
}

export async function GET() {
  try {
    // Filtramos solo type=WeaponPersonal para mantener el dataset acotado a
    // las armas reales (no attachments, no ammo containers).
    const rows: any[] = await sql.unsafe(`
      SELECT
        name,
        damage_class,
        item_type,
        magazine_size       AS magazine,
        ammo_speed          AS bullet_speed,
        damage_alpha_total  AS alpha_damage,
        rate_of_fire_rpm    AS max_firerate,
        dps_total           AS max_dps,
        raw_data
      FROM fps_weapon_items
      WHERE type = 'WeaponPersonal'
      ORDER BY name ASC
    `, []);

    // Coercer numerics + extraer modos del JSON. La página espera shape exacto
    // del endpoint viejo así que mapeamos uno a uno.
    const TEXT_FIELDS = new Set(["name", "type"]);
    const data = rows.map((r) => {
      const modes = extractModes(r.raw_data);
      const volume = extractVolume(r.raw_data);

      const numericOrNull = (v: any): number | null => {
        if (v === null || v === undefined) return null;
        if (typeof v === "number") return Number.isFinite(v) ? v : null;
        if (typeof v === "bigint") return Number(v);
        if (typeof v === "string") {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };

      return {
        name: String(r.name ?? ""),
        type: mapDamageClass(r.damage_class, r.item_type),
        magazine: numericOrNull(r.magazine),
        bulletSpeed: numericOrNull(r.bullet_speed),
        alphaDamage: numericOrNull(r.alpha_damage),
        maxFirerate: numericOrNull(r.max_firerate),
        maxDps: numericOrNull(r.max_dps),
        singleFirerate: modes.singleFirerate,
        singleDps: modes.singleDps,
        burstFirerate: modes.burstFirerate,
        burstDps: modes.burstDps,
        rapidFirerate: modes.rapidFirerate,
        rapidDps: modes.rapidDps,
        volumeMicroScu: volume,
      };
    });
    void TEXT_FIELDS; // mantenido por si se usa en lint future

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
