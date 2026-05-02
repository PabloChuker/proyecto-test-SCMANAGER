#!/usr/bin/env node
/**
 * ingest_power_fast.mjs — Optimized batch ingest of scunpacked power model data.
 *
 * Uses batched transactions (50 per batch) to minimize round-trips.
 * Skips raw_data JSONB to keep things fast.
 *
 * Usage:
 *   node scripts/ingest_power_fast.mjs              # live run
 *   node scripts/ingest_power_fast.mjs --phase 1    # run specific phase only
 */

import "dotenv/config";
import postgres from "postgres";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SCUNPACKED = join(ROOT, "scunpacked");
const BATCH_SIZE = 40;

const args = process.argv.slice(2);
const PHASE_ONLY = args.includes("--phase") ? parseInt(args[args.indexOf("--phase") + 1]) : null;

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "";
if (!connectionString) { console.error("❌ No DATABASE_URL in .env"); process.exit(1); }

const sql = postgres(connectionString, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 15,
  prepare: false, // required for pgbouncer transaction mode
});

function loadJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }
function sf(v) { return v === undefined || v === null || isNaN(v) ? null : Number(v); }

function extractRN(stdItem) {
  const rn = stdItem?.ResourceNetwork ?? {};
  const usage = rn.Usage ?? {};
  const gen = rn.Generation ?? {};
  const power = usage.Power ?? {};
  const coolant = usage.Coolant ?? {};
  const states = stdItem?.States ?? [];
  const state0 = states[0] ?? {};
  return {
    pMin: sf(power.Min), pMax: sf(power.Max),
    cMin: sf(coolant.Min), cMax: sf(coolant.Max),
    genP: sf(gen.Power), genC: sf(gen.Coolant),
    pips: sf(state0.Pips),
    powerRanges: state0.PowerRanges ?? null,
  };
}
function extractEmission(stdItem) {
  const s0 = (stdItem?.States ?? [])[0] ?? {};
  return { emMax: sf(s0?.Signature?.EM), irMax: sf(s0?.Signature?.IR) };
}
function extractDistortion(stdItem) {
  const d = stdItem?.Distortion ?? {};
  return { shutdownDamage: sf(d.ShutdownDamage), decayDelay: sf(d.DecayDelay), decayRate: sf(d.DecayRate), shutdownTime: sf(d.ShutdownTime) };
}
function extractDurability(stdItem) { return { health: sf(stdItem?.Durability?.Health) }; }
function extractDimensions(stdItem) {
  return { mass: sf(stdItem?.Mass), width: sf(stdItem?.Width), height: sf(stdItem?.Height), length: sf(stdItem?.Length), scu: sf(stdItem?.InventoryOccupancy?.SMCGridSizeX) };
}

const stats = { powerPlants:0, shields:0, coolers:0, quantumDrives:0, weaponGuns:0, radars:0, flightControllers:0, weaponMining:0, ships:0, shipPowerRef:0, shipPools:0, shipHardpoints:0, errors:[] };

// Helper: run an array of async fns in sequential batches
async function runBatched(label, fns) {
  const total = fns.length;
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = fns.slice(i, i + BATCH_SIZE);
    await sql.begin(async (tx) => {
      for (const fn of batch) await fn(tx);
    });
    process.stdout.write(`\r   ${label}: ${Math.min(i + BATCH_SIZE, total)}/${total}`);
  }
  console.log("");
}

// =============================================================================
// PHASE 1: Component catalog
// =============================================================================
async function phase1() {
  console.log("\n📦 Phase 1: Component catalog...");
  const items = loadJSON(join(SCUNPACKED, "ship-items.json"));
  console.log(`   Loaded ${items.length} items`);

  const fns = [];

  for (const item of items) {
    const type = item.type;
    const className = item.className;
    const stdItem = item.stdItem ?? {};
    if (!className) continue;

    const rn = extractRN(stdItem);
    const em = extractEmission(stdItem);
    const dist = extractDistortion(stdItem);
    const dur = extractDurability(stdItem);
    const dim = extractDimensions(stdItem);

    switch (type) {
      case "PowerPlant":
        fns.push(async (tx) => {
          await tx`UPDATE power_plants SET
            power_consumption_min=COALESCE(${rn.pMin},power_consumption_min), power_consumption_max=COALESCE(${rn.pMax},power_consumption_max),
            coolant_consumption_min=COALESCE(${rn.cMin},coolant_consumption_min), coolant_consumption_max=COALESCE(${rn.cMax},coolant_consumption_max),
            pips=COALESCE(${rn.pips},pips), power_ranges=COALESCE(${rn.powerRanges?JSON.stringify(rn.powerRanges):null}::jsonb,power_ranges),
            ir_max=COALESCE(${em.irMax},ir_max) WHERE class_name=${className}`;
          stats.powerPlants++;
        });
        break;
      case "Shield":
        fns.push(async (tx) => {
          await tx`UPDATE shields SET
            pips=COALESCE(${rn.pips},pips), power_ranges=COALESCE(${rn.powerRanges?JSON.stringify(rn.powerRanges):null}::jsonb,power_ranges),
            coolant_consumption_min=COALESCE(${rn.cMin},coolant_consumption_min), coolant_consumption_max=COALESCE(${rn.cMax},coolant_consumption_max),
            ir_max=COALESCE(${em.irMax},ir_max) WHERE class_name=${className}`;
          stats.shields++;
        });
        break;
      case "Cooler":
        fns.push(async (tx) => {
          await tx`UPDATE coolers SET
            pips=COALESCE(${rn.pips},pips), power_ranges=COALESCE(${rn.powerRanges?JSON.stringify(rn.powerRanges):null}::jsonb,power_ranges),
            coolant_consumption_min=COALESCE(${rn.cMin},coolant_consumption_min), coolant_consumption_max=COALESCE(${rn.cMax},coolant_consumption_max)
            WHERE class_name=${className}`;
          stats.coolers++;
        });
        break;
      case "QuantumDrive":
        fns.push(async (tx) => {
          await tx`UPDATE quantum_drives SET
            power_consumption_min=COALESCE(${rn.pMin},power_consumption_min), power_consumption_max=COALESCE(${rn.pMax},power_consumption_max),
            coolant_consumption_min=COALESCE(${rn.cMin},coolant_consumption_min), coolant_consumption_max=COALESCE(${rn.cMax},coolant_consumption_max),
            pips=COALESCE(${rn.pips},pips), power_ranges=COALESCE(${rn.powerRanges?JSON.stringify(rn.powerRanges):null}::jsonb,power_ranges),
            em_max=COALESCE(${em.emMax},em_max), ir_max=COALESCE(${em.irMax},ir_max),
            health=COALESCE(${dur.health},health),
            distortion_shutdown_damage=COALESCE(${dist.shutdownDamage},distortion_shutdown_damage),
            distortion_decay_delay=COALESCE(${dist.decayDelay},distortion_decay_delay),
            distortion_decay_rate=COALESCE(${dist.decayRate},distortion_decay_rate),
            distortion_shutdown_time=COALESCE(${dist.shutdownTime},distortion_shutdown_time),
            width=COALESCE(${dim.width},width), height=COALESCE(${dim.height},height),
            length=COALESCE(${dim.length},length), scu=COALESCE(${dim.scu},scu)
            WHERE class_name=${className}`;
          stats.quantumDrives++;
        });
        break;
      case "WeaponGun": {
        const isEnergy = (rn.pMax ?? 0) > 0 || (rn.pMin ?? 0) > 0 ? true : null;
        fns.push(async (tx) => {
          await tx`UPDATE weapon_guns SET
            power_consumption_min=COALESCE(${rn.pMin},power_consumption_min), power_consumption_max=COALESCE(${rn.pMax},power_consumption_max),
            coolant_consumption_min=COALESCE(${rn.cMin},coolant_consumption_min), coolant_consumption_max=COALESCE(${rn.cMax},coolant_consumption_max),
            ir_max=COALESCE(${em.irMax},ir_max), is_energy_weapon=COALESCE(${isEnergy},is_energy_weapon)
            WHERE class_name=${className}`;
          stats.weaponGuns++;
        });
        break;
      }
      case "Radar":
        fns.push(async (tx) => {
          await tx`UPDATE radars SET
            power_consumption_min=COALESCE(${rn.pMin},power_consumption_min), power_consumption_max=COALESCE(${rn.pMax},power_consumption_max),
            coolant_consumption_min=COALESCE(${rn.cMin},coolant_consumption_min), coolant_consumption_max=COALESCE(${rn.cMax},coolant_consumption_max),
            pips=COALESCE(${rn.pips},pips), power_ranges=COALESCE(${rn.powerRanges?JSON.stringify(rn.powerRanges):null}::jsonb,power_ranges),
            em_max=COALESCE(${em.emMax},em_max), ir_max=COALESCE(${em.irMax},ir_max),
            health=COALESCE(${dur.health},health),
            distortion_shutdown_damage=COALESCE(${dist.shutdownDamage},distortion_shutdown_damage),
            distortion_decay_delay=COALESCE(${dist.decayDelay},distortion_decay_delay),
            distortion_decay_rate=COALESCE(${dist.decayRate},distortion_decay_rate),
            distortion_shutdown_time=COALESCE(${dist.shutdownTime},distortion_shutdown_time),
            width=COALESCE(${dim.width},width), height=COALESCE(${dim.height},height),
            length=COALESCE(${dim.length},length), scu=COALESCE(${dim.scu},scu)
            WHERE class_name=${className}`;
          stats.radars++;
        });
        break;
      case "FlightController":
        fns.push(async (tx) => {
          await tx`UPDATE flight_controllers SET
            power_consumption_min=COALESCE(${rn.pMin},power_consumption_min), power_consumption_max=COALESCE(${rn.pMax},power_consumption_max),
            coolant_consumption_min=COALESCE(${rn.cMin},coolant_consumption_min), coolant_consumption_max=COALESCE(${rn.cMax},coolant_consumption_max),
            pips=COALESCE(${rn.pips},pips), power_ranges=COALESCE(${rn.powerRanges?JSON.stringify(rn.powerRanges):null}::jsonb,power_ranges),
            em_max=COALESCE(${em.emMax},em_max), ir_max=COALESCE(${em.irMax},ir_max),
            health=COALESCE(${dur.health},health),
            distortion_shutdown_damage=COALESCE(${dist.shutdownDamage},distortion_shutdown_damage),
            distortion_decay_delay=COALESCE(${dist.decayDelay},distortion_decay_delay),
            distortion_decay_rate=COALESCE(${dist.decayRate},distortion_decay_rate),
            distortion_shutdown_time=COALESCE(${dist.shutdownTime},distortion_shutdown_time),
            mass=COALESCE(${dim.mass},mass), width=COALESCE(${dim.width},width),
            height=COALESCE(${dim.height},height), length=COALESCE(${dim.length},length),
            scu=COALESCE(${dim.scu},scu) WHERE class_name=${className}`;
          stats.flightControllers++;
        });
        break;
      case "WeaponMining": {
        const mining = stdItem?.Mining ?? {};
        const uuid = stdItem.UUID ?? item.reference;
        fns.push(async (tx) => {
          await tx`INSERT INTO weapon_mining (
            id,class_name,item_name,name,power_consumption_min,power_consumption_max,
            coolant_consumption_min,coolant_consumption_max,em_max,ir_max,
            mining_laser_power,optimal_range,maximum_range,extraction_throughput,
            mining_modifier,resistance_modifier,instability_modifier,
            optimal_charge_window,optimal_charge_rate,shatter_damage,health,
            distortion_shutdown_damage,distortion_shutdown_time,
            mass,width,height,length,scu
          ) VALUES (
            ${uuid}::uuid,${className},${stdItem.Name??null},${item.name??stdItem.Name??className},
            ${rn.pMin},${rn.pMax},${rn.cMin},${rn.cMax},${em.emMax},${em.irMax},
            ${sf(mining.LaserPower)},${sf(mining.OptimalRange)},${sf(mining.MaximumRange)},
            ${sf(mining.ExtractionThroughput)},${sf(mining.MiningModifier)},${sf(mining.ResistanceModifier)},
            ${sf(mining.InstabilityModifier)},${sf(mining.OptimalChargeWindowSize)},${sf(mining.OptimalChargeRate)},
            ${sf(mining.ShatterDamage)},${dur.health},${dist.shutdownDamage},${dist.shutdownTime},
            ${dim.mass},${dim.width},${dim.height},${dim.length},${dim.scu}
          ) ON CONFLICT (class_name) DO UPDATE SET
            power_consumption_min=COALESCE(EXCLUDED.power_consumption_min,weapon_mining.power_consumption_min),
            power_consumption_max=COALESCE(EXCLUDED.power_consumption_max,weapon_mining.power_consumption_max),
            mining_laser_power=COALESCE(EXCLUDED.mining_laser_power,weapon_mining.mining_laser_power),
            extraction_throughput=COALESCE(EXCLUDED.extraction_throughput,weapon_mining.extraction_throughput)`;
          stats.weaponMining++;
        });
        break;
      }
    }
  }

  await runBatched("Components", fns);
}

// =============================================================================
// PHASE 2: Ships + ship_power_reference + ship_pools
// =============================================================================
async function phase2() {
  console.log("\n🚀 Phase 2: Ships + power reference + pools...");
  const shipsIndex = loadJSON(join(SCUNPACKED, "ships.json"));
  console.log(`   Loaded ${shipsIndex.length} ships`);

  // Pre-load reference→id map
  const rows = await sql`SELECT id, reference FROM ships WHERE reference IS NOT NULL`;
  const refToId = {};
  for (const r of rows) refToId[r.reference] = r.id;
  console.log(`   Mapped ${Object.keys(refToId).length} DB ships`);

  const fns = [];

  for (const ship of shipsIndex) {
    const cn = ship.ClassName;
    if (!cn) continue;
    const dbId = refToId[cn];
    if (!dbId) continue;

    const pwr = ship.Power ?? {};
    const cool = ship.Cooling ?? {};
    const emis = ship.Emission ?? {};
    const shTot = ship.ShieldsTotal ?? {};
    const dist = ship.Distortion ?? {};
    const prop = ship.Propulsion ?? {};
    const qt = ship.QuantumTravel ?? {};

    fns.push(async (tx) => {
      // 2a: Update ships
      await tx`UPDATE ships SET
        class_name=COALESCE(${cn},class_name),
        career=COALESCE(${ship.Career??null},career),
        length_m=COALESCE(${sf(ship.Length)},length_m), width_m=COALESCE(${sf(ship.Width)},width_m),
        height_m=COALESCE(${sf(ship.Height)},height_m),
        mass_empty_kg=COALESCE(${sf(ship.Mass)},mass_empty_kg),
        mass_loadout_kg=COALESCE(${sf(ship.MassLoadout)},mass_loadout_kg),
        mass_total_kg=COALESCE(${sf(ship.MassTotal)},mass_total_kg),
        crew=COALESCE(${sf(ship.Crew)},crew),
        is_spaceship=COALESCE(${ship.IsSpaceship??null},is_spaceship),
        is_gravlev=COALESCE(${ship.IsGravlev??null},is_gravlev),
        cargo_scu=COALESCE(${sf(ship.Cargo)},cargo_scu),
        source_version='scunpacked-2026-04-16', imported_at=now()
        WHERE id=${dbId}::uuid`;
      stats.ships++;

      // 2b: ship_power_reference
      await tx`INSERT INTO ship_power_reference (
        ship_id, power_generation_segments, power_used_scm, power_used_nav,
        power_used_grouped_scm, power_used_grouped_nav,
        cooling_generation_segments, cooling_used_scm, cooling_used_nav,
        cooling_used_pct_scm, cooling_used_pct_nav,
        cooling_used_grouped_scm, cooling_used_grouped_nav,
        em_shields, em_quantum, ir_shields, ir_quantum, em_per_segment,
        em_groups_scm, em_groups_nav, em_segment_groups_scm, em_segment_groups_nav,
        total_shield_hp, total_shield_regen, total_shield_regen_raw, total_shield_regen_min_power,
        distortion_pool, fuel_capacity_hydrogen, fuel_capacity_quantum,
        qt_range_km, qt_speed_ms, qt_spool_time_s, source_version
      ) VALUES (
        ${dbId}::uuid,
        ${sf(pwr.GenerationSegments)}, ${sf(pwr.UsedSegmentsShields)}, ${sf(pwr.UsedSegmentsQuantum)},
        ${pwr.UsedSegmentsGrouped?JSON.stringify(pwr.UsedSegmentsGrouped):null}::jsonb,
        ${cool.UsedSegmentsQuantumGrouped?JSON.stringify(cool.UsedSegmentsQuantumGrouped):null}::jsonb,
        ${sf(cool.GenerationSegments)}, ${sf(cool.UsedSegmentsShields)}, ${sf(cool.UsedSegmentsQuantum)},
        ${sf(cool.UsedSegmentsShieldsPct)}, ${sf(cool.UsedSegmentsQuantumPct)},
        ${cool.UsedSegmentsShieldsGrouped?JSON.stringify(cool.UsedSegmentsShieldsGrouped):null}::jsonb,
        ${cool.UsedSegmentsQuantumGrouped?JSON.stringify(cool.UsedSegmentsQuantumGrouped):null}::jsonb,
        ${sf(emis.EmShields)}, ${sf(emis.EmQuantum)}, ${sf(emis.IrShields)}, ${sf(emis.IrQuantum)},
        ${sf(emis.EmPerSegment)},
        ${emis.EmGroupsShields?JSON.stringify(emis.EmGroupsShields):null}::jsonb,
        ${emis.EmGroupsQuantum?JSON.stringify(emis.EmGroupsQuantum):null}::jsonb,
        ${emis.EmSegmentGroupsShields?JSON.stringify(emis.EmSegmentGroupsShields):null}::jsonb,
        ${emis.EmSegmentGroupsQuantum?JSON.stringify(emis.EmSegmentGroupsQuantum):null}::jsonb,
        ${sf(shTot.Hp)}, ${sf(shTot.Regen)}, ${sf(shTot.RegenRaw)}, ${sf(shTot.RegenMinPower)},
        ${sf(dist.Pool)}, ${sf(prop.FuelCapacity)}, ${sf(qt.FuelCapacity)},
        ${qt.Range?sf(qt.Range/1000):null}, ${sf(qt.Speed)}, ${sf(qt.SpoolTime)},
        'scunpacked-2026-04-16'
      ) ON CONFLICT (ship_id) DO UPDATE SET
        power_generation_segments=COALESCE(EXCLUDED.power_generation_segments,ship_power_reference.power_generation_segments),
        power_used_scm=COALESCE(EXCLUDED.power_used_scm,ship_power_reference.power_used_scm),
        power_used_nav=COALESCE(EXCLUDED.power_used_nav,ship_power_reference.power_used_nav),
        power_used_grouped_scm=COALESCE(EXCLUDED.power_used_grouped_scm,ship_power_reference.power_used_grouped_scm),
        power_used_grouped_nav=COALESCE(EXCLUDED.power_used_grouped_nav,ship_power_reference.power_used_grouped_nav),
        cooling_generation_segments=COALESCE(EXCLUDED.cooling_generation_segments,ship_power_reference.cooling_generation_segments),
        cooling_used_scm=COALESCE(EXCLUDED.cooling_used_scm,ship_power_reference.cooling_used_scm),
        cooling_used_nav=COALESCE(EXCLUDED.cooling_used_nav,ship_power_reference.cooling_used_nav),
        cooling_used_pct_scm=COALESCE(EXCLUDED.cooling_used_pct_scm,ship_power_reference.cooling_used_pct_scm),
        cooling_used_pct_nav=COALESCE(EXCLUDED.cooling_used_pct_nav,ship_power_reference.cooling_used_pct_nav),
        cooling_used_grouped_scm=COALESCE(EXCLUDED.cooling_used_grouped_scm,ship_power_reference.cooling_used_grouped_scm),
        cooling_used_grouped_nav=COALESCE(EXCLUDED.cooling_used_grouped_nav,ship_power_reference.cooling_used_grouped_nav),
        em_shields=COALESCE(EXCLUDED.em_shields,ship_power_reference.em_shields),
        em_quantum=COALESCE(EXCLUDED.em_quantum,ship_power_reference.em_quantum),
        ir_shields=COALESCE(EXCLUDED.ir_shields,ship_power_reference.ir_shields),
        ir_quantum=COALESCE(EXCLUDED.ir_quantum,ship_power_reference.ir_quantum),
        em_per_segment=COALESCE(EXCLUDED.em_per_segment,ship_power_reference.em_per_segment),
        em_groups_scm=COALESCE(EXCLUDED.em_groups_scm,ship_power_reference.em_groups_scm),
        em_groups_nav=COALESCE(EXCLUDED.em_groups_nav,ship_power_reference.em_groups_nav),
        em_segment_groups_scm=COALESCE(EXCLUDED.em_segment_groups_scm,ship_power_reference.em_segment_groups_scm),
        em_segment_groups_nav=COALESCE(EXCLUDED.em_segment_groups_nav,ship_power_reference.em_segment_groups_nav),
        total_shield_hp=COALESCE(EXCLUDED.total_shield_hp,ship_power_reference.total_shield_hp),
        total_shield_regen=COALESCE(EXCLUDED.total_shield_regen,ship_power_reference.total_shield_regen),
        total_shield_regen_raw=COALESCE(EXCLUDED.total_shield_regen_raw,ship_power_reference.total_shield_regen_raw),
        total_shield_regen_min_power=COALESCE(EXCLUDED.total_shield_regen_min_power,ship_power_reference.total_shield_regen_min_power),
        distortion_pool=COALESCE(EXCLUDED.distortion_pool,ship_power_reference.distortion_pool),
        fuel_capacity_hydrogen=COALESCE(EXCLUDED.fuel_capacity_hydrogen,ship_power_reference.fuel_capacity_hydrogen),
        fuel_capacity_quantum=COALESCE(EXCLUDED.fuel_capacity_quantum,ship_power_reference.fuel_capacity_quantum),
        qt_range_km=COALESCE(EXCLUDED.qt_range_km,ship_power_reference.qt_range_km),
        qt_speed_ms=COALESCE(EXCLUDED.qt_speed_ms,ship_power_reference.qt_speed_ms),
        qt_spool_time_s=COALESCE(EXCLUDED.qt_spool_time_s,ship_power_reference.qt_spool_time_s),
        computed_at=now(), source_version=EXCLUDED.source_version`;
      stats.shipPowerRef++;

      // 2c: ship_pools
      const pools = ship.PowerPools ?? {};
      for (const [poolType, poolData] of Object.entries(pools)) {
        const maxSize = poolData?.Size ?? poolData;
        if (maxSize === undefined || maxSize === null) continue;
        await tx`INSERT INTO ship_pools (ship_id, item_type, max_size)
          VALUES (${dbId}::uuid, ${poolType}, ${sf(maxSize)})
          ON CONFLICT (ship_id, item_type) DO UPDATE SET max_size=EXCLUDED.max_size`;
        stats.shipPools++;
      }
    });
  }

  await runBatched("Ships+PowerRef+Pools", fns);
}

// =============================================================================
// PHASE 3: ship_hardpoints stock loadout
// =============================================================================
async function phase3() {
  console.log("\n🔧 Phase 3: Ship hardpoints...");
  const shipsDir = join(SCUNPACKED, "ships");
  if (!existsSync(shipsDir)) { console.log("   ⚠ scunpacked/ships/ not found"); return; }

  const shipFiles = readdirSync(shipsDir).filter(f => f.endsWith(".json"));
  console.log(`   Found ${shipFiles.length} ship files`);

  // Pre-load reference→id
  const rows = await sql`SELECT id, reference FROM ships WHERE reference IS NOT NULL`;
  const refToId = {};
  for (const r of rows) refToId[r.reference?.toLowerCase()] = r.id;

  const fns = [];

  for (const file of shipFiles) {
    try {
      const shipData = loadJSON(join(shipsDir, file));
      const cn = shipData.ClassName;
      const dbId = refToId[cn?.toLowerCase()];
      if (!dbId) continue;

      const loadout = shipData.Loadout ?? [];
      let posIdx = 0;

      for (const hp of loadout) {
        const hpName = hp.HardpointName;
        if (!hpName) continue;
        const idx = posIdx++;
        const hpJson = JSON.stringify(hp);

        fns.push(async (tx) => {
          await tx`UPDATE ship_hardpoints SET
            ship_id=${dbId}::uuid,
            stock_loadout=${hpJson}::jsonb,
            position_index=${idx}
            WHERE ship_reference=${cn} AND hardpoint_name=${hpName}`;
          stats.shipHardpoints++;
        });
      }
    } catch (err) {
      stats.errors.push(`hp/${file}: ${err.message}`);
    }
  }

  await runBatched("Hardpoints", fns);
}

// =============================================================================
// PHASE 4: multi_pp_ratio backfill
// =============================================================================
async function phase4() {
  console.log("\n⚡ Phase 4: multi_pp_ratio...");
  const result = await sql`
    WITH ship_pp AS (
      SELECT sh.ship_id, SUM(pp.power_generation) AS total_gen_catalog
      FROM ship_hardpoints sh
      JOIN power_plants pp ON pp.class_name = sh.stock_loadout->>'ClassName'
      WHERE sh.hardpoint_type = 'PowerPlant' AND sh.ship_id IS NOT NULL
      GROUP BY sh.ship_id
    )
    UPDATE ship_power_reference spr
    SET multi_pp_ratio = CASE WHEN spp.total_gen_catalog > 0
      THEN spr.power_generation_segments / spp.total_gen_catalog ELSE NULL END,
      computed_at = now()
    FROM ship_pp spp WHERE spr.ship_id = spp.ship_id`;
  console.log(`   Updated ${result.count} ships with multi_pp_ratio`);
}

// =============================================================================
// MAIN
// =============================================================================
console.log("═══════════════════════════════════════════════════════════════");
console.log("  SC Labs — Power Model Ingest (Fast Batch)");
console.log("═══════════════════════════════════════════════════════════════");

const t0 = Date.now();

try {
  if (!PHASE_ONLY || PHASE_ONLY === 1) await phase1();
  if (!PHASE_ONLY || PHASE_ONLY === 2) await phase2();
  if (!PHASE_ONLY || PHASE_ONLY === 3) await phase3();
  if (!PHASE_ONLY || PHASE_ONLY === 4) await phase4();
} catch (err) {
  console.error("\n❌ Fatal:", err.message);
  stats.errors.push(err.message);
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  SUMMARY");
console.log("═══════════════════════════════════════════════════════════════");
console.log(`  Power Plants:       ${stats.powerPlants}`);
console.log(`  Shields:            ${stats.shields}`);
console.log(`  Coolers:            ${stats.coolers}`);
console.log(`  Quantum Drives:     ${stats.quantumDrives}`);
console.log(`  Weapon Guns:        ${stats.weaponGuns}`);
console.log(`  Radars:             ${stats.radars}`);
console.log(`  Flight Controllers: ${stats.flightControllers}`);
console.log(`  Weapon Mining:      ${stats.weaponMining}`);
console.log(`  Ships:              ${stats.ships}`);
console.log(`  Power References:   ${stats.shipPowerRef}`);
console.log(`  Ship Pools:         ${stats.shipPools}`);
console.log(`  Ship Hardpoints:    ${stats.shipHardpoints}`);
console.log(`  Errors:             ${stats.errors.length}`);
if (stats.errors.length > 0) {
  console.log("  First 10 errors:");
  stats.errors.slice(0, 10).forEach(e => console.log(`    ⚠ ${e}`));
}
console.log(`  Time: ${elapsed}s`);
console.log("═══════════════════════════════════════════════════════════════");

await sql.end();
