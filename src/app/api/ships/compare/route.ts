export const dynamic = 'force-dynamic';
// =============================================================================
// SC LABS — GET/POST /api/ships/compare v2
// Returns detailed data for up to 3 ships for side-by-side comparison.
// GET: Query: ?ids=uuid1,uuid2,uuid3
// POST: Body: { ids: ["uuid1", "uuid2", "uuid3"] } or { ids: "uuid1,uuid2,uuid3" }
// Rewritten to use raw SQL (matching /api/ships/[id] approach).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { validateIds, parsePostBody, secureHeaders } from "@/lib/api-security";

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/**
 * Shared internal function for fetching and comparing ships.
 * Called by both GET and POST handlers.
 */
async function compareShips(ids: string[]) {
  if (ids.length === 0) {
    return { error: "No valid ids provided", status: 400, data: null };
  }

  try {
    // ── 1. Fetch ships by ID ──
    // Build parameterized query for multiple IDs
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const ships: any[] = await sql.unsafe(
      `SELECT * FROM ships WHERE id::text IN (${placeholders})`,
      ids,
    );

    if (ships.length === 0) {
      return { error: null, status: 200, data: [] };
    }

    // ── 2. Fetch satellite data for all ships ──
    const shipIds = ships.map((s) => String(s.id));
    const shipRefs = ships.map((s) => String(s.reference));

    const flightPlaceholders = shipIds.map((_, i) => `$${i + 1}`).join(", ");
    let flightRows: any[] = [];
    try {
      flightRows = await sql.unsafe(
        `SELECT * FROM ship_flight_stats WHERE ship_id::text IN (${flightPlaceholders})`,
        shipIds,
      ) as any[];
    } catch {}

    let fuelRows: any[] = [];
    try {
      fuelRows = await sql.unsafe(
        `SELECT * FROM ship_fuel WHERE ship_id::text IN (${flightPlaceholders})`,
        shipIds,
      ) as any[];
    } catch {}

    // ── 3. Fetch hardpoints for all ships ──
    const refPlaceholders = shipRefs.map((_, i) => `$${i + 1}`).join(", ");
    const allHardpoints: any[] = await sql.unsafe(
      `SELECT * FROM ship_hardpoints WHERE ship_reference IN (${refPlaceholders})
       ORDER BY ship_reference, hardpoint_type, max_size DESC`,
      shipRefs,
    );

    // ── 4. Batch-load all component data ──
    const allClasses = allHardpoints
      .map((hp) => hp.default_item_class)
      .filter((c: any) => c && c !== "");

    // Also gather child classes from loadout_json
    for (const hp of allHardpoints) {
      const loadout = hp.loadout_json;
      if (Array.isArray(loadout)) {
        for (const entry of loadout) {
          const cn = entry?.ClassName || entry?.className;
          if (cn) allClasses.push(cn);
        }
      }
    }

    const uniqueClasses = [...new Set(allClasses)];

    // Build component map: className -> stats
    const componentMap = new Map<string, { table: string; row: any }>();

    if (uniqueClasses.length > 0) {
      const classPlaceholders = uniqueClasses.map((_, i) => `$${i + 1}`).join(", ");

      const safeQuery = async (query: string, params: string[]): Promise<any[]> => {
        try { return await sql.unsafe(query, params) as any[]; }
        catch { return []; }
      };

      const [weapons, shields, powerPlants, coolers, quantumDrives] = await Promise.all([
        safeQuery(`SELECT * FROM weapon_guns WHERE class_name IN (${classPlaceholders})`, uniqueClasses),
        safeQuery(`SELECT * FROM shields WHERE class_name IN (${classPlaceholders})`, uniqueClasses),
        safeQuery(`SELECT * FROM power_plants WHERE class_name IN (${classPlaceholders})`, uniqueClasses),
        safeQuery(`SELECT * FROM coolers WHERE class_name IN (${classPlaceholders})`, uniqueClasses),
        safeQuery(`SELECT * FROM quantum_drives WHERE class_name IN (${classPlaceholders})`, uniqueClasses),
      ]);

      for (const r of (weapons as any[])) componentMap.set(r.class_name, { table: "weapon_guns", row: r });
      for (const r of (shields as any[])) componentMap.set(r.class_name, { table: "shields", row: r });
      for (const r of (powerPlants as any[])) componentMap.set(r.class_name, { table: "power_plants", row: r });
      for (const r of (coolers as any[])) componentMap.set(r.class_name, { table: "coolers", row: r });
      for (const r of (quantumDrives as any[])) componentMap.set(r.class_name, { table: "quantum_drives", row: r });
    }

    // ── 5. Build result for each ship ──
    const result = ships.map((ship) => {
      const fs = flightRows.find((f: any) => String(f.ship_id) === String(ship.id));
      const fuel = fuelRows.find((f: any) => String(f.ship_id) === String(ship.id));
      const hps = allHardpoints.filter((hp: any) => hp.ship_reference === ship.reference);

      // Aggregate stats from hardpoints + component data
      let totalDps = 0;
      let totalAlpha = 0;
      let totalShieldHp = 0;
      let totalShieldRegen = 0;
      let totalPowerOutput = 0;
      let totalCooling = 0;
      let totalMissileDmg = 0;
      let weaponCount = 0;
      let missileCount = 0;
      let shieldCount = 0;
      let quantumSpeed: number | null = null;
      let quantumRange: number | null = null;
      let quantumSpool: number | null = null;

      for (const hp of hps) {
        const cls = hp.default_item_class;
        const hpType = (hp.hardpoint_type || "").split(".")[0];

        if (!cls) continue;
        const comp = componentMap.get(cls);

        // Weapons (direct + children in loadout_json)
        if (hpType === "Weapon" || hpType === "WeaponGun") {
          weaponCount++;
          if (comp?.table === "weapon_guns") {
            const r = comp.row;
            const dps =
              (numOrNull(r.dps_physical) ?? 0) +
              (numOrNull(r.dps_energy) ?? 0) +
              (numOrNull(r.dps_distortion) ?? 0) +
              (numOrNull(r.dps_thermal) ?? 0) +
              (numOrNull(r.dps_biochemical) ?? 0) +
              (numOrNull(r.dps_stun) ?? 0);
            const alpha =
              (numOrNull(r.alpha_physical) ?? 0) +
              (numOrNull(r.alpha_energy) ?? 0) +
              (numOrNull(r.alpha_distortion) ?? 0) +
              (numOrNull(r.alpha_thermal) ?? 0) +
              (numOrNull(r.alpha_biochemical) ?? 0) +
              (numOrNull(r.alpha_stun) ?? 0);
            totalDps += dps;
            totalAlpha += alpha;
          }
        }

        // Turrets with children
        if (hpType === "Turret" || hpType === "TurretBase") {
          const loadout = hp.loadout_json;
          if (Array.isArray(loadout)) {
            for (const entry of loadout) {
              const childCls = entry?.ClassName || entry?.className;
              if (!childCls) continue;
              const childComp = componentMap.get(childCls);
              if (childComp?.table === "weapon_guns") {
                weaponCount++;
                const r = childComp.row;
                const dps =
                  (numOrNull(r.dps_physical) ?? 0) +
                  (numOrNull(r.dps_energy) ?? 0) +
                  (numOrNull(r.dps_distortion) ?? 0) +
                  (numOrNull(r.dps_thermal) ?? 0) +
                  (numOrNull(r.dps_biochemical) ?? 0) +
                  (numOrNull(r.dps_stun) ?? 0);
                const alpha =
                  (numOrNull(r.alpha_physical) ?? 0) +
                  (numOrNull(r.alpha_energy) ?? 0) +
                  (numOrNull(r.alpha_distortion) ?? 0) +
                  (numOrNull(r.alpha_thermal) ?? 0) +
                  (numOrNull(r.alpha_biochemical) ?? 0) +
                  (numOrNull(r.alpha_stun) ?? 0);
                totalDps += dps;
                totalAlpha += alpha;
              }
            }
          }
        }

        // Missiles
        if (hpType === "MissileLauncher") {
          missileCount++;
          // Missile damage from loadout children
          const loadout = hp.loadout_json;
          if (Array.isArray(loadout)) {
            for (const entry of loadout) {
              const dmg = numOrNull(entry?.DamageTotal) ?? 0;
              totalMissileDmg += dmg;
            }
          }
        }

        // Shields
        if (hpType === "Shield" && comp?.table === "shields") {
          shieldCount++;
          totalShieldHp += numOrNull(comp.row.pool_hp) ?? 0;
          totalShieldRegen += numOrNull(comp.row.max_shield_regen) ?? 0;
        }

        // Power Plants
        if (hpType === "PowerPlant" && comp?.table === "power_plants") {
          let gen = numOrNull(comp.row.power_generation) ?? 0;
          if (!gen) {
            gen = numOrNull(comp.row.raw_data?.stdItem?.ResourceNetwork?.Usage?.Power?.Maximum) ?? 0;
          }
          totalPowerOutput += gen;
        }

        // Coolers
        if (hpType === "Cooler" && comp?.table === "coolers") {
          totalCooling += numOrNull(comp.row.cooling_generation) ?? 0;
        }

        // Quantum Drive
        if (hpType === "QuantumDrive" && comp?.table === "quantum_drives") {
          quantumSpeed = numOrNull(comp.row.drive_speed);
          quantumRange = null; // not in our table
          quantumSpool = numOrNull(comp.row.spool_up_time);
        }
      }

      return {
        id: String(ship.id),
        name: ship.name || "",
        localizedName: null,
        manufacturer: ship.manufacturer || null,
        type: "SHIP",
        size: numOrNull(ship.size),
        gameVersion: ship.game_version || "",
        msrpUsd: numOrNull(ship.msrp_usd),
        warbondUsd: numOrNull(ship.warbond_usd),
        ship: {
          maxCrew: numOrNull(ship.max_crew),
          cargo: numOrNull(ship.cargo_capacity),
          mass: numOrNull(ship.mass),
          scmSpeed: numOrNull(fs?.scm_speed ?? ship.scm_speed),
          afterburnerSpeed: numOrNull(fs?.max_speed ?? ship.afterburner_speed),
          pitchRate: numOrNull(fs?.pitch ?? fs?.pitch_rate),
          yawRate: numOrNull(fs?.yaw ?? fs?.yaw_rate),
          rollRate: numOrNull(fs?.roll ?? fs?.roll_rate),
          maxAccelMain: numOrNull(fs?.accel_forward),
          maxAccelRetro: numOrNull(fs?.accel_backward),
          accelUp: numOrNull(fs?.accel_up),
          accelDown: numOrNull(fs?.accel_down),
          accelStrafe: numOrNull(fs?.accel_strafe),
          boostSpeedForward: numOrNull(fs?.boost_speed_forward),
          boostSpeedBackward: numOrNull(fs?.boost_speed_backward),
          boostedPitch: numOrNull(fs?.pitch_boosted ?? fs?.boosted_pitch),
          boostedYaw: numOrNull(fs?.yaw_boosted ?? fs?.boosted_yaw),
          boostedRoll: numOrNull(fs?.roll_boosted ?? fs?.boosted_roll),
          hydrogenFuelCap: numOrNull(fuel?.hydrogen_capacity),
          quantumFuelCap: numOrNull(fuel?.quantum_fuel_capacity ?? fuel?.quantum_capacity),
          quantumRange: numOrNull(fuel?.quantum_range),
          shieldHpTotal: numOrNull(fuel?.shield_hp_total),
          hullHp: numOrNull(fuel?.hull_hp),
          lengthMeters: numOrNull(ship.length_meters ?? ship.length),
          beamMeters: numOrNull(ship.beam_meters ?? ship.beam),
          heightMeters: numOrNull(ship.height_meters ?? ship.height),
          role: ship.role || null,
          focus: ship.focus || null,
          career: ship.career || null,
          baseEmSignature: numOrNull(ship.base_em_signature),
          baseIrSignature: numOrNull(ship.base_ir_signature),
          baseCsSignature: numOrNull(ship.base_cs_signature),
        },
        computed: {
          totalDps: Math.round(totalDps * 100) / 100,
          totalAlpha: Math.round(totalAlpha * 100) / 100,
          totalShieldHp: Math.round(totalShieldHp),
          totalShieldRegen: Math.round(totalShieldRegen * 100) / 100,
          totalPowerOutput: Math.round(totalPowerOutput * 100) / 100,
          totalCooling: Math.round(totalCooling * 100) / 100,
          totalMissileDmg: Math.round(totalMissileDmg),
          weaponCount,
          missileCount,
          shieldCount,
          quantumSpeed,
          quantumRange,
          quantumSpool,
        },
      };
    });

    // Reorder to match input ids order
    const ordered = ids.map((id) => result.find((r) => r.id === id)).filter(Boolean);

    return { error: null, status: 200, data: ordered };
  } catch (error) {
    console.error("[API /ships/compare] Error:", error);
    return { error: "Error comparing ships", status: 500, data: null };
  }
}

/**
 * GET handler — backward compatible query parameter support
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");

    if (!idsParam) {
      return NextResponse.json(
        { error: "Missing ids parameter" },
        { status: 400, headers: secureHeaders() }
      );
    }

    // Validate IDs using security utility
    const ids = validateIds(idsParam, 3);

    const result = await compareShips(ids);

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: secureHeaders() }
      );
    }

    return NextResponse.json(
      { data: result.data },
      { headers: secureHeaders() }
    );
  } catch (error) {
    console.error("[API /ships/compare GET] Error:", error);
    return NextResponse.json(
      { error: "Error comparing ships" },
      { status: 500, headers: secureHeaders() }
    );
  }
}

/**
 * POST handler — accepts JSON body with ids array or comma-separated string
 */
export async function POST(request: NextRequest) {
  try {
    const body = await parsePostBody<{ ids?: string[] | string }>(request);

    if (!body || !body.ids) {
      return NextResponse.json(
        { error: "Missing or invalid ids in request body" },
        { status: 400, headers: secureHeaders() }
      );
    }

    // Validate IDs using security utility
    const ids = validateIds(body.ids, 3);

    const result = await compareShips(ids);

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: secureHeaders() }
      );
    }

    return NextResponse.json(
      { data: result.data },
      { headers: secureHeaders() }
    );
  } catch (error) {
    console.error("[API /ships/compare POST] Error:", error);
    return NextResponse.json(
      { error: "Error comparing ships" },
      { status: 500, headers: secureHeaders() }
    );
  }
}
