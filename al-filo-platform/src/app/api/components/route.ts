export const dynamic = "force-dynamic";
// =============================================================================
// AL FILO — GET /api/components v2 (Raw SQL — actual DB schema)
//
// Searches component tables (component_weapons, component_shields, etc.)
// for compatible items given a hardpoint category and size.
//
// Parameters:
//   ?category=WEAPON&maxSize=3
//   ?category=SHIELD&maxSize=2&search=shimmer
//   ?category=POWER_PLANT&search=js-400
//   ?limit=50
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 300;

// Map hardpoint category → component table + type label
const CATEGORY_TABLE: Record<string, { table: string; type: string }> = {
  WEAPON:        { table: "component_weapons",        type: "WEAPON" },
  TURRET:        { table: "component_weapons",        type: "WEAPON" },
  MISSILE_RACK:  { table: "component_weapons",        type: "MISSILE" },
  SHIELD:        { table: "component_shields",        type: "SHIELD" },
  POWER_PLANT:   { table: "component_power_plants",   type: "POWER_PLANT" },
  COOLER:        { table: "component_coolers",         type: "COOLER" },
  QUANTUM_DRIVE: { table: "component_quantum_drives", type: "QUANTUM_DRIVE" },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const category = searchParams.get("category")?.trim() || searchParams.get("type")?.trim() || "";
    const maxSize  = parseInt(searchParams.get("maxSize") || "99", 10);
    const search   = searchParams.get("search")?.trim() || "";
    const limit    = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

    const mapping = CATEGORY_TABLE[category];
    if (!mapping) {
      return NextResponse.json(
        { error: "Se requiere 'category' válido (WEAPON, SHIELD, POWER_PLANT, COOLER, QUANTUM_DRIVE, etc.)" },
        { status: 400 },
      );
    }

    const { table, type } = mapping;

    // Build query
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    // Size filter (if the table has a size column)
    if (maxSize < 99) {
      conditions.push(`size <= $${idx}`);
      params.push(maxSize);
      idx++;
    }

    // Search filter
    if (search) {
      conditions.push(`(name ILIKE $${idx} OR reference ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    let rows: any[] = [];
    let total = 0;

    try {
      const countResult: any[] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int as total FROM ${table} ${whereClause}`,
        ...params,
      );
      total = countResult[0]?.total ?? 0;

      rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM ${table} ${whereClause} ORDER BY size DESC NULLS LAST, name ASC LIMIT $${idx}`,
        ...params,
        limit,
      );
    } catch {
      // Table might be empty or not fully set up yet — return empty gracefully
      rows = [];
      total = 0;
    }

    // Map to expected format
    const data = rows.map((comp) => ({
      id: comp.id,
      reference: comp.reference || "",
      name: comp.name || "",
      localizedName: null,
      className: null,
      type,
      size: comp.size ?? null,
      grade: comp.grade ?? null,
      manufacturer: comp.manufacturer ?? null,
      componentStats: buildStats(comp, type),
    }));

    return NextResponse.json(
      { data, meta: { total, limit } },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (error) {
    console.error("[API /components] Error:", error);
    return NextResponse.json({ error: "Error al buscar componentes" }, { status: 500 });
  }
}

// ─── Build componentStats from raw component columns ────────────────────────

function buildStats(comp: any, type: string): Record<string, any> | null {
  const s: Record<string, any> = {};

  // Weapon fields
  if (comp.alpha_damage != null) s.alphaDamage = Number(comp.alpha_damage);
  if (comp.fire_rate != null) s.fireRate = Number(comp.fire_rate);
  if (comp.dps != null) s.dps = Number(comp.dps);
  if (comp.damage_type != null) s.damageType = comp.damage_type;
  if (comp.range != null) s.range = Number(comp.range);
  if (comp.speed != null) s.speed = Number(comp.speed);
  if (comp.ammo_count != null) s.ammoCount = Number(comp.ammo_count);

  // Shield fields
  if (comp.max_hp != null) { s.shieldHp = Number(comp.max_hp); s.maxHp = Number(comp.max_hp); }
  if (comp.regen_rate != null) { s.shieldRegen = Number(comp.regen_rate); s.regenRate = Number(comp.regen_rate); }

  // Power plant fields
  if (comp.power_output != null) s.powerOutput = Number(comp.power_output);

  // Cooler fields
  if (comp.cooling_rate != null) s.coolingRate = Number(comp.cooling_rate);

  // Quantum drive fields
  if (comp.max_speed != null) s.maxSpeed = Number(comp.max_speed);
  if (comp.fuel_rate != null) s.fuelRate = Number(comp.fuel_rate);

  // Common fields
  if (comp.power_draw != null) s.powerDraw = Number(comp.power_draw);
  if (comp.thermal_output != null) s.thermalOutput = Number(comp.thermal_output);
  if (comp.em_signature != null) s.emSignature = Number(comp.em_signature);
  if (comp.ir_signature != null) s.irSignature = Number(comp.ir_signature);

  // Compute DPS if missing
  if (!s.dps && s.alphaDamage && s.fireRate) {
    const a = s.alphaDamage, fr = s.fireRate;
    if (a > 0 && fr > 0) s.dps = Math.round(a * (fr / 60) * 100) / 100;
  }

  return Object.keys(s).length > 0 ? s : null;
}
