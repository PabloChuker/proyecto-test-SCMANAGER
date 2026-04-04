export const dynamic = "force-dynamic";
// =============================================================================
// AL FILO — GET /api/catalog v2 (Raw SQL — actual DB schema)
//
// Universal item catalog endpoint. Queries component_weapons,
// component_shields, component_power_plants, component_coolers,
// component_quantum_drives based on the requested type(s).
//
// Query params:
//   types      — comma-separated: WEAPON, TURRET, SHIELD, POWER_PLANT, etc.
//   type       — single type (alias for types)
//   maxSize    — max component size
//   minSize    — min component size
//   search     — text search across name, reference
//   sortBy     — name, size, dps, shieldHp, powerOutput, coolingRate
//   sortOrder  — asc or desc
//   limit      — max results (default 50, max 200)
//   include    — ignored for now (compatibility with old frontend)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 300;

// Map item types → actual DB table + component type label
const TYPE_TABLE_MAP: Record<string, { table: string; type: string }> = {
  WEAPON:        { table: "component_weapons",        type: "WEAPON" },
  TURRET:        { table: "component_weapons",        type: "WEAPON" },
  MISSILE:       { table: "component_weapons",        type: "MISSILE" },
  SHIELD:        { table: "component_shields",        type: "SHIELD" },
  POWER_PLANT:   { table: "component_power_plants",   type: "POWER_PLANT" },
  COOLER:        { table: "component_coolers",         type: "COOLER" },
  QUANTUM_DRIVE: { table: "component_quantum_drives", type: "QUANTUM_DRIVE" },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const typeParam  = searchParams.get("type")?.trim() || "";
    const typesParam = searchParams.get("types")?.trim() || "";
    const minSize    = parseInt(searchParams.get("minSize") || "0", 10);
    const maxSize    = parseInt(searchParams.get("maxSize") || "99", 10);
    const search     = searchParams.get("search")?.trim() || "";
    const sortOrder  = searchParams.get("sortOrder") === "asc" ? "ASC" : "DESC";
    const limit      = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

    // Resolve which types to query
    let types: string[] = [];
    if (typeParam) types = [typeParam];
    else if (typesParam) types = typesParam.split(",").map((t) => t.trim()).filter(Boolean);

    if (types.length === 0) {
      return NextResponse.json({ data: [], meta: { total: 0, limit } });
    }

    // Find unique tables to query
    const tablesToQuery = new Map<string, { table: string; type: string }>();
    for (const t of types) {
      const mapping = TYPE_TABLE_MAP[t];
      if (mapping && !tablesToQuery.has(mapping.table)) {
        tablesToQuery.set(mapping.table, mapping);
      }
    }

    if (tablesToQuery.size === 0) {
      return NextResponse.json({ data: [], meta: { total: 0, limit } });
    }

    // Query each table and combine results
    const allItems: any[] = [];
    let totalCount = 0;

    for (const [, { table, type }] of tablesToQuery) {
      try {
        const conditions: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (maxSize < 99) {
          conditions.push(`size <= $${idx}`);
          params.push(maxSize);
          idx++;
        }
        if (minSize > 0) {
          conditions.push(`size >= $${idx}`);
          params.push(minSize);
          idx++;
        }
        if (search) {
          conditions.push(`(name ILIKE $${idx} OR reference ILIKE $${idx})`);
          params.push(`%${search}%`);
          idx++;
        }

        const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

        // Count
        const countResult: any[] = await prisma.$queryRawUnsafe(
          `SELECT COUNT(*)::int as total FROM ${table} ${whereClause}`,
          ...params,
        );
        const count = countResult[0]?.total ?? 0;
        totalCount += count;

        // Fetch
        if (count > 0) {
          const rows: any[] = await prisma.$queryRawUnsafe(
            `SELECT * FROM ${table} ${whereClause} ORDER BY size DESC NULLS LAST, name ASC LIMIT $${idx}`,
            ...params,
            limit,
          );

          for (const row of rows) {
            allItems.push(mapToCatalogItem(row, type));
          }
        }
      } catch {
        // Table might be empty or inaccessible — skip gracefully
      }
    }

    return NextResponse.json(
      {
        data: allItems,
        meta: { total: totalCount, limit, types },
      },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (error) {
    console.error("[API /catalog] Error:", error);
    return NextResponse.json({ error: "Error en el catálogo" }, { status: 500 });
  }
}

// ─── Map raw component row to the CatalogItem format the frontend expects ───

function mapToCatalogItem(comp: any, type: string): any {
  const stats = buildStats(comp, type);

  return {
    id: comp.id,
    reference: comp.reference || "",
    name: comp.name || "",
    localizedName: null,
    className: null,
    type,
    size: comp.size ?? null,
    grade: comp.grade ?? null,
    manufacturer: comp.manufacturer ?? null,
    // Old-style stats fields (for ComponentPicker compatibility)
    weaponStats: type === "WEAPON" || type === "MISSILE" ? stats : null,
    shieldStats: type === "SHIELD" ? stats : null,
    powerStats: type === "POWER_PLANT" ? stats : null,
    coolingStats: type === "COOLER" ? stats : null,
    quantumStats: type === "QUANTUM_DRIVE" ? stats : null,
    miningStats: null,
    missileStats: type === "MISSILE" ? stats : null,
    thrusterStats: null,
    shopInventory: [], // Shop data not yet available
  };
}

function buildStats(comp: any, type: string): Record<string, any> | null {
  const s: Record<string, any> = {};

  // Weapon fields
  if (comp.alpha_damage != null) s.alphaDamage = Number(comp.alpha_damage);
  if (comp.fire_rate != null) s.fireRate = Number(comp.fire_rate);
  if (comp.dps != null) s.dps = Number(comp.dps);
  if (comp.damage_type != null) s.damageType = comp.damage_type;
  if (comp.range != null) s.range = Number(comp.range);

  // Shield fields
  if (comp.max_hp != null) { s.maxHp = Number(comp.max_hp); s.shieldHp = Number(comp.max_hp); }
  if (comp.regen_rate != null) { s.regenRate = Number(comp.regen_rate); s.shieldRegen = Number(comp.regen_rate); }

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
