// =============================================================================
// AL FILO — GET /api/ships/[id] v9 (Resilient Raw SQL)
//
// Queries ships + ship_hardpoints directly. Satellite tables (flight_stats,
// fuel, etc.) loaded separately with try/catch to handle column name
// mismatches (camelCase from Prisma vs snake_case).
// Component tables may be empty (Xolii populating them).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 300;

// ─── Category inference from hardpoint_name ─────────────────────────────────

function inferCategory(name: string, hp: any): string {
  const n = name.toLowerCase();

  // Check which default component FK is populated
  if (hp.default_weapon_id) return "WEAPON";
  if (hp.default_shield_id) return "SHIELD";
  if (hp.default_power_id) return "POWER_PLANT";
  if (hp.default_cooler_id) return "COOLER";
  if (hp.default_quantum_id) return "QUANTUM_DRIVE";

  // Infer from name patterns (Star Citizen hardpoint naming conventions)
  if (n.includes("turret")) return "TURRET";
  if (n.includes("weapon") || n.includes("gun") || n.includes("cannon") || n.includes("gimbal") || n.includes("nose_mount")) return "WEAPON";
  if (n.includes("missile") || n.includes("pylon") || n.includes("bomb")) return "MISSILE_RACK";
  if (n.includes("shield")) return "SHIELD";
  if (n.includes("power_plant") || n.includes("powerplant")) return "POWER_PLANT";
  if (n.includes("cooler") || n.includes("cooling")) return "COOLER";
  if (n.includes("quantum") || n.includes("qdrive") || n.includes("quantum_drive")) return "QUANTUM_DRIVE";
  if (n.includes("main_thruster") || n.includes("thruster_main")) return "THRUSTER_MAIN";
  if (n.includes("thruster") || n.includes("mav")) return "THRUSTER_MANEUVERING";
  if (n.includes("radar")) return "RADAR";
  if (n.includes("armor")) return "ARMOR";
  if (n.includes("fuel_tank")) return "FUEL_TANK";
  if (n.includes("fuel_intake") || n.includes("intake")) return "FUEL_INTAKE";
  if (n.includes("mining")) return "MINING";
  if (n.includes("salvage")) return "SALVAGE";
  if (n.includes("tractor")) return "TRACTOR_BEAM";
  if (n.includes("countermeasure") || n.includes("cm_launcher") || n.includes("flare") || n.includes("chaff") || n.includes("noise")) return "COUNTERMEASURE";
  if (n.includes("avionics")) return "AVIONICS";

  return "OTHER";
}

// ─── Safe column accessor (handles camelCase and snake_case) ────────────────

function col(row: any, ...keys: string[]): any {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k];
  }
  return null;
}

// ─── Main handler ───────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // ── 1. Find the ship (just the ships table, no JOINs) ──
    const shipRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM ships
       WHERE reference = $1
          OR reference ILIKE $1
          OR name ILIKE $1
          OR id::text = $1
          OR reference ILIKE '%' || $1 || '%'
       LIMIT 1`,
      id,
    );

    if (shipRows.length === 0) {
      return NextResponse.json({ error: "Nave no encontrada" }, { status: 404 });
    }

    const ship = shipRows[0];

    // ── 2. Load satellite data separately (resilient to column name issues) ──
    let flightStats: any = null;
    let fuelStats: any = null;

    try {
      const fsRows: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM ship_flight_stats WHERE ship_id = $1 LIMIT 1`,
        ship.id,
      );
      if (fsRows.length > 0) flightStats = fsRows[0];
    } catch (e) {
      console.warn("[ships/[id]] Could not load flight stats:", e);
    }

    try {
      const fRows: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM ship_fuel WHERE ship_id = $1 LIMIT 1`,
        ship.id,
      );
      if (fRows.length > 0) fuelStats = fRows[0];
    } catch (e) {
      console.warn("[ships/[id]] Could not load fuel stats:", e);
    }

    // ── 3. Get hardpoints ──
    const hardpointRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM ship_hardpoints WHERE ship_id = $1 ORDER BY max_size DESC, hardpoint_name ASC`,
      ship.id,
    );

    // ── 4. Try to resolve equipped components (may be empty tables) ──
    const weaponIds = hardpointRows.map(h => h.default_weapon_id).filter(Boolean);
    const shieldIds = hardpointRows.map(h => h.default_shield_id).filter(Boolean);
    const powerIds = hardpointRows.map(h => h.default_power_id).filter(Boolean);
    const coolerIds = hardpointRows.map(h => h.default_cooler_id).filter(Boolean);
    const quantumIds = hardpointRows.map(h => h.default_quantum_id).filter(Boolean);

    const components = new Map<string, any>();

    const loadComponents = async (ids: string[], table: string, type: string) => {
      if (ids.length === 0) return;
      try {
        // Use IN clause with individual params for safety
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
        const rows: any[] = await prisma.$queryRawUnsafe(
          `SELECT * FROM ${table} WHERE id IN (${placeholders})`,
          ...ids,
        );
        for (const row of rows) {
          components.set(row.id, { ...row, _type: type });
        }
      } catch {
        // Table might not have data — skip gracefully
      }
    };

    await Promise.all([
      loadComponents(weaponIds, "component_weapons", "WEAPON"),
      loadComponents(shieldIds, "component_shields", "SHIELD"),
      loadComponents(powerIds, "component_power_plants", "POWER_PLANT"),
      loadComponents(coolerIds, "component_coolers", "COOLER"),
      loadComponents(quantumIds, "component_quantum_drives", "QUANTUM_DRIVE"),
    ]);

    // ── 5. Build flat hardpoints ──
    const flatHardpoints = hardpointRows.map((hp) => {
      const category = inferCategory(hp.hardpoint_name, hp);

      const defaultId =
        hp.default_weapon_id ||
        hp.default_shield_id ||
        hp.default_power_id ||
        hp.default_cooler_id ||
        hp.default_quantum_id;

      let equippedItem = null;
      if (defaultId && components.has(defaultId)) {
        const comp = components.get(defaultId)!;
        equippedItem = buildEquippedItem(comp);
      }

      return {
        id: hp.id,
        hardpointName: hp.hardpoint_name,
        category,
        minSize: 0,
        maxSize: hp.max_size ?? 0,
        isFixed: false,
        isManned: false,
        isInternal: category !== "WEAPON" && category !== "TURRET" && category !== "MISSILE_RACK",
        equippedItem,
        children: [] as any[],
      };
    });

    // ── 6. Build response (handle both camelCase and snake_case columns) ──
    const scmSpeed = numOrNull(col(ship, "scm_speed", "scmSpeed"))
      ?? numOrNull(col(flightStats, "scm_speed", "scmSpeed"));
    const afterburnerSpeed = numOrNull(col(ship, "afterburner_speed", "afterburnerSpeed"))
      ?? numOrNull(col(flightStats, "max_speed", "maxSpeed"));

    const data = {
      id: ship.id,
      reference: ship.reference,
      name: ship.name,
      localizedName: null,
      manufacturer: ship.manufacturer,
      gameVersion: col(ship, "game_version", "gameVersion") ?? "",
      type: "SHIP",
      ship: {
        scmSpeed,
        afterburnerSpeed,
        pitchRate: numOrNull(col(flightStats, "pitch", "pitchRate")),
        yawRate: numOrNull(col(flightStats, "yaw", "yawRate")),
        rollRate: numOrNull(col(flightStats, "roll", "rollRate")),
        maxCrew: col(ship, "max_crew", "maxCrew"),
        cargo: numOrNull(col(ship, "cargo_capacity", "cargoCapacity", "cargo")),
        role: ship.role ?? null,
        focus: null,
        career: null,
        mass: numOrNull(ship.mass),
        // Extra flight data
        boostSpeedForward: numOrNull(col(flightStats, "boost_speed_forward", "boostSpeedForward")),
        accelForward: numOrNull(col(flightStats, "accel_forward", "accelForward")),
        // Fuel/power data
        hydrogenCapacity: numOrNull(col(fuelStats, "hydrogen_capacity", "hydrogenCapacity")),
        quantumRange: numOrNull(col(fuelStats, "quantum_range", "quantumRange")),
        shieldHpTotal: numOrNull(col(fuelStats, "shield_hp_total", "shieldHpTotal")),
        powerGeneration: numOrNull(col(fuelStats, "power_generation", "powerGeneration")),
      },
    };

    return NextResponse.json(
      { data, flatHardpoints },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (error: any) {
    console.error("[API /ships/[id]] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Error interno", detail: error?.message || "Unknown" },
      { status: 500 },
    );
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function buildEquippedItem(comp: any): any {
  const type = comp._type || "OTHER";
  const stats: Record<string, any> = {};

  // Weapon stats (try both snake_case and camelCase)
  const alphaDmg = col(comp, "alpha_damage", "alphaDamage");
  if (alphaDmg != null) stats.alphaDamage = Number(alphaDmg);
  const fr = col(comp, "fire_rate", "fireRate");
  if (fr != null) stats.fireRate = Number(fr);
  const dps = col(comp, "dps");
  if (dps != null) stats.dps = Number(dps);
  const dmgType = col(comp, "damage_type", "damageType");
  if (dmgType != null) stats.damageType = dmgType;

  // Shield stats
  const maxHp = col(comp, "max_hp", "maxHp");
  if (maxHp != null) { stats.shieldHp = Number(maxHp); stats.maxHp = Number(maxHp); }
  const regen = col(comp, "regen_rate", "regenRate");
  if (regen != null) { stats.shieldRegen = Number(regen); stats.regenRate = Number(regen); }

  // Power stats
  const po = col(comp, "power_output", "powerOutput");
  if (po != null) stats.powerOutput = Number(po);

  // Cooler stats
  const cr = col(comp, "cooling_rate", "coolingRate");
  if (cr != null) stats.coolingRate = Number(cr);

  // Quantum stats
  const ms = col(comp, "max_speed", "maxSpeed");
  if (ms != null) stats.maxSpeed = Number(ms);
  const frt = col(comp, "fuel_rate", "fuelRate");
  if (frt != null) stats.fuelRate = Number(frt);

  // Common
  const pd = col(comp, "power_draw", "powerDraw");
  if (pd != null) stats.powerDraw = Number(pd);
  const to = col(comp, "thermal_output", "thermalOutput");
  if (to != null) stats.thermalOutput = Number(to);
  const em = col(comp, "em_signature", "emSignature");
  if (em != null) stats.emSignature = Number(em);
  const ir = col(comp, "ir_signature", "irSignature");
  if (ir != null) stats.irSignature = Number(ir);

  // Compute DPS if missing
  if (!stats.dps && stats.alphaDamage && stats.fireRate) {
    const a = stats.alphaDamage, f = stats.fireRate;
    if (a > 0 && f > 0) stats.dps = Math.round(a * (f / 60) * 100) / 100;
  }

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
    componentStats: Object.keys(stats).length > 0 ? stats : null,
  };
}
