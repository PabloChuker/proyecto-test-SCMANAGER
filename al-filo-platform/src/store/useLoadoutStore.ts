// =============================================================================
// AL FILO — useLoadoutStore v7 (Per-Instance Power Grid)
//
// Power model redesign:
//   - Each component INSTANCE gets its own power pip allocation
//   - PowerRanges from sc-unpacked data define segments per component
//   - PowerPlant generates the total power pool
//   - Coolers CONVERT power to coolant
//   - FlightController consumes power for thrusters (no interactive pips)
//   - Thrusters consume fuel, not power pips
// =============================================================================

import { create } from "zustand";

// =============================================================================
// Types
// =============================================================================

export interface ComponentStatsData { [key: string]: any; }

/** Power network data from sc-unpacked (attached to each component by API) */
export interface PowerNetworkInfo {
  type: string;
  pMin: number;  // Usage.Power.Minimum
  pMax: number;  // Usage.Power.Maximum
  cMin: number;  // Usage.Coolant.Minimum
  cMax: number;  // Usage.Coolant.Maximum
  genP?: number; // Generation.Power (PowerPlants only)
  genC?: number; // Generation.Coolant (Coolers)
  pips?: number; // Total interactive pips (sum of RegisterRange)
  ranges?: { s: number; m: number; r: number }[]; // PowerRanges tiers
  em?: number;   // EM signature max
  ir?: number;   // IR signature max
}

export interface EquippedItem {
  id: string; reference: string; name: string; localizedName: string | null;
  className: string | null; type: string; size: number | null;
  grade: string | null; manufacturer: string | null;
  componentStats: ComponentStatsData | null;
  powerNetwork?: PowerNetworkInfo | null;
}

export interface ResolvedChild {
  id: string; hardpointName: string; category: string;
  minSize: number; maxSize: number; isFixed: boolean;
  equippedItem: EquippedItem | null;
}

export interface ResolvedHardpoint {
  id: string; hardpointName: string; originalCategory: string;
  resolvedCategory: string; minSize: number; maxSize: number;
  isFixed: boolean; defaultItem: EquippedItem | null;
  children: ResolvedChild[];
}

export interface ShipInfo {
  id: string; reference: string; name: string; localizedName: string | null;
  manufacturer: string | null; gameVersion: string;
  scmSpeed: number | null; afterburnerSpeed: number | null;
  pitchRate: number | null; yawRate: number | null; rollRate: number | null;
  crew: number | null; cargo: number | null;
  role: string | null; focus: string | null; size: number | null;
  accelForward: number | null; accelBackward: number | null;
  accelUp: number | null; accelDown: number | null; accelStrafe: number | null;
  boostSpeedForward: number | null; boostSpeedBackward: number | null;
  boostMultUp: number | null; boostMultStrafe: number | null;
  boostedPitch: number | null; boostedYaw: number | null; boostedRoll: number | null;
  mass: number | null; hydrogenCapacity: number | null; quantumFuelCapacity: number | null;
  shieldHpTotal: number | null; powerGeneration: number | null; hullHp: number | null;
  deflectionPhysical: number | null; deflectionEnergy: number | null; deflectionDistortion: number | null;
}

export type FlightMode = "SCM" | "NAV";

/** Power categories for UI grouping */
export type PowerCategory = "weapons" | "thrusters" | "shields" | "quantum" | "radar" | "coolers" | "lifesupport";
export const POWER_CATEGORIES: PowerCategory[] = ["weapons", "thrusters", "shields", "quantum", "radar", "coolers", "lifesupport"];

const CAT_TO_POWER: Record<string, PowerCategory> = {
  WEAPON: "weapons", TURRET: "weapons", MISSILE_RACK: "weapons",
  SHIELD: "shields", COOLER: "coolers", QUANTUM_DRIVE: "quantum",
  MINING: "weapons", UTILITY: "weapons", RADAR: "radar",
  LIFE_SUPPORT: "lifesupport",
};

/** Per-instance power allocation info for the power grid UI */
export interface ComponentPowerInstance {
  hardpointId: string;
  hardpointName: string;
  componentName: string;
  category: PowerCategory;
  type: string;           // component type (Cooler, Shield, etc.)
  totalPips: number;      // total interactive pips (from RegisterRange sum)
  allocatedPips: number;  // currently allocated pips (0..totalPips)
  ranges: { start: number; modifier: number; range: number }[];
  powerMin: number;       // Usage.Power.Minimum
  powerMax: number;       // Usage.Power.Maximum
  genPower: number;       // Generation.Power
  genCoolant: number;     // Generation.Coolant
  emMax: number;
  irMax: number;
  isOn: boolean;
}

export interface CategoryPowerInfo { minDraw: number; allocated: number; componentCount: number; activeCount: number; }
export interface PowerNetworkState {
  totalOutput: number; totalAllocated: number; totalMinDraw: number;
  consumptionPercent: number; freePoints: number; isOverloaded: boolean;
  categories: Record<PowerCategory, CategoryPowerInfo>;
  activeCategories: PowerCategory[];
  /** Per-instance power data for the grid UI */
  instances: ComponentPowerInstance[];
}

export interface ComputedStats {
  totalDps: number; totalAlpha: number;
  shieldHp: number; shieldRegen: number;
  powerOutput: number; powerDraw: number; powerBalance: number;
  coolingRate: number; thermalOutput: number; thermalBalance: number;
  emSignature: number; irSignature: number;
  effectiveSpeed: number | null; effectiveSpeedLabel: string;
  powerNetwork: PowerNetworkState;
  summary: { weapons: number; missiles: number; shields: number; coolers: number; powerPlants: number; quantumDrives: number; activeComponents: number; totalComponents: number; };
}

// =============================================================================
// Category inference
// =============================================================================

const TYPE_TO_CAT: Record<string, string> = {
  WEAPON: "WEAPON", TURRET: "TURRET", MISSILE: "MISSILE_RACK", MISSILE_RACK: "MISSILE_RACK",
  SHIELD: "SHIELD", POWER_PLANT: "POWER_PLANT", COOLER: "COOLER", QUANTUM_DRIVE: "QUANTUM_DRIVE",
  MINING_LASER: "MINING", MINING: "MINING", TRACTOR_BEAM: "UTILITY", EMP: "UTILITY",
  RADAR: "RADAR", COUNTERMEASURE: "COUNTERMEASURE",
  LIFE_SUPPORT: "LIFE_SUPPORT", LifeSupportGenerator: "LIFE_SUPPORT",
};
const NAME_PATTERNS: [RegExp, string][] = [
  [/turret/i, "TURRET"], [/weapon|gun|cannon|gatling|repeater|scattergun|gimbal/i, "WEAPON"],
  [/missile|rocket|msd-/i, "MISSILE_RACK"], [/shield/i, "SHIELD"],
  [/power_plant|powerplant|power plant/i, "POWER_PLANT"], [/cool/i, "COOLER"],
  [/quantum|qdrive/i, "QUANTUM_DRIVE"], [/mining/i, "MINING"],
  [/radar|scanner/i, "RADAR"], [/life.?support/i, "LIFE_SUPPORT"],
];
const USEFUL = new Set(["WEAPON", "TURRET", "MISSILE_RACK", "SHIELD", "POWER_PLANT", "COOLER", "QUANTUM_DRIVE", "MINING", "UTILITY", "RADAR", "COUNTERMEASURE", "LIFE_SUPPORT"]);

function inferCategory(category: string, item: EquippedItem | null, hpName: string): string {
  // Detect turrets by item name even when category is WEAPON
  if (category === "WEAPON" && item?.name && /turret/i.test(item.name)) return "TURRET";
  if (category !== "OTHER" && USEFUL.has(category)) return category;
  if (item?.type) { const m = TYPE_TO_CAT[item.type]; if (m) return m; }
  for (const [re, cat] of NAME_PATTERNS) { if (re.test(hpName)) return cat; }
  return category;
}

// =============================================================================
// Helpers
// =============================================================================

function toNumOrNull(v: any): number | null { if (v === null || v === undefined) return null; const n = Number(v); return isNaN(n) ? null : n; }
function pickNum(o: any, ...k: string[]): number { if (!o) return 0; for (const key of k) { const v = o[key]; if (v != null) { const n = Number(v); if (!isNaN(n) && n !== 0) return n; } } return 0; }

function mergeItemStats(eq: any): ComponentStatsData | null {
  if (!eq) return null;
  if (eq.componentStats && typeof eq.componentStats === "object" && Object.keys(eq.componentStats).length > 0) return eq.componentStats;
  const tables = [eq.weaponStats, eq.shieldStats, eq.powerStats, eq.coolingStats, eq.quantumStats, eq.miningStats, eq.missileStats, eq.thrusterStats];
  const m: Record<string, any> = {}; let has = false;
  for (const t of tables) { if (!t) continue; has = true; for (const [k, v] of Object.entries(t)) { if (k !== "id" && k !== "itemId" && v != null) m[k] = v; } }
  if (!has) return null;
  if (m.maxHp && !m.shieldHp) m.shieldHp = m.maxHp;
  if (m.regenRate && !m.shieldRegen) m.shieldRegen = m.regenRate;
  if (m.damage && !m.alphaDamage) m.alphaDamage = m.damage;
  if (!m.dps && m.alphaDamage && m.fireRate) { const a = Number(m.alphaDamage), fr = Number(m.fireRate); if (a > 0 && fr > 0) m.dps = Math.round(a * (fr / 60) * 100) / 100; }
  return m;
}

function parseEquipped(eq: any): EquippedItem | null {
  if (!eq) return null;
  const stats = eq.componentStats ?? mergeItemStats(eq);
  return {
    id: eq.id ?? "", reference: eq.reference ?? "", name: eq.name ?? "",
    localizedName: eq.localizedName ?? null, className: eq.className ?? null,
    type: eq.type ?? "OTHER", size: eq.size ?? null, grade: eq.grade ?? null,
    manufacturer: eq.manufacturer ?? null, componentStats: stats,
    powerNetwork: eq.powerNetwork ?? null,
  };
}

// =============================================================================
// computeStats
// =============================================================================

const WEAPON_CATS = new Set(["WEAPON", "TURRET", "MISSILE_RACK"]);
const SYSTEM_CATS = new Set(["SHIELD", "POWER_PLANT", "COOLER", "QUANTUM_DRIVE", "MINING", "UTILITY", "LIFE_SUPPORT"]);

function emptyCat(): CategoryPowerInfo { return { minDraw: 0, allocated: 0, componentCount: 0, activeCount: 0 }; }

/**
 * Combine multiple power plant outputs into a single effective total,
 * applying in-game diminishing returns.
 *
 * Empirical formula (2026-04 observations from live game testing):
 *
 *   Total = floor(bestRating * 0.95) + round( sum(rest) / 3 )
 *
 * Rationale:
 *   - The best plant pays a ~5% efficiency tax for connection overhead.
 *     This matches Star Citizen's behavior where rating 21 → 19 effective,
 *     rating 20 → 19, rating 19 → 18.
 *   - Each additional plant only contributes ~⅓ of its rated output because
 *     the ship's power network caps how many plants can feed in parallel.
 *   - This prevents stacking identical plants from linearly scaling output.
 *
 * Validation (rating → effective total):
 *   [21]          → 19   (floor(21*0.95) = 19)
 *   [20]          → 19   (floor(20*0.95) = 19)
 *   [19]          → 18   (floor(19*0.95) = 18)
 *   [21, 20]      → 26   (19 + round(20/3) = 19 + 7)
 *   [21, 19]      → 25   (19 + round(19/3) = 19 + 6)
 *   [21, 20, 19]  → 32   (19 + round(39/3) = 19 + 13)
 */
function combinePowerPlantOutputs(outputs: number[]): number {
  if (outputs.length === 0) return 0;
  // Sort descending so index 0 is the best plant.
  const sorted = [...outputs].sort((a, b) => b - a);
  const best = sorted[0];
  const rest = sorted.slice(1);
  const restSum = rest.reduce((acc, v) => acc + v, 0);
  const effectiveBest = Math.floor(best * 0.95);
  const effectiveRest = Math.round(restSum / 3);
  return Math.max(0, effectiveBest + effectiveRest);
}

function computeStats(
  hardpoints: ResolvedHardpoint[], overrides: Map<string, EquippedItem | null>,
  componentStates: Record<string, boolean>, flightMode: FlightMode,
  instancePower: Record<string, number>,  // hardpointName -> allocated pips
  shipInfo: ShipInfo | null,
  shipPowerGen: number,  // from ship-power-data.json
  flightControllerPower: any | null,  // from power-network-lookup (Controller_Flight_*)
): ComputedStats {
  let totalDps = 0, totalAlpha = 0, shieldHp = 0, shieldRegen = 0;
  let powerOutput = 0, coolingRate = 0, thermalOutput = 0, emSig = 0, irSig = 0;
  // Individual power plant outputs — accumulated separately so we can apply
  // diminishing returns at the end (Star Citizen in-game behavior: the best
  // plant contributes near-full output minus fixed overhead, and each extra
  // plant only contributes ~⅓ of its rating). See combinePowerPlantOutputs().
  const powerPlantOutputs: number[] = [];
  let activeComponents = 0, totalComponents = 0;
  const summary = { weapons: 0, missiles: 0, shields: 0, coolers: 0, powerPlants: 0, quantumDrives: 0, activeComponents: 0, totalComponents: 0 };
  const cats: Record<PowerCategory, CategoryPowerInfo> = {} as any;
  for (const c of POWER_CATEGORIES) cats[c] = emptyCat();

  // Per-instance power data for the grid UI
  const instances: ComponentPowerInstance[] = [];

  const accumDps = (s: ComponentStatsData | null | undefined) => {
    if (!s) return;
    let dps = pickNum(s, "dps");
    if (dps === 0) { const a = pickNum(s, "alphaDamage", "damage"), fr = pickNum(s, "fireRate"); if (a > 0 && fr > 0) dps = a * (fr / 60); }
    totalDps += dps;
    totalAlpha += pickNum(s, "alphaDamage", "damage");
  };

  const accumBase = (s: ComponentStatsData | null | undefined) => {
    if (!s) return;
    thermalOutput += pickNum(s, "thermalOutput");
    emSig += pickNum(s, "emSignature");
    irSig += pickNum(s, "irSignature");
  };

  // ── Weapons: accumulate into a single combined power column ──
  let weaponPowerMin = 0;
  let weaponPowerMax = 0;
  let weaponEmMax = 0;
  let weaponIrMax = 0;
  let weaponCount = 0;
  let weaponActiveCount = 0;
  const WEAPON_POWER_ID = "__weapons_combined__";

  // ── Shields: accumulate into a single combined power column ──
  // (game mechanic: in Star Citizen shields are always represented as 1 column)
  let shieldPowerMin = 0;
  let shieldPowerMax = 0;
  let shieldEmMax = 0;
  let shieldIrMax = 0;
  let shieldGenPower = 0;
  let shieldGenCoolant = 0;
  let shieldCount = 0;
  let shieldActiveCount = 0;
  let shieldFirstHpName: string | null = null;
  const SHIELD_POWER_ID = "__shields_combined__";

  for (const hp of hardpoints) {
    const cat = hp.resolvedCategory;
    if (!USEFUL.has(cat)) continue;
    const item = overrides.has(hp.id) ? (overrides.get(hp.id) ?? null) : hp.defaultItem;
    if (!item) continue;
    totalComponents++;
    switch (cat) {
      case "WEAPON": case "TURRET": summary.weapons++; break;
      case "MISSILE_RACK": summary.missiles++; break;
      case "SHIELD": summary.shields++; break;
      case "COOLER": summary.coolers++; break;
      case "POWER_PLANT": summary.powerPlants++; break;
      case "QUANTUM_DRIVE": summary.quantumDrives++; break;
    }
    const s = item.componentStats;
    const pn = item.powerNetwork;
    const isOn = componentStates[hp.hardpointName] !== false;

    // Build power instance for ALL components with power interaction
    const pCat = CAT_TO_POWER[cat];
    if (pCat) {
      // === PRIMARY: Use DB power_consumption_min/max if available ===
      const dbMin = pickNum(s, "powerDrawMin");
      const dbMax = pickNum(s, "powerDrawMax");

      // Derive totalPips (max 6 cells like the game)
      let totalPips = 0;
      let powerMin = 0;
      let powerMax = 0;

      if (dbMax > 0) {
        // DB values are the ground truth
        totalPips = Math.min(6, Math.max(1, Math.ceil(dbMax)));
        powerMin = dbMin;
        powerMax = dbMax;
      } else if (pn?.pips && pn.pips > 0) {
        // Fallback: powerNetwork JSON has RegisterRange pips
        totalPips = Math.min(6, pn.pips);
        powerMin = pn.pMin ?? 0;
        powerMax = pn.pMax ?? 0;
      } else if (pn && pn.pMax > 0) {
        // Fallback: derive from powerNetwork pMax
        totalPips = Math.min(6, Math.max(1, Math.ceil(pn.pMax)));
        powerMin = pn.pMin ?? 0;
        powerMax = pn.pMax;
      } else {
        // Last resort: single powerDraw from componentStats
        const pd = pickNum(s, "powerDraw", "powerBase");
        if (pd > 0) {
          totalPips = Math.min(6, Math.max(1, Math.ceil(pd)));
          powerMin = pd;
          powerMax = pd;
        }
      }

      const allocPips = instancePower[hp.hardpointName] ?? 0;

      cats[pCat].componentCount++;
      if (isOn) {
        cats[pCat].activeCount++;
        cats[pCat].minDraw += powerMin > 0 ? powerMin : (pn?.pMin ?? pickNum(s, "powerDraw", "powerBase"));
      }
      cats[pCat].allocated += allocPips;

      // WEAPONS → accumulate into single combined column (game mechanic: 1 column for all weapons)
      if (pCat === "weapons") {
        if (totalPips > 0) {
          weaponPowerMin += powerMin;
          weaponPowerMax += powerMax;
          weaponEmMax += pn?.em ?? pickNum(s, "emSignature");
          weaponIrMax += pn?.ir ?? pickNum(s, "irSignature");
          weaponCount++;
          if (isOn) weaponActiveCount++;
        }
      } else if (pCat === "shields") {
        // SHIELDS → accumulate into single combined column
        // (in Star Citizen the HUD always shows shields as a unified single column)
        if (totalPips > 0) {
          shieldPowerMin += powerMin;
          shieldPowerMax += powerMax;
          shieldEmMax += pn?.em ?? pickNum(s, "emSignature");
          shieldIrMax += pn?.ir ?? pickNum(s, "irSignature");
          shieldGenPower += pn?.genP ?? 0;
          shieldGenCoolant += pn?.genC ?? 0;
          shieldCount++;
          if (isOn) shieldActiveCount++;
          // Remember the first shield hardpointName so the merged column
          // can control allocation/toggle via an existing store key.
          if (!shieldFirstHpName) shieldFirstHpName = hp.hardpointName;
        }
      } else if (totalPips > 0) {
        // Non-weapons: individual instance per component (as before)
        const ranges = (pn?.ranges ?? []).map(r => ({ start: r.s, modifier: r.m, range: r.r }));
        const displayRanges = ranges.length > 0 ? ranges
          : [{ start: 0, modifier: 1, range: totalPips }];

        instances.push({
          hardpointId: hp.id,
          hardpointName: hp.hardpointName,
          componentName: item.name,
          category: pCat,
          type: pn?.type || cat,
          totalPips,
          allocatedPips: Math.min(allocPips, totalPips),
          ranges: displayRanges,
          powerMin,
          powerMax,
          genPower: pn?.genP ?? 0,
          genCoolant: pn?.genC ?? 0,
          emMax: pn?.em ?? pickNum(s, "emSignature"),
          irMax: pn?.ir ?? pickNum(s, "irSignature"),
          isOn,
        });
      }
    }

    // Power plants: always output — prefer DB value over static JSON.
    // Collect each plant's rated output; the combined total is computed
    // AFTER the loop using diminishing returns (see combinePowerPlantOutputs).
    if (cat === "POWER_PLANT") {
      const dbPower = pickNum(s, "powerOutput");
      const ppOutput = dbPower > 0 ? dbPower : (pn?.genP ?? 0);
      if (ppOutput > 0) powerPlantOutputs.push(ppOutput);
      if (isOn) { activeComponents++; }
      // EM from power network data
      if (pn?.em) emSig += pn.em;
      else accumBase(s);
      continue;
    }

    if (!isOn) continue;
    activeComponents++;

    // EM/IR from power network data when available
    if (pn?.em) emSig += pn.em;
    if (pn?.ir) irSig += pn.ir;

    // TURRET/RACK with children: DPS comes from children, base stats from parent
    // Also create power instances for each child weapon
    if ((cat === "TURRET" || cat === "MISSILE_RACK") && hp.children.length > 0) {
      if (!pn) accumBase(s);
      for (const child of hp.children) {
        const childOn = componentStates[child.hardpointName] !== false;
        if (!childOn) continue;
        const cItem = child.equippedItem;
        if (!cItem) continue;
        accumDps(cItem.componentStats);
        if (!cItem.powerNetwork) accumBase(cItem.componentStats);

        // Accumulate child weapon power into combined weapons column
        const childPn = cItem.powerNetwork;
        const childS = cItem.componentStats;
        if (childPn && childPn.pMax > 0) {
          cats.weapons.componentCount++;
          if (childOn) {
            cats.weapons.activeCount++;
            cats.weapons.minDraw += childPn.pMin ?? 0;
          }
          const childAllocPips = instancePower[child.hardpointName] ?? 0;
          cats.weapons.allocated += childAllocPips;
          weaponPowerMin += childPn.pMin ?? 0;
          weaponPowerMax += childPn.pMax;
          weaponEmMax += childPn.em ?? pickNum(childS, "emSignature");
          weaponIrMax += childPn.ir ?? 0;
          weaponCount++;
          if (childOn) weaponActiveCount++;
        }
      }
    } else {
      if (cat === "WEAPON" || cat === "TURRET") { accumDps(s); }
      if (cat === "MISSILE_RACK") { totalAlpha += pickNum(s, "alphaDamage", "damage"); }
      if (cat === "SHIELD") { shieldHp += pickNum(s, "shieldHp", "maxHp"); shieldRegen += pickNum(s, "shieldRegen", "regenRate"); }
      if (cat === "COOLER") { coolingRate += pickNum(s, "coolingRate"); }
      if (!pn) accumBase(s);
    }
  }

  // ── Push synthetic thrusters column (from FlightController power data) ──
  // Thrusters are not regular hardpoints, so we inject a single column based on
  // the ship's Controller_Flight_* entry in power-network-lookup.json.
  const THRUSTERS_POWER_ID = "__thrusters_combined__";
  if (flightControllerPower && (flightControllerPower.pMax ?? 0) > 0) {
    const thrPMin = Number(flightControllerPower.pMin ?? 0);
    const thrPMax = Number(flightControllerPower.pMax ?? 0);
    const thrustPips = Math.min(6, Math.max(1, Math.ceil(thrPMax)));
    const thrustAllocPips = instancePower[THRUSTERS_POWER_ID] ?? 0;

    cats.thrusters.componentCount += 1;
    cats.thrusters.activeCount += 1;
    cats.thrusters.minDraw += thrPMin;
    cats.thrusters.allocated += thrustAllocPips;

    instances.push({
      hardpointId: THRUSTERS_POWER_ID,
      hardpointName: THRUSTERS_POWER_ID,
      componentName: "Thrusters",
      category: "thrusters",
      type: "FlightController",
      totalPips: thrustPips,
      allocatedPips: Math.min(thrustAllocPips, thrustPips),
      ranges: [{ start: 0, modifier: 1, range: thrustPips }],
      powerMin: thrPMin,
      powerMax: thrPMax,
      genPower: 0,
      genCoolant: 0,
      emMax: Number(flightControllerPower.em ?? 0),
      irMax: Number(flightControllerPower.ir ?? 0),
      isOn: true,
    });
  }

  // ── Push single combined weapons column ──
  if (weaponCount > 0) {
    const weaponAllocPips = instancePower[WEAPON_POWER_ID] ?? 0;
    const combinedPips = Math.min(6, Math.max(1, Math.ceil(weaponPowerMax)));
    // Override the per-weapon allocated counts with the single combined allocation
    cats.weapons.allocated = weaponAllocPips;
    instances.push({
      hardpointId: WEAPON_POWER_ID,
      hardpointName: WEAPON_POWER_ID,
      componentName: `Weapons (${weaponCount})`,
      category: "weapons",
      type: "WeaponGun",
      totalPips: combinedPips,
      allocatedPips: Math.min(weaponAllocPips, combinedPips),
      ranges: [{ start: 0, modifier: 1, range: combinedPips }],
      powerMin: weaponPowerMin,
      powerMax: weaponPowerMax,
      genPower: 0,
      genCoolant: 0,
      emMax: weaponEmMax,
      irMax: weaponIrMax,
      isOn: weaponActiveCount > 0,
    });
  }

  // ── Push single combined shields column ──
  // In Star Citizen the HUD always shows a single shield column, regardless
  // of how many shield generators the ship has. We aggregate all shield
  // generators into one visual column matching the weapons treatment.
  if (shieldCount > 0) {
    const shieldAllocPips = instancePower[SHIELD_POWER_ID] ?? 0;
    const combinedShieldPips = Math.min(6, Math.max(1, Math.ceil(shieldPowerMax)));
    // Override the per-shield allocated counts with the single combined allocation
    cats.shields.allocated = shieldAllocPips;
    instances.push({
      hardpointId: SHIELD_POWER_ID,
      hardpointName: SHIELD_POWER_ID,
      componentName: `Shields (${shieldCount})`,
      category: "shields",
      type: "Shield",
      totalPips: combinedShieldPips,
      allocatedPips: Math.min(shieldAllocPips, combinedShieldPips),
      ranges: [{ start: 0, modifier: 1, range: combinedShieldPips }],
      powerMin: shieldPowerMin,
      powerMax: shieldPowerMax,
      genPower: shieldGenPower,
      genCoolant: shieldGenCoolant,
      emMax: shieldEmMax,
      irMax: shieldIrMax,
      isOn: shieldActiveCount > 0,
    });
  }

  // Apply diminishing returns to combine multiple power plants.
  // Empirical formula derived from in-game observations (2026-04):
  //
  //   Total = round( (bestRating - 2) + sum(rest) / 3 )
  //
  // The first plant loses a fixed "connection tax" of 2 points, and every
  // additional plant only contributes ~1/3 of its rated output. This matches
  // Star Citizen's actual behavior: stacking identical plants gives sharply
  // diminishing gains (e.g. 21+20+19 rated → ~32 effective, not 60).
  powerOutput = combinePowerPlantOutputs(powerPlantOutputs);

  // Prefer component-level power output (from equipped power plants) over ship-level static data.
  // Ship-level is only a fallback when no power plant components are found.
  const totalPO = powerOutput > 0 ? powerOutput : (shipPowerGen > 0 ? shipPowerGen : 0);

  let totalAllocated = 0, totalMinDraw = 0;
  for (const c of POWER_CATEGORIES) {
    totalAllocated += cats[c].allocated;
    totalMinDraw += Math.ceil(cats[c].minDraw);
  }
  const consumptionPercent = totalPO > 0 ? Math.round((totalMinDraw / totalPO) * 100) : 0;
  const activeCategories = POWER_CATEGORIES.filter(c => cats[c].componentCount > 0);

  if (flightMode === "NAV") {
    totalDps = 0; totalAlpha = 0; shieldRegen = 0; shieldHp = 0;
    // NAV mode turns off shields — free their power allocation
    for (const inst of instances) {
      if (inst.category === "shields") {
        inst.isOn = false;
        inst.allocatedPips = 0;
      }
    }
    cats.shields.activeCount = 0;
    cats.shields.allocated = 0;
    cats.shields.minDraw = 0;
  } else {
    // SCM mode turns off quantum drive — free their power allocation
    for (const inst of instances) {
      if (inst.category === "quantum") {
        inst.isOn = false;
        inst.allocatedPips = 0;
      }
    }
    cats.quantum.activeCount = 0;
    cats.quantum.allocated = 0;
    cats.quantum.minDraw = 0;
  }

  let effectiveSpeed: number | null; let effectiveSpeedLabel: string;
  if (flightMode === "NAV") { effectiveSpeed = shipInfo?.afterburnerSpeed ?? null; effectiveSpeedLabel = "NAV"; } else { effectiveSpeed = shipInfo?.scmSpeed ?? null; effectiveSpeedLabel = "SCM"; }

  summary.activeComponents = activeComponents; summary.totalComponents = totalComponents;
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    totalDps: r(totalDps), totalAlpha: r(totalAlpha), shieldHp: r(shieldHp), shieldRegen: r(shieldRegen),
    powerOutput: r(totalPO), powerDraw: r(totalMinDraw), powerBalance: r(totalPO - totalMinDraw),
    coolingRate: r(coolingRate), thermalOutput: r(thermalOutput), thermalBalance: r(coolingRate - thermalOutput),
    emSignature: r(emSig), irSignature: r(irSig), effectiveSpeed, effectiveSpeedLabel,
    powerNetwork: { totalOutput: totalPO, totalAllocated, totalMinDraw: Math.round(totalMinDraw), consumptionPercent, freePoints: totalPO - totalAllocated, isOverloaded: consumptionPercent > 100, categories: cats, activeCategories, instances },
    summary,
  };
}

// =============================================================================
// Store
// =============================================================================

const ZERO_ALLOC: Record<PowerCategory, number> = { weapons: 0, thrusters: 0, shields: 0, quantum: 0, radar: 0, coolers: 0, lifesupport: 0 };
const EMPTY_NET: PowerNetworkState = { totalOutput: 0, totalAllocated: 0, totalMinDraw: 0, consumptionPercent: 0, freePoints: 0, isOverloaded: false, categories: (() => { const c = {} as any; for (const k of POWER_CATEGORIES) c[k] = emptyCat(); return c; })(), activeCategories: [], instances: [] };
const EMPTY_STATS: ComputedStats = { totalDps: 0, totalAlpha: 0, shieldHp: 0, shieldRegen: 0, powerOutput: 0, powerDraw: 0, powerBalance: 0, coolingRate: 0, thermalOutput: 0, thermalBalance: 0, emSignature: 0, irSignature: 0, effectiveSpeed: null, effectiveSpeedLabel: "SCM", powerNetwork: EMPTY_NET, summary: { weapons: 0, missiles: 0, shields: 0, coolers: 0, powerPlants: 0, quantumDrives: 0, activeComponents: 0, totalComponents: 0 } };

interface LoadoutState {
  shipId: string | null; shipInfo: ShipInfo | null;
  hardpoints: ResolvedHardpoint[]; overrides: Map<string, EquippedItem | null>;
  componentStates: Record<string, boolean>; flightMode: FlightMode;
  /** Per-instance power allocation: hardpointName -> allocated pips */
  instancePower: Record<string, number>;
  /** Ship-level power generation from sc-unpacked */
  shipPowerGen: number;
  /** Flight controller power data (for thrusters column) */
  flightControllerPower: any | null;
  // Legacy: keep for backward compat but internally maps to instancePower
  allocatedPower: Record<PowerCategory, number>;
  isLoading: boolean; error: string | null;

  getStats: () => ComputedStats;
  getEffectiveItem: (hpId: string) => EquippedItem | null;
  isComponentOn: (hpName: string) => boolean;
  hasChanges: () => boolean;
  getWeaponHardpoints: () => ResolvedHardpoint[];
  getSystemHardpoints: () => ResolvedHardpoint[];
  loadShip: (id: string, buildParam?: string | null) => Promise<void>;
  equipItem: (hardpointId: string, item: EquippedItem) => void;
  clearSlot: (hardpointId: string) => void;
  resetAll: () => void;
  encodeBuild: () => string;
  toggleComponent: (hpName: string) => void;
  setFlightMode: (mode: FlightMode) => void;
  /** Set per-instance power allocation */
  setInstancePower: (hardpointName: string, pips: number) => void;
  /** Legacy: set power by category (updates all instances in that category) */
  setAllocatedPower: (cat: PowerCategory, points: number) => void;
  autoAllocatePower: () => void;
}

export const useLoadoutStore = create<LoadoutState>((set, get) => ({
  shipId: null, shipInfo: null, hardpoints: [], overrides: new Map(),
  componentStates: {}, flightMode: "SCM" as FlightMode,
  instancePower: {}, shipPowerGen: 0, flightControllerPower: null,
  allocatedPower: { ...ZERO_ALLOC }, isLoading: false, error: null,

  getStats: () => {
    const s = get();
    return s.hardpoints.length === 0
      ? EMPTY_STATS
      : computeStats(s.hardpoints, s.overrides, s.componentStates, s.flightMode, s.instancePower, s.shipInfo, s.shipPowerGen, s.flightControllerPower);
  },
  getEffectiveItem: (hpId) => { const { hardpoints, overrides } = get(); if (overrides.has(hpId)) return overrides.get(hpId) ?? null; return hardpoints.find(h => h.id === hpId)?.defaultItem ?? null; },
  isComponentOn: (hpName) => get().componentStates[hpName] !== false,
  hasChanges: () => get().overrides.size > 0,
  getWeaponHardpoints: () => get().hardpoints.filter(hp => WEAPON_CATS.has(hp.resolvedCategory)),
  getSystemHardpoints: () => get().hardpoints.filter(hp => SYSTEM_CATS.has(hp.resolvedCategory)),

  loadShip: async (id, buildParam) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/ships/" + encodeURIComponent(id));
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      const data = json.data; const sd = data?.ship;

      // Ship-level power from sc-unpacked
      const shipPower = json.shipPower;
      const shipPowerGen = shipPower?.gen ?? 0;
      const flightControllerPower = json.flightController ?? null;

      const shipInfo: ShipInfo = {
        id: data.id ?? "", reference: data.reference ?? "", name: data.name ?? "",
        localizedName: data.localizedName ?? null, manufacturer: data.manufacturer ?? null,
        gameVersion: data.gameVersion ?? "",
        scmSpeed: toNumOrNull(sd?.scmSpeed ?? sd?.maxSpeed),
        afterburnerSpeed: toNumOrNull(sd?.afterburnerSpeed),
        pitchRate: toNumOrNull(sd?.pitchRate), yawRate: toNumOrNull(sd?.yawRate),
        rollRate: toNumOrNull(sd?.rollRate),
        crew: sd?.maxCrew ?? null, cargo: sd?.cargo ?? null,
        role: sd?.role ?? null, focus: sd?.focus ?? null, size: sd?.size ?? null,
        accelForward: toNumOrNull(sd?.accelForward),
        accelBackward: toNumOrNull(sd?.accelBackward),
        accelUp: toNumOrNull(sd?.accelUp),
        accelDown: toNumOrNull(sd?.accelDown),
        accelStrafe: toNumOrNull(sd?.accelStrafe),
        boostSpeedForward: toNumOrNull(sd?.boostSpeedForward),
        boostSpeedBackward: toNumOrNull(sd?.boostSpeedBackward),
        boostMultUp: toNumOrNull(sd?.boostMultUp),
        boostMultStrafe: toNumOrNull(sd?.boostMultStrafe),
        boostedPitch: toNumOrNull(sd?.boostedPitch),
        boostedYaw: toNumOrNull(sd?.boostedYaw),
        boostedRoll: toNumOrNull(sd?.boostedRoll),
        mass: toNumOrNull(sd?.mass),
        hydrogenCapacity: toNumOrNull(sd?.hydrogenCapacity),
        quantumFuelCapacity: toNumOrNull(sd?.quantumFuelCapacity),
        shieldHpTotal: toNumOrNull(sd?.shieldHpTotal),
        powerGeneration: toNumOrNull(sd?.powerGeneration),
        hullHp: toNumOrNull(sd?.hullHp),
        deflectionPhysical: toNumOrNull(sd?.deflectionPhysical),
        deflectionEnergy: toNumOrNull(sd?.deflectionEnergy),
        deflectionDistortion: toNumOrNull(sd?.deflectionDistortion),
      };

      // Parse flatHardpoints with children
      const rawHps: any[] = json.flatHardpoints ?? [];
      const resolved: ResolvedHardpoint[] = rawHps.map((hp: any) => {
        const item = parseEquipped(hp.equippedItem);

        const rawChildren: any[] = hp.childWeapons ?? hp.children ?? [];
        const children: ResolvedChild[] = rawChildren.map((ch: any) => ({
          id: ch.id ?? "",
          hardpointName: ch.hardpointName ?? "",
          category: ch.category ?? "WEAPON",
          minSize: ch.minSize ?? 0,
          maxSize: ch.maxSize ?? 0,
          isFixed: ch.isFixed ?? false,
          equippedItem: parseEquipped(ch.equippedItem),
        })).filter((ch: ResolvedChild) => ch.hardpointName);

        return {
          id: hp.id ?? "", hardpointName: hp.hardpointName ?? "",
          originalCategory: hp.category ?? "OTHER",
          resolvedCategory: inferCategory(hp.category ?? "OTHER", item, hp.hardpointName ?? ""),
          minSize: hp.minSize ?? 0, maxSize: hp.maxSize ?? 0,
          isFixed: hp.isFixed ?? false, defaultItem: item, children,
        };
      }).filter((hp: ResolvedHardpoint) => USEFUL.has(hp.resolvedCategory) || hp.resolvedCategory === "COUNTERMEASURE");

      // Build param overrides
      let restored = new Map<string, EquippedItem | null>();
      if (buildParam) {
        try {
          const d = JSON.parse(atob(buildParam));
          if (typeof d === "object" && d) {
            for (const hp of resolved) {
              const ref = (d as any)[hp.hardpointName];
              if (ref === undefined) continue;
              if (ref === null) { restored.set(hp.id, null); continue; }
              const f = resolved.map(h => h.defaultItem).filter((i): i is EquippedItem => !!i).find(i => i.reference === ref || i.className === ref);
              if (f) restored.set(hp.id, f);
            }
          }
        } catch {}
      }

      // Initialize componentStates: all ON
      const states: Record<string, boolean> = {};
      for (const hp of resolved) {
        states[hp.hardpointName] = true;
        for (const ch of hp.children) {
          states[ch.hardpointName] = true;
        }
      }

      set({
        shipId: id, shipInfo, hardpoints: resolved, overrides: restored,
        componentStates: states, flightMode: "SCM",
        instancePower: {}, shipPowerGen, flightControllerPower,
        allocatedPower: { ...ZERO_ALLOC },
        isLoading: false, error: null,
      });
      setTimeout(() => get().autoAllocatePower(), 0);
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  },

  equipItem: (hpId, item) => { set(s => { const n = new Map(s.overrides); n.set(hpId, item); return { overrides: n }; }); setTimeout(() => get().autoAllocatePower(), 0); },
  clearSlot: (hpId) => { set(s => { const n = new Map(s.overrides); n.set(hpId, null); return { overrides: n }; }); setTimeout(() => get().autoAllocatePower(), 0); },
  toggleComponent: (hpName) => { set(s => ({ componentStates: { ...s.componentStates, [hpName]: s.componentStates[hpName] === false } })); setTimeout(() => get().autoAllocatePower(), 0); },
  resetAll: () => { const fresh: Record<string, boolean> = {}; for (const hp of get().hardpoints) { fresh[hp.hardpointName] = true; for (const ch of hp.children) fresh[ch.hardpointName] = true; } set({ overrides: new Map(), componentStates: fresh, flightMode: "SCM" as FlightMode, instancePower: {}, allocatedPower: { ...ZERO_ALLOC } }); setTimeout(() => get().autoAllocatePower(), 0); },
  setFlightMode: (mode) => { set({ flightMode: mode }); setTimeout(() => get().autoAllocatePower(), 0); },

  setInstancePower: (hardpointName, pips) => {
    const s = get();
    const st = s.getStats();
    const inst = st.powerNetwork.instances.find(i => i.hardpointName === hardpointName);
    if (!inst) return;

    const clamped = Math.max(0, Math.min(inst.totalPips, pips));
    const diff = clamped - (s.instancePower[hardpointName] ?? 0);

    // Check if we have enough free power
    if (diff > 0 && diff > st.powerNetwork.freePoints) return;

    set({ instancePower: { ...s.instancePower, [hardpointName]: clamped } });
  },

  // Legacy compatibility
  setAllocatedPower: (cat, points) => {
    // No-op in the new model — use setInstancePower instead
  },

  autoAllocatePower: () => {
    const s = get();
    // Compute stats with zero allocation to get instance list
    const probe = computeStats(s.hardpoints, s.overrides, s.componentStates, s.flightMode, {}, s.shipInfo, s.shipPowerGen, s.flightControllerPower);
    const total = probe.powerNetwork.totalOutput;
    const newAlloc: Record<string, number> = {};
    let rem = total;

    // Phase 1: Give each active component its minimum (at least 1 pip if it has pips)
    for (const inst of probe.powerNetwork.instances) {
      if (!inst.isOn) continue;
      if (inst.totalPips === 0) continue;
      // Find the minimum pips needed: first range with range > 0
      let minPips = 1; // At least 1 pip for active components
      for (const r of inst.ranges) {
        if (r.range > 0) {
          minPips = Math.max(1, r.start > 0 ? r.start : 1);
          break;
        }
      }
      minPips = Math.min(minPips, inst.totalPips, rem);
      newAlloc[inst.hardpointName] = minPips;
      rem -= minPips;
    }

    // Phase 2: Distribute remaining pips evenly across active instances
    if (rem > 0) {
      const active = probe.powerNetwork.instances.filter(i => i.isOn && i.totalPips > 0);
      let stuck = 0;
      let i = 0;
      while (rem > 0 && stuck < active.length) {
        const inst = active[i % active.length];
        const current = newAlloc[inst.hardpointName] ?? 0;
        if (current < inst.totalPips) {
          newAlloc[inst.hardpointName] = current + 1;
          rem--;
          stuck = 0;
        } else {
          stuck++;
        }
        i++;
      }
    }

    // Also compute category-level allocatedPower for backward compat
    const catAlloc: Record<PowerCategory, number> = { ...ZERO_ALLOC };
    for (const inst of probe.powerNetwork.instances) {
      const pips = newAlloc[inst.hardpointName] ?? 0;
      catAlloc[inst.category] += pips;
    }

    set({ instancePower: newAlloc, allocatedPower: catAlloc });
  },

  encodeBuild: () => { const { hardpoints, overrides } = get(); if (overrides.size === 0) return ""; const e: Record<string, string | null> = {}; for (const [hpId, item] of overrides.entries()) { const hp = hardpoints.find(h => h.id === hpId); if (hp) e[hp.hardpointName] = item?.reference ?? null; } return btoa(JSON.stringify(e)); },
}));
