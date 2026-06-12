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
import { getOnlineVersionsArray } from "@/lib/onlineVersions";

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
    // Fase GV-Online: filtramos a versions online
    const onlineList = await getOnlineVersionsArray();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const onlineClause = onlineList && onlineList.length > 0
      ? ` AND s.game_version = ANY($${ids.length + 1}::text[])`
      : "";
    const shipParams: any[] = [...ids];
    if (onlineList && onlineList.length > 0) shipParams.push(onlineList);
    // Sitio.1 (2026-06-12): puente de precios por class_name — ship_price
    // guarda UUIDs de la GV donde se importó (4.7.0); el join directo por id
    // daba msrp null para casi todas las naves de la GV online.
    const ships: any[] = await sql.unsafe(
      `SELECT s.*, s.class_name AS reference, sp.msrp_usd, sp.warbond_usd, m.name AS manufacturer
       FROM ships s
       LEFT JOIN LATERAL (
         SELECT sp2.* FROM ship_price sp2
         JOIN ships sx ON sx.id = sp2.id AND sx.class_name = s.class_name
         ORDER BY sx.game_version DESC LIMIT 1
       ) sp ON true
       LEFT JOIN manufacturers m ON m.id = s.manufacturer_id
       WHERE s.id::text IN (${placeholders})${onlineClause}`,
      shipParams,
    );

    if (ships.length === 0) {
      return { error: null, status: 200, data: [] };
    }

    // ── 2. Fetch satellite data for all ships ──
    const shipIds = ships.map((s) => String(s.id));
    const shipRefs = ships.map((s) => String(s.reference));
    // Fix dup (2026-05-28): cuando una nave tiene mismo ship_id en múltiples
    // gvs (caso típico Avenger Titan: 0079c5d5 en 4.7.2 + 4.8.0-fix1 +
    // 4.8.0-fix2), el SELECT WHERE ship_id IN multiplica filas → cada nave
    // aparece N veces. Igual con ship_hardpoints por ship_reference.
    // Filtrar por (ship_id, game_version) en pareja para cada ship pedido.
    const shipGvPairs = ships.map((s) => ({ id: String(s.id), gv: String(s.game_version ?? '') }));
    const refGvPairs = ships.map((s) => ({ ref: String(s.reference ?? ''), gv: String(s.game_version ?? '') }));

    // Construir WHERE con OR de pares (id, gv) — postgres no soporta IN (tuples)
    // como ANY de array compuesto fácilmente, vamos por OR explícito.
    const buildIdPairsWhere = (alias: string) =>
      shipGvPairs.map((_, i) => `(${alias}.ship_id::text = $${i*2+1} AND ${alias}.game_version = $${i*2+2})`).join(' OR ');
    const idPairsFlatten = shipGvPairs.flatMap(p => [p.id, p.gv]);

    let flightRows: any[] = [];
    try {
      flightRows = await sql.unsafe(
        `SELECT * FROM ship_flight_stats WHERE ${buildIdPairsWhere('ship_flight_stats')}`,
        idPairsFlatten,
      ) as any[];
    } catch {}

    let fuelRows: any[] = [];
    try {
      fuelRows = await sql.unsafe(
        `SELECT * FROM ship_fuel WHERE ${buildIdPairsWhere('ship_fuel')}`,
        idPairsFlatten,
      ) as any[];
    } catch {}

    // Sitio.2 (2026-06-12): hull/shield/QT-range/signatures viven en
    // ship_power_reference y ship_resistances, no en ship_fuel/ships — el
    // comparador mostraba "—" en esos bloques para TODAS las naves.
    let powerRefRows: any[] = [];
    try {
      powerRefRows = await sql.unsafe(
        `SELECT * FROM ship_power_reference WHERE ${buildIdPairsWhere('ship_power_reference')}`,
        idPairsFlatten,
      ) as any[];
    } catch {}
    let resistRows: any[] = [];
    try {
      resistRows = await sql.unsafe(
        `SELECT * FROM ship_resistances WHERE ${buildIdPairsWhere('ship_resistances')}`,
        idPairsFlatten,
      ) as any[];
    } catch {}

    // ── 3. Fetch hardpoints for all ships ──
    // Igual: filtrar por (ship_reference, game_version) por par para no
    // mezclar hardpoints de versiones distintas.
    const refPairsWhere = refGvPairs.map((_, i) =>
      `(ship_reference = $${i*2+1} AND game_version = $${i*2+2})`).join(' OR ');
    const refPairsFlatten = refGvPairs.flatMap(p => [p.ref, p.gv]);
    const allHardpoints: any[] = await sql.unsafe(
      `SELECT * FROM ship_hardpoints WHERE ${refPairsWhere}
       ORDER BY ship_reference, hardpoint_type, max_size DESC`,
      refPairsFlatten,
    );

    // Sitio.2: totalMissileDmg era 0 para todas las naves — sumaba
    // entry.DamageTotal de loadout_json, que en la GV online viene siempre
    // vacío (los misiles son filas hijas). Sumamos desde ship_hardpoints
    // tipo Missile × missiles.damage_total (match por raw_data ClassName).
    const missileAgg = new Map<string, { count: number; dmg: number }>();
    try {
      const missileRows: any[] = await sql.unsafe(
        `SELECT sh.ship_reference, COUNT(*)::int AS n, COALESCE(SUM(m.damage_total), 0) AS dmg
           FROM ship_hardpoints sh
           LEFT JOIN missiles m
             ON m.raw_data->>'ClassName' = sh.default_item_class
            AND m.game_version = sh.game_version
          WHERE (${refPairsWhere.replace(/ship_reference/g, 'sh.ship_reference').replace(/game_version/g, 'sh.game_version')})
            AND split_part(sh.hardpoint_type, '.', 1) = 'Missile'
          GROUP BY sh.ship_reference`,
        refPairsFlatten,
      );
      for (const r of missileRows) {
        missileAgg.set(String(r.ship_reference), { count: r.n, dmg: Number(r.dmg) || 0 });
      }
    } catch {}

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
      const powerRef = powerRefRows.find((f: any) => String(f.ship_id) === String(ship.id));
      const resist = resistRows.find((f: any) => String(f.ship_id) === String(ship.id));
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
        reference: String(ship.reference || ""),
        name: ship.name || "",
        localizedName: null,
        manufacturer: ship.manufacturer || null,
        type: "SHIP",
        size: numOrNull(ship.size),
        gameVersion: ship.game_version || "",
        msrpUsd: numOrNull(ship.msrp_usd),
        warbondUsd: numOrNull(ship.warbond_usd),
        ship: {
          maxCrew: numOrNull(ship.crew),
          cargo: numOrNull(ship.cargo_capacity),
          mass: numOrNull(ship.mass_total_kg),
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
          // Sitio.2: estos campos leían columnas inexistentes (ship_fuel no
          // tiene quantum_range/shield_hp_total/hull_hp; ships no tiene
          // length_meters ni base_*_signature) → "—" para todas las naves.
          quantumRange: numOrNull(powerRef?.qt_range_km),
          shieldHpTotal: numOrNull(powerRef?.total_shield_hp),
          hullHp: numOrNull(resist?.armor_hp),
          lengthMeters: numOrNull(ship.length_m),
          beamMeters: numOrNull(ship.width_m),
          heightMeters: numOrNull(ship.height_m),
          role: ship.role || null,
          focus: ship.career || null,
          career: ship.career || null,
          baseEmSignature: numOrNull(resist?.base_em_signature),
          baseIrSignature: numOrNull(resist?.base_ir_signature),
          baseCsSignature: numOrNull(resist?.base_cs_signature),
        },
        computed: {
          totalDps: Math.round(totalDps * 100) / 100,
          totalAlpha: Math.round(totalAlpha * 100) / 100,
          totalShieldHp: Math.round(totalShieldHp),
          totalShieldRegen: Math.round(totalShieldRegen * 100) / 100,
          totalPowerOutput: Math.round(totalPowerOutput * 100) / 100,
          totalCooling: Math.round(totalCooling * 100) / 100,
          // Sitio.2: desde la agregación BD (filas hijas tipo Missile), no
          // desde loadout_json (siempre vacío en la GV online).
          totalMissileDmg: Math.round(missileAgg.get(String(ship.reference))?.dmg ?? totalMissileDmg),
          weaponCount,
          missileCount: missileAgg.get(String(ship.reference))?.count ?? missileCount,
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
