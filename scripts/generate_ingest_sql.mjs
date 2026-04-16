#!/usr/bin/env node
/**
 * generate_ingest_sql.mjs
 *
 * Reads scunpacked data and generates a single SQL file that can be
 * executed directly in Supabase SQL Editor (no network round-trips).
 *
 * Usage: node scripts/generate_ingest_sql.mjs > /tmp/ingest.sql
 *        (then paste into Supabase SQL Editor)
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SCUNPACKED = join(ROOT, "scunpacked");

function loadJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }
function sf(v) { return v === undefined || v === null || isNaN(v) ? null : Number(v); }
function esc(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return isNaN(v) ? "NULL" : String(v);
  // Escape single quotes
  return `'${String(v).replace(/'/g, "''")}'`;
}
function escJson(obj) {
  if (!obj || (typeof obj === "object" && Object.keys(obj).length === 0)) return "NULL";
  return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
}

// Helpers to extract resource network data
function extractRN(stdItem) {
  const rn = stdItem?.ResourceNetwork ?? {};
  const usage = rn.Usage ?? {};
  const gen = rn.Generation ?? {};
  const power = usage.Power ?? {};
  const coolant = usage.Coolant ?? {};
  const states = stdItem?.States ?? [];
  const state0 = states[0] ?? {};
  const powerRanges = state0.PowerRanges ?? null;
  return {
    pMin: sf(power.Min), pMax: sf(power.Max),
    cMin: sf(coolant.Min), cMax: sf(coolant.Max),
    genP: sf(gen.Power), genC: sf(gen.Coolant),
    pips: sf(state0.Pips),
    emMax: sf(state0?.Signature?.EM),
    powerRanges,
  };
}
function extractEmission(stdItem) {
  const states = stdItem?.States ?? [];
  const s0 = states[0] ?? {};
  return { emMax: sf(s0?.Signature?.EM), irMax: sf(s0?.Signature?.IR) };
}
function extractDistortion(stdItem) {
  const d = stdItem?.Distortion ?? {};
  return {
    shutdownDamage: sf(d.ShutdownDamage), decayDelay: sf(d.DecayDelay),
    decayRate: sf(d.DecayRate), shutdownTime: sf(d.ShutdownTime),
  };
}
function extractDurability(stdItem) {
  return { health: sf(stdItem?.Durability?.Health) };
}
function extractDimensions(stdItem) {
  return {
    mass: sf(stdItem?.Mass), width: sf(stdItem?.Width),
    height: sf(stdItem?.Height), length: sf(stdItem?.Length),
    scu: sf(stdItem?.InventoryOccupancy?.SMCGridSizeX),
  };
}

const lines = [];
const stats = {
  powerPlants: 0, shields: 0, coolers: 0, quantumDrives: 0,
  weaponGuns: 0, radars: 0, flightControllers: 0, weaponMining: 0,
  ships: 0, shipPowerRef: 0, shipPools: 0, shipHardpoints: 0,
};

lines.push("-- SC Labs Power Model Ingest SQL");
lines.push("-- Generated: " + new Date().toISOString());
lines.push("BEGIN;");
lines.push("");

// =============================================================================
// PHASE 1: Component catalog
// =============================================================================
lines.push("-- ═══════════════════════════════════════════════════════════════");
lines.push("-- PHASE 1: Component catalog updates");
lines.push("-- ═══════════════════════════════════════════════════════════════");

const items = loadJSON(join(SCUNPACKED, "ship-items.json"));

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
      lines.push(`UPDATE power_plants SET
  power_consumption_min = COALESCE(${esc(rn.pMin)}, power_consumption_min),
  power_consumption_max = COALESCE(${esc(rn.pMax)}, power_consumption_max),
  coolant_consumption_min = COALESCE(${esc(rn.cMin)}, coolant_consumption_min),
  coolant_consumption_max = COALESCE(${esc(rn.cMax)}, coolant_consumption_max),
  pips = COALESCE(${esc(rn.pips)}, pips),
  power_ranges = COALESCE(${escJson(rn.powerRanges)}, power_ranges),
  ir_max = COALESCE(${esc(em.irMax)}, ir_max)
WHERE class_name = ${esc(className)};`);
      stats.powerPlants++;
      break;

    case "Shield":
      lines.push(`UPDATE shields SET
  pips = COALESCE(${esc(rn.pips)}, pips),
  power_ranges = COALESCE(${escJson(rn.powerRanges)}, power_ranges),
  coolant_consumption_min = COALESCE(${esc(rn.cMin)}, coolant_consumption_min),
  coolant_consumption_max = COALESCE(${esc(rn.cMax)}, coolant_consumption_max),
  ir_max = COALESCE(${esc(em.irMax)}, ir_max)
WHERE class_name = ${esc(className)};`);
      stats.shields++;
      break;

    case "Cooler":
      lines.push(`UPDATE coolers SET
  pips = COALESCE(${esc(rn.pips)}, pips),
  power_ranges = COALESCE(${escJson(rn.powerRanges)}, power_ranges),
  coolant_consumption_min = COALESCE(${esc(rn.cMin)}, coolant_consumption_min),
  coolant_consumption_max = COALESCE(${esc(rn.cMax)}, coolant_consumption_max)
WHERE class_name = ${esc(className)};`);
      stats.coolers++;
      break;

    case "QuantumDrive":
      lines.push(`UPDATE quantum_drives SET
  power_consumption_min = COALESCE(${esc(rn.pMin)}, power_consumption_min),
  power_consumption_max = COALESCE(${esc(rn.pMax)}, power_consumption_max),
  coolant_consumption_min = COALESCE(${esc(rn.cMin)}, coolant_consumption_min),
  coolant_consumption_max = COALESCE(${esc(rn.cMax)}, coolant_consumption_max),
  pips = COALESCE(${esc(rn.pips)}, pips),
  power_ranges = COALESCE(${escJson(rn.powerRanges)}, power_ranges),
  em_max = COALESCE(${esc(em.emMax)}, em_max),
  ir_max = COALESCE(${esc(em.irMax)}, ir_max),
  health = COALESCE(${esc(dur.health)}, health),
  distortion_shutdown_damage = COALESCE(${esc(dist.shutdownDamage)}, distortion_shutdown_damage),
  distortion_decay_delay = COALESCE(${esc(dist.decayDelay)}, distortion_decay_delay),
  distortion_decay_rate = COALESCE(${esc(dist.decayRate)}, distortion_decay_rate),
  distortion_shutdown_time = COALESCE(${esc(dist.shutdownTime)}, distortion_shutdown_time),
  width = COALESCE(${esc(dim.width)}, width),
  height = COALESCE(${esc(dim.height)}, height),
  length = COALESCE(${esc(dim.length)}, length),
  scu = COALESCE(${esc(dim.scu)}, scu)
WHERE class_name = ${esc(className)};`);
      stats.quantumDrives++;
      break;

    case "WeaponGun": {
      const isEnergy = (rn.pMax ?? 0) > 0 ? true : (rn.pMin ?? 0) > 0 ? true : null;
      lines.push(`UPDATE weapon_guns SET
  power_consumption_min = COALESCE(${esc(rn.pMin)}, power_consumption_min),
  power_consumption_max = COALESCE(${esc(rn.pMax)}, power_consumption_max),
  coolant_consumption_min = COALESCE(${esc(rn.cMin)}, coolant_consumption_min),
  coolant_consumption_max = COALESCE(${esc(rn.cMax)}, coolant_consumption_max),
  ir_max = COALESCE(${esc(em.irMax)}, ir_max),
  is_energy_weapon = COALESCE(${esc(isEnergy)}, is_energy_weapon)
WHERE class_name = ${esc(className)};`);
      stats.weaponGuns++;
      break;
    }

    case "Radar":
      lines.push(`UPDATE radars SET
  power_consumption_min = COALESCE(${esc(rn.pMin)}, power_consumption_min),
  power_consumption_max = COALESCE(${esc(rn.pMax)}, power_consumption_max),
  coolant_consumption_min = COALESCE(${esc(rn.cMin)}, coolant_consumption_min),
  coolant_consumption_max = COALESCE(${esc(rn.cMax)}, coolant_consumption_max),
  pips = COALESCE(${esc(rn.pips)}, pips),
  power_ranges = COALESCE(${escJson(rn.powerRanges)}, power_ranges),
  em_max = COALESCE(${esc(em.emMax)}, em_max),
  ir_max = COALESCE(${esc(em.irMax)}, ir_max),
  health = COALESCE(${esc(dur.health)}, health),
  distortion_shutdown_damage = COALESCE(${esc(dist.shutdownDamage)}, distortion_shutdown_damage),
  distortion_decay_delay = COALESCE(${esc(dist.decayDelay)}, distortion_decay_delay),
  distortion_decay_rate = COALESCE(${esc(dist.decayRate)}, distortion_decay_rate),
  distortion_shutdown_time = COALESCE(${esc(dist.shutdownTime)}, distortion_shutdown_time),
  distortion_decay_max = COALESCE(${esc(dist.decayRate)}, distortion_decay_max),
  width = COALESCE(${esc(dim.width)}, width),
  height = COALESCE(${esc(dim.height)}, height),
  length = COALESCE(${esc(dim.length)}, length),
  scu = COALESCE(${esc(dim.scu)}, scu)
WHERE class_name = ${esc(className)};`);
      stats.radars++;
      break;

    case "FlightController":
      lines.push(`UPDATE flight_controllers SET
  power_consumption_min = COALESCE(${esc(rn.pMin)}, power_consumption_min),
  power_consumption_max = COALESCE(${esc(rn.pMax)}, power_consumption_max),
  coolant_consumption_min = COALESCE(${esc(rn.cMin)}, coolant_consumption_min),
  coolant_consumption_max = COALESCE(${esc(rn.cMax)}, coolant_consumption_max),
  pips = COALESCE(${esc(rn.pips)}, pips),
  power_ranges = COALESCE(${escJson(rn.powerRanges)}, power_ranges),
  em_max = COALESCE(${esc(em.emMax)}, em_max),
  ir_max = COALESCE(${esc(em.irMax)}, ir_max),
  health = COALESCE(${esc(dur.health)}, health),
  distortion_shutdown_damage = COALESCE(${esc(dist.shutdownDamage)}, distortion_shutdown_damage),
  distortion_decay_delay = COALESCE(${esc(dist.decayDelay)}, distortion_decay_delay),
  distortion_decay_rate = COALESCE(${esc(dist.decayRate)}, distortion_decay_rate),
  distortion_shutdown_time = COALESCE(${esc(dist.shutdownTime)}, distortion_shutdown_time),
  distortion_decay_max = COALESCE(${esc(dist.decayRate)}, distortion_decay_max),
  mass = COALESCE(${esc(dim.mass)}, mass),
  width = COALESCE(${esc(dim.width)}, width),
  height = COALESCE(${esc(dim.height)}, height),
  length = COALESCE(${esc(dim.length)}, length),
  scu = COALESCE(${esc(dim.scu)}, scu)
WHERE class_name = ${esc(className)};`);
      stats.flightControllers++;
      break;

    case "WeaponMining": {
      const mining = stdItem?.Mining ?? {};
      const uuid = stdItem.UUID ?? item.reference;
      lines.push(`INSERT INTO weapon_mining (
  id, class_name, item_name, name,
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
  ${esc(uuid)}::uuid, ${esc(className)}, ${esc(stdItem.Name ?? item.itemName ?? null)},
  ${esc(item.name ?? stdItem.Name ?? className)},
  ${esc(rn.pMin)}, ${esc(rn.pMax)}, ${esc(rn.cMin)}, ${esc(rn.cMax)},
  ${esc(em.emMax)}, ${esc(em.irMax)},
  ${esc(sf(mining.LaserPower))}, ${esc(sf(mining.OptimalRange))}, ${esc(sf(mining.MaximumRange))},
  ${esc(sf(mining.ExtractionThroughput))}, ${esc(sf(mining.MiningModifier))},
  ${esc(sf(mining.ResistanceModifier))}, ${esc(sf(mining.InstabilityModifier))},
  ${esc(sf(mining.OptimalChargeWindowSize))}, ${esc(sf(mining.OptimalChargeRate))},
  ${esc(sf(mining.ShatterDamage))}, ${esc(dur.health)},
  ${esc(dist.shutdownDamage)}, ${esc(dist.shutdownTime)},
  ${esc(dim.mass)}, ${esc(dim.width)}, ${esc(dim.height)}, ${esc(dim.length)}, ${esc(dim.scu)},
  ${escJson(stdItem)}
) ON CONFLICT (class_name) DO UPDATE SET
  power_consumption_min = COALESCE(EXCLUDED.power_consumption_min, weapon_mining.power_consumption_min),
  power_consumption_max = COALESCE(EXCLUDED.power_consumption_max, weapon_mining.power_consumption_max),
  coolant_consumption_min = COALESCE(EXCLUDED.coolant_consumption_min, weapon_mining.coolant_consumption_min),
  coolant_consumption_max = COALESCE(EXCLUDED.coolant_consumption_max, weapon_mining.coolant_consumption_max),
  em_max = COALESCE(EXCLUDED.em_max, weapon_mining.em_max),
  ir_max = COALESCE(EXCLUDED.ir_max, weapon_mining.ir_max),
  mining_laser_power = COALESCE(EXCLUDED.mining_laser_power, weapon_mining.mining_laser_power),
  extraction_throughput = COALESCE(EXCLUDED.extraction_throughput, weapon_mining.extraction_throughput),
  raw_data = EXCLUDED.raw_data;`);
      stats.weaponMining++;
      break;
    }
  }
}

// =============================================================================
// PHASE 2: Ships + ship_power_reference + ship_pools
// =============================================================================
lines.push("");
lines.push("-- ═══════════════════════════════════════════════════════════════");
lines.push("-- PHASE 2: Ships + ship_power_reference + ship_pools");
lines.push("-- Uses reference (ClassName) to look up the real ship id");
lines.push("-- ═══════════════════════════════════════════════════════════════");

const shipsIndex = loadJSON(join(SCUNPACKED, "ships.json"));

for (const ship of shipsIndex) {
  const cn = ship.ClassName;
  if (!cn) continue;

  // 2a: Update ships table
  lines.push(`UPDATE ships SET
  class_name = COALESCE(${esc(cn)}, class_name),
  description = COALESCE(${esc(ship.DescriptionText ?? ship.Description ?? null)}, description),
  career = COALESCE(${esc(ship.Career ?? null)}, career),
  length_m = COALESCE(${esc(sf(ship.Length))}, length_m),
  width_m = COALESCE(${esc(sf(ship.Width))}, width_m),
  height_m = COALESCE(${esc(sf(ship.Height))}, height_m),
  mass_empty_kg = COALESCE(${esc(sf(ship.Mass))}, mass_empty_kg),
  mass_loadout_kg = COALESCE(${esc(sf(ship.MassLoadout))}, mass_loadout_kg),
  mass_total_kg = COALESCE(${esc(sf(ship.MassTotal))}, mass_total_kg),
  crew = COALESCE(${esc(sf(ship.Crew))}, crew),
  is_spaceship = COALESCE(${esc(ship.IsSpaceship ?? null)}, is_spaceship),
  is_gravlev = COALESCE(${esc(ship.IsGravlev ?? null)}, is_gravlev),
  cargo_scu = COALESCE(${esc(sf(ship.Cargo))}, cargo_scu),
  source_version = 'scunpacked-2026-04-16',
  imported_at = now(),
  raw_data = ${escJson(ship)}
WHERE reference = ${esc(cn)};`);
  stats.ships++;

  // 2b: ship_power_reference (use subquery to get ship id from reference)
  const pwr = ship.Power ?? {};
  const cool = ship.Cooling ?? {};
  const emis = ship.Emission ?? {};
  const shTot = ship.ShieldsTotal ?? {};
  const dist = ship.Distortion ?? {};
  const prop = ship.Propulsion ?? {};
  const qt = ship.QuantumTravel ?? {};

  lines.push(`INSERT INTO ship_power_reference (
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
) SELECT
  s.id,
  ${esc(sf(pwr.GenerationSegments))}, ${esc(sf(pwr.UsedSegmentsShields))}, ${esc(sf(pwr.UsedSegmentsQuantum))},
  ${escJson(pwr.UsedSegmentsGrouped)}, ${escJson(cool.UsedSegmentsQuantumGrouped)},
  ${esc(sf(cool.GenerationSegments))}, ${esc(sf(cool.UsedSegmentsShields))}, ${esc(sf(cool.UsedSegmentsQuantum))},
  ${esc(sf(cool.UsedSegmentsShieldsPct))}, ${esc(sf(cool.UsedSegmentsQuantumPct))},
  ${escJson(cool.UsedSegmentsShieldsGrouped)}, ${escJson(cool.UsedSegmentsQuantumGrouped)},
  ${esc(sf(emis.EmShields))}, ${esc(sf(emis.EmQuantum))},
  ${esc(sf(emis.IrShields))}, ${esc(sf(emis.IrQuantum))},
  ${esc(sf(emis.EmPerSegment))},
  ${escJson(emis.EmGroupsShields)}, ${escJson(emis.EmGroupsQuantum)},
  ${escJson(emis.EmSegmentGroupsShields)}, ${escJson(emis.EmSegmentGroupsQuantum)},
  ${esc(sf(shTot.Hp))}, ${esc(sf(shTot.Regen))}, ${esc(sf(shTot.RegenRaw))}, ${esc(sf(shTot.RegenMinPower))},
  ${esc(sf(dist.Pool))},
  ${esc(sf(prop.FuelCapacity))}, ${esc(sf(qt.FuelCapacity))},
  ${qt.Range ? esc(sf(qt.Range / 1000)) : "NULL"}, ${esc(sf(qt.Speed))}, ${esc(sf(qt.SpoolTime))},
  'scunpacked-2026-04-16'
FROM ships s WHERE s.reference = ${esc(cn)}
ON CONFLICT (ship_id) DO UPDATE SET
  power_generation_segments = COALESCE(EXCLUDED.power_generation_segments, ship_power_reference.power_generation_segments),
  power_used_scm = COALESCE(EXCLUDED.power_used_scm, ship_power_reference.power_used_scm),
  power_used_nav = COALESCE(EXCLUDED.power_used_nav, ship_power_reference.power_used_nav),
  power_used_grouped_scm = COALESCE(EXCLUDED.power_used_grouped_scm, ship_power_reference.power_used_grouped_scm),
  power_used_grouped_nav = COALESCE(EXCLUDED.power_used_grouped_nav, ship_power_reference.power_used_grouped_nav),
  cooling_generation_segments = COALESCE(EXCLUDED.cooling_generation_segments, ship_power_reference.cooling_generation_segments),
  cooling_used_scm = COALESCE(EXCLUDED.cooling_used_scm, ship_power_reference.cooling_used_scm),
  cooling_used_nav = COALESCE(EXCLUDED.cooling_used_nav, ship_power_reference.cooling_used_nav),
  cooling_used_pct_scm = COALESCE(EXCLUDED.cooling_used_pct_scm, ship_power_reference.cooling_used_pct_scm),
  cooling_used_pct_nav = COALESCE(EXCLUDED.cooling_used_pct_nav, ship_power_reference.cooling_used_pct_nav),
  cooling_used_grouped_scm = COALESCE(EXCLUDED.cooling_used_grouped_scm, ship_power_reference.cooling_used_grouped_scm),
  cooling_used_grouped_nav = COALESCE(EXCLUDED.cooling_used_grouped_nav, ship_power_reference.cooling_used_grouped_nav),
  em_shields = COALESCE(EXCLUDED.em_shields, ship_power_reference.em_shields),
  em_quantum = COALESCE(EXCLUDED.em_quantum, ship_power_reference.em_quantum),
  ir_shields = COALESCE(EXCLUDED.ir_shields, ship_power_reference.ir_shields),
  ir_quantum = COALESCE(EXCLUDED.ir_quantum, ship_power_reference.ir_quantum),
  em_per_segment = COALESCE(EXCLUDED.em_per_segment, ship_power_reference.em_per_segment),
  em_groups_scm = COALESCE(EXCLUDED.em_groups_scm, ship_power_reference.em_groups_scm),
  em_groups_nav = COALESCE(EXCLUDED.em_groups_nav, ship_power_reference.em_groups_nav),
  em_segment_groups_scm = COALESCE(EXCLUDED.em_segment_groups_scm, ship_power_reference.em_segment_groups_scm),
  em_segment_groups_nav = COALESCE(EXCLUDED.em_segment_groups_nav, ship_power_reference.em_segment_groups_nav),
  total_shield_hp = COALESCE(EXCLUDED.total_shield_hp, ship_power_reference.total_shield_hp),
  total_shield_regen = COALESCE(EXCLUDED.total_shield_regen, ship_power_reference.total_shield_regen),
  total_shield_regen_raw = COALESCE(EXCLUDED.total_shield_regen_raw, ship_power_reference.total_shield_regen_raw),
  total_shield_regen_min_power = COALESCE(EXCLUDED.total_shield_regen_min_power, ship_power_reference.total_shield_regen_min_power),
  distortion_pool = COALESCE(EXCLUDED.distortion_pool, ship_power_reference.distortion_pool),
  fuel_capacity_hydrogen = COALESCE(EXCLUDED.fuel_capacity_hydrogen, ship_power_reference.fuel_capacity_hydrogen),
  fuel_capacity_quantum = COALESCE(EXCLUDED.fuel_capacity_quantum, ship_power_reference.fuel_capacity_quantum),
  qt_range_km = COALESCE(EXCLUDED.qt_range_km, ship_power_reference.qt_range_km),
  qt_speed_ms = COALESCE(EXCLUDED.qt_speed_ms, ship_power_reference.qt_speed_ms),
  qt_spool_time_s = COALESCE(EXCLUDED.qt_spool_time_s, ship_power_reference.qt_spool_time_s),
  computed_at = now(),
  source_version = EXCLUDED.source_version;`);
  stats.shipPowerRef++;

  // 2c: ship_pools
  const pools = ship.PowerPools ?? {};
  for (const [poolType, poolData] of Object.entries(pools)) {
    const maxSize = poolData?.Size ?? poolData;
    if (maxSize === undefined || maxSize === null) continue;
    lines.push(`INSERT INTO ship_pools (ship_id, item_type, max_size)
SELECT s.id, ${esc(poolType)}, ${esc(sf(maxSize))}
FROM ships s WHERE s.reference = ${esc(cn)}
ON CONFLICT (ship_id, item_type) DO UPDATE SET max_size = EXCLUDED.max_size;`);
    stats.shipPools++;
  }
}

// =============================================================================
// PHASE 3: ship_hardpoints stock loadout from individual ship files
// =============================================================================
lines.push("");
lines.push("-- ═══════════════════════════════════════════════════════════════");
lines.push("-- PHASE 3: Ship hardpoints stock loadout data");
lines.push("-- ═══════════════════════════════════════════════════════════════");

const shipsDir = join(SCUNPACKED, "ships");
if (existsSync(shipsDir)) {
  const shipFiles = readdirSync(shipsDir).filter(f => f.endsWith(".json"));

  for (const file of shipFiles) {
    const shipData = loadJSON(join(shipsDir, file));
    const cn = shipData.ClassName;
    if (!cn) continue;

    const loadout = shipData.Loadout ?? [];
    let posIdx = 0;

    for (const hp of loadout) {
      const hpName = hp.HardpointName;
      if (!hpName) continue;

      lines.push(`UPDATE ship_hardpoints SET
  ship_id = (SELECT id FROM ships WHERE reference = ${esc(cn)} LIMIT 1),
  stock_loadout = ${escJson(hp)},
  position_index = ${posIdx}
WHERE ship_reference = ${esc(cn)} AND hardpoint_name = ${esc(hpName)};`);
      posIdx++;
      stats.shipHardpoints++;
    }
  }
}

// =============================================================================
// PHASE 4: multi_pp_ratio backfill
// =============================================================================
lines.push("");
lines.push("-- ═══════════════════════════════════════════════════════════════");
lines.push("-- PHASE 4: Backfill multi_pp_ratio");
lines.push("-- ═══════════════════════════════════════════════════════════════");
lines.push(`WITH ship_pp AS (
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
  WHEN spp.total_gen_catalog > 0
    THEN spr.power_generation_segments / spp.total_gen_catalog
  ELSE NULL
END,
computed_at = now()
FROM ship_pp spp
WHERE spr.ship_id = spp.ship_id;`);

lines.push("");
lines.push("COMMIT;");

// Write output
const sqlContent = lines.join("\n");
const outPath = join(ROOT, "scripts", "ingest_power_model.sql");
writeFileSync(outPath, sqlContent, "utf8");

console.error(`✅ Generated ${outPath}`);
console.error(`   Lines: ${lines.length}`);
console.error(`   Stats: PP=${stats.powerPlants} SH=${stats.shields} CO=${stats.coolers} QD=${stats.quantumDrives}`);
console.error(`          WG=${stats.weaponGuns} RA=${stats.radars} FC=${stats.flightControllers} WM=${stats.weaponMining}`);
console.error(`          Ships=${stats.ships} PowerRef=${stats.shipPowerRef} Pools=${stats.shipPools} HP=${stats.shipHardpoints}`);
