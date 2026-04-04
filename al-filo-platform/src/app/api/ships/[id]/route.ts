// =============================================================================
// AL FILO — GET /api/ships/[id] v8 (Raw SQL — actual DB schema)
//
// Queries ships + ship_hardpoints + ship_flight_stats directly.
// Component tables may be empty (Xolii populating them), so equippedItem
// is resolved only when the corresponding component row exists.
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

// ─── Main handler ───────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // ── 1. Find the ship (flexible matching: exact, case-insensitive, partial) ──
    const shipRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT s.*,
              sfs.pitch as flight_pitch, sfs.yaw as flight_yaw, sfs.roll as flight_roll,
              sfs.scm_speed as flight_scm, sfs.max_speed as flight_max,
              sfs.boost_speed_forward, sfs.mass_total, sfs.mass_loadout,
              sfs.accel_forward, sfs.accel_backward, sfs.accel_up, sfs.accel_down, sfs.accel_strafe,
              sf.hydrogen_capacity, sf.quantum_capacity, sf.quantum_range, sf.quantum_speed,
              sf.quantum_spool_time, sf.shield_hp_total, sf.shield_regen_total,
              sf.power_generation, sf.cooling_generation
       FROM ships s
       LEFT JOIN ship_flight_stats sfs ON sfs.ship_id = s.id
       LEFT JOIN ship_fuel sf ON sf.ship_id = s.id
       WHERE s.reference = $1
          OR s.reference ILIKE $1
          OR s.name ILIKE $1
          OR s.id::text = $1
          OR s.reference ILIKE '%' || $1 || '%'
       LIMIT 1`,
      id,
    );

    if (shipRows.length === 0) {
      return NextResponse.json({ error: "Nave no encontrada" }, { status: 404 });
    }

    const ship = shipRows[0];

    // ── 2. Get hardpoints ──
    const hardpointRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM ship_hardpoints WHERE ship_id = $1 ORDER BY max_size DESC, hardpoint_name ASC`,
      ship.id,
    );

    // ── 3. Try to resolve equipped components (may be empty tables) ──
    const weaponIds = hardpointRows.map(h => h.default_weapon_id).filter(Boolean);
    const shieldIds = hardpointRows.map(h => h.default_shield_id).filter(Boolean);
    const powerIds = hardpointRows.map(h => h.default_power_id).filter(Boolean);
    const coolerIds = hardpointRows.map(h => h.default_cooler_id).filter(Boolean);
    const quantumIds = hardpointRows.map(h => h.default_quantum_id).filter(Boolean);

    // Batch-load components that exist
    const components = new Map<string, any>();

    const loadComponents = async (ids: string[], table: string, type: string) => {
      if (ids.length === 0) return;
      try {
        const rows: any[] = await prisma.$queryRawUnsafe(
          `SELECT * FROM ${table} WHERE id = ANY($1::uuid[])`,
          ids,
        );
        for (const row of rows) {
          components.set(row.id, { ...row, _type: type });
        }
      } catch {
        // Table might not have data or might have different columns — skip gracefully
      }
    };

    await Promise.all([
      loadComponents(weaponIds, "component_weapons", "WEAPON"),
      loadComponents(shieldIds, "component_shields", "SHIELD"),
      loadComponents(powerIds, "component_power_plants", "POWER_PLANT"),
      loadComponents(coolerIds, "component_coolers", "COOLER"),
      loadComponents(quantumIds, "component_quantum_drives", "QUANTUM_DRIVE"),
    ]);

    // ── 4. Build flat hardpoints ──
    const flatHardpoints = hardpointRows.map((hp) => {
      const category = inferCategory(hp.hardpoint_name, hp);

      // Resolve equipped item from default FKs
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
        children: [] as any[], // Children will be populated when turret/rack component data is available
      };
    });

    // ── 5. Build response ──
    const data = {
      id: ship.id,
      reference: ship.reference,
      name: ship.name,
      localizedName: null,
      manufacturer: ship.manufacturer,
      gameVersion: ship.game_version,
      type: "SHIP",
      ship: {
        scmSpeed: numOrNull(ship.scm_speed) ?? numOrNull(ship.flight_scm),
        afterburnerSpeed: numOrNull(ship.afterburner_speed) ?? numOrNull(ship.flight_max),
        pitchRate: numOrNull(ship.flight_pitch),
        yawRate: numOrNull(ship.flight_yaw),
        rollRate: numOrNull(ship.flight_roll),
        maxCrew: ship.max_crew ?? null,
        cargo: numOrNull(ship.cargo_capacity),
        role: ship.role ?? null,
        focus: null,
        career: null,
        mass: numOrNull(ship.mass),
      },
    };

    return NextResponse.json(
      { data, flatHardpoints },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (error) {
    console.error("[API /ships/[id]] Error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
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

  // Build componentStats from the component's columns
  const stats: Record<string, any> = {};

  // Weapon stats
  if (comp.alpha_damage != null) stats.alphaDamage = Number(comp.alpha_damage);
  if (comp.fire_rate != null) stats.fireRate = Number(comp.fire_rate);
  if (comp.dps != null) stats.dps = Number(comp.dps);
  if (comp.damage_type != null) stats.damageType = comp.damage_type;

  // Shield stats
  if (comp.max_hp != null) { stats.shieldHp = Number(comp.max_hp); stats.maxHp = Number(comp.max_hp); }
  if (comp.regen_rate != null) { stats.shieldRegen = Number(comp.regen_rate); stats.regenRate = Number(comp.regen_rate); }

  // Power stats
  if (comp.power_output != null) stats.powerOutput = Number(comp.power_output);

  // Cooler stats
  if (comp.cooling_rate != null) stats.coolingRate = Number(comp.cooling_rate);

  // Quantum stats
  if (comp.max_speed != null) stats.maxSpeed = Number(comp.max_speed);
  if (comp.fuel_rate != null) stats.fuelRate = Number(comp.fuel_rate);

  // Common stats
  if (comp.power_draw != null) stats.powerDraw = Number(comp.power_draw);
  if (comp.thermal_output != null) stats.thermalOutput = Number(comp.thermal_output);
  if (comp.em_signature != null) stats.emSignature = Number(comp.em_signature);
  if (comp.ir_signature != null) stats.irSignature = Number(comp.ir_signature);

  // Compute DPS if missing
  if (!stats.dps && stats.alphaDamage && stats.fireRate) {
    const a = stats.alphaDamage, fr = stats.fireRate;
    if (a > 0 && fr > 0) stats.dps = Math.round(a * (fr / 60) * 100) / 100;
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
