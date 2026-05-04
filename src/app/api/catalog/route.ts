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
  /**
   * WHERE estático opcional que se AND-ea al final. Sirve para múltiples
   * types que comparten tabla pero filtran por sub_type (ej SALVAGE_HEAD vs
   * SALVAGE_MODIFIER sobre weapon_salvage). Ya viene pre-sanitizado porque
   * es literal en código (no viene del user).
   */
  extraWhere?: string;
  /**
   * Loadout.4f (2026-05-04): true si la tabla tiene columna `game_version`.
   * Si la tabla la tiene, el DISTINCT ON dedupea quedándose con la versión
   * más alta (LIVE 4.7.2 > LIVE 4.7.0). Si no, el ORDER BY del CTE referencia
   * solo class_name — sino el COALESCE(t.game_version, ...) tiraría
   * "column does not exist" y el picker quedaba vacío silenciosamente.
   *
   * Tablas confirmadas con game_version (de migrations): weapon_salvage,
   * quantum_interdiction_generators, jump_drives. El resto del catálogo
   * (weapon_guns, missiles, shields, power_plants, coolers, etc.) no la
   * tiene en migrations — si en prod fueron ALTER'd, el dedupe sigue siendo
   * funcional pero pickea una variante arbitraria (no la latest).
   */
  hasGameVersion?: boolean;
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
  // Jump Drive (Fase P.1, migración 058) — módulo independiente del QT drive,
  // habilita saltos inter-sistema. Mayoritariamente equipado en capital ships
  // (890J / Bengal / Idris / Javelin / Polaris). Excluimos templates/placeholders
  // del catálogo público para que el picker no muestre <= PLACEHOLDER =>.
  JUMP_DRIVE: {
    table: "jump_drives", type: "JUMP_DRIVE",
    idCol: "uuid", nameCol: "name", classCol: "class_name",
    sizeCol: "size", gradeCol: "grade", mfrCol: "manufacturer_id",
    extraWhere: "t.class_name NOT ILIKE '%_Template%' AND (t.name IS NULL OR t.name NOT ILIKE '%PLACEHOLDER%')",
    hasGameVersion: true, // PK compuesta (uuid, game_version) en migración 058
  },
  // Mining lasers: migrado a tabla `weapon_mining` (migración 054). Es el
  // superset con modelo de power completo. La tabla antigua `mining_lasers`
  // queda como legacy hasta que se confirme todo funciona en prod.
  //
  // IMPORTANTE: weapon_mining tiene variantes por ship (Template, Test,
  // Test_Active, MPUV_Arm, etc). El filtrado de esas variantes se hace en
  // mapRow/buildStats vía un WHERE implícito o DISTINCT ON (name). Los
  // endpoints con resultados listables (catalog picker, mining/lasers)
  // deduplican por name. Los ship loadouts vienen con className exacto
  // asi que SI buscan por class_name matchean la variante correcta.
  MINING_LASER: {
    table: "weapon_mining", type: "MINING_LASER",
    idCol: "id", nameCol: "name", classCol: "class_name",
    sizeCol: "size", gradeCol: "grade", mfrCol: "manufacturer_id",
  },
  // Salvage (Fase M — migración 056): la tabla weapon_salvage alberga tanto
  // cabezas de salvage (Baler, Salvation, y los tractor beams que CIG tipifica
  // como SalvageHead) como los modifiers Tractor/Scraper que van dentro de
  // esos heads. El ComponentPicker pide SALVAGE_HEAD para el slot padre y
  // SALVAGE_MODIFIER para el slot hijo — ambos resuelven a la misma tabla
  // con extraWhere por sub_type.
  //
  // Se filtran templates/placeholders en extraWhere para que el picker no
  // muestre "<= PLACEHOLDER =>" ni variantes Template.
  SALVAGE_HEAD: {
    table: "weapon_salvage", type: "SALVAGE_HEAD",
    idCol: "id", nameCol: "name", classCol: "class_name",
    sizeCol: "size", gradeCol: "grade", mfrCol: "manufacturer_id",
    extraWhere: "t.sub_type = 'Head' AND t.class_name NOT ILIKE '%_Template%' AND (t.name IS NULL OR t.name NOT ILIKE '%PLACEHOLDER%')",
    hasGameVersion: true, // PK compuesta (id, game_version) en migración 056
  },
  SALVAGE_MODIFIER: {
    table: "weapon_salvage", type: "SALVAGE_MODIFIER",
    idCol: "id", nameCol: "name", classCol: "class_name",
    sizeCol: "size", gradeCol: "grade", mfrCol: "manufacturer_id",
    extraWhere: "t.sub_type = 'Modifier' AND t.class_name NOT ILIKE '%_Template%' AND (t.name IS NULL OR t.name NOT ILIKE '%PLACEHOLDER%')",
    hasGameVersion: true, // PK compuesta (id, game_version) en migración 056
  },
  // QIG / QED / QDMP — Fase N (migración 057). Los 3 tipos viven en la
  // misma tabla (quantum_interdiction_generators). El picker pide QIG
  // cuando el slot es editable; para slots fixed (Mantis/Cutlass Blue/
  // Guardian QI) ni siquiera se abre. extraWhere excluye templates /
  // placeholders ("<= PLACEHOLDER =>", QED_Template, QIG_Prototype).
  QIG: {
    table: "quantum_interdiction_generators", type: "QIG",
    idCol: "uuid", nameCol: "name", classCol: "class_name",
    sizeCol: "size", gradeCol: "grade", mfrCol: "manufacturer_id",
    extraWhere: "t.class_name NOT ILIKE '%_Template%' AND t.class_name NOT ILIKE '%_Prototype%' AND (t.name IS NULL OR t.name NOT ILIKE '%PLACEHOLDER%')",
    hasGameVersion: true, // ALTER en migración 057 agrega game_version + PK compuesta
  },
  // RADAR (Loadout.4j, 2026-05-04) — Pablo reportó "en radares me aparece la
  // lista vacia". El picker pedía types=OTHER porque RADAR no estaba en el
  // mapping → API ignoraba. Tabla `radars` (PK uuid) extendida en 037b con
  // power/cooling/emisiones + game_version. Excluimos placeholders/templates.
  RADAR: {
    table: "radars", type: "RADAR",
    idCol: "uuid", nameCol: "name", classCol: "class_name",
    sizeCol: "size", gradeCol: "grade", mfrCol: "manufacturer_id",
    extraWhere: "t.class_name NOT ILIKE '%_Template%' AND (t.name IS NULL OR t.name NOT ILIKE '%PLACEHOLDER%')",
    hasGameVersion: true, // PK natural pero ALTER 037b agrega game_version
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

  // Deduplicate by (table + extraWhere) porque varios types pueden compartir
  // tabla con filtros distintos (SALVAGE_HEAD vs SALVAGE_MODIFIER sobre
  // weapon_salvage, WEAPON vs TURRET sobre weapon_guns/turrets). Usar solo
  // la tabla como clave colapsaría los dos a un solo query.
  const tablesToQuery = new Map<string, TableDef>();
  for (const t of validTypes) {
    const def = TYPE_TABLE[t];
    if (!def) continue;
    const key = def.table + "::" + (def.extraWhere ?? "");
    if (!tablesToQuery.has(key)) tablesToQuery.set(key, def);
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

      // Static extraWhere (sub_type / template filter, etc). Literal en código,
      // no viene del user — no se paramatriza.
      if (def.extraWhere) {
        conds.push(`(${def.extraWhere})`);
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

      // Loadout.4d (2026-05-04): DISTINCT ON (class_name) en un CTE para
      // evitar duplicados cuando una nave/componente vive en múltiples
      // game_version (LIVE 4.7.0 + PTU 4.7.2). Antes salía el mismo item dos
      // veces en el ComponentPicker.
      //
      // Loadout.4f (2026-05-04, BUGFIX): la versión anterior referenciaba
      // `COALESCE(t.game_version, '')` SIEMPRE — pero la mayoría de tablas
      // del catálogo (weapon_guns, missiles, shields, power_plants, coolers,
      // quantum_drives, weapon_mining, etc.) NO tienen columna game_version
      // en sus migraciones. La query rompía con `column does not exist`,
      // el catch del catálogo lo logueaba silenciosamente, y el picker
      // quedaba vacío → "al hacer click en armas no aparece nada".
      //
      // Fix: solo usar COALESCE(game_version) cuando def.hasGameVersion=true.
      //
      // Loadout.4h (2026-05-04, BUGFIX adicional): el CTE además hardcodeaba
      // `t.class_name` pero la tabla `missiles` no tiene class_name (usa
      // `name` como classCol según TYPE_TABLE). El query rompía con
      // 'column missiles.class_name does not exist' y los misiles del rack
      // children quedaban vacíos. Ahora el dedupe usa def.classCol — la
      // columna correcta de cada tabla.
      const classRef = `t.${def.classCol}`;
      const dedupOrder = def.hasGameVersion
        ? `${classRef}, COALESCE(t.game_version, '') DESC`
        : classRef;
      const rows: any[] = await sql.unsafe(
        `WITH dedup AS (
           SELECT DISTINCT ON (${classRef}) t.*
           FROM ${def.table} t
           ${where}
           ORDER BY ${dedupOrder}
         )
         SELECT t.*${manufacturerSelect}, COUNT(*) OVER()::int AS _total_count
         FROM dedup t
         ${joinClause}
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
    // Loadout.4k (2026-05-04): exponer sub_type (Military / Civilian /
    // Industrial / Racing / Stealth) para que el picker lo muestre como
    // badge. Tablas que no tienen sub_type devuelven null y el badge no
    // se renderiza. Para weapons, fallback a fire_mode (Auto/Burst/Single)
    // que es la categoría más identificable de un arma.
    subType: row.sub_type ?? row.fire_mode ?? null,
    // Per-type stat objects (ComponentPicker reads these)
    weaponStats: type === "WEAPON" ? stats : null,
    shieldStats: type === "SHIELD" ? stats : null,
    powerStats: type === "POWER_PLANT" ? stats : null,
    coolingStats: type === "COOLER" ? stats : null,
    quantumStats: type === "QUANTUM_DRIVE" || type === "JUMP_DRIVE" ? stats : null,
    miningStats: type === "MINING_LASER" ? stats : null,
    missileStats: type === "MISSILE" ? stats : null,
    turretStats: type === "TURRET" ? stats : null,
    missileRackStats: type === "MISSILE_RACK" ? stats : null,
    bombStats: type === "BOMB" ? stats : null,
    salvageStats: type === "SALVAGE_HEAD" || type === "SALVAGE_MODIFIER" ? stats : null,
    qigStats: type === "QIG" ? stats : null,
    radarStats: type === "RADAR" ? stats : null,
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
      // Rango de tamanio de misil aceptado: min y max de los ports.
      // Ej: MSD-322 = 2 ports S2 → min=2, max=2. MSD-441 = 4 ports S1
      // → min=1, max=1. Usamos tanto MaxSize como MinSize del port para
      // cubrir ambos extremos.
      if (ports.length > 0) {
        const maxSizes = ports
          .map((p: any) => numOrNull(p?.MaxSize ?? p?.Size))
          .filter((n: number | null): n is number => n !== null);
        const minSizes = ports
          .map((p: any) => numOrNull(p?.MinSize ?? p?.Size))
          .filter((n: number | null): n is number => n !== null);
        s.maxMissileSize = maxSizes.length > 0 ? Math.max(...maxSizes) : null;
        s.minMissileSize = minSizes.length > 0 ? Math.min(...minSizes) : null;
      } else {
        s.maxMissileSize = null;
        s.minMissileSize = null;
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
      // weapon_mining columns (migrado desde mining_lasers en Fase L.1).
      // Nombres que cambian respecto al legacy mining_lasers:
      //   mining_power → mining_laser_power
      //   max_range    → maximum_range
      // Las otras columnas (resistance, instability, throttle_*, heat_output,
      // shatter_damage, module_slots) fueron agregadas a weapon_mining por la
      // migración 054 y pobladas desde mining_lasers matcheando por name.
      s.miningPower = numOrNull(row.mining_laser_power);
      s.resistance = numOrNull(row.resistance);
      s.instability = numOrNull(row.instability);
      s.optimalRange = numOrNull(row.optimal_range);
      s.maxRange = numOrNull(row.maximum_range);
      s.throttleRate = numOrNull(row.throttle_rate);
      s.throttleMin = numOrNull(row.throttle_min);
      s.heatOutput = numOrNull(row.heat_output);
      s.shatterDamage = numOrNull(row.shatter_damage);
      s.moduleSlots = numOrNull(row.module_slots);
      // Extra de weapon_mining (no estaba en mining_lasers) — permite que el
      // power grid del LoadoutBuilder use el modelo real del mining laser.
      s.powerDraw = numOrNull(row.power_consumption_max) ?? numOrNull(row.power_consumption_min);
      s.powerDrawMin = numOrNull(row.power_consumption_min);
      s.powerDrawMax = numOrNull(row.power_consumption_max);
      s.emSignature = numOrNull(row.em_max);
      s.irSignature = numOrNull(row.ir_max);
      break;
    }

    case "SALVAGE_HEAD":
    case "SALVAGE_MODIFIER": {
      // weapon_salvage columns (migración 056). Sub_type distingue Head vs
      // Modifier; modifier_kind distingue Tractor vs Scraper dentro de los
      // modifiers. Los heads no tienen stats (wraparound del juego; son
      // puro "contenedor" de los modifiers en el brazo). Los modifiers
      // llevan speed/radius/efficiency multipliers.
      s.subType = row.sub_type ?? null;
      s.modifierKind = row.modifier_kind ?? null;
      s.salvageSpeedMultiplier = numOrNull(row.salvage_speed_multiplier);
      s.radiusMultiplier = numOrNull(row.radius_multiplier);
      s.extractionEfficiency = numOrNull(row.extraction_efficiency);
      s.mass = numOrNull(row.mass);
      break;
    }

    case "JUMP_DRIVE": {
      // jump_drives columns (migración 058). El JD no consume power continuo
      // (solo QuantumFuel durante el salto) — la métrica clave es el alignment
      // rate y el fuel efficiency. Distortion + health van como referencia.
      s.alignmentRate = numOrNull(row.alignment_rate);
      s.alignmentDecayRate = numOrNull(row.alignment_decay_rate);
      s.tuningRate = numOrNull(row.tuning_rate);
      s.tuningDecayRate = numOrNull(row.tuning_decay_rate);
      s.fuelEfficiencyMultiplier = numOrNull(row.fuel_usage_efficiency_multiplier);
      s.distortionMax = numOrNull(row.distortion_max);
      s.distortionShutdownTime = numOrNull(row.distortion_shutdown_time);
      s.health = numOrNull(row.health);
      s.mass = numOrNull(row.mass);
      break;
    }

    case "RADAR": {
      // radars columns (migración 025 + 037b extiende con power/cooling/emisiones).
      // Stat principal del picker = sensitivity (mas sensible = detecta antes).
      // sub_type distingue Civilian/Military/Industrial.
      s.sensitivity = numOrNull(row.sensitivity);
      s.groundVehicleSensitivityAddition = numOrNull(row.ground_vehicle_sensitivity_addition);
      s.subType = row.sub_type ?? null;
      s.pips = numOrNull(row.pips);
      s.powerDraw = numOrNull(row.power_consumption_max) ?? numOrNull(row.power_consumption_min);
      s.powerDrawMin = numOrNull(row.power_consumption_min);
      s.powerDrawMax = numOrNull(row.power_consumption_max);
      s.coolantMin = numOrNull(row.coolant_consumption_min);
      s.coolantMax = numOrNull(row.coolant_consumption_max);
      s.emSignature = numOrNull(row.em_max);
      s.irSignature = numOrNull(row.ir_max);
      // rangeMinM / rangeMaxM siguen NULL en BD para todos los radares hasta
      // Fase X (importer pendiente). Igual los exponemos por si después se
      // pueblan — el picker no los usa hoy.
      s.rangeMinM = numOrNull(row.range_min_m);
      s.rangeMaxM = numOrNull(row.range_max_m);
      break;
    }

    case "QIG": {
      // quantum_interdiction_generators columns (migración 049 base +
      // extensión 057 con power/emisiones). Los 3 dígitos claves para el
      // picker son:
      //   - jammingRange: si impide spooling (los 3 QIGs tienen > 0)
      //   - interdictionRange: si corta saltos (sólo Reynie tiene > 0)
      //   - powerDraw: MW continuo en modo Online
      s.jammingRange = numOrNull(row.jamming_range);
      s.interdictionRange = numOrNull(row.interdiction_range);
      s.pulseChargeTime = numOrNull(row.pulse_charge_time);
      s.pulseDischargeTime = numOrNull(row.pulse_discharge_time);
      s.pulseCooldownTime = numOrNull(row.pulse_cooldown_time);
      s.pulseRadius = numOrNull(row.pulse_radius);
      s.powerDraw = numOrNull(row.power_consumption_max);
      s.powerDrawMin = numOrNull(row.power_consumption_min);
      s.powerDrawMax = numOrNull(row.power_consumption_max);
      s.emSignature = numOrNull(row.em_max);
      s.emMin = numOrNull(row.em_min);
      s.emDecay = numOrNull(row.em_decay);
      s.irSignature = numOrNull(row.ir_max);
      s.jammerMaxPowerDraw = numOrNull(row.jammer_max_power_draw);
      s.basePowerDrawFraction = numOrNull(row.base_power_draw_fraction);
      s.pulsePowerFraction = numOrNull(row.pulse_power_fraction);
      s.jammerPowerFraction = numOrNull(row.jammer_power_fraction);
      break;
    }
  }

  return Object.keys(s).length > 0 ? s : null;
}
