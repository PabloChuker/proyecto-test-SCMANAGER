export const dynamic = "force-dynamic";
// =============================================================================
// SC LABS — GET /api/components/browse
//
// Generic component table browser. Returns rows from any allowed table
// with sorting, filtering, and pagination.
//
// Params:
//   ?table=weapon_guns       (required)
//   ?sort=name&dir=asc       (optional)
//   ?search=vanduul           (optional, searches name/class_name)
//   ?size=3                   (optional, filter by size)
//   ?limit=50&offset=0        (optional)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── Allowed tables (whitelist for security) ─────────────────────────────────

const ALLOWED_TABLES: Record<string, { label: string; defaultSort: string }> = {
  ships:               { label: "Ships",             defaultSort: "name" },
  weapon_guns:         { label: "Weapons",           defaultSort: "name" },
  missiles:            { label: "Missiles",          defaultSort: "name" },
  emps:                { label: "EMP Generators",    defaultSort: "name" },
  shields:             { label: "Shields",           defaultSort: "name" },
  power_plants:        { label: "Power Plants",      defaultSort: "name" },
  coolers:             { label: "Coolers",           defaultSort: "name" },
  quantum_drives:      { label: "Quantum Drives",    defaultSort: "name" },
  mining_lasers:       { label: "Mining Lasers",     defaultSort: "name" },
  turrets:             { label: "Turrets",           defaultSort: "name" },
  quantum_interdiction_generators: { label: "QED", defaultSort: "name" },
};

// ─── Column configs per table (which columns to show & their display names) ──

export interface ColumnDef {
  key: string;
  label: string;
  type: "text" | "number" | "grade";
  width?: number; // relative width weight
}

const TABLE_COLUMNS: Record<string, ColumnDef[]> = {
  ships: [
    { key: "name", label: "Name", type: "text", width: 3 },
    { key: "manufacturer", label: "Manufacturer", type: "text", width: 2 },
    { key: "role", label: "Role", type: "text" },
    { key: "size", label: "Size", type: "number" },
    { key: "max_crew", label: "Crew", type: "number" },
    { key: "cargo_capacity", label: "Cargo", type: "number" },
    { key: "scm_speed", label: "SCM Speed", type: "number" },
    { key: "afterburner_speed", label: "NAV Speed", type: "number" },
  ],
  weapon_guns: [
    { key: "name", label: "Name", type: "text", width: 2 },
    { key: "class_name", label: "Class", type: "text", width: 2 },
    { key: "size", label: "Size", type: "number" },
    { key: "grade", label: "Grade", type: "grade" },
    { key: "class", label: "Type", type: "text" },
    { key: "dps_total", label: "DPS", type: "number" },
    { key: "alpha_total", label: "Alpha", type: "number" },
    { key: "rate_of_fire", label: "Fire Rate", type: "number" },
    { key: "effective_range", label: "Range", type: "number" },
    { key: "ammo_speed", label: "Ammo Speed", type: "number" },
    { key: "damage_per_shot", label: "Dmg/Shot", type: "number" },
  ],
  missiles: [
    { key: "name", label: "Name", type: "text", width: 2 },
    { key: "size", label: "Size", type: "number" },
    { key: "tracking_signal_type", label: "Tracking", type: "text" },
    { key: "damage_total", label: "Damage", type: "number" },
    { key: "linear_speed", label: "Speed", type: "number" },
    { key: "lock_time", label: "Lock Time", type: "number" },
  ],
  emps: [
    { key: "name", label: "Name", type: "text", width: 2 },
    { key: "class_name", label: "Class", type: "text", width: 2 },
    { key: "size", label: "Size", type: "number" },
    { key: "distortion_damage", label: "Distortion DMG", type: "number" },
    { key: "charge_time", label: "Charge Time", type: "number" },
    { key: "cooldown_time", label: "Cooldown", type: "number" },
    { key: "radius", label: "Radius", type: "number" },
  ],
  shields: [
    { key: "name", label: "Name", type: "text", width: 2 },
    { key: "class_name", label: "Class", type: "text", width: 2 },
    { key: "size", label: "Size", type: "number" },
    { key: "grade", label: "Grade", type: "grade" },
    { key: "class", label: "Type", type: "text" },
    { key: "pool_hp", label: "Shield HP", type: "number" },
    { key: "max_shield_regen", label: "Regen", type: "number" },
    { key: "regen_time", label: "Regen Time", type: "number" },
    { key: "power_consumption", label: "Power Draw", type: "number" },
    { key: "em_max", label: "EM", type: "number" },
    { key: "physical_resistance_max", label: "Phys Res", type: "number" },
    { key: "energy_resistance_max", label: "Energy Res", type: "number" },
    { key: "distortion_resistance_max", label: "Dist Res", type: "number" },
  ],
  power_plants: [
    { key: "name", label: "Name", type: "text", width: 2 },
    { key: "class_name", label: "Class", type: "text", width: 2 },
    { key: "size", label: "Size", type: "number" },
    { key: "grade", label: "Grade", type: "grade" },
    { key: "class", label: "Type", type: "text" },
    { key: "power_generation", label: "Power Output", type: "number" },
    { key: "em_max", label: "EM", type: "number" },
    { key: "health", label: "Health", type: "number" },
  ],
  coolers: [
    { key: "name", label: "Name", type: "text", width: 2 },
    { key: "class_name", label: "Class", type: "text", width: 2 },
    { key: "size", label: "Size", type: "number" },
    { key: "grade", label: "Grade", type: "grade" },
    { key: "class", label: "Type", type: "text" },
    { key: "cooling_generation", label: "Cooling Rate", type: "number" },
    { key: "power_consumption", label: "Power Draw", type: "number" },
    { key: "em_max", label: "EM", type: "number" },
    { key: "ir_max", label: "IR", type: "number" },
    { key: "health", label: "Health", type: "number" },
  ],
  quantum_drives: [
    { key: "name", label: "Name", type: "text", width: 2 },
    { key: "class_name", label: "Class", type: "text", width: 2 },
    { key: "size", label: "Size", type: "number" },
    { key: "grade", label: "Grade", type: "grade" },
    { key: "class", label: "Type", type: "text" },
    { key: "drive_speed", label: "Speed", type: "number" },
    { key: "fuel_rate", label: "Fuel Rate", type: "number" },
    { key: "spool_up_time", label: "Spool Time", type: "number" },
    { key: "cooldown_time", label: "Cooldown", type: "number" },
  ],
  mining_lasers: [
    { key: "name", label: "Name", type: "text", width: 2 },
    { key: "class_name", label: "Class", type: "text", width: 2 },
    { key: "size", label: "Size", type: "number" },
    { key: "grade", label: "Grade", type: "grade" },
  ],
  turrets: [
    { key: "name", label: "Name", type: "text", width: 2 },
    { key: "class_name", label: "Class", type: "text", width: 2 },
    { key: "size", label: "Size", type: "number" },
  ],
  quantum_interdiction_generators: [
    { key: "name", label: "Name", type: "text", width: 2 },
    { key: "class_name", label: "Class", type: "text", width: 2 },
    { key: "size", label: "Size", type: "number" },
  ],
};

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get("table")?.trim() || "";

    if (!table || !ALLOWED_TABLES[table]) {
      return NextResponse.json(
        { error: "Invalid table", allowed: Object.keys(ALLOWED_TABLES) },
        { status: 400 },
      );
    }

    const config = ALLOWED_TABLES[table];
    const columns = TABLE_COLUMNS[table] || [{ key: "name", label: "Name", type: "text" as const }];

    // Parse params
    const search = searchParams.get("search")?.trim() || "";
    const sizeFilter = searchParams.get("size")?.trim() || "";
    const sortCol = searchParams.get("sort")?.trim() || config.defaultSort;
    const sortDir = searchParams.get("dir")?.trim().toUpperCase() === "DESC" ? "DESC" : "ASC";
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "200", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    // Security: validate sort column exists in column defs
    const validColumns = columns.map(c => c.key);
    const safeSortCol = validColumns.includes(sortCol) ? sortCol : config.defaultSort;

    // Build WHERE conditions
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (search) {
      conditions.push(`(name ILIKE $${idx} OR COALESCE(class_name,'') ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    if (sizeFilter) {
      conditions.push(`size = $${idx}`);
      params.push(parseInt(sizeFilter, 10));
      idx++;
    }

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    // For weapon_guns DPS: compute dps_total as a computed column
    let selectClause = "*";
    let orderClause = `"${safeSortCol}" ${sortDir} NULLS LAST`;

    if (table === "weapon_guns") {
      selectClause = `*,
        COALESCE(dps_physical,0) + COALESCE(dps_energy,0) + COALESCE(dps_distortion,0) + COALESCE(dps_thermal,0) + COALESCE(dps_biochemical,0) + COALESCE(dps_stun,0) as dps_total,
        COALESCE(alpha_physical,0) + COALESCE(alpha_energy,0) + COALESCE(alpha_distortion,0) + COALESCE(alpha_thermal,0) + COALESCE(alpha_biochemical,0) + COALESCE(alpha_stun,0) as alpha_total`;
      if (safeSortCol === "dps_total") {
        orderClause = `(COALESCE(dps_physical,0) + COALESCE(dps_energy,0) + COALESCE(dps_distortion,0) + COALESCE(dps_thermal,0)) ${sortDir} NULLS LAST`;
      }
      if (safeSortCol === "alpha_total") {
        orderClause = `(COALESCE(alpha_physical,0) + COALESCE(alpha_energy,0) + COALESCE(alpha_distortion,0) + COALESCE(alpha_thermal,0)) ${sortDir} NULLS LAST`;
      }
    }

    // Count total
    const countResult: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as total FROM ${table} ${where}`,
      ...params,
    );
    const total = countResult[0]?.total ?? 0;

    // Fetch rows
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT ${selectClause} FROM ${table} ${where} ORDER BY ${orderClause} LIMIT $${idx} OFFSET $${idx + 1}`,
      ...params,
      limit,
      offset,
    );

    // Strip raw_data to reduce payload
    const cleanRows = rows.map((row: any) => {
      const { raw_data, ...rest } = row;
      // Convert BigInt/Decimal to number for JSON serialization
      const clean: Record<string, any> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (typeof v === "bigint") clean[k] = Number(v);
        else if (v !== null && typeof v === "object" && "toNumber" in (v as any)) clean[k] = (v as any).toNumber();
        else clean[k] = v;
      }
      return clean;
    });

    return NextResponse.json(
      {
        table,
        label: config.label,
        columns,
        rows: cleanRows,
        meta: { total, limit, offset },
      },
      {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      },
    );
  } catch (error: any) {
    console.error("[API /components/browse] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Error interno", detail: error?.message || "Unknown" },
      { status: 500 },
    );
  }
}
