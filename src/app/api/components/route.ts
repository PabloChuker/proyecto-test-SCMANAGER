export const dynamic = "force-dynamic";
// =============================================================================
// AL FILO — GET /api/components v3 (Correct DB tables)
//
// Searches real component tables (weapon_guns, shields, power_plants,
// coolers, quantum_drives, missiles) for compatible items.
//
// Parameters (GET):
//   ?category=WEAPON&maxSize=3
//   ?category=SHIELD&maxSize=2&search=shimmer
//   ?category=POWER_PLANT&search=js-400
//   ?limit=50
//
// Parameters (POST):
//   { category, maxSize, minSize, search, limit }
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

// Map hardpoint category → actual DB table + type label
const CATEGORY_TABLE: Record<string, { table: string; type: string; nameCol: string; classCol: string; sizeCol: string | null }> = {
  WEAPON:        { table: "weapon_guns",    type: "WEAPON",        nameCol: "name", classCol: "class_name", sizeCol: "size" },
  TURRET:        { table: "weapon_guns",    type: "WEAPON",        nameCol: "name", classCol: "class_name", sizeCol: "size" },
  MISSILE_RACK:  { table: "missiles",       type: "MISSILE",       nameCol: "name", classCol: "name",       sizeCol: "size" },
  SHIELD:        { table: "shields",        type: "SHIELD",        nameCol: "name", classCol: "class_name", sizeCol: "size" },
  POWER_PLANT:   { table: "power_plants",   type: "POWER_PLANT",   nameCol: "name", classCol: "class_name", sizeCol: "size" },
  COOLER:        { table: "coolers",        type: "COOLER",        nameCol: "name", classCol: "class_name", sizeCol: "size" },
  QUANTUM_DRIVE: { table: "quantum_drives", type: "QUANTUM_DRIVE", nameCol: "name", classCol: "class_name", sizeCol: "size" },
};

const ALLOWED_CATEGORIES = Object.keys(CATEGORY_TABLE) as const;

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
  if (typeof g === "string" && g.length === 1) return g.toUpperCase();
  return String(g);
}

/** Shared internal function for component search */
async function searchComponents(
  category: string,
  maxSize: number,
  minSize: number,
  search: string,
  limit: number,
) {
  // Validate and sanitize inputs
  const validCategory = validateWhitelist(category, ALLOWED_CATEGORIES, "WEAPON");
  const safeSearch = sanitizeString(search, 100);
  const safeMaxSize = validateInt(maxSize, 99, 0, 500);
  const safeMinSize = validateInt(minSize, 0, 0, 500);
  const safeLimit = validateInt(limit, 50, 1, 200);

  const mapping = CATEGORY_TABLE[validCategory];
  if (!mapping) {
    return {
      data: [],
      meta: { total: 0, limit: safeLimit },
      error: "Se requiere 'category' válido (WEAPON, SHIELD, POWER_PLANT, COOLER, QUANTUM_DRIVE, etc.)",
    };
  }

  const { table, type, nameCol, classCol, sizeCol } = mapping;

  // Build query
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (sizeCol) {
    if (safeMaxSize < 500) {
      conditions.push(`${sizeCol} <= $${idx}`);
      params.push(safeMaxSize);
      idx++;
    }
    if (safeMinSize > 0) {
      conditions.push(`${sizeCol} >= $${idx}`);
      params.push(safeMinSize);
      idx++;
    }
  }

  if (safeSearch) {
    conditions.push(`(${nameCol} ILIKE $${idx} OR ${classCol} ILIKE $${idx})`);
    params.push(`%${safeSearch}%`);
    idx++;
  }

  const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const orderCol = sizeCol ? `${sizeCol} DESC NULLS LAST, ` : "";

  let rows: any[] = [];
  let total = 0;

  try {
    const countResult: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as total FROM ${table} ${whereClause}`,
      ...params,
    );
    total = countResult[0]?.total ?? 0;

    rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM ${table} ${whereClause} ORDER BY ${orderCol}${nameCol} ASC LIMIT $${idx}`,
      ...params,
      safeLimit,
    );
  } catch {
    rows = [];
    total = 0;
  }

  const data = rows.map((row) => ({
    id: row.id || row.uuid || "",
    reference: row[classCol] || row.class_name || "",
    name: row[nameCol] || row.name || "",
    localizedName: null,
    className: row.class_name || row[classCol] || null,
    type,
    size: numOrNull(row[sizeCol || "size"]),
    grade: gradeToLetter(row.grade),
    manufacturer: row.manufacturer_id ?? row.manufacturer ?? null,
    componentStats: buildStats(row, type),
  }));

  return { data, meta: { total, limit: safeLimit } };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const category = searchParams.get("category")?.trim() || searchParams.get("type")?.trim() || "";
    const maxSize = searchParams.get("maxSize") || "99";
    const minSize = searchParams.get("minSize") || "0";
    const search = searchParams.get("search")?.trim() || "";
    const limit = searchParams.get("limit") || "50";

    const result = await searchComponents(category, parseInt(maxSize, 10), parseInt(minSize, 10), search, parseInt(limit, 10));

    if ((result as any).error) {
      return NextResponse.json(
        { error: (result as any).error },
        { status: 400, headers: secureHeaders() },
      );
    }

    return NextResponse.json(result, {
      headers: secureHeaders({ "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" }),
    });
  } catch (error) {
    console.error("[API /components] GET Error:", error);
    return NextResponse.json(
      { error: "Error al buscar componentes" },
      { status: 500, headers: secureHeaders() },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await parsePostBody<{
      category?: string;
      maxSize?: number;
      minSize?: number;
      search?: string;
      limit?: number;
    }>(request);

    if (!body) {
      return NextResponse.json(
        { error: "Invalid or missing JSON body" },
        { status: 400, headers: secureHeaders() },
      );
    }

    const category = String(body.category || "");
    const maxSize = body.maxSize ?? 99;
    const minSize = body.minSize ?? 0;
    const search = String(body.search || "");
    const limit = body.limit ?? 50;

    const result = await searchComponents(category, maxSize, minSize, search, limit);

    if ((result as any).error) {
      return NextResponse.json(
        { error: (result as any).error },
        { status: 400, headers: secureHeaders() },
      );
    }

    return NextResponse.json(result, {
      headers: secureHeaders({ "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" }),
    });
  } catch (error) {
    console.error("[API /components] POST Error:", error);
    return NextResponse.json(
      { error: "Error al buscar componentes" },
      { status: 500, headers: secureHeaders() },
    );
  }
}

// ─── Build componentStats from real DB columns ─────────────────────────────

function buildStats(row: any, type: string): Record<string, any> | null {
  const s: Record<string, any> = {};

  switch (type) {
    case "WEAPON": {
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
      s.heatPerShot = numOrNull(row.heat_per_shot);
      s.emSignature = numOrNull(row.emission_em_max);
      if (s.dps === 0 && s.alphaDamage > 0 && s.fireRate > 0) {
        s.dps = Math.round(s.alphaDamage * (s.fireRate / 60) * 100) / 100;
      }
      break;
    }
    case "SHIELD": {
      s.shieldHp = numOrNull(row.pool_hp);
      s.maxHp = numOrNull(row.pool_hp);
      s.shieldRegen = numOrNull(row.max_shield_regen);
      s.regenRate = numOrNull(row.max_shield_regen);
      s.downedDelay = numOrNull(row.downed_regen_delay);
      s.damagedDelay = numOrNull(row.damaged_regen_delay);
      s.powerDraw = numOrNull(row.power_consumption);
      s.emSignature = numOrNull(row.em_max);
      break;
    }
    case "POWER_PLANT": {
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
      s.coolingRate = numOrNull(row.cooling_generation);
      s.powerDraw = numOrNull(row.power_consumption);
      s.emSignature = numOrNull(row.em_max);
      s.irSignature = numOrNull(row.ir_max);
      break;
    }
    case "QUANTUM_DRIVE": {
      s.maxSpeed = numOrNull(row.drive_speed);
      s.fuelRate = numOrNull(row.fuel_rate);
      s.cooldownTime = numOrNull(row.cooldown_time);
      s.spoolUpTime = numOrNull(row.spool_up_time);
      break;
    }
    case "MISSILE": {
      s.damage = numOrNull(row.damage_total);
      s.alphaDamage = numOrNull(row.damage_total);
      s.trackingSignal = row.tracking_signal_type ?? null;
      s.speed = numOrNull(row.linear_speed);
      break;
    }
  }

  return Object.keys(s).length > 0 ? s : null;
}
