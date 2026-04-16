#!/usr/bin/env node
// =============================================================================
// SC Labs — Power Model Ingest Script
//
// Populates power/energy/emissions data from scunpacked into Supabase.
//
// Phase 1: Update component catalog tables with ResourceNetwork fields
// Phase 2: Upsert ships + ship_power_reference + ship_pools
// Phase 3: Upsert ship_hardpoints from individual ship files
// Phase 4: Create weapon_mining entries
//
// Usage:
//   node scripts/ingest_power_model.mjs
//   node scripts/ingest_power_model.mjs --dry-run
//
// Requires: DATABASE_URL or DIRECT_URL in .env
//           scunpacked/ folder at repo root
// =============================================================================

import postgres from "postgres";
import "dotenv/config";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, basename } from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");
const SCUNPACKED = join(process.cwd(), "scunpacked");

// ─── DB Connection ────────────────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "";
if (!connectionString && !DRY_RUN) {
  console.error("❌ No DATABASE_URL found in .env");
  process.exit(1);
}

const sql = connectionString
  ? postgres(connectionString, { max: 10, idle_timeout: 20, connect_timeout: 10 })
  : null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadJSON(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function sf(val) {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function deepGet(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") return null;
    cur = cur[k];
  }
  return cur ?? null;
}

/** Extract ResourceNetwork fields from a stdItem */
function extractRN(stdItem) {
  const rn = stdItem?.ResourceNetwork ?? {};
  const usage = rn.Usage ?? {};
  const gen = rn.Generation ?? {};
  const states = rn.States ?? [];
  const state0 = states[0] ?? {};
  const sig = state0.Signature ?? {};
  const ranges = state0.PowerRanges ?? [];

  const pMin = sf(deepGet(usage, "Power", "Minimum"));
  const pMax = sf(deepGet(usage, "Power", "Maximum"));
  const cMin = sf(deepGet(usage, "Coolant", "Minimum"));
  const cMax = sf(deepGet(usage, "Coolant", "Maximum"));
  const genP = sf(deepGet(gen, "Power"));
  const genC = sf(deepGet(gen, "Coolant"));
  const emSig = sf(sig.EM);

  // Count pips: number of ranges with RegisterRange > 0
  const pips = ranges.filter((r) => r.RegisterRange > 0).length || null;
  const powerRanges = ranges.length > 0 ? ranges : null;

  return { pMin, pMax, cMin, cMax, genP, genC, emSig, pips, powerRanges };
}

/** Extract Emission fields from stdItem */
function extractEmission(stdItem) {
  const em = stdItem?.Emission ?? {};
  const emObj = em.Em ?? {};
  const irVal = em.Ir;

  return {
    emMax: sf(typeof emObj === "object" ? emObj.Maximum : emObj),
    emMin: sf(typeof emObj === "object" ? emObj.Minimum : null),
    irMax: sf(typeof irVal === "object" ? irVal?.Maximum : irVal),
  };
}

/** Extract Distortion fields from stdItem */
function extractDistortion(stdItem) {
  const d = stdItem?.Distortion ?? {};
  return {
    shutdownDamage: sf(d.Maximum),
    decayDelay: sf(d.DecayDelay),
    decayRate: sf(d.DecayRate),
    warningRatio: sf(d.WarningRatio),
    shutdownTime: sf(d.ShutdownTime),
  };
}

/** Extract Durability fields */
function extractDurability(stdItem) {
  return { health: sf(stdItem?.Durability?.Health) };
}

/** Extract physical dimensions */
function extractDimensions(stdItem) {
  return {
    mass: sf(stdItem?.Mass),
    width: sf(stdItem?.Width),
    height: sf(stdItem?.Height),
    length: sf(stdItem?.Length),
    scu: sf(stdItem?.InventoryOccupancy?.SMCGridSizeX), // approximate SCU
  };
}

const stats = {
  powerPlants: 0, shields: 0, coolers: 0, quantumDrives: 0,
  weaponGuns: 0, radars: 0, flightControllers: 0, weaponMining: 0,
  ships: 0, shipPowerRef: 0, shipPools: 0, shipHardpoints: 0,
  errors: [],
};

// =============================================================================
// PHASE 1: Update component catalog tables
// =============================================================================

async function phase1_components() {
  console.log("\n📦 Phase 1: Updating component catalog with power model fields...");
  const items = loadJSON(join(SCUNPACKED, "ship-items.json"));
  console.log(`   Loaded ${items.length} items from ship-items.json`);

  for (const item of items) {
    const type = item.type;
    const className = item.className;
    const stdItem = item.stdItem ?? {};
    const uuid = stdItem.UUID ?? item.reference;

    if (!className || !uuid) continue;

    const rn = extractRN(stdItem);
    const em = extractEmission(stdItem);
    const dist = extractDistortion(stdItem);
    const dur = extractDurability(stdItem);
    const dim = extractDimensions(stdItem);

    try {
      switch (type) {
        case "PowerPlant":
          await updatePowerPlant(uuid, className, rn, em, dist, dur, dim, stdItem);
          break;
        case "Shield":
          await updateShield(uuid, className, rn, em, dist, dur, dim, stdItem);
          break;
        case "Cooler":
          await updateCooler(uuid, className, rn, em, dist, dur, dim, stdItem);
          break;
        case "QuantumDrive":
          await updateQuantumDrive(uuid, className, rn, em, dist, dur, dim, stdItem, item);
          break;
        case "WeaponGun":
          await updateWeaponGun(uuid, className, rn, em, dist, dur, dim, stdItem, item);
          break;
        case "Radar":
          await updateRadar(uuid, className, rn, em, dist, dur, dim, stdItem, item);
          break;
        case "FlightController":
          await updateFlightController(uuid, className, rn, em, dist, dur, dim, stdItem, item);
          break;
        case "WeaponMining":
          await insertWeaponMining(uuid, className, rn, em, dist, dur, dim, stdItem, item);
          break;
      }
    } catch (err) {
      stats.errors.push(`${type}/${className}: ${err.message}`);
      if (VERBOSE) console.error(`   ⚠ ${type}/${className}: ${err.message}`);
    }
  }
}

// ── Component updaters ────────────────────────────────────────────────────────

async function updatePowerPlant(uuid, className, rn, em, dist, dur, dim, stdItem) {
  if (DRY_RUN) { stats.powerPlants++; return; }
  const result = await sql`
    UPDATE power_plants SET
      power_consumption_min   = COALESCE(${rn.pMin}, power_consumption_min),
      power_consumption_max   = COALESCE(${rn.pMax}, power_consumption_max),
      coolant_consumption_min = COALESCE(${rn.cMin}, coolant_consumption_min),
      coolant_consumption_max = COALESCE(${rn.cMax}, coolant_consumption_max),
      pips                    = COALESCE(${rn.pips}, pips),
      power_ranges            = COALESCE(${rn.powerRanges ? JSON.stringify(rn.powerRanges) : null}::jsonb, power_ranges),
      ir_max                  = COALESCE(${em.irMax}, ir_max)
    WHERE class_name = ${className}
  `;
  if (result.count > 0) stats.powerPlants++;
}

async function updateShield(uuid, className, rn, em, dist, dur, dim, stdItem) {
  if (DRY_RUN) { stats.shields++; return; }
  const result = await sql`
    UPDATE shields SET
      pips                    = COALESCE(${rn.pips}, pips),
      power_ranges            = COALESCE(${rn.powerRanges ? JSON.stringify(rn.powerRanges) : null}::jsonb, power_ranges),
      coolant_consumption_min = COALESCE(${rn.cMin}, coolant_consumption_min),
      coolant_consumption_max = COALESCE(${rn.cMax}, coolant_consumption_max),
      ir_max                  = COALESCE(${em.irMax}, ir_max)
    WHERE class_name = ${className}
  `;
  if (result.count > 0) stats.shields++;
}

async function updateCooler(uuid, className, rn, em, dist, dur, dim, stdItem) {
  if (DRY_RUN) { stats.coolers++; return; }
  const result = await sql`
    UPDATE coolers SET
      pips                    = COALESCE(${rn.pips}, pips),
      power_ranges            = COALESCE(${rn.powerRanges ? JSON.stringify(rn.powerRanges) : null}::jsonb, power_ranges),
      coolant_consumption_min = COALESCE(${rn.cMin}, coolant_consumption_min),
      coolant_consumption_max = COALESCE(${rn.cMax}, coolant_consumption_max)
    WHERE class_name = ${className}
  `;
  if (result.count > 0) stats.coolers++;
}

async function updateQuantumDrive(uuid, className, rn, em, dist, dur, dim, stdItem, item) {
  if (DRY_RUN) { stats.quantumDrives++; return; }
  const result = await sql`
    UPDATE quantum_drives SET
      power_consumption_min       = COALESCE(${rn.pMin}, power_consumption_min),
      power_consumption_max       = COALESCE(${rn.pMax}, power_consumption_max),
      coolant_consumption_min     = COALESCE(${rn.cMin}, coolant_consumption_min),
      coolant_consumption_max     = COALESCE(${rn.cMax}, coolant_consumption_max),
      pips                        = COALESCE(${rn.pips}, pips),
      power_ranges                = COALESCE(${rn.powerRanges ? JSON.stringify(rn.powerRanges) : null}::jsonb, power_ranges),
      em_max                      = COALESCE(${em.emMax}, em_max),
      ir_max                      = COALESCE(${em.irMax}, ir_max),
      health                      = COALESCE(${dur.health}, health),
      distortion_shutdown_damage  = COALESCE(${dist.shutdownDamage}, distortion_shutdown_damage),
      distortion_decay_delay      = COALESCE(${dist.decayDelay}, distortion_decay_delay),
      distortion_decay_rate       = COALESCE(${dist.decayRate}, distortion_decay_rate),
      distortion_shutdown_time    = COALESCE(${dist.shutdownTime}, distortion_shutdown_time),
      width                       = COALESCE(${dim.width}, width),
      height                      = COALESCE(${dim.height}, height),
      length                      = COALESCE(${dim.length}, length),
      scu                         = COALESCE(${dim.scu}, scu)
    WHERE class_name = ${className}
  `;
  if (result.count > 0) stats.quantumDrives++;
}

async function updateWeaponGun(uuid, className, rn, em, dist, dur, dim, stdItem, item) {
  if (DRY_RUN) { stats.weaponGuns++; return; }
  // Determine if energy weapon: has power consumption > 0
  const isEnergy = (rn.pMax ?? 0) > 0 ? true : (rn.pMin ?? 0) > 0 ? true : null;
  const result = await sql`
    UPDATE weapon_guns SET
      power_consumption_min   = COALESCE(${rn.pMin}, power_consumption_min),
      power_consumption_max   = COALESCE(${rn.pMax}, power_consumption_max),
      coolant_consumption_min = COALESCE(${rn.cMin}, coolant_consumption_min),
      coolant_consumption_max = COALESCE(${rn.cMax}, coolant_consumption_max),
      ir_max                  = COALESCE(${em.irMax}, ir_max),
      is_energy_weapon        = COALESCE(${isEnergy}, is_energy_weapon)
    WHERE class_name = ${className}
  `;
  if (result.count > 0) stats.weaponGuns++;
}

async function updateRadar(uuid, className, rn, em, dist, dur, dim, stdItem, item) {
  if (DRY_RUN) { stats.radars++; return; }
  const result = await sql`
    UPDATE radars SET
      power_consumption_min       = COALESCE(${rn.pMin}, power_consumption_min),
      power_consumption_max       = COALESCE(${rn.pMax}, power_consumption_max),
      coolant_consumption_min     = COALESCE(${rn.cMin}, coolant_consumption_min),
      coolant_consumption_max     = COALESCE(${rn.cMax}, coolant_consumption_max),
      pips                        = COALESCE(${rn.pips}, pips),
      power_ranges                = COALESCE(${rn.powerRanges ? JSON.stringify(rn.powerRanges) : null}::jsonb, power_ranges),
      em_max                      = COALESCE(${em.emMax}, em_max),
      em_min                      = COALESCE(${em.emMin}, em_min),
      ir_max                      = COALESCE(${em.irMax}, ir_max),
      health                      = COALESCE(${dur.health}, health),
      distortion_shutdown_damage  = COALESCE(${dist.shutdownDamage}, distortion_shutdown_damage),
      distortion_decay_delay      = COALESCE(${dist.decayDelay}, distortion_decay_delay),
      distortion_decay_rate       = COALESCE(${dist.decayRate}, distortion_decay_rate),
      distortion_warning_ratio    = COALESCE(${dist.warningRatio}, distortion_warning_ratio),
      distortion_shutdown_time    = COALESCE(${dist.shutdownTime}, distortion_shutdown_time),
      width                       = COALESCE(${dim.width}, width),
      height                      = COALESCE(${dim.height}, height),
      length                      = COALESCE(${dim.length}, length),
      scu                         = COALESCE(${dim.scu}, scu)
    WHERE class_name = ${className}
  `;
  if (result.count > 0) stats.radars++;
}

async function updateFlightController(uuid, className, rn, em, dist, dur, dim, stdItem, item) {
  if (DRY_RUN) { stats.flightControllers++; return; }
  const result = await sql`
    UPDATE flight_controllers SET
      power_consumption_min       = COALESCE(${rn.pMin}, power_consumption_min),
      power_consumption_max       = COALESCE(${rn.pMax}, power_consumption_max),
      coolant_consumption_min     = COALESCE(${rn.cMin}, coolant_consumption_min),
      coolant_consumption_max     = COALESCE(${rn.cMax}, coolant_consumption_max),
      pips                        = COALESCE(${rn.pips}, pips),
      power_ranges                = COALESCE(${rn.powerRanges ? JSON.stringify(rn.powerRanges) : null}::jsonb, power_ranges),
      em_max                      = COALESCE(${em.emMax}, em_max),
      ir_max                      = COALESCE(${em.irMax}, ir_max),
      health                      = COALESCE(${dur.health}, health),
      distortion_shutdown_damage  = COALESCE(${dist.shutdownDamage}, distortion_shutdown_damage),
      distortion_decay_delay      = COALESCE(${dist.decayDelay}, distortion_decay_delay),
      distortion_decay_rate       = COALESCE(${dist.decayRate}, distortion_decay_rate),
      distortion_warning_ratio    = COALESCE(${dist.warningRatio}, distortion_warning_ratio),
      distortion_shutdown_time    = COALESCE(${dist.shutdownTime}, distortion_shutdown_time),
      mass                        = COALESCE(${dim.mass}, mass),
      width                       = COALESCE(${dim.width}, width),
      height                      = COALESCE(${dim.height}, height),
      length                      = COALESCE(${dim.length}, length),
      scu                         = COALESCE(${dim.scu}, scu)
    WHERE class_name = ${className}
  `;
  if (result.count > 0) stats.flightControllers++;
}

async function insertWeaponMining(uuid, className, rn, em, dist, dur, dim, stdItem, item) {
  if (DRY_RUN) { stats.weaponMining++; return; }
  const mining = stdItem?.Mining ?? {};
  const result = await sql`
    INSERT INTO weapon_mining (
      id, class_name, item_name, name, description, manufacturer_id,
      size, grade_number, grade, class,
      power_consumption_min, power_consumption_max,
      coolant_consumption_min, coolant_consumption_max,
      em_max, ir_max,
      mining_laser_power, optimal_range, maximum_range,
      extraction_throughput, mining_modifier, resistance_modifier,
      instability_modifier, optimal_charge_window, optimal_charge_rate,
      shatter_damage, health,
      distortion_shutdown_damage, distortion_shutdown_time,
      mass, width, height, length, scu,
      raw_data
    ) VALUES (
      ${uuid}::uuid, ${className}, ${stdItem.Name ?? item.itemName ?? null},
      ${item.name ?? stdItem.Name ?? className}, ${stdItem.Description ?? null},
      ${stdItem.Manufacturer?.UUID !== "00000000-0000-0000-0000-000000000000" ? stdItem.Manufacturer?.UUID ?? null : null},
      ${sf(stdItem.Size)}, ${sf(stdItem.Grade)},
      ${stdItem.DescriptionData?.Grade ?? null}, ${stdItem.DescriptionData?.Class ?? null},
      ${rn.pMin}, ${rn.pMax}, ${rn.cMin}, ${rn.cMax},
      ${em.emMax}, ${em.irMax},
      ${sf(mining.LaserPower)}, ${sf(mining.OptimalRange)}, ${sf(mining.MaximumRange)},
      ${sf(mining.ExtractionThroughput)}, ${sf(mining.MiningModifier)},
      ${sf(mining.ResistanceModifier)}, ${sf(mining.InstabilityModifier)},
      ${sf(mining.OptimalChargeWindowSize)}, ${sf(mining.OptimalChargeRate)},
      ${sf(mining.ShatterDamage)}, ${dur.health},
      ${dist.shutdownDamage}, ${dist.shutdownTime},
      ${dim.mass}, ${dim.width}, ${dim.height}, ${dim.length}, ${dim.scu},
      ${JSON.stringify(stdItem)}::jsonb
    )
    ON CONFLICT (class_name) DO UPDATE SET
      power_consumption_min  = COALESCE(EXCLUDED.power_consumption_min, weapon_mining.power_consumption_min),
      power_consumption_max  = COALESCE(EXCLUDED.power_consumption_max, weapon_mining.power_consumption_max),
      coolant_consumption_min = COALESCE(EXCLUDED.coolant_consumption_min, weapon_mining.coolant_consumption_min),
      coolant_consumption_max = COALESCE(EXCLUDED.coolant_consumption_max, weapon_mining.coolant_consumption_max),
      em_max                 = COALESCE(EXCLUDED.em_max, weapon_mining.em_max),
      ir_max                 = COALESCE(EXCLUDED.ir_max, weapon_mining.ir_max),
      mining_laser_power     = COALESCE(EXCLUDED.mining_laser_power, weapon_mining.mining_laser_power),
      extraction_throughput  = COALESCE(EXCLUDED.extraction_throughput, weapon_mining.extraction_throughput),
      raw_data               = EXCLUDED.raw_data
  `;
  stats.weaponMining++;
}


// =============================================================================
// PHASE 2: Ships + ship_power_reference + ship_pools
// =============================================================================

async function phase2_ships() {
  console.log("\n🚀 Phase 2: Upserting ships, ship_power_reference, ship_pools...");
  const shipsIndex = loadJSON(join(SCUNPACKED, "ships.json"));
  console.log(`   Loaded ${shipsIndex.length} ships from ships.json`);

  // Pre-load reference→id map from DB so we use the correct ship PK
  let refToDbId = {};
  if (!DRY_RUN) {
    const rows = await sql`SELECT id, reference FROM ships WHERE reference IS NOT NULL`;
    for (const r of rows) refToDbId[r.reference] = r.id;
    console.log(`   Mapped ${Object.keys(refToDbId).length} DB ships by reference`);
  }

  for (const ship of shipsIndex) {
    const cn = ship.ClassName;
    if (!cn) continue;

    // Resolve the real DB id via reference field
    const dbId = refToDbId[cn] ?? null;

    try {
      // --- 2a: Update ships table (new columns only), match by reference ---
      if (!DRY_RUN) {
        if (!dbId) {
          if (VERBOSE) console.log(`   ⏭ ship/${cn}: not in DB, skipping`);
          continue;
        }
        await sql`
          UPDATE ships SET
            class_name      = COALESCE(${cn}, class_name),
            description     = COALESCE(${ship.DescriptionText ?? ship.Description ?? null}, description),
            career          = COALESCE(${ship.Career ?? null}, career),
            length_m        = COALESCE(${sf(ship.Length)}, length_m),
            width_m         = COALESCE(${sf(ship.Width)}, width_m),
            height_m        = COALESCE(${sf(ship.Height)}, height_m),
            mass_empty_kg   = COALESCE(${sf(ship.Mass)}, mass_empty_kg),
            mass_loadout_kg = COALESCE(${sf(ship.MassLoadout)}, mass_loadout_kg),
            mass_total_kg   = COALESCE(${sf(ship.MassTotal)}, mass_total_kg),
            crew            = COALESCE(${sf(ship.Crew)}, crew),
            is_spaceship    = COALESCE(${ship.IsSpaceship ?? null}, is_spaceship),
            is_gravlev      = COALESCE(${ship.IsGravlev ?? null}, is_gravlev),
            cargo_scu       = COALESCE(${sf(ship.Cargo)}, cargo_scu),
            source_version  = 'scunpacked-2026-04-16',
            imported_at     = now(),
            raw_data        = ${JSON.stringify(ship)}::jsonb
          WHERE id = ${dbId}::uuid
        `;
      }
      stats.ships++;

      // --- 2b: ship_power_reference ---
      const pwr = ship.Power ?? {};
      const cool = ship.Cooling ?? {};
      const emis = ship.Emission ?? {};
      const shTot = ship.ShieldsTotal ?? {};
      const dist = ship.Distortion ?? {};
      const prop = ship.Propulsion ?? {};
      const qt = ship.QuantumTravel ?? {};

      // Calculate multi_pp_ratio: we'll need to look at the ship's loadout
      // to sum genP of its power plants. We'll do that in phase 3 or skip for now.
      // For now we store NULL and backfill after phase 3.

      if (!DRY_RUN) {
        await sql`
          INSERT INTO ship_power_reference (
            ship_id,
            power_generation_segments, power_used_scm, power_used_nav,
            power_used_grouped_scm, power_used_grouped_nav,
            cooling_generation_segments, cooling_used_scm, cooling_used_nav,
            cooling_used_pct_scm, cooling_used_pct_nav,
            cooling_used_grouped_scm, cooling_used_grouped_nav,
            em_shields, em_quantum, ir_shields, ir_quantum,
            em_per_segment,
            em_groups_scm, em_groups_nav,
            em_segment_groups_scm, em_segment_groups_nav,
            total_shield_hp, total_shield_regen, total_shield_regen_raw, total_shield_regen_min_power,
            distortion_pool,
            fuel_capacity_hydrogen, fuel_capacity_quantum,
            qt_range_km, qt_speed_ms, qt_spool_time_s,
            source_version
          ) VALUES (
            ${dbId}::uuid,
            ${sf(pwr.GenerationSegments)},
            ${sf(pwr.UsedSegmentsShields)},
            ${sf(pwr.UsedSegmentsQuantum)},
            ${pwr.UsedSegmentsGrouped ? JSON.stringify(pwr.UsedSegmentsGrouped) : null}::jsonb,
            ${cool.UsedSegmentsQuantumGrouped ? JSON.stringify(cool.UsedSegmentsQuantumGrouped) : null}::jsonb,
            ${sf(cool.GenerationSegments)},
            ${sf(cool.UsedSegmentsShields)},
            ${sf(cool.UsedSegmentsQuantum)},
            ${sf(cool.UsedSegmentsShieldsPct)},
            ${sf(cool.UsedSegmentsQuantumPct)},
            ${cool.UsedSegmentsShieldsGrouped ? JSON.stringify(cool.UsedSegmentsShieldsGrouped) : null}::jsonb,
            ${cool.UsedSegmentsQuantumGrouped ? JSON.stringify(cool.UsedSegmentsQuantumGrouped) : null}::jsonb,
            ${sf(emis.EmShields)}, ${sf(emis.EmQuantum)},
            ${sf(emis.IrShields)}, ${sf(emis.IrQuantum)},
            ${sf(emis.EmPerSegment)},
            ${emis.EmGroupsShields ? JSON.stringify(emis.EmGroupsShields) : null}::jsonb,
            ${emis.EmGroupsQuantum ? JSON.stringify(emis.EmGroupsQuantum) : null}::jsonb,
            ${emis.EmSegmentGroupsShields ? JSON.stringify(emis.EmSegmentGroupsShields) : null}::jsonb,
            ${emis.EmSegmentGroupsQuantum ? JSON.stringify(emis.EmSegmentGroupsQuantum) : null}::jsonb,
            ${sf(shTot.Hp)}, ${sf(shTot.Regen)}, ${sf(shTot.RegenRaw)}, ${sf(shTot.RegenMinPower)},
            ${sf(dist.Pool)},
            ${sf(prop.FuelCapacity)}, ${sf(qt.FuelCapacity)},
            ${qt.Range ? sf(qt.Range / 1000) : null},
            ${sf(qt.Speed)}, ${sf(qt.SpoolTime)},
            'scunpacked-2026-04-16'
          )
          ON CONFLICT (ship_id) DO UPDATE SET
            power_generation_segments = COALESCE(EXCLUDED.power_generation_segments, ship_power_reference.power_generation_segments),
            power_used_scm            = COALESCE(EXCLUDED.power_used_scm, ship_power_reference.power_used_scm),
            power_used_nav            = COALESCE(EXCLUDED.power_used_nav, ship_power_reference.power_used_nav),
            power_used_grouped_scm    = COALESCE(EXCLUDED.power_used_grouped_scm, ship_power_reference.power_used_grouped_scm),
            power_used_grouped_nav    = COALESCE(EXCLUDED.power_used_grouped_nav, ship_power_reference.power_used_grouped_nav),
            cooling_generation_segments = COALESCE(EXCLUDED.cooling_generation_segments, ship_power_reference.cooling_generation_segments),
            cooling_used_scm          = COALESCE(EXCLUDED.cooling_used_scm, ship_power_reference.cooling_used_scm),
            cooling_used_nav          = COALESCE(EXCLUDED.cooling_used_nav, ship_power_reference.cooling_used_nav),
            cooling_used_pct_scm      = COALESCE(EXCLUDED.cooling_used_pct_scm, ship_power_reference.cooling_used_pct_scm),
            cooling_used_pct_nav      = COALESCE(EXCLUDED.cooling_used_pct_nav, ship_power_reference.cooling_used_pct_nav),
            cooling_used_grouped_scm  = COALESCE(EXCLUDED.cooling_used_grouped_scm, ship_power_reference.cooling_used_grouped_scm),
            cooling_used_grouped_nav  = COALESCE(EXCLUDED.cooling_used_grouped_nav, ship_power_reference.cooling_used_grouped_nav),
            em_shields                = COALESCE(EXCLUDED.em_shields, ship_power_reference.em_shields),
            em_quantum                = COALESCE(EXCLUDED.em_quantum, ship_power_reference.em_quantum),
            ir_shields                = COALESCE(EXCLUDED.ir_shields, ship_power_reference.ir_shields),
            ir_quantum                = COALESCE(EXCLUDED.ir_quantum, ship_power_reference.ir_quantum),
            em_per_segment            = COALESCE(EXCLUDED.em_per_segment, ship_power_reference.em_per_segment),
            em_groups_scm             = COALESCE(EXCLUDED.em_groups_scm, ship_power_reference.em_groups_scm),
            em_groups_nav             = COALESCE(EXCLUDED.em_groups_nav, ship_power_reference.em_groups_nav),
            em_segment_groups_scm     = COALESCE(EXCLUDED.em_segment_groups_scm, ship_power_reference.em_segment_groups_scm),
            em_segment_groups_nav     = COALESCE(EXCLUDED.em_segment_groups_nav, ship_power_reference.em_segment_groups_nav),
            total_shield_hp           = COALESCE(EXCLUDED.total_shield_hp, ship_power_reference.total_shield_hp),
            total_shield_regen        = COALESCE(EXCLUDED.total_shield_regen, ship_power_reference.total_shield_regen),
            total_shield_regen_raw    = COALESCE(EXCLUDED.total_shield_regen_raw, ship_power_reference.total_shield_regen_raw),
            total_shield_regen_min_power = COALESCE(EXCLUDED.total_shield_regen_min_power, ship_power_reference.total_shield_regen_min_power),
            distortion_pool           = COALESCE(EXCLUDED.distortion_pool, ship_power_reference.distortion_pool),
            fuel_capacity_hydrogen    = COALESCE(EXCLUDED.fuel_capacity_hydrogen, ship_power_reference.fuel_capacity_hydrogen),
            fuel_capacity_quantum     = COALESCE(EXCLUDED.fuel_capacity_quantum, ship_power_reference.fuel_capacity_quantum),
            qt_range_km               = COALESCE(EXCLUDED.qt_range_km, ship_power_reference.qt_range_km),
            qt_speed_ms               = COALESCE(EXCLUDED.qt_speed_ms, ship_power_reference.qt_speed_ms),
            qt_spool_time_s           = COALESCE(EXCLUDED.qt_spool_time_s, ship_power_reference.qt_spool_time_s),
            computed_at               = now(),
            source_version            = EXCLUDED.source_version
        `;
      }
      stats.shipPowerRef++;

      // --- 2c: ship_pools ---
      const pools = ship.PowerPools ?? {};
      for (const [poolType, poolData] of Object.entries(pools)) {
        const maxSize = poolData?.Size ?? poolData;
        if (maxSize === undefined || maxSize === null) continue;
        if (!DRY_RUN) {
          await sql`
            INSERT INTO ship_pools (ship_id, item_type, max_size)
            VALUES (${dbId}::uuid, ${poolType}, ${sf(maxSize)})
            ON CONFLICT (ship_id, item_type) DO UPDATE SET
              max_size = EXCLUDED.max_size
          `;
        }
        stats.shipPools++;
      }
    } catch (err) {
      stats.errors.push(`ship/${cn}: ${err.message}`);
      if (VERBOSE) console.error(`   ⚠ ship/${cn}: ${err.message}`);
    }
  }
}


// =============================================================================
// PHASE 3: Ship hardpoints from individual ship files
// =============================================================================

async function phase3_hardpoints() {
  console.log("\n🔧 Phase 3: Updating ship_hardpoints with stock loadout data...");
  const shipsDir = join(SCUNPACKED, "ships");
  if (!existsSync(shipsDir)) {
    console.log("   ⚠ scunpacked/ships/ directory not found, skipping hardpoints.");
    return;
  }

  const shipFiles = readdirSync(shipsDir).filter((f) => f.endsWith(".json"));
  console.log(`   Found ${shipFiles.length} individual ship files`);

  // Load reference→DB id mapping
  const refToDbId = {};
  if (!DRY_RUN) {
    const rows = await sql`SELECT id, reference FROM ships WHERE reference IS NOT NULL`;
    for (const r of rows) refToDbId[r.reference?.toLowerCase()] = r.id;
    console.log(`   Mapped ${Object.keys(refToDbId).length} DB ships by reference`);
  }

  // Also build item className → UUID lookup from ship-items.json
  const itemsIndex = loadJSON(join(SCUNPACKED, "ship-items.json"));
  const itemClassToUUID = {};
  for (const item of itemsIndex) {
    const cn = item.className;
    const uuid = item.stdItem?.UUID ?? item.reference;
    if (cn && uuid) itemClassToUUID[cn] = uuid;
  }

  for (const file of shipFiles) {
    try {
      const shipData = loadJSON(join(shipsDir, file));
      const cn = shipData.ClassName;
      const shipDbId = refToDbId[cn?.toLowerCase()];
      if (!shipDbId) continue;

      const loadout = shipData.Loadout ?? [];
      let posIdx = 0;

      for (const hp of loadout) {
        const hpName = hp.HardpointName;
        const itemCN = hp.ClassName;
        if (!hpName) continue;

        const stockItemUUID = itemCN ? (itemClassToUUID[itemCN] ?? null) : null;
        const hpType = hp.Type?.split(".")[0] ?? null;

        if (!DRY_RUN) {
          // Update existing hardpoint rows (matched by ship_reference + hardpoint_name)
          // First try with ship_id, fall back to ship_reference
          await sql`
            UPDATE ship_hardpoints SET
              ship_id         = COALESCE(${shipDbId}::uuid, ship_id),
              stock_item_id   = COALESCE(${stockItemUUID}::uuid, stock_item_id),
              stock_loadout   = ${JSON.stringify(hp)}::jsonb,
              position_index  = ${posIdx}
            WHERE ship_reference = ${cn}
              AND hardpoint_name = ${hpName}
          `;
        }
        posIdx++;
        stats.shipHardpoints++;
      }
    } catch (err) {
      stats.errors.push(`hardpoints/${file}: ${err.message}`);
      if (VERBOSE) console.error(`   ⚠ hardpoints/${file}: ${err.message}`);
    }
  }
}


// =============================================================================
// PHASE 4: Backfill multi_pp_ratio in ship_power_reference
// =============================================================================

async function phase4_multiPPRatio() {
  console.log("\n⚡ Phase 4: Computing multi_pp_ratio for multi-PP ships...");
  if (DRY_RUN) {
    console.log("   (dry-run, skipping)");
    return;
  }

  // For each ship that has a ship_power_reference with generation_segments,
  // look up the power plants in its loadout (ship_hardpoints) and sum their genP
  // from the power_plants table.
  const result = await sql`
    WITH ship_pp AS (
      SELECT
        sh.ship_id,
        SUM(pp.power_generation) AS total_gen_catalog
      FROM ship_hardpoints sh
      JOIN power_plants pp ON pp.class_name = sh.stock_loadout->>'ClassName'
      WHERE sh.hardpoint_type = 'PowerPlant'
        AND sh.ship_id IS NOT NULL
      GROUP BY sh.ship_id
    )
    UPDATE ship_power_reference spr
    SET multi_pp_ratio = CASE
      WHEN spp.total_gen_catalog > 0 THEN spr.power_generation_segments / spp.total_gen_catalog
      ELSE NULL
    END
    FROM ship_pp spp
    WHERE spr.ship_id = spp.ship_id
      AND spp.total_gen_catalog > 0
  `;
  console.log(`   Updated ${result.count} ships with multi_pp_ratio`);
}


// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  SC Labs — Power Model Ingest");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"}`);
  console.log(`  Source: ${SCUNPACKED}`);
  console.log("═══════════════════════════════════════════════════════════");

  if (!existsSync(join(SCUNPACKED, "ship-items.json"))) {
    console.error("❌ scunpacked/ship-items.json not found. Run from repo root.");
    process.exit(1);
  }

  await phase1_components();
  await phase2_ships();
  await phase3_hardpoints();
  await phase4_multiPPRatio();

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  RESULTS");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Power Plants updated:       ${stats.powerPlants}`);
  console.log(`  Shields updated:            ${stats.shields}`);
  console.log(`  Coolers updated:            ${stats.coolers}`);
  console.log(`  Quantum Drives updated:     ${stats.quantumDrives}`);
  console.log(`  Weapon Guns updated:        ${stats.weaponGuns}`);
  console.log(`  Radars updated:             ${stats.radars}`);
  console.log(`  Flight Controllers updated: ${stats.flightControllers}`);
  console.log(`  Weapon Mining inserted:     ${stats.weaponMining}`);
  console.log(`  Ships updated:              ${stats.ships}`);
  console.log(`  Ship Power Refs upserted:   ${stats.shipPowerRef}`);
  console.log(`  Ship Pools upserted:        ${stats.shipPools}`);
  console.log(`  Ship Hardpoints updated:    ${stats.shipHardpoints}`);
  if (stats.errors.length > 0) {
    console.log(`\n  ⚠ Errors: ${stats.errors.length}`);
    for (const e of stats.errors.slice(0, 20)) {
      console.log(`    · ${e}`);
    }
    if (stats.errors.length > 20) {
      console.log(`    ... and ${stats.errors.length - 20} more`);
    }
  }
  console.log("═══════════════════════════════════════════════════════════\n");

  if (sql) await sql.end();
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  if (sql) sql.end().then(() => process.exit(1));
  else process.exit(1);
});
