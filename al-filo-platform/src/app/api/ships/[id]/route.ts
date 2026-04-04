// =============================================================================
// AL FILO — GET /api/ships/[id] v10 (New ship_hardpoints schema)
//
// Uses the new ship_hardpoints table populated from sc-unpacked JSON.
// Hardpoints JOIN with component tables (weapon_guns, shields, power_plants,
// coolers, quantum_drives) via default_item_class = class_name.
// Nested loadout (gimbals→weapons, racks→missiles) stored in loadout_json.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 300;

// ─── Helpers ────────────────────────────────────────────────────────────────

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function col(row: any, ...keys: string[]): any {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k];
  }
  return null;
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

// ─── Hardpoint type → store category mapping ────────────────────────────────

const HP_TYPE_TO_CATEGORY: Record<string, string> = {
  Weapon: "WEAPON",
  Shield: "SHIELD",
  PowerPlant: "POWER_PLANT",
  Cooler: "COOLER",
  QuantumDrive: "QUANTUM_DRIVE",
  Radar: "RADAR",
  Countermeasure: "COUNTERMEASURE",
  ManneuverThruster: "THRUSTER_MANEUVERING",
  MainThruster: "THRUSTER_MAIN",
  Armor: "ARMOR",
  FuelTank: "FUEL_TANK",
  FuelIntake: "FUEL_INTAKE",
};

function hpCategory(hpType: string, hpName: string): string {
  if (HP_TYPE_TO_CATEGORY[hpType]) return HP_TYPE_TO_CATEGORY[hpType];
  // Fallback: infer from name
  const n = hpName.toLowerCase();
  if (n.includes("turret")) return "TURRET";
  if (n.includes("weapon") || n.includes("gun")) return "WEAPON";
  if (n.includes("missile")) return "MISSILE_RACK";
  if (n.includes("shield")) return "SHIELD";
  if (n.includes("power_plant")) return "POWER_PLANT";
  if (n.includes("cooler")) return "COOLER";
  if (n.includes("quantum")) return "QUANTUM_DRIVE";
  if (n.includes("radar")) return "RADAR";
  if (n.includes("countermeasure")) return "COUNTERMEASURE";
  return "OTHER";
}

// ─── Build equippedItem from component row ──────────────────────────────────

function buildWeaponItem(row: any): any {
  const dps_total =
    (numOrNull(row.dps_physical) ?? 0) +
    (numOrNull(row.dps_energy) ?? 0) +
    (numOrNull(row.dps_distortion) ?? 0) +
    (numOrNull(row.dps_thermal) ?? 0) +
    (numOrNull(row.dps_biochemical) ?? 0) +
    (numOrNull(row.dps_stun) ?? 0);

  const alpha_total =
    (numOrNull(row.alpha_physical) ?? 0) +
    (numOrNull(row.alpha_energy) ?? 0) +
    (numOrNull(row.alpha_distortion) ?? 0) +
    (numOrNull(row.alpha_thermal) ?? 0) +
    (numOrNull(row.alpha_biochemical) ?? 0) +
    (numOrNull(row.alpha_stun) ?? 0);

  return {
    id: row.id || row.class_name,
    reference: row.class_name || "",
    name: row.name || row.item_name || "",
    localizedName: null,
    className: row.class_name,
    type: "WEAPON",
    size: numOrNull(row.size),
    grade: gradeToLetter(row.grade),
    manufacturer: row.manufacturer_id ?? null,
    componentStats: {
      alphaDamage: alpha_total,
      dps: dps_total,
      fireRate: numOrNull(row.rate_of_fire),
      damagePerShot: numOrNull(row.damage_per_shot),
      alphaPhysical: numOrNull(row.alpha_physical),
      alphaEnergy: numOrNull(row.alpha_energy),
      alphaDistortion: numOrNull(row.alpha_distortion),
      effectiveRange: numOrNull(row.effective_range),
      ammoSpeed: numOrNull(row.ammo_speed),
      ammoCapacity: numOrNull(row.ammo_capacity),
      fireMode: row.fire_mode ?? null,
      heatPerShot: numOrNull(row.heat_per_shot),
      emSignature: numOrNull(row.emission_em_max),
    },
  };
}

function buildShieldItem(row: any): any {
  return {
    id: row.id || row.class_name,
    reference: row.class_name || "",
    name: row.name || row.item_name || "",
    localizedName: null,
    className: row.class_name,
    type: "SHIELD",
    size: numOrNull(row.size),
    grade: gradeToLetter(row.grade),
    manufacturer: row.manufacturer_id ?? null,
    componentStats: {
      shieldHp: numOrNull(row.max_shield_health),
      maxHp: numOrNull(row.max_shield_health),
      shieldRegen: numOrNull(row.max_shield_regen),
      regenRate: numOrNull(row.max_shield_regen),
      downedDelay: numOrNull(row.downed_delay),
      damagedDelay: numOrNull(row.damaged_delay),
    },
  };
}

function buildPowerPlantItem(row: any): any {
  // power_generation column is 0 for all rows — extract from raw_data
  let powerGen = numOrNull(row.power_generation);
  if (!powerGen || powerGen === 0) {
    // Try raw_data -> stdItem -> ResourceNetwork -> Usage -> Power -> Maximum
    powerGen = numOrNull(row.raw_data?.stdItem?.ResourceNetwork?.Usage?.Power?.Maximum) ?? 0;
  }

  // Also extract EM signature from raw_data
  const emSig = numOrNull(row.raw_data?.stdItem?.Emission?.Em?.Maximum) ?? 0;

  return {
    id: row.uuid || row.class_name,
    reference: row.class_name || "",
    name: row.name || "",
    localizedName: null,
    className: row.class_name,
    type: "POWER_PLANT",
    size: numOrNull(row.size),
    grade: gradeToLetter(row.grade),
    manufacturer: row.manufacturer_id ?? null,
    componentStats: {
      powerOutput: powerGen,
      powerDraw: 0, // Power plants don't consume power, they generate it
      emSignature: emSig,
    },
  };
}

function buildCoolerItem(row: any): any {
  return {
    id: row.id || row.class_name,
    reference: row.class_name || "",
    name: row.name || "",
    localizedName: null,
    className: row.class_name,
    type: "COOLER",
    size: numOrNull(row.size),
    grade: gradeToLetter(row.grade),
    manufacturer: row.manufacturer_id ?? null,
    componentStats: {
      coolingRate: numOrNull(row.cooling_rate),
      powerDraw: numOrNull(row.power_draw_max),
    },
  };
}

function buildQuantumItem(row: any): any {
  return {
    id: row.uuid || row.class_name,
    reference: row.class_name || "",
    name: row.name || "",
    localizedName: null,
    className: row.class_name,
    type: "QUANTUM_DRIVE",
    size: numOrNull(row.size),
    grade: gradeToLetter(row.grade),
    manufacturer: row.manufacturer_id ?? null,
    componentStats: {
      maxSpeed: numOrNull(row.drive_speed),
      fuelRate: numOrNull(row.fuel_rate),
      cooldownTime: numOrNull(row.cooldown_time),
      spoolUpTime: numOrNull(row.spool_up_time),
    },
  };
}

// Build a generic item from ship_hardpoints data (no component table match)
function buildGenericItem(hp: any): any {
  if (!hp.default_item_name || hp.default_item_name === "") return null;
  return {
    id: hp.default_item_uuid || hp.id,
    reference: hp.default_item_class || "",
    name: hp.default_item_name || "",
    localizedName: null,
    className: hp.default_item_class,
    type: hp.hardpoint_type || "OTHER",
    size: numOrNull(hp.max_size),
    grade: gradeToLetter(hp.default_item_grade),
    manufacturer: hp.default_item_manufacturer ?? null,
    componentStats: null,
  };
}

// ─── Build children from loadout_json ───────────────────────────────────────

function buildChildren(
  loadoutJson: any[] | null,
  weaponMap: Map<string, any>,
  missileMap: Map<string, any>,
): any[] {
  if (!loadoutJson || !Array.isArray(loadoutJson)) return [];

  return loadoutJson
    .map((entry, idx) => {
      const className = entry.ClassName || entry.className || "";
      let equippedItem: any = null;

      // Try to find the weapon in weapon_guns
      if (weaponMap.has(className)) {
        equippedItem = buildWeaponItem(weaponMap.get(className));
      }

      // If not found and it's a weapon type, build from loadout entry data
      if (!equippedItem && entry.Type?.includes("WeaponGun")) {
        equippedItem = {
          id: entry.UUID || `child-${idx}`,
          reference: className,
          name: entry.Name || className,
          localizedName: null,
          className,
          type: "WEAPON",
          size: entry.Size ?? null,
          grade: gradeToLetter(entry.Grade),
          manufacturer: null,
          componentStats: null,
        };
      }

      // Missile
      if (!equippedItem && entry.Type?.includes("Missile")) {
        equippedItem = {
          id: entry.UUID || `child-${idx}`,
          reference: className,
          name: entry.Name || className,
          localizedName: null,
          className,
          type: "MISSILE_RACK",
          size: entry.Size ?? null,
          grade: gradeToLetter(entry.Grade),
          manufacturer: null,
          componentStats: entry.DamageTotal
            ? { alphaDamage: Number(entry.DamageTotal), damage: Number(entry.DamageTotal) }
            : null,
        };
      }

      if (!equippedItem) return null;

      return {
        id: entry.UUID || `child-${idx}`,
        hardpointName: entry.HardpointName || `sub_${idx}`,
        category: equippedItem.type === "MISSILE_RACK" ? "MISSILE_RACK" : "WEAPON",
        minSize: 0,
        maxSize: entry.MaxSize ?? equippedItem.size ?? 0,
        isFixed: false,
        equippedItem,
      };
    })
    .filter(Boolean);
}

// ─── Main handler ───────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // ── 1. Find the ship ──
    const shipRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM ships
       WHERE reference = $1
          OR reference ILIKE $1
          OR name ILIKE $1
          OR id::text = $1
          OR reference ILIKE '%' || $1 || '%'
       LIMIT 1`,
      String(id),
    );

    if (shipRows.length === 0) {
      return NextResponse.json({ error: "Nave no encontrada" }, { status: 404 });
    }

    const ship = shipRows[0];

    // ── 2. Load satellite data ──
    let flightStats: any = null;
    let fuelStats: any = null;

    try {
      const fsRows: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM ship_flight_stats WHERE ship_id::text = $1 LIMIT 1`,
        String(ship.id),
      );
      if (fsRows.length > 0) flightStats = fsRows[0];
    } catch (e) {
      console.warn("[ships/[id]] Could not load flight stats:", e);
    }

    try {
      const fRows: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM ship_fuel WHERE ship_id::text = $1 LIMIT 1`,
        String(ship.id),
      );
      if (fRows.length > 0) fuelStats = fRows[0];
    } catch (e) {
      console.warn("[ships/[id]] Could not load fuel stats:", e);
    }

    // ── 3. Get hardpoints from NEW schema (match by ship reference) ──
    const hardpointRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM ship_hardpoints
       WHERE ship_reference = $1
       ORDER BY hardpoint_type, max_size DESC, hardpoint_name ASC`,
      String(ship.reference),
    );

    // ── 4. Collect all default_item_class values for batch lookup ──
    const allClasses = hardpointRows
      .map((hp) => hp.default_item_class)
      .filter((c) => c && c !== "");

    // Also collect class names from loadout_json children
    const childClasses: string[] = [];
    for (const hp of hardpointRows) {
      const loadout = hp.loadout_json;
      if (Array.isArray(loadout)) {
        for (const entry of loadout) {
          if (entry.ClassName) childClasses.push(entry.ClassName);
          if (entry.className) childClasses.push(entry.className);
        }
      }
    }

    const uniqueClasses = [...new Set([...allClasses, ...childClasses])];

    // ── 5. Batch-fetch components from all tables ──
    const componentMap = new Map<string, { table: string; row: any }>();

    const batchFetch = async (
      table: string,
      classCol: string,
      classes: string[],
    ) => {
      if (classes.length === 0) return;
      try {
        const placeholders = classes.map((_, i) => `$${i + 1}`).join(",");
        const rows: any[] = await prisma.$queryRawUnsafe(
          `SELECT * FROM ${table} WHERE ${classCol} IN (${placeholders})`,
          ...classes,
        );
        for (const row of rows) {
          componentMap.set(row[classCol], { table, row });
        }
      } catch {
        // Table might not exist or have issues — skip
      }
    };

    await Promise.all([
      batchFetch("weapon_guns", "class_name", uniqueClasses),
      batchFetch("shields", "class_name", uniqueClasses),
      batchFetch("power_plants", "class_name", uniqueClasses),
      batchFetch("coolers", "class_name", uniqueClasses),
      batchFetch("quantum_drives", "class_name", uniqueClasses),
    ]);

    // Build weapon map for child resolution
    const weaponMap = new Map<string, any>();
    for (const [cls, { table, row }] of componentMap) {
      if (table === "weapon_guns") weaponMap.set(cls, row);
    }
    // Missile map (missiles use 'name' not 'class_name', so we skip batch for now)
    const missileMap = new Map<string, any>();

    // ── 6. Build flatHardpoints ──
    const flatHardpoints = hardpointRows
      .map((hp) => {
        const category = hpCategory(hp.hardpoint_type, hp.hardpoint_name);

        // Skip non-useful hardpoints (thrusters, armor, fuel, etc. - info only)
        // Keep: WEAPON, TURRET, MISSILE_RACK, SHIELD, POWER_PLANT, COOLER, QUANTUM_DRIVE, RADAR, COUNTERMEASURE
        const USEFUL = new Set([
          "WEAPON", "TURRET", "MISSILE_RACK", "SHIELD", "POWER_PLANT",
          "COOLER", "QUANTUM_DRIVE", "RADAR", "COUNTERMEASURE",
        ]);
        if (!USEFUL.has(category)) return null;

        // Build equippedItem from component table match
        let equippedItem: any = null;
        const cls = hp.default_item_class;
        if (cls && componentMap.has(cls)) {
          const { table, row } = componentMap.get(cls)!;
          switch (table) {
            case "weapon_guns":
              equippedItem = buildWeaponItem(row);
              break;
            case "shields":
              equippedItem = buildShieldItem(row);
              break;
            case "power_plants":
              equippedItem = buildPowerPlantItem(row);
              break;
            case "coolers":
              equippedItem = buildCoolerItem(row);
              break;
            case "quantum_drives":
              equippedItem = buildQuantumItem(row);
              break;
          }
        }

        // If no component match, build generic item from hardpoint data
        if (!equippedItem) {
          equippedItem = buildGenericItem(hp);
        }

        // For weapons: check if this is a gimbal/turret with nested weapons
        // The loadout_json contains the actual weapons inside gimbals
        const children = buildChildren(hp.loadout_json, weaponMap, missileMap);

        // If we have children (gimbal → weapon), this is actually a TURRET
        let finalCategory = category;
        if (category === "WEAPON" && children.length > 0) {
          finalCategory = "TURRET";
        }

        return {
          id: hp.id,
          hardpointName: hp.hardpoint_name,
          category: finalCategory,
          minSize: hp.min_size ?? 0,
          maxSize: hp.max_size ?? 0,
          isFixed: !hp.editable,
          isManned: false,
          isInternal:
            finalCategory !== "WEAPON" &&
            finalCategory !== "TURRET" &&
            finalCategory !== "MISSILE_RACK",
          equippedItem,
          children,
        };
      })
      .filter(Boolean);

    // ── 7. Build response ──
    const scmSpeed =
      numOrNull(col(ship, "scm_speed", "scmSpeed")) ??
      numOrNull(col(flightStats, "scm_speed", "scmSpeed"));
    const afterburnerSpeed =
      numOrNull(col(ship, "afterburner_speed", "afterburnerSpeed")) ??
      numOrNull(col(flightStats, "max_speed", "maxSpeed"));

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
        cargo: numOrNull(
          col(ship, "cargo_capacity", "cargoCapacity", "cargo"),
        ),
        role: ship.role ?? null,
        focus: null,
        career: null,
        size: ship.size ?? null,
        mass: numOrNull(ship.mass),
        boostSpeedForward: numOrNull(
          col(flightStats, "boost_speed_forward", "boostSpeedForward"),
        ),
        accelForward: numOrNull(
          col(flightStats, "accel_forward", "accelForward"),
        ),
        accelBackward: numOrNull(
          col(flightStats, "accel_backward", "accelBackward"),
        ),
        accelUp: numOrNull(col(flightStats, "accel_up", "accelUp")),
        accelDown: numOrNull(col(flightStats, "accel_down", "accelDown")),
        accelStrafe: numOrNull(
          col(flightStats, "accel_strafe", "accelStrafe"),
        ),
        boostSpeedBackward: numOrNull(
          col(flightStats, "boost_speed_backward", "boostSpeedBackward"),
        ),
        boostedPitch: numOrNull(
          col(flightStats, "pitch_boosted", "boosted_pitch", "boostedPitch"),
        ),
        boostedYaw: numOrNull(col(flightStats, "yaw_boosted", "boosted_yaw", "boostedYaw")),
        boostedRoll: numOrNull(
          col(flightStats, "roll_boosted", "boosted_roll", "boostedRoll"),
        ),
        hydrogenCapacity: numOrNull(
          col(fuelStats, "hydrogen_capacity", "hydrogenCapacity"),
        ),
        quantumFuelCapacity: numOrNull(
          col(fuelStats, "quantum_fuel_capacity", "quantumFuelCapacity"),
        ),
        quantumRange: numOrNull(
          col(fuelStats, "quantum_range", "quantumRange"),
        ),
        shieldHpTotal: numOrNull(
          col(fuelStats, "shield_hp_total", "shieldHpTotal"),
        ),
        powerGeneration: numOrNull(
          col(fuelStats, "power_generation", "powerGeneration"),
        ),
        hullHp: numOrNull(col(fuelStats, "hull_hp", "hullHp")),
      },
    };

    return NextResponse.json(
      { data, flatHardpoints },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error: any) {
    console.error("[API /ships/[id]] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Error interno", detail: error?.message || "Unknown" },
      { status: 500 },
    );
  }
}
