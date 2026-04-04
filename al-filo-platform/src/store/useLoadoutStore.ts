// =============================================================================
// AL FILO — useLoadoutStore v6.1 (Robust Children)
//
// Fixes:
//   - loadShip: parses children defensively, handles missing componentStats
//   - computeStats: sums child DPS even when parent turret has null stats
//   - Children initialized in componentStates for on/off toggle
// =============================================================================

import { create } from "zustand";

// =============================================================================
// Types
// =============================================================================

export interface ComponentStatsData { [key: string]: any; }

export interface EquippedItem {
  id: string; reference: string; name: string; localizedName: string | null;
  className: string | null; type: string; size: number | null;
  grade: string | null; manufacturer: string | null;
  componentStats: ComponentStatsData | null;
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
  role: string | null; focus: string | null;
  // Acceleration data for radar charts
  accelForward: number | null; accelBackward: number | null;
  accelUp: number | null; accelDown: number | null; accelStrafe: number | null;
  boostSpeedForward: number | null;
}

export type FlightMode = "SCM" | "NAV";
export type PowerCategory = "weapons" | "thrusters" | "shields" | "quantum" | "radar" | "coolers";
export const POWER_CATEGORIES: PowerCategory[] = ["weapons", "thrusters", "shields", "quantum", "radar", "coolers"];

const CAT_TO_POWER: Record<string, PowerCategory> = {
  WEAPON: "weapons", TURRET: "weapons", MISSILE_RACK: "weapons",
  SHIELD: "shields", COOLER: "coolers", QUANTUM_DRIVE: "quantum",
  MINING: "weapons", UTILITY: "weapons",
};

export interface CategoryPowerInfo { minDraw: number; allocated: number; componentCount: number; activeCount: number; }
export interface PowerNetworkState {
  totalOutput: number; totalAllocated: number; totalMinDraw: number;
  consumptionPercent: number; freePoints: number; isOverloaded: boolean;
  categories: Record<PowerCategory, CategoryPowerInfo>;
  activeCategories: PowerCategory[];
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
};
const NAME_PATTERNS: [RegExp, string][] = [
  [/turret/i, "TURRET"], [/weapon|gun|cannon|gatling|repeater|scattergun|gimbal/i, "WEAPON"],
  [/missile|rocket|msd-/i, "MISSILE_RACK"], [/shield/i, "SHIELD"],
  [/power_plant|powerplant|power plant/i, "POWER_PLANT"], [/cool/i, "COOLER"],
  [/quantum|qdrive/i, "QUANTUM_DRIVE"], [/mining/i, "MINING"],
  [/radar|scanner/i, "RADAR"],
];
const USEFUL = new Set(["WEAPON", "TURRET", "MISSILE_RACK", "SHIELD", "POWER_PLANT", "COOLER", "QUANTUM_DRIVE", "MINING", "UTILITY", "RADAR", "COUNTERMEASURE"]);

function inferCategory(category: string, item: EquippedItem | null, hpName: string): string {
  // Already classified by API
  if (category !== "OTHER" && USEFUL.has(category)) return category;
  // Try item type
  if (item?.type) { const m = TYPE_TO_CAT[item.type]; if (m) return m; }
  // Try name patterns
  for (const [re, cat] of NAME_PATTERNS) { if (re.test(hpName)) return cat; }
  return category; // preserve API classification like COUNTERMEASURE, ARMOR, etc.
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
  };
}

// =============================================================================
// computeStats
// =============================================================================

const WEAPON_CATS = new Set(["WEAPON", "TURRET", "MISSILE_RACK"]);
const SYSTEM_CATS = new Set(["SHIELD", "POWER_PLANT", "COOLER", "QUANTUM_DRIVE", "MINING", "UTILITY"]);

function emptyCat(): CategoryPowerInfo { return { minDraw: 0, allocated: 0, componentCount: 0, activeCount: 0 }; }

function computeStats(
  hardpoints: ResolvedHardpoint[], overrides: Map<string, EquippedItem | null>,
  componentStates: Record<string, boolean>, flightMode: FlightMode,
  allocatedPower: Record<PowerCategory, number>, shipInfo: ShipInfo | null,
): ComputedStats {
  let totalDps = 0, totalAlpha = 0, shieldHp = 0, shieldRegen = 0;
  let powerOutput = 0, coolingRate = 0, thermalOutput = 0, emSig = 0, irSig = 0;
  let activeComponents = 0, totalComponents = 0;
  const summary = { weapons: 0, missiles: 0, shields: 0, coolers: 0, powerPlants: 0, quantumDrives: 0, activeComponents: 0, totalComponents: 0 };
  const cats: Record<PowerCategory, CategoryPowerInfo> = {} as any;
  for (const c of POWER_CATEGORIES) cats[c] = emptyCat();

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
    const isOn = componentStates[hp.hardpointName] !== false;

    // Power plants: always output
    if (cat === "POWER_PLANT") {
      powerOutput += pickNum(s, "powerOutput");
      if (isOn) { activeComponents++; accumBase(s); }
      continue;
    }

    const pCat = CAT_TO_POWER[cat];
    if (pCat) { cats[pCat].componentCount++; if (isOn) { cats[pCat].activeCount++; cats[pCat].minDraw += pickNum(s, "powerDraw", "powerBase"); } }
    if (!isOn) continue;
    activeComponents++;

    // TURRET/RACK with children: DPS comes from children, base stats from parent
    if ((cat === "TURRET" || cat === "MISSILE_RACK") && hp.children.length > 0) {
      accumBase(s); // Parent turret body: thermal, EM, IR
      // Children: actual weapons/missiles that deal damage
      for (const child of hp.children) {
        const childOn = componentStates[child.hardpointName] !== false;
        if (!childOn) continue;
        const cItem = child.equippedItem;
        if (!cItem) continue;
        accumDps(cItem.componentStats);
        accumBase(cItem.componentStats);
      }
    } else {
      // Normal component OR turret/rack with NO children (fallback: use parent stats)
      if (cat === "WEAPON" || cat === "TURRET") { accumDps(s); }
      if (cat === "MISSILE_RACK") { totalAlpha += pickNum(s, "alphaDamage", "damage"); }
      if (cat === "SHIELD") { shieldHp += pickNum(s, "shieldHp", "maxHp"); shieldRegen += pickNum(s, "shieldRegen", "regenRate"); }
      if (cat === "COOLER") { coolingRate += pickNum(s, "coolingRate"); }
      accumBase(s);
    }
  }

  let totalAllocated = 0, totalMinDraw = 0;
  for (const c of POWER_CATEGORIES) { cats[c].allocated = allocatedPower[c] || 0; totalAllocated += cats[c].allocated; totalMinDraw += Math.ceil(cats[c].minDraw); }
  const totalPO = Math.round(powerOutput);
  const consumptionPercent = totalPO > 0 ? Math.round((totalMinDraw / totalPO) * 100) : 0;
  const activeCategories = POWER_CATEGORIES.filter(c => cats[c].componentCount > 0);

  if (flightMode === "NAV") { totalDps = 0; totalAlpha = 0; shieldRegen = 0; }

  let effectiveSpeed: number | null; let effectiveSpeedLabel: string;
  if (flightMode === "NAV") { effectiveSpeed = shipInfo?.afterburnerSpeed ?? null; effectiveSpeedLabel = "NAV"; } else { effectiveSpeed = shipInfo?.scmSpeed ?? null; effectiveSpeedLabel = "SCM"; }

  summary.activeComponents = activeComponents; summary.totalComponents = totalComponents;
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    totalDps: r(totalDps), totalAlpha: r(totalAlpha), shieldHp: r(shieldHp), shieldRegen: r(shieldRegen),
    powerOutput: r(powerOutput), powerDraw: r(totalMinDraw), powerBalance: r(powerOutput - totalMinDraw),
    coolingRate: r(coolingRate), thermalOutput: r(thermalOutput), thermalBalance: r(coolingRate - thermalOutput),
    emSignature: r(emSig), irSignature: r(irSig), effectiveSpeed, effectiveSpeedLabel,
    powerNetwork: { totalOutput: totalPO, totalAllocated, totalMinDraw: Math.round(totalMinDraw), consumptionPercent, freePoints: totalPO - totalAllocated, isOverloaded: consumptionPercent > 100, categories: cats, activeCategories },
    summary,
  };
}

// =============================================================================
// Store
// =============================================================================

const ZERO_ALLOC: Record<PowerCategory, number> = { weapons: 0, thrusters: 0, shields: 0, quantum: 0, radar: 0, coolers: 0 };
const EMPTY_NET: PowerNetworkState = { totalOutput: 0, totalAllocated: 0, totalMinDraw: 0, consumptionPercent: 0, freePoints: 0, isOverloaded: false, categories: (() => { const c = {} as any; for (const k of POWER_CATEGORIES) c[k] = emptyCat(); return c; })(), activeCategories: [] };
const EMPTY_STATS: ComputedStats = { totalDps: 0, totalAlpha: 0, shieldHp: 0, shieldRegen: 0, powerOutput: 0, powerDraw: 0, powerBalance: 0, coolingRate: 0, thermalOutput: 0, thermalBalance: 0, emSignature: 0, irSignature: 0, effectiveSpeed: null, effectiveSpeedLabel: "SCM", powerNetwork: EMPTY_NET, summary: { weapons: 0, missiles: 0, shields: 0, coolers: 0, powerPlants: 0, quantumDrives: 0, activeComponents: 0, totalComponents: 0 } };

interface LoadoutState {
  shipId: string | null; shipInfo: ShipInfo | null;
  hardpoints: ResolvedHardpoint[]; overrides: Map<string, EquippedItem | null>;
  componentStates: Record<string, boolean>; flightMode: FlightMode;
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
  setAllocatedPower: (cat: PowerCategory, points: number) => void;
  autoAllocatePower: () => void;
}

export const useLoadoutStore = create<LoadoutState>((set, get) => ({
  shipId: null, shipInfo: null, hardpoints: [], overrides: new Map(),
  componentStates: {}, flightMode: "SCM" as FlightMode,
  allocatedPower: { ...ZERO_ALLOC }, isLoading: false, error: null,

  getStats: () => { const s = get(); return s.hardpoints.length === 0 ? EMPTY_STATS : computeStats(s.hardpoints, s.overrides, s.componentStates, s.flightMode, s.allocatedPower, s.shipInfo); },
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

      const shipInfo: ShipInfo = {
        id: data.id ?? "", reference: data.reference ?? "", name: data.name ?? "",
        localizedName: data.localizedName ?? null, manufacturer: data.manufacturer ?? null,
        gameVersion: data.gameVersion ?? "",
        scmSpeed: toNumOrNull(sd?.scmSpeed ?? sd?.maxSpeed),
        afterburnerSpeed: toNumOrNull(sd?.afterburnerSpeed),
        pitchRate: toNumOrNull(sd?.pitchRate), yawRate: toNumOrNull(sd?.yawRate),
        rollRate: toNumOrNull(sd?.rollRate),
        crew: sd?.maxCrew ?? null, cargo: sd?.cargo ?? null,
        role: sd?.role ?? null, focus: sd?.focus ?? null,
        accelForward: toNumOrNull(sd?.accelForward),
        accelBackward: toNumOrNull(sd?.accelBackward),
        accelUp: toNumOrNull(sd?.accelUp),
        accelDown: toNumOrNull(sd?.accelDown),
        accelStrafe: toNumOrNull(sd?.accelStrafe),
        boostSpeedForward: toNumOrNull(sd?.boostSpeedForward),
      };

      // Parse flatHardpoints with children
      const rawHps: any[] = json.flatHardpoints ?? [];
      const resolved: ResolvedHardpoint[] = rawHps.map((hp: any) => {
        const item = parseEquipped(hp.equippedItem);

        // Parse children (turret guns, rack missiles)
        const rawChildren: any[] = hp.children ?? [];
        const children: ResolvedChild[] = rawChildren.map((ch: any) => ({
          id: ch.id ?? "",
          hardpointName: ch.hardpointName ?? "",
          category: ch.category ?? "WEAPON",
          minSize: ch.minSize ?? 0,
          maxSize: ch.maxSize ?? 0,
          isFixed: ch.isFixed ?? false,
          equippedItem: parseEquipped(ch.equippedItem),
        })).filter((ch: ResolvedChild) => ch.hardpointName); // Skip empty

        return {
          id: hp.id ?? "", hardpointName: hp.hardpointName ?? "",
          originalCategory: hp.category ?? "OTHER",
          resolvedCategory: inferCategory(hp.category ?? "OTHER", item, hp.hardpointName ?? ""),
          minSize: hp.minSize ?? 0, maxSize: hp.maxSize ?? 0,
          isFixed: hp.isFixed ?? false, defaultItem: item, children,
        };
      }).filter((hp: ResolvedHardpoint) => USEFUL.has(hp.resolvedCategory));

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

      // Initialize componentStates: all ON, including children
      const states: Record<string, boolean> = {};
      for (const hp of resolved) {
        states[hp.hardpointName] = true;
        for (const ch of hp.children) {
          states[ch.hardpointName] = true;
        }
      }

      set({ shipId: id, shipInfo, hardpoints: resolved, overrides: restored, componentStates: states, flightMode: "SCM", allocatedPower: { ...ZERO_ALLOC }, isLoading: false, error: null });
      setTimeout(() => get().autoAllocatePower(), 0);
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  },

  equipItem: (hpId, item) => { set(s => { const n = new Map(s.overrides); n.set(hpId, item); return { overrides: n }; }); setTimeout(() => get().autoAllocatePower(), 0); },
  clearSlot: (hpId) => { set(s => { const n = new Map(s.overrides); n.set(hpId, null); return { overrides: n }; }); setTimeout(() => get().autoAllocatePower(), 0); },
  toggleComponent: (hpName) => { set(s => ({ componentStates: { ...s.componentStates, [hpName]: s.componentStates[hpName] === false } })); setTimeout(() => get().autoAllocatePower(), 0); },
  resetAll: () => { const fresh: Record<string, boolean> = {}; for (const hp of get().hardpoints) { fresh[hp.hardpointName] = true; for (const ch of hp.children) fresh[ch.hardpointName] = true; } set({ overrides: new Map(), componentStates: fresh, flightMode: "SCM" as FlightMode, allocatedPower: { ...ZERO_ALLOC } }); setTimeout(() => get().autoAllocatePower(), 0); },
  setFlightMode: (mode) => set({ flightMode: mode }),
  setAllocatedPower: (cat, points) => { const s = get(); const st = s.getStats(); const alloc = { ...s.allocatedPower }; const cl = Math.max(0, points); const d = cl - alloc[cat]; const tot = Object.values(alloc).reduce((a, b) => a + b, 0); if (d > 0 && tot + d > st.powerNetwork.totalOutput) return; alloc[cat] = cl; set({ allocatedPower: alloc }); },
  autoAllocatePower: () => { const s = get(); const probe = computeStats(s.hardpoints, s.overrides, s.componentStates, s.flightMode, ZERO_ALLOC, s.shipInfo); const total = probe.powerNetwork.totalOutput; const alloc: Record<PowerCategory, number> = { ...ZERO_ALLOC }; let rem = total; for (const c of POWER_CATEGORIES) { if (probe.powerNetwork.categories[c].activeCount === 0) continue; const need = Math.ceil(probe.powerNetwork.categories[c].minDraw); const give = Math.min(need, rem); alloc[c] = give; rem -= give; } if (rem > 0) { const act = POWER_CATEGORIES.filter(c => alloc[c] > 0 || probe.powerNetwork.categories[c].activeCount > 0); let i = 0; while (rem > 0 && act.length > 0) { alloc[act[i % act.length]]++; rem--; i++; } } set({ allocatedPower: alloc }); },
  encodeBuild: () => { const { hardpoints, overrides } = get(); if (overrides.size === 0) return ""; const e: Record<string, string | null> = {}; for (const [hpId, item] of overrides.entries()) { const hp = hardpoints.find(h => h.id === hpId); if (hp) e[hp.hardpointName] = item?.reference ?? null; } return btoa(JSON.stringify(e)); },
}));
