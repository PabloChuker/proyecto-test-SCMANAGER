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
import { computeCoolingDemand, computeCoolerSupply } from "@/lib/cooling";

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
  /** Hull / armor resistances + base signatures (from ship_resistances table) */
  resistances: ShipResistances | null;
}

/** Hull resistances, damage multipliers, and base signatures.
 *  Source: ship_resistances table (populated from scunpacked raw ship data).
 *  - dmgMult*: damage multiplier (< 1 means resistance, e.g. 0.75 = 25% reduction)
 *  - sigMult*: signature multiplier applied to emissions (stealth variants = lower)
 *  - base*Signature: baseline ship emissions before loadout
 *  - crossSection*: physical dimensions affecting detectability
 *  - *Total*: computed total emissions in different flight modes
 */
export interface ShipResistances {
  armorHp: number | null;
  dmgMultPhysical: number | null; dmgMultEnergy: number | null; dmgMultDistortion: number | null;
  dmgMultThermal: number | null; dmgMultBiochemical: number | null; dmgMultStun: number | null;
  sigMultCrossSection: number | null; sigMultInfrared: number | null; sigMultElectromagnetic: number | null;
  penResistBase: number | null; penResistPhysical: number | null; penResistEnergy: number | null; penResistDistortion: number | null;
  baseEmSignature: number | null; baseIrSignature: number | null; baseCsSignature: number | null;
  crossSectionX: number | null; crossSectionY: number | null; crossSectionZ: number | null;
  emTotalShields: number | null; emTotalQuantum: number | null;
  irTotalShields: number | null; irTotalQuantum: number | null;
}

export type FlightMode = "SCM" | "NAV";

/** Power categories for UI grouping */
export type PowerCategory = "weapons" | "thrusters" | "shields" | "quantum" | "radar" | "coolers" | "lifesupport" | "qig";
export const POWER_CATEGORIES: PowerCategory[] = ["weapons", "thrusters", "shields", "quantum", "radar", "coolers", "lifesupport", "qig"];

const CAT_TO_POWER: Record<string, PowerCategory> = {
  WEAPON: "weapons", TURRET: "weapons", MISSILE_RACK: "weapons",
  SHIELD: "shields", COOLER: "coolers", QUANTUM_DRIVE: "quantum",
  MINING: "weapons", SALVAGE: "weapons", UTILITY: "weapons", RADAR: "radar",
  LIFE_SUPPORT: "lifesupport",
  // Fase N.4 (2026-04-24): QIG tiene SU PROPIO bucket de power. Antes lo
  // colapsé con "quantum" pensando que compartían subsistema, pero el power
  // grid del LoadoutBuilder renderiza UNA columna por bucket y los QIGs
  // aparecían como "un segundo QT drive" con el mismo ícono. Separándolos
  // queda claro que Burke/Captor/Reynie son interdictores, no motores de salto.
  QIG: "qig",
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
  /**
   * Sub-componentes físicos detrás de esta columna combinada (Fase U.5b,
   * 2026-04-29). Solo se usa hoy para la columna de shields: la ship Avenger
   * Titan tiene 2 generadores que comparten una columna pero queremos poder
   * apagarlos individualmente. Cada entry corresponde a un hardpoint físico
   * con sus pips de minimum draw. La zona "min" del render se divide en
   * sub-bloques proporcionales a `pipsForMin` y cada sub-bloque togglea su
   * propio hardpoint. Si la columna no es combinada, queda undefined.
   */
  subShields?: Array<{
    hardpointName: string;
    componentName: string;
    pipsForMin: number;
    regenFull: number;
    isOn: boolean;
  }>;
}

export interface CategoryPowerInfo { minDraw: number; allocated: number; componentCount: number; activeCount: number; }
export interface PowerNetworkState {
  totalOutput: number; totalAllocated: number; totalMinDraw: number;
  /** Actual power draw interpolated from pip allocation (reflects component differences) */
  totalActualDraw: number;
  consumptionPercent: number; freePoints: number; isOverloaded: boolean;
  categories: Record<PowerCategory, CategoryPowerInfo>;
  activeCategories: PowerCategory[];
  /** Per-instance power data for the grid UI */
  instances: ComponentPowerInstance[];
}

export interface ComputedStats {
  totalDps: number; totalAlpha: number;
  /** Alpha damage solo de hardpoints WEAPON/TURRET (excluye misiles). */
  weaponAlpha: number;
  /** Alpha damage sumado de MISSILE_RACK children. */
  missileAlpha: number;
  burstDps: number; sustainedDps: number;
  shieldHp: number; shieldRegen: number;
  powerOutput: number; powerDraw: number; powerBalance: number;
  coolingRate: number; thermalOutput: number; thermalBalance: number;
  emSignature: number; irSignature: number;
  /** Cross-section (CS): VerseTools §5.3. Hull base × armor sigMultCS, o estimación. */
  csSignature: number;
  /** True cuando csSignature es estimación (no valor validado in-game). */
  csIsEstimate: boolean;
  effectiveSpeed: number | null; effectiveSpeedLabel: string;
  powerNetwork: PowerNetworkState;
  weaponMaxPips: number;
  summary: { weapons: number; missiles: number; shields: number; coolers: number; powerPlants: number; quantumDrives: number; activeComponents: number; totalComponents: number; };
}

// =============================================================================
// Category inference
// =============================================================================

const TYPE_TO_CAT: Record<string, string> = {
  WEAPON: "WEAPON", TURRET: "TURRET", MISSILE: "MISSILE_RACK", MISSILE_RACK: "MISSILE_RACK",
  SHIELD: "SHIELD", POWER_PLANT: "POWER_PLANT", COOLER: "COOLER", QUANTUM_DRIVE: "QUANTUM_DRIVE",
  // Jump Drive (Fase P.1) — categoría propia para que el LoadoutBuilder pueda
  // renderizarlo como slot separado del QT drive en el widget QUANTUM.
  JUMP_DRIVE: "JUMP_DRIVE",
  MINING_LASER: "MINING", MINING: "MINING", MINING_MODIFIER: "MINING",
  SALVAGE: "SALVAGE", SALVAGE_MODIFIER: "SALVAGE", SALVAGE_HEAD: "SALVAGE", SALVAGE_LASER: "SALVAGE",
  TRACTOR_BEAM: "UTILITY", EMP: "UTILITY",
  RADAR: "RADAR", COUNTERMEASURE: "COUNTERMEASURE",
  LIFE_SUPPORT: "LIFE_SUPPORT", LifeSupportGenerator: "LIFE_SUPPORT",
  // Fase N (2026-04-24): interdictores cuánticos. El API los emite con
  // type="QIG" y category="QIG"; acá aseguramos que mapeen a "QIG" y no caigan
  // al patrón genérico /quantum/ que los tragaría como QUANTUM_DRIVE.
  QIG: "QIG", QuantumInterdictionGenerator: "QIG",
};
const NAME_PATTERNS: [RegExp, string][] = [
  [/turret/i, "TURRET"], [/weapon|gun|cannon|gatling|repeater|scattergun|gimbal/i, "WEAPON"],
  [/missile|rocket|msd-/i, "MISSILE_RACK"], [/shield/i, "SHIELD"],
  [/power_plant|powerplant|power plant/i, "POWER_PLANT"], [/cool/i, "COOLER"],
  // QIG DEBE ir antes de /quantum/ — el hardpoint name
  // "hardpoint_quantum_interdiction_generator" contiene la palabra "quantum"
  // pero no es un QT drive. Idem QED/QDMP (los del Reynie/Burke/Captor).
  [/interdict|\bqed\b|\bqdmp\b|\bqig\b/i, "QIG"],
  // JD-specific name patterns ANTES del genérico /quantum/ para no caer al
  // bucket QT drive. Convención scunpacked: className arranca con JDRV_.
  [/\bjump.?drive\b|\bjdrv\b/i, "JUMP_DRIVE"],
  [/quantum|qdrive/i, "QUANTUM_DRIVE"],
  [/salvage|scraper|reclaim/i, "SALVAGE"],
  [/tractor.?beam|cargo.?beam/i, "UTILITY"],
  [/mining/i, "MINING"],
  [/radar|scanner/i, "RADAR"], [/life.?support/i, "LIFE_SUPPORT"],
];
const USEFUL = new Set(["WEAPON", "TURRET", "MISSILE_RACK", "SHIELD", "POWER_PLANT", "COOLER", "QUANTUM_DRIVE", "JUMP_DRIVE", "MINING", "SALVAGE", "UTILITY", "RADAR", "COUNTERMEASURE", "LIFE_SUPPORT", "QIG"]);

// Patrones industriales que DEBEN ganarle a una categoría genérica "WEAPON"
// devuelta por la API. Ej: Mole/Prospector/Golem traen los brazos mineros con
// hpType "Weapon" → sin este chequeo quedan como WEAPON y nunca entran al
// widget MINING. Idem Reclaimer/Fortune/Salvation con SALVAGE. Y QIG para
// que el nombre "quantum_interdiction" no caiga al bucket QUANTUM_DRIVE.
const INDUSTRIAL_OVERRIDE: [RegExp, string][] = [
  [/salvage|scraper|reclaim/i, "SALVAGE"],
  [/mining/i, "MINING"],
  [/interdict|\bqed\b|\bqdmp\b|\bqig\b/i, "QIG"],
];

function inferCategory(category: string, item: EquippedItem | null, hpName: string): string {
  // Detect turrets by item name even when category is WEAPON
  if (category === "WEAPON" && item?.name && /turret/i.test(item.name)) return "TURRET";
  // Override industrial: si el nombre del hardpoint o del ítem grita "mining"/"salvage",
  // pisa la categoría que venga (WEAPON, OTHER, TURRET, etc).
  const probe = `${hpName} ${item?.name ?? ""} ${item?.type ?? ""}`;
  for (const [re, cat] of INDUSTRIAL_OVERRIDE) { if (re.test(probe)) return cat; }
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
const SYSTEM_CATS = new Set(["SHIELD", "POWER_PLANT", "COOLER", "QUANTUM_DRIVE", "JUMP_DRIVE", "MINING", "SALVAGE", "UTILITY", "LIFE_SUPPORT", "QIG"]);

function emptyCat(): CategoryPowerInfo { return { minDraw: 0, allocated: 0, componentCount: 0, activeCount: 0 }; }

/**
 * Combine multiple power plant outputs into a single effective total,
 * applying in-game diminishing returns.
 *
 * Empirical formula (2026-04 — validada con Erkul):
 *
 * Rama A — Plantas MIXTAS (ratings distintos):
 *     Total = floor(bestRating * 0.95) + floor( sum(rest) / 3 )
 *   La mejor paga un ~5% de overhead y cada planta extra aporta ~⅓ de
 *   su rating al bus compartido (truncado, no redondeado).
 *
 * Rama B — Plantas IDÉNTICAS (todas mismo rating r):
 *     Total = floor(r * factor(n))     con factor dependiente de n:
 *       n=1 → 1.0    (single plant → full rating)
 *       n=2 → 1.24   (recalibrado con JS-400 [21,21]→26 y Bolide [20,20]→24)
 *       n=3 → 1.65
 *       n≥4 → 0.95 + 0.25*(n-1) + 0.10*(n-1)*(n-2)  (extrapolación cuadrática)
 *
 * Validation (rating → effective total, todos verificados en Erkul):
 *   [21, 20]        → 25   (rama A, mixta: 19 + floor(20/3) = 19 + 6)
 *   [21, 19]        → 25   (rama A, mixta: 19 + floor(19/3) = 19 + 6)
 *   [21, 20, 19]    → 32   (rama A, mixta: 19 + floor(39/3) = 19 + 13)
 *   [20, 20]        → 24   (rama B, idénticas n=2: floor(20*1.24))   ← Asgard stock
 *   [21, 21]        → 26   (rama B, idénticas n=2: floor(21*1.24))   ← 2× JS-400
 *   [20, 20, 20]    → 33   (rama B, idénticas n=3: floor(20*1.65))   ← Paladin
 */
function combinePowerPlantOutputs(outputs: number[]): number {
  if (outputs.length === 0) return 0;
  // Sort descending so index 0 is the best plant.
  const sorted = [...outputs].sort((a, b) => b - a);
  const n = sorted.length;
  const best = sorted[0];

  // Rama B — todas las plantas idénticas: factor empírico por cantidad.
  const allIdentical = sorted.every((r) => r === best);
  if (allIdentical) {
    let factor: number;
    if (n === 1) factor = 1.0;   // single plant → full rating
    else if (n === 2) factor = 1.24;  // recalibrado: [20,20]→24, [21,21]→26
    else if (n === 3) factor = 1.65;
    else factor = 0.95 + 0.25 * (n - 1) + 0.10 * (n - 1) * (n - 2);
    return Math.max(0, Math.floor(best * factor));
  }

  // Rama A — plantas mixtas: best paga 5% y cada extra aporta ~⅓.
  const rest = sorted.slice(1);
  const restSum = rest.reduce((acc, v) => acc + v, 0);
  const effectiveBest = Math.floor(best * 0.95);
  const effectiveRest = Math.floor(restSum / 3);
  return Math.max(0, effectiveBest + effectiveRest);
}

function computeStats(
  hardpoints: ResolvedHardpoint[], overrides: Map<string, EquippedItem | null>,
  componentStates: Record<string, boolean>, flightMode: FlightMode,
  instancePower: Record<string, number>,  // hardpointName -> allocated pips
  shipInfo: ShipInfo | null,
  shipPowerGen: number,  // from ship-power-data.json
  flightControllerPower: any | null,  // from power-network-lookup (Controller_Flight_*)
  pools: Record<string, number> | null,  // pool pip counts from ship_power_reference
  usedGroupedScm: Record<string, number> | null,  // per-category pip usage from game data
  emShieldsRef: number | null = null,  // ship_power_reference.em_shields (CIG aggregate)
  irShieldsRef: number | null = null,  // ship_power_reference.ir_shields (CIG aggregate)
): ComputedStats {
  let totalDps = 0, totalSustainedDps = 0, totalAlpha = 0, shieldHp = 0, shieldRegen = 0;
  // Alpha separado para poder mostrar armas vs misiles por separado en el UI.
  let weaponAlpha = 0, missileAlpha = 0;
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
    const alpha = pickNum(s, "alphaDamage", "damage");
    const fireRate = pickNum(s, "fireRate");
    let dps = pickNum(s, "dps");
    if (dps === 0 && alpha > 0 && fireRate > 0) dps = alpha * (fireRate / 60);
    totalDps += dps;
    totalAlpha += alpha;
    // Fase W.2 (2026-05-02): sustainedDps ahora viene calculado por arma
    // desde el endpoint /api/ships/[id] usando la fórmula de VerseTools
    // (duty cycle por regen energético / overheat balístico). Si el campo
    // no está presente (componente sin data o item sintético), fallback
    // al burst DPS — que es el comportamiento previo. Esto fixea el caso
    // donde el panel mostraba sustained = burst. Ahora burst = sum(dps),
    // sustained = sum(dps × ratio_per_weapon). Ej: arma energy con
    // magazine 75, regenRate 15/s, cooldown 1s → ratio típico ~0.6.
    const sustained = pickNum(s, "sustainedDps");
    totalSustainedDps += sustained > 0 ? sustained : dps;
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
  let weaponTotalIndividualPips = 0;  // sum of each weapon's totalPips
  const WEAPON_POWER_ID = "__weapons_combined__";

  // ── Shields (Fase U.5b, 2026-04-29): una sola columna combinada estilo HUD,
  // pero la "min zone" se subdivide en N sub-bloques (uno por shield físico)
  // para poder togglear cada generador por separado. Acumulamos los datos
  // que necesita el render: pMin/pMax suma, pips totales, regen full por hp,
  // y un array `subShieldsInfo` que se inyecta en la instance combinada.
  let shieldPowerMin = 0;
  let shieldPowerMax = 0;
  let shieldEmMax = 0;
  let shieldIrMax = 0;
  let shieldGenPower = 0;
  let shieldGenCoolant = 0;
  let shieldCount = 0;
  let shieldActiveCount = 0;
  let shieldTotalIndividualPips = 0;
  let shieldFirstHpName: string | null = null;
  const SHIELD_POWER_ID = "__shields_combined__";
  // Por-shield: necesario para escalar regen y para subdividir la min-zone.
  const shieldRegenByHp: Record<string, number> = {};
  const subShieldsInfo: Array<{
    hardpointName: string;
    componentName: string;
    pipsForMin: number;
    regenFull: number;
    isOn: boolean;
  }> = [];

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

      if (pn?.pips && pn.pips > 0) {
        // PRIMARY: powerNetwork pips from game datamining (RegisterRange)
        // But if pMax implies more pips (e.g. radar: pips=1, pMax=5), use the larger
        const pnPMax = pn.pMax ?? 0;
        const impliedPips = pnPMax > 0 ? Math.ceil(pnPMax) : 0;
        totalPips = Math.min(8, Math.max(pn.pips, impliedPips));
        powerMin = dbMin > 0 ? dbMin : (pn.pMin ?? 0);
        powerMax = dbMax > 0 ? dbMax : (pn.pMax ?? 0);
      } else if (dbMax > 0) {
        // Fallback: derive from DB powerDrawMax
        totalPips = Math.min(8, Math.max(1, Math.ceil(dbMax)));
        powerMin = dbMin;
        powerMax = dbMax;
      } else if (pn && pn.pMax > 0) {
        // Fallback: derive from powerNetwork pMax
        totalPips = Math.min(8, Math.max(1, Math.ceil(pn.pMax)));
        powerMin = pn.pMin ?? 0;
        powerMax = pn.pMax;
      } else {
        // Last resort: single powerDraw from componentStats
        const pd = pickNum(s, "powerDraw", "powerBase");
        if (pd > 0) {
          totalPips = Math.min(8, Math.max(1, Math.ceil(pd)));
          powerMin = pd;
          powerMax = pd;
        }
      }

      const allocPips = instancePower[hp.hardpointName] ?? 0;

      cats[pCat].componentCount++;
      if (isOn) {
        cats[pCat].activeCount++;
        // Use the derived powerMin directly — 0 is valid (e.g. energy weapons at idle).
        // Only fallback to pn/componentStats if no pip derivation happened (totalPips==0).
        cats[pCat].minDraw += totalPips > 0 ? powerMin : (pn?.pMin ?? pickNum(s, "powerDraw", "powerBase"));
      }
      cats[pCat].allocated += allocPips;

      // WEAPONS → accumulate into single combined column (game mechanic: 1 column for all weapons)
      if (pCat === "weapons") {
        if (totalPips > 0) {
          weaponPowerMin += powerMin;
          weaponPowerMax += powerMax;
          weaponEmMax += pn?.em ?? pickNum(s, "emSignature");
          weaponIrMax += pn?.ir ?? pickNum(s, "irSignature");
          weaponTotalIndividualPips += totalPips;
          weaponCount++;
          if (isOn) weaponActiveCount++;
        }
      } else if (pCat === "shields") {
        // SHIELDS → columna combinada (Fase U.5b). Acumulamos para el push
        // único y además registramos el sub-shield para que el render
        // subdivida la min-zone en N bloques (uno por hardpoint físico).
        // OJO: este branch corre ANTES del `if (!isOn) continue`, así que
        // sub-shields apagados también se registran (con isOn=false) — eso
        // es lo que queremos para que aparezcan en el render aunque off.
        if (totalPips > 0) {
          shieldPowerMin += powerMin;
          shieldPowerMax += powerMax;
          shieldEmMax += pn?.em ?? pickNum(s, "emSignature");
          shieldIrMax += pn?.ir ?? pickNum(s, "irSignature");
          shieldGenPower += pn?.genP ?? 0;
          shieldGenCoolant += pn?.genC ?? 0;
          shieldTotalIndividualPips += totalPips;
          shieldCount++;
          if (isOn) shieldActiveCount++;
          if (!shieldFirstHpName) shieldFirstHpName = hp.hardpointName;
          // Pips que ocupa este shield en la min-zone visual. Default = ceil(powerMin)
          // (lo mínimo que el shield necesita para mantenerse encendido).
          // Si powerMin es 0 (raro), reservamos al menos 1 pip para que tenga
          // celda toggleable.
          const pipsForMin = Math.max(1, Math.ceil(powerMin));
          // Capturamos regen full ahora (acá tenemos `s` accesible aunque el
          // shield esté apagado). El regen del item es independiente de su
          // estado on/off — es propiedad del componente.
          const regenFull = pickNum(s, "shieldRegen", "regenRate");
          subShieldsInfo.push({
            hardpointName: hp.hardpointName,
            componentName: item.name,
            pipsForMin,
            regenFull,
            isOn,
          });
          // shieldRegenByHp lo dejamos también acá — antes se llenaba en el
          // bloque `if (cat === "SHIELD")` que está después de !isOn continue.
          shieldRegenByHp[hp.hardpointName] = regenFull;
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
    // If parent is overridden with a direct weapon (not turret/rack), skip children
    const parentIsTurretOrRack = (cat === "TURRET" || cat === "MISSILE_RACK")
      && (!overrides.has(hp.id) || (item?.type && /turret|gimbal|rack/i.test(item.type + " " + (item.name ?? ""))));
    if (parentIsTurretOrRack && hp.children.length > 0) {
      if (!pn) accumBase(s);
      for (const child of hp.children) {
        const childOn = componentStates[child.hardpointName] !== false;
        if (!childOn) continue;
        // Check overrides for child items (user may have swapped the weapon/missile)
        const cItem = overrides.has(child.id)
          ? (overrides.get(child.id) ?? null)
          : child.equippedItem;
        if (!cItem) continue;
        accumDps(cItem.componentStats);
        // Split alpha by parent kind: TURRET → weaponAlpha, MISSILE_RACK → missileAlpha.
        // Nota: accumDps ya sumó este alpha a totalAlpha (no se duplica ahí).
        const childAlpha = pickNum(cItem.componentStats, "alphaDamage", "damage");
        if (cat === "MISSILE_RACK") missileAlpha += childAlpha;
        else weaponAlpha += childAlpha;
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
          // Derive child weapon pips same way as parent
          const childPips = childPn.pips && childPn.pips > 0
            ? Math.min(8, Math.max(childPn.pips, Math.ceil(childPn.pMax)))
            : Math.min(8, Math.max(1, Math.ceil(childPn.pMax)));
          weaponTotalIndividualPips += childPips;
          weaponCount++;
          if (childOn) weaponActiveCount++;
        }
      }
    } else {
      if (cat === "WEAPON" || cat === "TURRET") {
        accumDps(s);
        weaponAlpha += pickNum(s, "alphaDamage", "damage");
      }
      if (cat === "MISSILE_RACK") {
        const a = pickNum(s, "alphaDamage", "damage");
        totalAlpha += a;
        missileAlpha += a;
      }
      if (cat === "SHIELD") {
        // shieldHp solo cuenta cuando el shield está ON (este bloque corre
        // tras `if (!isOn) continue`). El regen full ya se capturó arriba en
        // el branch `else if (pCat === "shields")` para que sub-shields
        // apagados también queden con su regenFull en subShieldsInfo.
        shieldHp += pickNum(s, "shieldHp", "maxHp");
      }
      if (cat === "COOLER") { coolingRate += pickNum(s, "coolingRate"); }
      if (!pn) accumBase(s);
    }
  }

  // ── Push synthetic thrusters column (from FlightController power data) ──
  // Thrusters are not regular hardpoints, so we inject a single column based on
  // the ship's Controller_Flight_* entry in power-network-lookup.json.
  // Fallback: if flightControllerPower is null, use usedGroupedScm.FlightController.
  const THRUSTERS_POWER_ID = "__thrusters_combined__";
  const ugScmThr = usedGroupedScm?.FlightController ?? 0;
  if (flightControllerPower && (flightControllerPower.pMax ?? 0) > 0) {
    const thrPMin = Number(flightControllerPower.pMin ?? 0);
    const thrPMax = Number(flightControllerPower.pMax ?? 0);
    const thrPoolPips = pools?.FlightController ?? 0;
    // Use the best available pip count
    const thrustPips = Math.min(8, Math.max(
      ugScmThr,
      thrPoolPips > 0 ? thrPoolPips : 0,
      Math.max(1, Math.ceil(thrPMax)),
    ));
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
  } else if (ugScmThr > 0) {
    // No flightController data in JSON, but usedGroupedScm tells us the pip count
    const thrustPips = Math.min(8, ugScmThr);
    const thrustAllocPips = instancePower[THRUSTERS_POWER_ID] ?? 0;

    cats.thrusters.componentCount += 1;
    cats.thrusters.activeCount += 1;
    cats.thrusters.minDraw += 1;  // conservative minimum
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
      powerMin: 1,
      powerMax: ugScmThr,  // use pip count as approximate power draw
      genPower: 0,
      genCoolant: 0,
      emMax: 0,
      irMax: 0,
      isOn: true,
    });
  }

  // ── Push single combined weapons column ──
  if (weaponCount > 0) {
    // Best pip source priority: usedGroupedScm > sum of individual pips > pools > ceil(pMax)
    const ugScmWpn = usedGroupedScm?.WeaponGun ?? 0;
    const wpnPoolPips = pools?.WeaponGun ?? 0;
    const combinedPips = Math.min(8, Math.max(
      ugScmWpn,
      weaponTotalIndividualPips,
      wpnPoolPips,
      Math.max(1, Math.ceil(weaponPowerMax)),
    ));
    // Fase Q.3 + bugfix: distinguir "user nunca tocó pips" (default = full
    // alloc, DPS al 100%) de "user puso 0 explícitamente" (colapsa DPS a 0).
    // Antes asumíamos 0 si era undefined, lo que rompía el DPS por default
    // hasta que el usuario movía el slider — ahora full alloc es el default.
    const weaponAllocRaw = instancePower[WEAPON_POWER_ID];
    const weaponAllocPips = weaponAllocRaw !== undefined ? weaponAllocRaw : combinedPips;
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
      powerMin: weaponPowerMin,  // sum of individual weapon minimums (energy weapons draw at idle)
      powerMax: weaponPowerMax,
      genPower: 0,
      genCoolant: 0,
      emMax: weaponEmMax,
      irMax: weaponIrMax,
      isOn: weaponActiveCount > 0,
    });

    // Pablo (2026-04-25): GATE BINARIO. El DPS reportado debe ser:
    //   - Suma cruda de las armas si hay energía Y al menos un weapon ON
    //   - 0 si pips=0 explícito o todas las armas off
    // Antes escalaba lineal por el ratio de pips (0.5 pips → DPS al 50%),
    // pero el feedback de Pablo es que la métrica que importa es "tengo
    // armas operativas o no", no "qué porcentaje de energía les puse". Si
    // mañana queremos volver al modelo lineal Erkul-style se restaura
    // multiplicando por (effectivePips / combinedPips) en vez de 0/1.
    const weaponSystemActive = weaponActiveCount > 0 && weaponAllocPips > 0;
    const weaponPowerRatio = weaponSystemActive ? 1 : 0;
    totalDps          *= weaponPowerRatio;
    totalSustainedDps *= weaponPowerRatio;
    totalAlpha        *= weaponPowerRatio;
    weaponAlpha       *= weaponPowerRatio;
  } else {
    // No hay armas: DPS y alpha en 0 por definición.
    totalDps = 0;
    totalSustainedDps = 0;
    totalAlpha = 0;
    weaponAlpha = 0;
  }

  // ── Push columna combinada de shields (Fase U.5b, 2026-04-29) ──────────────
  // Volvemos a UNA columna pero con `subShields[]` adentro. La min-zone del
  // render se subdivide en N sub-bloques (uno por hardpoint físico) — cada
  // uno toggleable por separado. Conserva el comportamiento HUD-style del
  // juego (todos los shields como un único conjunto) pero permite apagar
  // un generador individual sin tocar los otros.
  if (shieldCount > 0) {
    const shieldAllocPips = instancePower[SHIELD_POWER_ID] ?? 0;
    const ugScmShld = usedGroupedScm?.Shield ?? 0;
    const shldPoolPips = pools?.Shield ?? 0;
    const combinedShieldPips = Math.min(8, Math.max(
      ugScmShld,
      shieldTotalIndividualPips,
      shldPoolPips,
      Math.max(1, Math.ceil(shieldPowerMax)),
    ));
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
      subShields: subShieldsInfo,
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

  // Compute actual power draw per instance based on pip allocation.
  // At 0 pips → powerMin, at max pips → powerMax. Linear interpolation.
  // This makes energy weapons draw more at high allocation vs ballistic at constant low draw.
  let totalActualDraw = 0;
  for (const inst of instances) {
    if (!inst.isOn || inst.totalPips === 0) continue;
    const ratio = inst.allocatedPips / inst.totalPips;
    totalActualDraw += inst.powerMin + (inst.powerMax - inst.powerMin) * ratio;
  }
  totalActualDraw = Math.round(totalActualDraw * 100) / 100;

  // Consumption % based on actual pip-based draw (not just idle min draw)
  const consumptionPercent = totalPO > 0 ? Math.round((totalActualDraw / totalPO) * 100) : 0;
  const activeCategories = POWER_CATEGORIES.filter(c => cats[c].componentCount > 0);

  if (flightMode === "NAV") {
    totalDps = 0; totalSustainedDps = 0; totalAlpha = 0; weaponAlpha = 0; missileAlpha = 0; shieldRegen = 0; shieldHp = 0;
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

  // ── Signature scaling with pip allocation (F2.1 + F2.5) ───────────────────
  // In Star Citizen, EM/IR emissions scale linearly with power allocation
  // from 0 at idle up to em_max at full pips. The loop above accumulated
  // "max potential" emissions; we rebuild from instances[] with pip ratios.
  //
  // F2.5 (2026-04-17): Do NOT add ship_resistances.baseEmSignature on top.
  // In the scunpacked data BaseEmSignature == em_shields total (sum of all
  // component emissions at full pips) — they are the same aggregate value,
  // not a separate hull baseline. Previously we summed instance emissions
  // AND added baseEm, which double-counted and produced EM ~2-3x higher
  // than Erkul. We keep sigMult (stealth variant multiplier like Ghost/
  // Stalker/Renegade) applied to the scaled component sum. If the ship has
  // no component instances (edge case, e.g. empty hardpoints), we fall
  // back to baseEm/baseIr so a bare-hull ship still shows its intrinsic
  // signature.
  let emSigScaled = 0, irSigScaled = 0;
  for (const inst of instances) {
    if (!inst.isOn) continue;
    const ratio = inst.totalPips > 0
      ? Math.min(1, Math.max(0, inst.allocatedPips / inst.totalPips))
      : 1;
    emSigScaled += (inst.emMax ?? 0) * ratio;
    irSigScaled += (inst.irMax ?? 0) * ratio;
  }
  // Power plants don't appear in instances[] (no pip slider). Reañadir
  // su emisión cuando están ON.
  //
  // Fase W.4 (2026-05-02): según VerseTools la EM de los PP escala con la
  // utilización de potencia (PP em = emMax × Total Power Used / Total Output).
  // Antes lo sumábamos full siempre, sobreestimando cuando hay pocos pips
  // usados. El factor de utilización lo calculamos abajo con totalPO+
  // totalActualDraw que ya están disponibles. IR de PP queda full porque
  // VerseTools no especifica scaling para IR de PP (los coolers dominan).
  const ppUtilization = totalPO > 0
    ? Math.min(1, Math.max(0, totalActualDraw / totalPO))
    : 0;
  for (const hp of hardpoints) {
    if (hp.resolvedCategory !== "POWER_PLANT") continue;
    const item = overrides.has(hp.id) ? (overrides.get(hp.id) ?? null) : hp.defaultItem;
    if (!item) continue;
    const isOn = componentStates[hp.hardpointName] !== false;
    if (!isOn) continue;
    const pn = item.powerNetwork;
    const ppEm = pn?.em ?? pickNum(item.componentStats, "emSignature");
    const ppIr = pn?.ir ?? pickNum(item.componentStats, "irSignature");
    emSigScaled += ppEm * ppUtilization;
    irSigScaled += ppIr;
  }
  const _res = shipInfo?.resistances;
  const baseEm = _res?.baseEmSignature ?? 0;
  const baseIr = _res?.baseIrSignature ?? 0;
  const emMult = _res?.sigMultElectromagnetic ?? 1;
  const irMult = _res?.sigMultInfrared ?? 1;
  // Fase P.4 (2026-04-25): si la nave tiene hardpoints pero el usuario apagó
  // todo, emisiones = 0. El fallback a baseEm/baseIr SOLO aplica para naves
  // sin hardpoints en absoluto (edge case de bare hull / loading). Antes
  // mostraba el baseline aunque todo estuviera off, lo cual no se condice
  // con un casco realmente apagado.
  const hasAnyHp = hardpoints.length > 0;
  emSig = hasAnyHp
    ? emSigScaled * emMult
    : baseEm * emMult;

  // F2.6 (2026-04-17): IR signature via ratio against CIG's ship-level
  // aggregate. Per-component irMax values (e.g. Bracer cooler = 7260)
  // over-count when summed naively because CIG's IrShields aggregate
  // pre-applies cooler heat-dissipation attenuation that per-component
  // summation can't replicate (scunpacked only exposes EmGroupsShields,
  // no IrGroupsShields breakdown).
  //
  // Fix: scale irShieldsRef by the EM activity ratio. Assumes IR emissions
  // scale proportionally to EM with pip allocation, which holds well
  // enough for combat loadouts. Validated vs Erkul: Avenger Titan
  // 8714 × (emSigScaled/24227) × 1.1 ≈ 5.1K, matches Erkul's 5K.
  //
  // Fall back to the old scaled-sum approach if refs are missing (ships
  // with no ship_power_reference row).
  if (irShieldsRef && irShieldsRef > 0 && emShieldsRef && emShieldsRef > 0 && emSigScaled > 0) {
    const activityRatio = Math.min(1, emSigScaled / emShieldsRef);
    irSig = irShieldsRef * activityRatio * irMult;
  } else if (hasAnyHp) {
    // Fase P.4: misma regla que EM — si la nave tiene hardpoints pero todo
    // está off, IR = 0. baseIr solo cuando no hay hardpoints (bare hull).
    irSig = irSigScaled * irMult;
  } else {
    irSig = baseIr * irMult;
  }

  // ── Shield regen scaling (Fase U.5b + W.3, 2026-05-02) ────────────────────
  // VerseTools especifica que SOLO los primeros 2 escudos ("primary") regenan.
  // Los del 3° en adelante son "reserve": aportan HP al pool pero no regen.
  // Caso: Asgard (4 shields), Polaris (4), Idris (5+). Si sumamos regen full
  // de todos sobreestimamos. Filtramos subShields a los primeros 2.
  //
  // Pip ratio sigue siendo el de la columna combinada — el pool de pips se
  // distribuye entre TODOS los shields (incluso reserve), pero el regen
  // efectivo viene solo de los primary.
  const shieldInstForScale = instances.find(i => i.hardpointId === SHIELD_POWER_ID);
  if (shieldInstForScale && shieldInstForScale.isOn && shieldInstForScale.totalPips > 0) {
    const minPips = Math.min(
      shieldInstForScale.totalPips,
      Math.max(1, Math.ceil(shieldInstForScale.powerMin)),
    );
    const effectivePips = Math.max(minPips, shieldInstForScale.allocatedPips);
    const shieldRatio = Math.min(1, Math.max(0, effectivePips / shieldInstForScale.totalPips));
    // Recomputar regen sumando solo los sub-shields encendidos Y dentro de
    // los primary slots (primeros 2). El orden de subShieldsInfo respeta el
    // orden de aparición de los hardpoints SHIELD en la nave.
    let activeRegenFull = 0;
    if (shieldInstForScale.subShields && shieldInstForScale.subShields.length > 0) {
      const PRIMARY_LIMIT = 2;
      const primary = shieldInstForScale.subShields.slice(0, PRIMARY_LIMIT);
      for (const sub of primary) {
        if (sub.isOn) activeRegenFull += sub.regenFull;
      }
    } else {
      // Edge case sin subShields — usar el shieldRegen acumulado en el loop.
      activeRegenFull = shieldRegen;
    }
    shieldRegen = activeRegenFull * shieldRatio;
  } else if (shieldInstForScale && !shieldInstForScale.isOn) {
    shieldRegen = 0;
  }

  // ── Cooling supply (VerseTools §7.1, Fase W.8) ────────────────────────────
  // Supply = coolingRate × pips × bandMod / maxPips, maxPips = powerMax - 1.
  // Si pips = 0 → 0. bandMod = 1 cuando no hay tier explícito.
  let coolingScaled = 0;
  for (const inst of instances) {
    if (inst.category !== "coolers" || !inst.isOn) continue;
    if (inst.totalPips === 0) continue;
    const hp = hardpoints.find(h => h.hardpointName === inst.hardpointName);
    if (!hp) continue;
    const item = overrides.has(hp.id) ? (overrides.get(hp.id) ?? null) : hp.defaultItem;
    if (!item) continue;
    const rawCooling = pickNum(item.componentStats, "coolingRate");
    const pips = inst.allocatedPips;
    const maxPips = Math.max(1, inst.totalPips - 1);
    coolingScaled += computeCoolerSupply({
      coolingRate: rawCooling,
      pips,
      maxPips,
      bandMod: 1, // VerseTools usa el bandMod cuando hay bandas; instances ya
                  // resuelven la eficiencia vía allocatedPips, así que con 1
                  // queda equivalente. Si en el futuro queremos respetar bandMod
                  // explícito, leerlo de inst.ranges.
    });
  }
  const hasCoolerInstances = instances.some(i => i.category === "coolers");
  if (hasCoolerInstances) {
    coolingRate = coolingScaled;
  }

  // ── Cooling demand 2-tier (VerseTools §7.2, Fase W.7) ─────────────────────
  // Reemplazamos el thermalOutput plano del catálogo por la fórmula:
  //   Total Demand = PP_IDLE + Σ( pips × weight_per_category )
  // Pesos validados in-game (max error 2% en 5 ships). Esto refleja overload
  // térmico real cuando los pips de Shields/Radar/QD suben y los coolers no
  // siguen el ritmo. Mantenemos el thermalOutput previo como fallback solo
  // si no hubo NINGUNA instance de power (caso edge: ship sin loadout).
  if (instances.length > 0) {
    const computedDemand = computeCoolingDemand(
      instances.map((i) => ({
        category: i.category as string,
        allocatedPips: i.allocatedPips,
        isOn: i.isOn,
      })),
    );
    thermalOutput = computedDemand;
  }

  // ── Cross-Section (Fase W.10, VerseTools §5.3) ────────────────────────────
  // CS = Base Hull CS × Armor CS Multiplier. Si la nave tiene baseCsSignature
  // (validado o importado), lo usamos. Si no, estimación 253 × mass^0.33 ×
  // mult^1.4 (aproximación de VerseTools, ±10% en fighters / ±25% capitales).
  let csSignature = 0;
  let csIsEstimate = false;
  {
    const csMult = _res?.sigMultCrossSection ?? 1;
    const baseCs = _res?.baseCsSignature ?? 0;
    if (baseCs > 0) {
      csSignature = baseCs * csMult;
    } else {
      const mass = shipInfo?.mass ?? 0;
      if (mass > 0) {
        csSignature = 253 * Math.pow(mass, 0.33) * Math.pow(csMult || 1, 1.4);
        csIsEstimate = true;
      }
    }
  }

  summary.activeComponents = activeComponents; summary.totalComponents = totalComponents;
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    totalDps: r(totalDps), burstDps: r(totalDps), sustainedDps: r(totalSustainedDps), totalAlpha: r(totalAlpha), weaponAlpha: r(weaponAlpha), missileAlpha: r(missileAlpha), shieldHp: r(shieldHp), shieldRegen: r(shieldRegen),
    powerOutput: r(totalPO), powerDraw: r(totalMinDraw), powerBalance: r(totalPO - totalMinDraw),
    coolingRate: r(coolingRate), thermalOutput: r(thermalOutput), thermalBalance: r(coolingRate - thermalOutput),
    emSignature: r(emSig), irSignature: r(irSig),
    csSignature: r(csSignature), csIsEstimate,
    effectiveSpeed, effectiveSpeedLabel,
    powerNetwork: { totalOutput: totalPO, totalAllocated, totalMinDraw: Math.round(totalMinDraw), totalActualDraw, consumptionPercent, freePoints: totalPO - totalAllocated, isOverloaded: consumptionPercent > 100, categories: cats, activeCategories, instances },
    weaponMaxPips: pools?.WeaponGun ?? 0,
    summary,
  };
}

// =============================================================================
// Store
// =============================================================================

const ZERO_ALLOC: Record<PowerCategory, number> = { weapons: 0, thrusters: 0, shields: 0, quantum: 0, radar: 0, coolers: 0, lifesupport: 0, qig: 0 };
const EMPTY_NET: PowerNetworkState = { totalOutput: 0, totalAllocated: 0, totalMinDraw: 0, totalActualDraw: 0, consumptionPercent: 0, freePoints: 0, isOverloaded: false, categories: (() => { const c = {} as any; for (const k of POWER_CATEGORIES) c[k] = emptyCat(); return c; })(), activeCategories: [], instances: [] };
const EMPTY_STATS: ComputedStats = { totalDps: 0, burstDps: 0, sustainedDps: 0, totalAlpha: 0, weaponAlpha: 0, missileAlpha: 0, shieldHp: 0, shieldRegen: 0, powerOutput: 0, powerDraw: 0, powerBalance: 0, coolingRate: 0, thermalOutput: 0, thermalBalance: 0, emSignature: 0, irSignature: 0, csSignature: 0, csIsEstimate: false, effectiveSpeed: null, effectiveSpeedLabel: "SCM", powerNetwork: EMPTY_NET, weaponMaxPips: 0, summary: { weapons: 0, missiles: 0, shields: 0, coolers: 0, powerPlants: 0, quantumDrives: 0, activeComponents: 0, totalComponents: 0 } };

// =============================================================================
// Module-level performance helpers
// =============================================================================

// ── Round 4-A: getStats() memoization cache ───────────────────────────────────
// computeStats() is O(hardpoints) and called by every widget on every render.
// We cache the last result by a stable key so consecutive calls within the same
// React batch (CombatSummary + LoadoutDetail + PowerPanel all firing at once)
// pay the cost exactly once.
let _statsCache: { key: string; result: ComputedStats } | null = null;

function makeStatsKey(
  shipId: string | null,
  flightMode: FlightMode,
  overrides: Map<string, EquippedItem | null>,
  componentStates: Record<string, boolean>,
  instancePower: Record<string, number>,
  shipPowerGen: number,
): string {
  const ovr = [...overrides.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v?.reference ?? "∅"}`)
    .join(",");
  const off = Object.entries(componentStates)
    .filter(([, v]) => v === false)
    .map(([k]) => k)
    .sort()
    .join(",");
  const pw = Object.entries(instancePower)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
  return `${shipId ?? ""}|${flightMode}|${ovr}|${off}|${pw}|${shipPowerGen}`;
}

// ── Round 4-B: Debounced autoAllocatePower ────────────────────────────────────
// Replaces the per-action setTimeout(..., 0) scatter with a single 50ms
// trailing debounce so rapid equip/toggle/mode changes coalesce into one
// allocation pass instead of N cascading passes.
let _autoAllocTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAutoAlloc(get: () => LoadoutState) {
  if (_autoAllocTimer) clearTimeout(_autoAllocTimer);
  _autoAllocTimer = setTimeout(() => {
    _autoAllocTimer = null;
    get().autoAllocatePower();
  }, 50);
}

// ── Round 4-E: loadShip() request deduplication ───────────────────────────────
// Prevents duplicate in-flight fetches when the same ship is loaded twice
// (e.g. hot-reload, StrictMode double-invoke, or rapid navigation).
const _loadingShips = new Map<string, Promise<void>>();

interface LoadoutState {
  shipId: string | null; shipInfo: ShipInfo | null;
  hardpoints: ResolvedHardpoint[]; overrides: Map<string, EquippedItem | null>;
  /**
   * Loadout.4 (2026-05-04): preview override temporal (NO persistido).
   * Cuando el user pasa el mouse sobre un item en el ComponentPicker, se
   * setea acá. `getEffectiveItem(hpId)` lo prefiere sobre overrides/default,
   * lo que hace que computeStats recalcule en vivo. Al hacer click definitivo
   * (equipItem) o cerrar el picker, se limpia.
   */
  previewItem: { hardpointId: string; item: EquippedItem | null } | null;
  componentStates: Record<string, boolean>; flightMode: FlightMode;
  /** Per-instance power allocation: hardpointName -> allocated pips */
  instancePower: Record<string, number>;
  /** Ship-level power generation from sc-unpacked */
  shipPowerGen: number;
  /** Flight controller power data (for thrusters column) */
  flightControllerPower: any | null;
  /** Pool pip counts from ship_power_reference (e.g. { WeaponGun: 4, Shield: 2 }) */
  powerPools: Record<string, number> | null;
  /** Per-category pip usage from ship_power_reference (e.g. { Shield: 8, Radar: 5 }) */
  usedGroupedScm: Record<string, number> | null;
  /** CIG-authoritative ship-level EM aggregate from ship_power_reference.em_shields */
  shipEmShieldsRef: number | null;
  /** CIG-authoritative ship-level IR aggregate from ship_power_reference.ir_shields */
  shipIrShieldsRef: number | null;
  // Legacy: keep for backward compat but internally maps to instancePower
  allocatedPower: Record<PowerCategory, number>;
  isLoading: boolean; error: string | null;

  getStats: () => ComputedStats;
  getEffectiveItem: (hpId: string) => EquippedItem | null;
  /**
   * True si hay un override registrado para este hpId — incluye overrides
   * con valor null (clearSlot). Útil para distinguir "el usuario vacía
   * explícitamente" de "no hay info en el store" cuando el slot es
   * sintético (ej. children dinámicos de missile racks). Sin esto el
   * default del API se pisaba con null y los misiles se renderizaban
   * vacíos por defecto.
   */
  hasOverride: (hpId: string) => boolean;
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
  /** Loadout.4: previsualizar item temporalmente (hover en picker). */
  setPreviewItem: (hardpointId: string, item: EquippedItem | null) => void;
  /** Loadout.4: limpiar preview (mouse leave o cerrar picker). */
  clearPreviewItem: () => void;
}

export const useLoadoutStore = create<LoadoutState>((set, get) => ({
  shipId: null, shipInfo: null, hardpoints: [], overrides: new Map(),
  previewItem: null,                   // Loadout.4
  componentStates: {}, flightMode: "SCM" as FlightMode,
  instancePower: {}, shipPowerGen: 0, flightControllerPower: null, powerPools: null,
  usedGroupedScm: null,
  shipEmShieldsRef: null, shipIrShieldsRef: null,
  allocatedPower: { ...ZERO_ALLOC }, isLoading: false, error: null,

  getStats: () => {
    const s = get();
    if (s.hardpoints.length === 0) return EMPTY_STATS;
    // Loadout.4: si hay preview activo, lo aplicamos sobre overrides para que
    // computeStats lea el override "as-if-equipped". Después del cálculo se
    // descarta — no persiste. El cache key incluye el shipId+ref del preview
    // para invalidarlo cuando cambia el hovered item.
    const previewKey = s.previewItem
      ? `prev:${s.previewItem.hardpointId}:${s.previewItem.item?.id ?? "null"}`
      : "no-prev";
    const baseKey = makeStatsKey(s.shipId, s.flightMode, s.overrides, s.componentStates, s.instancePower, s.shipPowerGen);
    const key = baseKey + "|" + previewKey;
    if (_statsCache && _statsCache.key === key) return _statsCache.result;
    let effectiveOverrides = s.overrides;
    if (s.previewItem) {
      effectiveOverrides = new Map(s.overrides);
      effectiveOverrides.set(s.previewItem.hardpointId, s.previewItem.item);
    }
    const result = computeStats(s.hardpoints, effectiveOverrides, s.componentStates, s.flightMode, s.instancePower, s.shipInfo, s.shipPowerGen, s.flightControllerPower, s.powerPools, s.usedGroupedScm, s.shipEmShieldsRef, s.shipIrShieldsRef);
    _statsCache = { key, result };
    return result;
  },
  getEffectiveItem: (hpId) => {
    const { hardpoints, overrides, previewItem } = get();
    // Loadout.4: preview gana sobre overrides y default cuando matchea
    if (previewItem && previewItem.hardpointId === hpId) return previewItem.item;
    if (overrides.has(hpId)) return overrides.get(hpId) ?? null;
    const top = hardpoints.find(h => h.id === hpId);
    if (top) return top.defaultItem ?? null;
    for (const h of hardpoints) {
      const ch = h.children.find(c => c.id === hpId);
      if (ch) return ch.equippedItem ?? null;
    }
    return null;
  },
  hasOverride: (hpId) => get().overrides.has(hpId),
  isComponentOn: (hpName) => get().componentStates[hpName] !== false,
  hasChanges: () => get().overrides.size > 0,
  getWeaponHardpoints: () => get().hardpoints.filter(hp => WEAPON_CATS.has(hp.resolvedCategory)),
  getSystemHardpoints: () => get().hardpoints.filter(hp => SYSTEM_CATS.has(hp.resolvedCategory)),

  loadShip: async (id, buildParam) => {
    // FEAT 2026-04-28: pasar la game version activa al endpoint para que
    // pickee el row correcto cuando hay LIVE+PTU cargados. Lee el store
    // de game version sincrónicamente (sin React hook — esto corre en
    // contexto de zustand action).
    const { useGameVersionStore } = await import("@/store/useGameVersionStore");
    const gvState = useGameVersionStore.getState();
    const activeVersion = gvState.branch === "PTU" ? gvState.ptuVersion : gvState.liveVersion;
    const gvQuery = activeVersion ? `?gv=${encodeURIComponent(activeVersion)}` : "";

    const dedupKey = id + "|" + (buildParam ?? "") + "|" + (activeVersion ?? "");
    const inflight = _loadingShips.get(dedupKey);
    if (inflight) return inflight;
    const p = (async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/ships/" + encodeURIComponent(id) + gvQuery);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      const data = json.data; const sd = data?.ship;

      // Ship-level power from sc-unpacked
      const shipPower = json.shipPower;
      const shipPowerGen = shipPower?.gen ?? 0;
      const flightControllerPower = json.flightController ?? null;
      const powerPools: Record<string, number> | null = shipPower?.pools ?? null;
      // Per-category pip usage from game data (most reliable pip source)
      const rawGrouped = shipPower?.usedGroupedScm;
      const usedGroupedScm: Record<string, number> | null =
        rawGrouped && typeof rawGrouped === "object" ? rawGrouped : null;
      // F2.6 (2026-04-17): CIG-authoritative ship-level emission aggregates.
      // Used to compute IR signature via ratio against em_shields (scunpacked
      // doesn't expose per-group IR breakdown, only EM, so we can't sum IR
      // per-component correctly due to cooler heat-dissipation attenuation).
      const shipEmShieldsRef: number | null = shipPower?.emShields ?? null;
      const shipIrShieldsRef: number | null = shipPower?.irShields ?? null;

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
        resistances: sd?.resistances ? {
          armorHp: toNumOrNull(sd.resistances.armorHp),
          dmgMultPhysical: toNumOrNull(sd.resistances.dmgMultPhysical),
          dmgMultEnergy: toNumOrNull(sd.resistances.dmgMultEnergy),
          dmgMultDistortion: toNumOrNull(sd.resistances.dmgMultDistortion),
          dmgMultThermal: toNumOrNull(sd.resistances.dmgMultThermal),
          dmgMultBiochemical: toNumOrNull(sd.resistances.dmgMultBiochemical),
          dmgMultStun: toNumOrNull(sd.resistances.dmgMultStun),
          sigMultCrossSection: toNumOrNull(sd.resistances.sigMultCrossSection),
          sigMultInfrared: toNumOrNull(sd.resistances.sigMultInfrared),
          sigMultElectromagnetic: toNumOrNull(sd.resistances.sigMultElectromagnetic),
          penResistBase: toNumOrNull(sd.resistances.penResistBase),
          penResistPhysical: toNumOrNull(sd.resistances.penResistPhysical),
          penResistEnergy: toNumOrNull(sd.resistances.penResistEnergy),
          penResistDistortion: toNumOrNull(sd.resistances.penResistDistortion),
          baseEmSignature: toNumOrNull(sd.resistances.baseEmSignature),
          baseIrSignature: toNumOrNull(sd.resistances.baseIrSignature),
          baseCsSignature: toNumOrNull(sd.resistances.baseCsSignature),
          crossSectionX: toNumOrNull(sd.resistances.crossSectionX),
          crossSectionY: toNumOrNull(sd.resistances.crossSectionY),
          crossSectionZ: toNumOrNull(sd.resistances.crossSectionZ),
          emTotalShields: toNumOrNull(sd.resistances.emTotalShields),
          emTotalQuantum: toNumOrNull(sd.resistances.emTotalQuantum),
          irTotalShields: toNumOrNull(sd.resistances.irTotalShields),
          irTotalQuantum: toNumOrNull(sd.resistances.irTotalQuantum),
        } : null,
      };

      // Parse flatHardpoints with children
      const rawHps: any[] = json.flatHardpoints ?? [];
      const resolved: ResolvedHardpoint[] = rawHps.map((hp: any) => {
        const item = parseEquipped(hp.equippedItem);

        const rawChildren: any[] = hp.childWeapons ?? hp.children ?? [];
        const parentName = hp.hardpointName ?? hp.id ?? "";
        const children: ResolvedChild[] = rawChildren.map((ch: any, idx: number) => ({
          // Unique ID per child: parent name + child hardpoint name or index
          // Prevents ID collisions when same weapon is on multiple gimbals
          id: `${parentName}__${ch.hardpointName || idx}`,
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
            // Build a flat lookup: hardpointName → slot id (covers top-level + children)
            const slotId = new Map<string, string>();
            for (const hp of resolved) {
              slotId.set(hp.hardpointName, hp.id);
              for (const ch of hp.children) slotId.set(ch.hardpointName, ch.id);
            }
            // Default items for legacy format fallback
            const allDefaults = [
              ...resolved.map(h => h.defaultItem),
              ...resolved.flatMap(h => h.children.map(c => c.equippedItem)),
            ].filter((i): i is EquippedItem => !!i);

            for (const [hpName, val] of Object.entries(d as Record<string, any>)) {
              const id = slotId.get(hpName);
              if (!id) continue;
              if (val === null) { restored.set(id, null); continue; }
              // New rich format: { r, i, n, ln, t, s, g, m, cs, pn }
              if (typeof val === "object" && "r" in val) {
                restored.set(id, { id: val.i ?? val.r, reference: val.r, name: val.n ?? val.r, localizedName: val.ln ?? null, className: val.r ?? null, type: val.t ?? "WEAPON", size: val.s ?? null, grade: val.g ?? null, manufacturer: val.m ?? null, componentStats: val.cs ?? null, powerNetwork: val.pn ?? null });
                continue;
              }
              // Legacy format: value is a plain reference string
              if (typeof val === "string") {
                const f = allDefaults.find(i => i.reference === val || i.className === val);
                if (f) restored.set(id, f);
              }
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
        instancePower: {}, shipPowerGen, flightControllerPower, powerPools,
        usedGroupedScm,
        shipEmShieldsRef, shipIrShieldsRef,
        allocatedPower: { ...ZERO_ALLOC },
        isLoading: false, error: null,
      });
      scheduleAutoAlloc(get);
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
    })().finally(() => _loadingShips.delete(dedupKey));
    _loadingShips.set(dedupKey, p);
    return p;
  },

  // Equipping/clearing/toggling preserves user pip allocations — no auto-rebalance.
  // Auto-alloc only runs on initial ship load, explicit resetAll, and flight-mode change.
  // (Previous behavior overwrote manual pip changes whenever the user toggled anything.)
  // Loadout.4: cuando se confirma un item (click), limpiamos el preview para
  // que no quede aplicado encima del override real.
  equipItem: (hpId, item) => { set(s => { const n = new Map(s.overrides); n.set(hpId, item); return { overrides: n, previewItem: null }; }); },
  clearSlot: (hpId) => { set(s => { const n = new Map(s.overrides); n.set(hpId, null); return { overrides: n, previewItem: null }; }); },
  toggleComponent: (hpName) => {
    // OFF → zero this component's pips (so the pool visibly frees them).
    // ON  → restore a sensible default (min pips) from free pool, without touching other components.
    const s = get();
    const wasOn = s.componentStates[hpName] !== false;
    const nextStates = { ...s.componentStates, [hpName]: !wasOn };

    if (wasOn) {
      // Turning OFF: release pips
      set({
        componentStates: nextStates,
        instancePower: { ...s.instancePower, [hpName]: 0 },
      });
      return;
    }

    // Turning ON: figure out min pips this component needs and take them from the free pool
    const st = s.getStats();
    const inst = st.powerNetwork.instances.find(i => i.hardpointName === hpName);
    if (!inst || inst.totalPips === 0) {
      set({ componentStates: nextStates });
      return;
    }

    // Minimum pips: use first non-zero range start, fallback to 1
    let minPips = 1;
    for (const r of inst.ranges) {
      if (r.range > 0) {
        minPips = Math.max(1, r.start > 0 ? r.start : 1);
        break;
      }
    }
    // Clamp to what the component can hold and what's free in the pool
    const grant = Math.min(minPips, inst.totalPips, Math.max(0, st.powerNetwork.freePoints));

    set({
      componentStates: nextStates,
      instancePower: { ...s.instancePower, [hpName]: grant },
    });
  },
  resetAll: () => { const fresh: Record<string, boolean> = {}; for (const hp of get().hardpoints) { fresh[hp.hardpointName] = true; for (const ch of hp.children) fresh[ch.hardpointName] = true; } set({ overrides: new Map(), previewItem: null, componentStates: fresh, flightMode: "SCM" as FlightMode, instancePower: {}, allocatedPower: { ...ZERO_ALLOC } }); scheduleAutoAlloc(get); },
  setFlightMode: (mode) => { set({ flightMode: mode }); scheduleAutoAlloc(get); },

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
    const probe = computeStats(s.hardpoints, s.overrides, s.componentStates, s.flightMode, {}, s.shipInfo, s.shipPowerGen, s.flightControllerPower, s.powerPools, s.usedGroupedScm, s.shipEmShieldsRef, s.shipIrShieldsRef);
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

  // ── Loadout.4 (2026-05-04): preview hover live ─────────────────────────
  setPreviewItem: (hardpointId, item) => {
    set({ previewItem: { hardpointId, item } });
  },
  clearPreviewItem: () => {
    set({ previewItem: null });
  },

  encodeBuild: () => {
    const { hardpoints, overrides } = get();
    if (overrides.size === 0) return "";
    const encItem = (item: EquippedItem | null): any => {
      if (!item) return null;
      return { r: item.reference, i: item.id, n: item.name, ln: item.localizedName, t: item.type, s: item.size, g: item.grade, m: item.manufacturer, cs: item.componentStats, pn: item.powerNetwork };
    };
    const e: Record<string, any> = {};
    for (const [hpId, item] of overrides.entries()) {
      // Search top-level hardpoints first
      const hp = hardpoints.find(h => h.id === hpId);
      if (hp) { e[hp.hardpointName] = encItem(item); continue; }
      // Search children (turret sub-weapons etc.)
      for (const h of hardpoints) {
        const ch = h.children.find(c => c.id === hpId);
        if (ch) { e[ch.hardpointName] = encItem(item); break; }
      }
    }
    return btoa(JSON.stringify(e));
  },
}));
