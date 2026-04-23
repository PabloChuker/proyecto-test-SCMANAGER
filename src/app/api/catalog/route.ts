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
import { sql } from "@/lib/db";
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
  // TURRET apunta a la tabla `turrets` real (migracion 029) — son los gimbal
  // mounts / turret mounts que equipan armas adentro (con sub_type GunTurret,
  // MannedTurret, BallTurret, PDCTurret, MissileTurret, etc). Armas directas
  // se piden con type=WEAPON. El picker para un slot TURRET pide ambos types
  // y el cliente filtra por item.type para separar weapons vs gimbals.
  TURRET: {
    table: "turrets", type: "TURRET",
    idCol: "id", nameCol: "name", classCol: "class_name",
    sizeCol: "size", gradeCol: "grade", mfrCol: "manufacturer_id",
  },
  MISSILE: {
    table: "missiles", type: "MISSILE",
    idCol: "uuid", nameCol: "name", classCol: "name",
    sizeCol: "size", gradeCol: null, mfrCol: null,
  },
  // BOMB (migracion 053 / import-bombs.mjs) — bombas de gravity-drop como
  // el Colossus S10, Stormburst S5, Thunderball S3. Viven en su propia tabla
  // porque no tienen tracking y sus stats son ExplosionRadius / ArmTime.
  // Se piden EN CONJUNTO con MISSILE cuando el slot es un child de MISSILE_RACK:
  // asi los racks de bombers (Retaliator, Eclipse, Firebird) muestran bombas
  // como opcion alongside misiles del mismo size.
  BOMB: {
    table: "bombs", type: "BOMB",
    idCol: "id", nameCol: "name", classCol: "class_name",
    sizeCol: "size", gradeCol: "grade", mfrCol: "manufacturer_id",
  },
  // MISSILE_RACK apunta a tabla `missile_launchers` (migracion 018) — son los
  // racks/lanzadores que contienen los misiles adentro. Cuando el usuario
  // abre un slot MISSILE_RACK (no fijo) quiere cambiar el rack, no los
  // misiles de adentro. Los slots hijos siguen siendo type=MISSILE.
  MISSILE_RACK: {
    table: "missile_launchers", type: "MISSILE_RACK",
    idCol: "id", nameCol: "name", classCol: "class_name",
    sizeCol: "size", gradeCol: "grade", mfrCol: "manufacturer_id",
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
  // Mining lasers: misma fuente que /api/mining/lasers (MiningLoadoutCalculator).
  // mining_lasers no tiene class_name → usamos name como fallback para classCol.
  MINING_LASER: {
    table: "mining_lasers", type: "MINING_LASER",
    idCol: "id", nameCol: "name", classCol: "name",
    sizeCol: "size", gradeCol: null, mfrCol: "manufacturer",
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

  // Query each table — single round-trip per table using COUNT(*) OVER() window
  // function to avoid the separate COUNT query (N+1 → N queries).
  const allItems: any[] = [];
  let totalCount = 0;

  for (const [, def] of tablesToQuery) {
    try {
      const conds: string[] = [];
      const params: any[] = [];
      let idx = 1;

      // Columnas de la tabla base se refieren con alias "t." para evitar
      // ambiguedad cuando agregamos LEFT JOIN manufacturers (que tiene
      // columnas name, id que colisionan con las de t).
      // Size filter (only if the table has a size column)
      if (def.sizeCol) {
        if (maxSize < 99) {
          conds.push(`t.${def.sizeCol} <= $${idx}`);
          params.push(maxSize);
          idx++;
        }
        if (minSize > 0) {
          conds.push(`t.${def.sizeCol} >= $${idx}`);
          params.push(minSize);
          idx++;
        }
      }

      // Text search (sanitized)
      if (search) {
        const sanitized = sanitizeString(search, 100);
        conds.push(`(t.${def.nameCol} ILIKE $${idx} OR t.${def.classCol} ILIKE $${idx})`);
        params.push(`%${sanitized}%`);
        idx++;
      }

      const where = conds.length > 0 ? "WHERE " + conds.join(" AND ") : "";
      const orderCol = def.sizeCol ? `t.${def.sizeCol} DESC NULLS LAST, ` : "";

      // LEFT JOIN manufacturers solo si la tabla tiene columna de fabricante.
      // Asi devolvemos `manufacturer_name` legible (ej "Aegis Dynamics",
      // "Klaus & Werner") en lugar del UUID crudo que confunde al usuario.
      const joinClause = def.mfrCol
        ? `LEFT JOIN manufacturers m ON m.id = t.${def.mfrCol}`
        : "";
      const manufacturerSelect = def.mfrCol
        ? ", m.name AS manufacturer_name"
        : "";

      // Single query: data + total count via window function (no separate COUNT round-trip)
      const rows: any[] = await sql.unsafe(
        `SELECT t.*${manufacturerSelect}, COUNT(*) OVER()::int AS _total_count
         FROM ${def.table} t
         ${joinClause}
         ${where}
         ORDER BY ${orderCol}t.${def.nameCol} ASC
         LIMIT $${idx}`,
        [...params, limit],
      );

      if (rows.length > 0) {
        totalCount += rows[0]._total_count ?? rows.length;
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
    // manufacturer viene del JOIN con manufacturers: nombre legible
    // (ej "Aegis Dynamics") en lugar del UUID crudo. Fallback al UUID si
    // por alguna razon el JOIN no resolvio (defensive).
    manufacturer: def.mfrCol ? (row.manufacturer_name ?? row[def.mfrCol] ?? null) : null,
    // Per-type stat objects (ComponentPicker reads these)
    weaponStats: type === "WEAPON" ? stats : null,
    shieldStats: type === "SHIELD" ? stats : null,
    powerStats: type === "POWER_PLANT" ? stats : null,
    coolingStats: type === "COOLER" ? stats : null,
    quantumStats: type === "QUANTUM_DRIVE" ? stats : null,
    miningStats: type === "MINING_LASER" ? stats : null,
    missileStats: type === "MISSILE" ? stats : null,
    turretStats: type === "TURRET" ? stats : null,
    missileRackStats: type === "MISSILE_RACK" ? stats : null,
    bombStats: type === "BOMB" ? stats : null,
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
      s.weaponCapacity = numOrNull(row.weapon_capacity);
      s.requestedAmmoLoad = numOrNull(row.requested_ammo_load);
      s.regenCostPerBullet = numOrNull(row.regen_cost_per_bullet);
      s.maxAmmoLoad = numOrNull(row.max_ammo_load);
      s.maxRegenPerSec = numOrNull(row.max_regen_per_sec);
      s.fireMode = row.fire_mode ?? null;
      s.heatPerShot = numOrNull(row.heat_per_shot);
      s.emSignature = numOrNull(row.emission_em_max);
      // Power consumption (ballistic ≈ 0, energy > 0) — from migration 043
      s.powerDraw = numOrNull(row.power_consumption_max) ?? numOrNull(row.power_consumption);
      s.powerDrawMin = numOrNull(row.power_consumption_min);
      s.powerDrawMax = numOrNull(row.power_consumption_max);

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
      // Power consumption — from migration 042
      s.powerDraw = numOrNull(row.power_consumption_max) ?? numOrNull(row.power_consumption);
      s.powerDrawMin = numOrNull(row.power_consumption_min);
      s.powerDrawMax = numOrNull(row.power_consumption_max);
      s.emSignature = numOrNull(row.em_max);
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

    case "BOMB": {
      // bombs columns (migracion 053). Usamos los mismos alias que MISSILE
      // (damage, alphaDamage) para que el picker pueda mostrar bombas y
      // misiles mezclados en el mismo slot de rack sin logica extra.
      s.damage = numOrNull(row.damage_total);
      s.alphaDamage = numOrNull(row.damage_total);
      s.damagePhysical = numOrNull(row.damage_physical);
      s.damageEnergy = numOrNull(row.damage_energy);
      s.damageDistortion = numOrNull(row.damage_distortion);
      s.damageThermal = numOrNull(row.damage_thermal);
      s.explosionRadius = numOrNull(row.explosion_radius_max);
      s.armTime = numOrNull(row.arm_time);
      s.isCluster = !!row.is_cluster;
      // subType: "Utility" hoy (podria ser "Cluster" en el futuro).
      s.subType = row.sub_type ?? null;
      // Las bombas NO tienen tracking, lo dejamos explicito null.
      s.trackingSignal = null;
      break;
    }

    case "MISSILE_RACK": {
      // missile_launchers columns — son lanzadores/racks que contienen
      // misiles. missiles_label es el formato "4xS3" (4 misiles size 3),
      // super util como stat rapido del rack.
      const ports = Array.isArray(row.ports) ? row.ports : [];
      s.missileCount = numOrNull(row.missile_count);
      s.missilesLabel = row.missiles_label ?? null;
      s.missilePorts = ports.length || 0;
      s.hp = numOrNull(row.durability_health);
      s.mass = numOrNull(row.mass);
      // Tamanio maximo de misil que el rack acepta (max MaxSize de ports).
      if (ports.length > 0) {
        const sizes = ports
          .map((p: any) => numOrNull(p?.MaxSize ?? p?.Size))
          .filter((n: number | null): n is number => n !== null);
        s.maxMissileSize = sizes.length > 0 ? Math.max(...sizes) : null;
      } else {
        s.maxMissileSize = null;
      }
      break;
    }

    case "TURRET": {
      // turrets columns — son gimbal mounts / turret mounts (no confundir con
      // armas turret-mounted, esas viven en weapon_guns con type=WEAPON).
      // sub_type: GunTurret, MannedTurret, BallTurret, PDCTurret, TopTurret,
      //   MissileTurret, Utility, NoseMounted, CanardTurret, BottomTurret.
      // ports: jsonb array con los slots de arma que tiene dentro.
      const ports = Array.isArray(row.ports) ? row.ports : [];
      s.subType = row.sub_type ?? null;
      s.hp = numOrNull(row.durability_health);
      s.mass = numOrNull(row.mass);
      // Numero de armas que puede montar adentro (N slots en el array ports).
      s.weaponPorts = ports.length || 0;
      // Tamanio maximo de arma soportada (max MaxSize de los ports).
      if (ports.length > 0) {
        const sizes = ports
          .map((p: any) => numOrNull(p?.MaxSize ?? p?.Size))
          .filter((n: number | null): n is number => n !== null);
        s.maxWeaponSize = sizes.length > 0 ? Math.max(...sizes) : null;
      } else {
        s.maxWeaponSize = null;
      }
      break;
    }

    case "MINING_LASER": {
      // mining_lasers columns (mismo schema que usa MiningLoadoutCalculator).
      s.miningPower = numOrNull(row.mining_power);
      s.resistance = numOrNull(row.resistance);
      s.instability = numOrNull(row.instability);
      s.optimalRange = numOrNull(row.optimal_range);
      s.maxRange = numOrNull(row.max_range);
      s.throttleRate = numOrNull(row.throttle_rate);
      s.throttleMin = numOrNull(row.throttle_min);
      s.heatOutput = numOrNull(row.heat_output);
      s.shatterDamage = numOrNull(row.shatter_damage);
      s.moduleSlots = numOrNull(row.module_slots);
      break;
    }
  }

  return Object.keys(s).length > 0 ? s : null;
}
