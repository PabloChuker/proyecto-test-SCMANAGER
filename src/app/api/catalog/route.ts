export const dynamic = "force-dynamic";
// =============================================================================
// AL FILO — GET/POST /api/catalog v3 (Correct DB table names + columns)
//
// Universal item catalog for the ComponentPicker. Queries the REAL tables:
//   weapon_guns, shields, power_plants, coolers, quantum_drives, missiles
//
// Query params (GET):
//   types      — comma-separated: WEAPON, TURRET, MISSILE, SHIELD, etc.
//   type       — single type alias
//   maxSize    — max component size
//   minSize    — min component size
//   search     — ILIKE on name / class_name
//   limit      — max results (default 80, max 200)
//   include    — ignored (compat)
//
// POST body:
//   { type?, types?, minSize?, maxSize?, search?, limit? }
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sanitizeString,
  validateInt,
  validateWhitelist,
  parsePostBody,
  secureHeaders,
} from "@/lib/api-security";

export const revalidate = 300;

// ─── Table mapping ─────────────────────────────────────────────────────────

interface TableDef {
  table: string;
  type: string;
  idCol: string;          // primary key column
  nameCol: string;        // display name
  classCol: string;       // class_name or equivalent
  sizeCol: string | null; // size column (null if not present)
  gradeCol: string | null;
  mfrCol: string | null;  // manufacturer column
}

const TYPE_TABLE: Record<string, TableDef> = {
  WEAPON: {
    table: "weapon_guns", type: "WEAPON",
    idCol: "id", nameCol: "name", classCol: "class_name",
    sizeCol: "size", gradeCol: "grade", mfrCol: "manufacturer_id",
  },
  TURRET: {
    table: "weapon_guns", type: "WEAPON",
    idCol: "id", nameCol: "name", classCol: "class_name",
    sizeCol: "size", gradeCol: "grade", mfrCol: "manufacturer_id",
  },
  MISSILE: {
    table: "missiles", type: "MISSILE",
    idCol: "uuid", nameCol: "name", classCol: "name",
    sizeCol: "size", gradeCol: null, mfrCol: null,
  },
  SHIELD: {
    table: "shields", type: "SHIELD",
    idCol: "id", nameCol: "name", classCol: "class_name",
    sizeCol: "size", gradeCol: "grade", mfrCol: "manufacturer_id",
  },
  POWER_PLANT: {
    table: "power_plants", type: "POWER_PLANT",
    idCol: "uuid", nameCol: "name", classCol: "class_name",
    sizeCol: "size", gradeCol: "grade", mfrCol: "manufacturer_id",
  },
  COOLER: {
    table: "coolers", type: "COOLER",
    idCol: "id", nameCol: "name", classCol: "class_name",
    sizeCol: "size", gradeCol: "grade", mfrCol: "manufacturer_id",
  },
  QUANTUM_DRIVE: {
    table: "quantum_drives", type: "QUANTUM_DRIVE",
    idCol: "uuid", nameCol: "name", classCol: "class_name",
    sizeCol: "size", gradeCol: "grade", mfrCol: "manufacturer_id",
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** Convert numeric grade (1,2,3) to letter (A,B,C,D) */
function gradeToLetter(g: any): string | null {
  if (g === null || g === undefined) return null;
  const GRADE_MAP: Record<number, string> = { 1: "A", 2: "B", 3: "C", 4: "D" };
  const n = Number(g);
  if (!isNaN(n) && GRADE_MAP[n]) return GRADE_MAP[n];
  // Already a letter
  if (typeof g === "string" && g.length === 1) return g.toUpperCase();
  return String(g);
}

// ─── Shared query function (used by GET and POST) ──────────────────────────

interface CatalogParams {
  type?: string;
  types?: string;
  minSize?: number;
  maxSize?: number;
  search?: string;
  limit?: number;
}

async function queryCatalog(params: CatalogParams) {
  const {
    type: typeParam = "",
    types: typesParam = "",
    minSize = 0,
    maxSize = 99,
    search = "",
    limit = 80,
  } = params;

  // Resolve types
  let types: string[] = [];
  if (typeParam) types = [typeParam];
  else if (typesParam) types = typesParam.split(",").map((t) => t.trim()).filter(Boolean);

  if (types.length === 0) {
    return { data: [], meta: { total: 0, limit } };
  }

  // Validate and sanitize types against whitelist
  const TYPE_WHITELIST = Object.keys(TYPE_TABLE) as const;
  const validTypes = types
    .map((t) => validateWhitelist(t, TYPE_WHITELIST, ""))
    .filter(Boolean);

  if (validTypes.length === 0) {
    return { data: [], meta: { total: 0, limit } };
  }

  // Deduplicate tables (WEAPON and TURRET both map to weapon_guns)
  const tablesToQuery = new Map<string, TableDef>();
  for (const t of validTypes) {
    const def = TYPE_TABLE[t];
    if (def && !tablesToQuery.has(def.table)) {
      tablesToQuery.set(def.table, def);
    }
  }

  if (tablesToQuery.size === 0) {
    return { data: [], meta: { total: 0, limit } };
  }

  // Query each table
  const allItems: any[] = [];
  let totalCount = 0;

  for (const [, def] of tablesToQuery) {
    try {
      const conds: string[] = [];
      const params: any[] = [];
      let idx = 1;

      // Size filter (only if the table has a size column)
      if (def.sizeCol) {
        if (maxSize < 99) {
          conds.push(`${def.sizeCol} <= $${idx}`);
          params.push(maxSize);
          idx++;
        }
        if (minSize > 0) {
          conds.push(`${def.sizeCol} >= $${idx}`);
          params.push(minSize);
          idx++;
        }
      }

      // Text search (sanitized)
      if (search) {
        const sanitized = sanitizeString(search, 100);
        conds.push(`(${def.nameCol} ILIKE $${idx} OR ${def.classCol} ILIKE $${idx})`);
        params.push(`%${sanitized}%`);
        idx++;
      }

      const where = conds.length > 0 ? "WHERE " + conds.join(" AND ") : "";
      const orderCol = def.sizeCol ? `${def.sizeCol} DESC NULLS LAST, ` : "";

      // Count
      const countRows: any[] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int as total FROM ${def.table} ${where}`,
        ...params,
      );
      const count = countRows[0]?.total ?? 0;
      totalCount += count;

      // Fetch
      if (count > 0) {
        const rows: any[] = await prisma.$queryRawUnsafe(
          `SELECT * FROM ${def.table} ${where} ORDER BY ${orderCol}${def.nameCol} ASC LIMIT $${idx}`,
          ...params,
          limit,
        );
        for (const row of rows) {
          allItems.push(mapRow(row, def));
        }
      }
    } catch (err) {
      console.error(`[catalog] Error querying ${def.table}:`, err);
    }
  }

  return { data: allItems, meta: { total: totalCount, limit, types: validTypes } };
}

// ─── GET handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract and validate query parameters
    const typeParam = sanitizeString(searchParams.get("type") || "", 100);
    const typesParam = sanitizeString(searchParams.get("types") || "", 200);
    const minSize = validateInt(searchParams.get("minSize"), 0, 0, 100);
    const maxSize = validateInt(searchParams.get("maxSize"), 99, 0, 100);
    const search = sanitizeString(searchParams.get("search") || "", 100);
    const limit = validateInt(searchParams.get("limit"), 80, 1, 200);

    const result = await queryCatalog({
      type: typeParam,
      types: typesParam,
      minSize,
      maxSize,
      search,
      limit,
    });

    return NextResponse.json(result, { headers: secureHeaders() });
  } catch (error) {
    console.error("[API /catalog GET] Error:", error);
    return NextResponse.json(
      { error: "Error en el catálogo" },
      { status: 500, headers: secureHeaders() },
    );
  }
}

// ─── POST handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await parsePostBody<CatalogParams>(request);

    if (!body) {
      return NextResponse.json(
        { error: "Invalid request body. Expected JSON." },
        { status: 400, headers: secureHeaders() },
      );
    }

    // Validate and sanitize parameters
    const typeParam = sanitizeString(body.type || "", 100);
    const typesParam = sanitizeString(body.types || "", 200);
    const minSize = validateInt(body.minSize, 0, 0, 100);
    const maxSize = validateInt(body.maxSize, 99, 0, 100);
    const search = sanitizeString(body.search || "", 100);
    const limit = validateInt(body.limit, 80, 1, 200);

    const result = await queryCatalog({
      type: typeParam,
      types: typesParam,
      minSize,
      maxSize,
      search,
      limit,
    });

    return NextResponse.json(result, { headers: secureHeaders() });
  } catch (error) {
    console.error("[API /catalog POST] Error:", error);
    return NextResponse.json(
      { error: "Error en el catálogo" },
      { status: 500, headers: secureHeaders() },
    );
  }
}

// ─── Map a DB row to the CatalogItem shape the frontend expects ─────────────

function mapRow(row: any, def: TableDef): any {
  const type = def.type;
  const stats = buildStats(row, type);
  const className = row[def.classCol] || row.class_name || null;

  return {
    id: row[def.idCol] || row.id || row.uuid || "",
    reference: className || "",
    name: row[def.nameCol] || row.name || "",
    localizedName: null,
    className,
    type,
    size: numOrNull(row[def.sizeCol || "size"]),
    grade: def.gradeCol ? gradeToLetter(row[def.gradeCol]) : null,
    manufacturer: def.mfrCol ? (row[def.mfrCol] ?? null) : null,
    // Per-type stat objects (ComponentPicker reads these)
    weaponStats: type === "WEAPON" ? stats : null,
    shieldStats: type === "SHIELD" ? stats : null,
    powerStats: type === "POWER_PLANT" ? stats : null,
    coolingStats: type === "COOLER" ? stats : null,
    quantumStats: type === "QUANTUM_DRIVE" ? stats : null,
    miningStats: null,
    missileStats: type === "MISSILE" ? stats : null,
    thrusterStats: null,
    shopInventory: [],
  };
}

// ─── Build the stats object from the actual DB columns ──────────────────────

function buildStats(row: any, type: string): Record<string, any> | null {
  const s: Record<string, any> = {};

  switch (type) {
    case "WEAPON": {
      // weapon_guns columns
      const dpsP = numOrNull(row.dps_physical) ?? 0;
      const dpsE = numOrNull(row.dps_energy) ?? 0;
      const dpsD = numOrNull(row.dps_distortion) ?? 0;
      const dpsT = numOrNull(row.dps_thermal) ?? 0;
      const dpsB = numOrNull(row.dps_biochemical) ?? 0;
      const dpsS = numOrNull(row.dps_stun) ?? 0;
      s.dps = Math.round(((dpsP) + (dpsE) + (dpsD) + (dpsT) + (dpsB) + (dpsS)) * 100) / 100;

      const aP = numOrNull(row.alpha_physical) ?? 0;
      const aE = numOrNull(row.alpha_energy) ?? 0;
      const aD = numOrNull(row.alpha_distortion) ?? 0;
      const aT = numOrNull(row.alpha_thermal) ?? 0;
      const aB = numOrNull(row.alpha_biochemical) ?? 0;
      const aS = numOrNull(row.alpha_stun) ?? 0;
      s.alphaDamage = Math.round(((aP) + (aE) + (aD) + (aT) + (aB) + (aS)) * 100) / 100;

      s.damagePerShot = numOrNull(row.damage_per_shot);
      s.fireRate = numOrNull(row.rate_of_fire);
      s.effectiveRange = numOrNull(row.effective_range);
      s.ammoSpeed = numOrNull(row.ammo_speed);
      s.ammoCapacity = numOrNull(row.ammo_capacity);
      s.fireMode = row.fire_mode ?? null;
      s.heatPerShot = numOrNull(row.heat_per_shot);
      s.emSignature = numOrNull(row.emission_em_max);

      // Compute DPS from alpha if table DPS columns are all 0
      if (s.dps === 0 && s.alphaDamage > 0 && s.fireRate > 0) {
        s.dps = Math.round(s.alphaDamage * (s.fireRate / 60) * 100) / 100;
      }
      break;
    }

    case "SHIELD": {
      // shields columns
      s.shieldHp = numOrNull(row.pool_hp) ?? numOrNull(row.max_shield_health);
      s.maxHp = numOrNull(row.pool_hp) ?? numOrNull(row.max_shield_health);
      s.shieldRegen = numOrNull(row.max_shield_regen);
      s.regenRate = numOrNull(row.max_shield_regen);
      s.downedDelay = numOrNull(row.downed_regen_delay) ?? numOrNull(row.downed_delay);
      s.damagedDelay = numOrNull(row.damaged_regen_delay) ?? numOrNull(row.damaged_delay);
      s.powerDraw = numOrNull(row.power_consumption_max) ?? numOrNull(row.power_consumption);
      s.powerDrawMin = numOrNull(row.power_consumption_min);
      s.powerDrawMax = numOrNull(row.power_consumption_max);
      s.emSignature = numOrNull(row.em_max);
      break;
    }

    case "POWER_PLANT": {
      // power_plants columns — prefer DB column, fallback to raw_data
      let powerGen = numOrNull(row.power_generation);
      if (!powerGen || powerGen === 0) {
        powerGen = numOrNull(row.raw_data?.stdItem?.ResourceNetwork?.Usage?.Power?.Maximum) ?? 0;
      }
      s.powerOutput = powerGen;
      let emSig = numOrNull(row.em_max);
      if (!emSig || emSig === 0) {
        emSig = numOrNull(row.raw_data?.stdItem?.Emission?.Em?.Maximum) ?? 0;
      }
      s.emSignature = emSig;
      break;
    }

    case "COOLER": {
      // coolers columns
      s.coolingRate = numOrNull(row.cooling_generation) ?? numOrNull(row.cooling_rate);
      s.powerDraw = numOrNull(row.power_consumption_max) ?? numOrNull(row.power_draw_max);
      s.powerDrawMin = numOrNull(row.power_consumption_min);
      s.powerDrawMax = numOrNull(row.power_consumption_max);
      s.emSignature = numOrNull(row.em_max);
      s.irSignature = numOrNull(row.ir_max);
      break;
    }

    case "QUANTUM_DRIVE": {
      // quantum_drives columns
      s.maxSpeed = numOrNull(row.drive_speed);
      s.fuelRate = numOrNull(row.fuel_rate);
      s.cooldownTime = numOrNull(row.cooldown_time);
      s.spoolUpTime = numOrNull(row.spool_up_time);
      break;
    }

    case "MISSILE": {
      // missiles columns
      s.damage = numOrNull(row.damage_total);
      s.alphaDamage = numOrNull(row.damage_total);
      s.trackingSignal = row.tracking_signal_type ?? null;
      s.speed = numOrNull(row.linear_speed);
      break;
    }
  }

  return Object.keys(s).length > 0 ? s : null;
}
