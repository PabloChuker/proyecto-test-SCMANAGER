export const dynamic = "force-dynamic";
// =============================================================================
// SC LABS — GET /api/components/browse
//
// Generic component table browser. Returns rows from any allowed table
// with sorting, filtering, and pagination.
//
// Params (GET):
//   ?table=weapon_guns       (required)
//   ?sort=name&dir=asc       (optional)
//   ?search=vanduul           (optional, searches name/class_name)
//   ?size=3                   (optional, filter by size)
//   ?limit=50&offset=0        (optional)
//
// Params (POST):
//   { table, search, size, sort, dir, limit, offset }
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getOnlineVersionsArray } from "@/lib/onlineVersions";
import {
  sanitizeString,
  validateInt,
  validateWhitelist,
  validateSortColumn,
  validateSortDir,
  parsePostBody,
  secureHeaders,
} from "@/lib/api-security";

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
  weapon_mining:       { label: "Mining Lasers",     defaultSort: "name" },
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
  // Sitio.7 (2026-06-12): ships no tiene columnas scm_speed/afterburner_speed
  // (viven en ship_flight_stats) — ordenarlas tiraba 500. manufacturer ahora
  // sale del JOIN a manufacturers (antes era manufacturer_id y mostraba "—").
  ships: [
    { key: "name", label: "Name", type: "text", width: 3 },
    { key: "manufacturer", label: "Manufacturer", type: "text", width: 2 },
    { key: "role", label: "Role", type: "text" },
    { key: "size", label: "Size", type: "number" },
    { key: "crew", label: "Crew", type: "number" },
    { key: "cargo_capacity", label: "Cargo", type: "number" },
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
  weapon_mining: [
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

// ─── Shared internal function for browsing components ────────────────────────

async function browseComponents(
  table: string,
  search: string,
  size: number | null,
  sort: string,
  dir: "ASC" | "DESC",
  limit: number,
  offset: number,
) {
  // Validate and sanitize inputs
  const validTable = validateWhitelist(table, Object.keys(ALLOWED_TABLES) as readonly string[], "weapon_guns");
  const config = ALLOWED_TABLES[validTable];
  const columns = TABLE_COLUMNS[validTable] || [{ key: "name", label: "Name", type: "text" as const }];

  const safeSearch = sanitizeString(search, 200);
  // Tope alto para poder traer todas las filas de un browse sin paginar.
  // Las tablas de componentes del juego rondan las ~300-2000 entradas como máximo.
  const safeLimit = validateInt(limit, 500, 1, 5000);
  const safeOffset = validateInt(offset, 0, 0, 1000000);

  // Build whitelist of column keys for sort validation
  const columnWhitelist = columns.reduce((acc, col) => {
    acc[col.key] = col.key;
    return acc;
  }, {} as Record<string, string>);

  const safeSortCol = validateSortColumn(sort, columnWhitelist, config.defaultSort);
  const safeSortDir = validateSortDir(dir);

  // Sitio.7: missiles no tiene class_name — el search genérico con
  // COALESCE(class_name,'') rompía en esa tabla.
  const hasClassName = validTable !== "missiles";

  // Build WHERE conditions (alias t — necesario para el JOIN de ships)
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (safeSearch) {
    conditions.push(
      hasClassName
        ? `(t.name ILIKE $${idx} OR COALESCE(t.class_name,'') ILIKE $${idx})`
        : `(t.name ILIKE $${idx})`,
    );
    params.push(`%${safeSearch}%`);
    idx++;
  }

  if (size !== null && size !== undefined) {
    const safeSize = validateInt(size, -1, 0, 500);
    if (safeSize >= 0) {
      conditions.push(`t.size = $${idx}`);
      params.push(safeSize);
      idx++;
    }
  }

  // Sitio.7 (CRÍTICO): todas las tablas versionadas tienen 4-5 game_versions
  // cargadas y este browse no filtraba ninguna → cada item aparecía 3-4 veces
  // con stats mezclados. Servimos solo la GV online (+ CONCEPT para ships,
  // que son las naves concept legítimas del catálogo).
  const onlineList = await getOnlineVersionsArray();
  if (onlineList && onlineList.length > 0) {
    const gvList = validTable === "ships" ? [...onlineList, "CONCEPT"] : onlineList;
    conditions.push(`t.game_version = ANY($${idx}::text[])`);
    params.push(gvList);
    idx++;
  }

  // Junk filter (Templates/Test/placeholders) — mismo criterio que /api/catalog.
  if (hasClassName) {
    conditions.push(
      `t.class_name NOT ILIKE '%_Template%' AND t.class_name NOT ILIKE '%_Test%' AND (t.name IS NULL OR t.name NOT ILIKE '%PLACEHOLDER%')`,
    );
  } else {
    conditions.push(`(t.name IS NULL OR t.name NOT ILIKE '%PLACEHOLDER%')`);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  // FROM con alias; ships joinea manufacturers para mostrar el nombre real.
  const fromClause =
    validTable === "ships"
      ? `ships t LEFT JOIN manufacturers mf ON mf.id = t.manufacturer_id`
      : `${validTable} t`;

  // For weapon_guns DPS: compute dps_total as a computed column
  let selectClause = "t.*";
  if (validTable === "ships") {
    selectClause = `t.*, t.class_name AS reference, mf.name AS manufacturer`;
  }
  let orderClause = `t."${safeSortCol}" ${safeSortDir} NULLS LAST`;
  if (validTable === "ships" && safeSortCol === "manufacturer") {
    orderClause = `mf.name ${safeSortDir} NULLS LAST`;
  }

  if (validTable === "weapon_guns") {
    selectClause = `t.*,
      COALESCE(dps_physical,0) + COALESCE(dps_energy,0) + COALESCE(dps_distortion,0) + COALESCE(dps_thermal,0) + COALESCE(dps_biochemical,0) + COALESCE(dps_stun,0) as dps_total,
      COALESCE(alpha_physical,0) + COALESCE(alpha_energy,0) + COALESCE(alpha_distortion,0) + COALESCE(alpha_thermal,0) + COALESCE(alpha_biochemical,0) + COALESCE(alpha_stun,0) as alpha_total`;
    if (safeSortCol === "dps_total") {
      orderClause = `(COALESCE(dps_physical,0) + COALESCE(dps_energy,0) + COALESCE(dps_distortion,0) + COALESCE(dps_thermal,0)) ${safeSortDir} NULLS LAST`;
    }
    if (safeSortCol === "alpha_total") {
      orderClause = `(COALESCE(alpha_physical,0) + COALESCE(alpha_energy,0) + COALESCE(alpha_distortion,0) + COALESCE(alpha_thermal,0)) ${safeSortDir} NULLS LAST`;
    }
  }

  // Count total
  const countResult: any[] = await sql.unsafe(
    `SELECT COUNT(*)::int as total FROM ${fromClause} ${where}`,
    params,
  );
  const total = countResult[0]?.total ?? 0;

  // Fetch rows
  const rows: any[] = await sql.unsafe(
    `SELECT ${selectClause} FROM ${fromClause} ${where} ORDER BY ${orderClause} LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, safeLimit, safeOffset],
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

  return {
    table: validTable,
    label: config.label,
    columns,
    rows: cleanRows,
    meta: { total, limit: safeLimit, offset: safeOffset },
  };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get("table")?.trim() || "";

    if (!table || !ALLOWED_TABLES[table]) {
      return NextResponse.json(
        { error: "Invalid table", allowed: Object.keys(ALLOWED_TABLES) },
        { status: 400, headers: secureHeaders() },
      );
    }

    // Parse params
    const search = searchParams.get("search")?.trim() || "";
    const sizeStr = searchParams.get("size")?.trim();
    const size = sizeStr ? parseInt(sizeStr, 10) : null;
    const sort = searchParams.get("sort")?.trim() || "";
    const dir = (searchParams.get("dir")?.trim().toUpperCase() === "DESC" ? "DESC" : "ASC") as "ASC" | "DESC";
    const limit = searchParams.get("limit") || "200";
    const offset = searchParams.get("offset") || "0";

    const result = await browseComponents(
      table,
      search,
      size,
      sort,
      dir,
      parseInt(limit, 10),
      parseInt(offset, 10),
    );

    return NextResponse.json(result, {
      headers: secureHeaders({ "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" }),
    });
  } catch (error: any) {
    console.error("[API /components/browse] GET Error:", error?.message || error);
    return NextResponse.json(
      { error: "Error interno", detail: error?.message || "Unknown" },
      { status: 500, headers: secureHeaders() },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await parsePostBody<{
      table?: string;
      search?: string;
      size?: number;
      sort?: string;
      dir?: string;
      limit?: number;
      offset?: number;
    }>(request);

    if (!body) {
      return NextResponse.json(
        { error: "Invalid or missing JSON body" },
        { status: 400, headers: secureHeaders() },
      );
    }

    const table = String(body.table || "");
    if (!table || !ALLOWED_TABLES[table]) {
      return NextResponse.json(
        { error: "Invalid table", allowed: Object.keys(ALLOWED_TABLES) },
        { status: 400, headers: secureHeaders() },
      );
    }

    const search = String(body.search || "");
    const size = body.size ?? null;
    const sort = String(body.sort || "");
    const dir = (String(body.dir || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC") as "ASC" | "DESC";
    const limit = body.limit ?? 200;
    const offset = body.offset ?? 0;

    const result = await browseComponents(table, search, size, sort, dir, limit, offset);

    return NextResponse.json(result, {
      headers: secureHeaders({ "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" }),
    });
  } catch (error: any) {
    console.error("[API /components/browse] POST Error:", error?.message || error);
    return NextResponse.json(
      { error: "Error interno", detail: error?.message || "Unknown" },
      { status: 500, headers: secureHeaders() },
    );
  }
}
