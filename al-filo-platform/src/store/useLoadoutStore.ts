// =============================================================================
// AL FILO — useLoadoutStore (Zustand)
//
// Single source of truth for the Loadout Builder.
//
// State:
//   shipId          — currently selected ship
//   shipData        — full ship data from API (cached)
//   hardpoints      — resolved hardpoints with inferred categories
//   overrides       — user's component swaps (Map: hardpointId → item)
//
// Computed (derived, not stored):
//   stats           — totalDps, powerBalance, etc. Recalculated on every change.
//
// Actions:
//   loadShip(id)    — fetch ship data and populate state
//   equipItem(hpId, item) — swap a component
//   clearSlot(hpId) — empty a hardpoint
//   resetAll()      — revert to default loadout
//   toShareableString() — serialize overrides for URL sharing
//   fromShareableString(s) — restore overrides from URL
// =============================================================================

import { create } from "zustand";

// =============================================================================
// Types
// =============================================================================

export interface ComponentStatsData {
  dps?: number | null;
  alphaDamage?: number | null;
  fireRate?: number | null;
  range?: number | null;
  speed?: number | null;
  ammoCount?: number | null;
  damageType?: string | null;
  shieldHp?: number | null;
  shieldRegen?: number | null;
  shieldDownDelay?: number | null;
  powerOutput?: number | null;
  coolingRate?: number | null;
  quantumSpeed?: number | null;
  quantumRange?: number | null;
  quantumSpoolUp?: number | null;
  quantumCooldown?: number | null;
  powerDraw?: number | null;
  thermalOutput?: number | null;
  emSignature?: number | null;
  irSignature?: number | null;
  [key: string]: any;
}

export interface EquippedItem {
  id: string;
  reference: string;
  name: string;
  localizedName: string | null;
  className: string | null;
  type: string;
  size: number | null;
  grade: string | null;
  manufacturer: string | null;
  componentStats: ComponentStatsData | null;
}

export interface ResolvedHardpoint {
  id: string;
  hardpointName: string;
  originalCategory: string;
  resolvedCategory: string;
  minSize: number;
  maxSize: number;
  isFixed: boolean;
  defaultItem: EquippedItem | null;
}

export interface ShipInfo {
  id: string;
  reference: string;
  name: string;
  localizedName: string | null;
  manufacturer: string | null;
  gameVersion: string;
  scmSpeed: number | null;
  afterburnerSpeed: number | null;
  pitchRate: number | null;
  yawRate: number | null;
  rollRate: number | null;
  crew: number | null;
  cargo: number | null;
  role: string | null;
  focus: string | null;
}

export interface ComputedStats {
  totalDps: number;
  totalAlpha: number;
  shieldHp: number;
  shieldRegen: number;
  powerOutput: number;
  powerDraw: number;
  powerBalance: number;
  coolingRate: number;
  thermalOutput: number;
  thermalBalance: number;
  emSignature: number;
  irSignature: number;
  summary: {
    weapons: number;
    missiles: number;
    shields: number;
    coolers: number;
    powerPlants: number;
    quantumDrives: number;
  };
}

// =============================================================================
// Category inference (same logic as LoadoutBuilder v5)
// =============================================================================

const TYPE_TO_CAT: Record<string, string> = {
  WEAPON: "WEAPON", TURRET: "TURRET", MISSILE: "MISSILE_RACK",
  MISSILE_RACK: "MISSILE_RACK", SHIELD: "SHIELD", POWER_PLANT: "POWER_PLANT",
  COOLER: "COOLER", QUANTUM_DRIVE: "QUANTUM_DRIVE", MINING_LASER: "MINING",
  MINING: "MINING", TRACTOR_BEAM: "UTILITY", EMP: "UTILITY", QED: "UTILITY",
  SALVAGE_HEAD: "UTILITY",
};

const NAME_PATTERNS: [RegExp, string][] = [
  [/turret/i, "TURRET"], [/weapon|gun|cannon|gatling|repeater|scattergun/i, "WEAPON"],
  [/missile|rocket/i, "MISSILE_RACK"], [/shield/i, "SHIELD"],
  [/power_plant|powerplant/i, "POWER_PLANT"], [/cool/i, "COOLER"],
  [/quantum|qdrive/i, "QUANTUM_DRIVE"], [/mining/i, "MINING"],
];

const USEFUL = new Set([
  "WEAPON", "TURRET", "MISSILE_RACK", "SHIELD", "POWER_PLANT",
  "COOLER", "QUANTUM_DRIVE", "MINING", "UTILITY",
]);

function inferCategory(category: string, item: EquippedItem | null, hpName: string): string {
  if (category !== "OTHER" && USEFUL.has(category)) return category;
  if (item?.type) { const m = TYPE_TO_CAT[item.type]; if (m) return m; }
  for (const [re, cat] of NAME_PATTERNS) { if (re.test(hpName)) return cat; }
  if (item) {
    const combined = (item.name || "") + " " + (item.className || "");
    for (const [re, cat] of NAME_PATTERNS) { if (re.test(combined)) return cat; }
  }
  return "OTHER";
}

// =============================================================================
// Pure stat computation
// =============================================================================

function nn(v: any): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function computeStats(
  hardpoints: ResolvedHardpoint[],
  overrides: Map<string, EquippedItem | null>
): ComputedStats {
  let totalDps = 0, totalAlpha = 0, shieldHp = 0, shieldRegen = 0;
  let powerOutput = 0, powerDraw = 0, coolingRate = 0, thermalOutput = 0;
  let emSignature = 0, irSignature = 0;
  const summary = { weapons: 0, missiles: 0, shields: 0, coolers: 0, powerPlants: 0, quantumDrives: 0 };

  for (const hp of hardpoints) {
    const cat = hp.resolvedCategory;
    if (!USEFUL.has(cat)) continue;

    const item = overrides.has(hp.id) ? overrides.get(hp.id)! : hp.defaultItem;
    const s = item?.componentStats;

    switch (cat) {
      case "WEAPON": case "TURRET": summary.weapons++; break;
      case "MISSILE_RACK": summary.missiles++; break;
      case "SHIELD": summary.shields++; break;
      case "COOLER": summary.coolers++; break;
      case "POWER_PLANT": summary.powerPlants++; break;
      case "QUANTUM_DRIVE": summary.quantumDrives++; break;
    }

    if (!s || typeof s !== "object") continue;

    totalDps += nn(s.dps);
    totalAlpha += nn(s.alphaDamage);
    shieldHp += nn(s.shieldHp);
    shieldRegen += nn(s.shieldRegen);
    powerOutput += nn(s.powerOutput);
    powerDraw += nn(s.powerDraw);
    coolingRate += nn(s.coolingRate);
    thermalOutput += nn(s.thermalOutput);
    emSignature += nn(s.emSignature);
    irSignature += nn(s.irSignature);
  }

  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    totalDps: r(totalDps), totalAlpha: r(totalAlpha),
    shieldHp: r(shieldHp), shieldRegen: r(shieldRegen),
    powerOutput: r(powerOutput), powerDraw: r(powerDraw),
    powerBalance: r(powerOutput - powerDraw),
    coolingRate: r(coolingRate), thermalOutput: r(thermalOutput),
    thermalBalance: r(coolingRate - thermalOutput),
    emSignature: r(emSignature), irSignature: r(irSignature),
    summary,
  };
}

// =============================================================================
// Store
// =============================================================================

interface LoadoutState {
  // Data
  shipId: string | null;
  shipInfo: ShipInfo | null;
  hardpoints: ResolvedHardpoint[];
  overrides: Map<string, EquippedItem | null>;
  isLoading: boolean;
  error: string | null;

  // Computed (recalculated by getStats)
  getStats: () => ComputedStats;
  getEffectiveItem: (hpId: string) => EquippedItem | null;
  hasChanges: () => boolean;
  getWeaponHardpoints: () => ResolvedHardpoint[];
  getSystemHardpoints: () => ResolvedHardpoint[];

  // Actions
  loadShip: (id: string) => Promise<void>;
  equipItem: (hardpointId: string, item: EquippedItem) => void;
  clearSlot: (hardpointId: string) => void;
  resetAll: () => void;
  toShareableString: () => string;
  fromShareableString: (encoded: string) => void;
}

const WEAPON_CATS = new Set(["WEAPON", "TURRET", "MISSILE_RACK"]);
const SYSTEM_CATS = new Set(["SHIELD", "POWER_PLANT", "COOLER", "QUANTUM_DRIVE", "MINING", "UTILITY"]);

const EMPTY_STATS: ComputedStats = {
  totalDps: 0, totalAlpha: 0, shieldHp: 0, shieldRegen: 0,
  powerOutput: 0, powerDraw: 0, powerBalance: 0,
  coolingRate: 0, thermalOutput: 0, thermalBalance: 0,
  emSignature: 0, irSignature: 0,
  summary: { weapons: 0, missiles: 0, shields: 0, coolers: 0, powerPlants: 0, quantumDrives: 0 },
};

export const useLoadoutStore = create<LoadoutState>((set, get) => ({
  shipId: null,
  shipInfo: null,
  hardpoints: [],
  overrides: new Map(),
  isLoading: false,
  error: null,

  // ── Computed ──

  getStats: () => {
    const { hardpoints, overrides } = get();
    if (hardpoints.length === 0) return EMPTY_STATS;
    return computeStats(hardpoints, overrides);
  },

  getEffectiveItem: (hpId: string) => {
    const { hardpoints, overrides } = get();
    if (overrides.has(hpId)) return overrides.get(hpId) ?? null;
    const hp = hardpoints.find((h) => h.id === hpId);
    return hp?.defaultItem ?? null;
  },

  hasChanges: () => get().overrides.size > 0,

  getWeaponHardpoints: () => get().hardpoints.filter((hp) => WEAPON_CATS.has(hp.resolvedCategory)),

  getSystemHardpoints: () => get().hardpoints.filter((hp) => SYSTEM_CATS.has(hp.resolvedCategory)),

  // ── Actions ──

  loadShip: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/ships/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error("Failed to load ship");
      const json = await res.json();
      const data = json.data;
      const shipData = data.ship;

      const shipInfo: ShipInfo = {
        id: data.id, reference: data.reference,
        name: data.name, localizedName: data.localizedName,
        manufacturer: data.manufacturer, gameVersion: data.gameVersion,
        scmSpeed: shipData?.scmSpeed ?? shipData?.maxSpeed ?? null,
        afterburnerSpeed: shipData?.afterburnerSpeed ?? null,
        pitchRate: shipData?.pitchRate ?? null,
        yawRate: shipData?.yawRate ?? null,
        rollRate: shipData?.rollRate ?? null,
        crew: shipData?.maxCrew ?? null,
        cargo: shipData?.cargo ?? null,
        role: shipData?.role ?? null,
        focus: shipData?.focus ?? null,
      };

      // Resolve hardpoints from API data (supports both flat and raw)
      const rawHps: any[] = json.flatHardpoints
        ?? data.hardpoints
        ?? [];

      const resolved: ResolvedHardpoint[] = rawHps
        .map((hp: any) => {
          const eq = hp.equippedItem;
          const item: EquippedItem | null = eq ? {
            id: eq.id ?? "", reference: eq.reference ?? "",
            name: eq.name ?? "", localizedName: eq.localizedName ?? null,
            className: eq.className ?? null, type: eq.type ?? "OTHER",
            size: eq.size ?? null, grade: eq.grade ?? null,
            manufacturer: eq.manufacturer ?? null,
            componentStats: eq.componentStats ?? null,
          } : null;

          const cat = inferCategory(
            hp.category ?? hp.resolvedCategory ?? "OTHER",
            item,
            hp.hardpointName ?? ""
          );

          return {
            id: hp.id ?? "",
            hardpointName: hp.hardpointName ?? "",
            originalCategory: hp.category ?? "OTHER",
            resolvedCategory: cat,
            minSize: hp.minSize ?? 0,
            maxSize: hp.maxSize ?? 0,
            isFixed: hp.isFixed ?? false,
            defaultItem: item,
          };
        })
        .filter((hp: ResolvedHardpoint) => USEFUL.has(hp.resolvedCategory));

      set({
        shipId: id,
        shipInfo,
        hardpoints: resolved,
        overrides: new Map(),
        isLoading: false,
        error: null,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },

  equipItem: (hardpointId: string, item: EquippedItem) => {
    set((state) => {
      const next = new Map(state.overrides);
      next.set(hardpointId, item);
      return { overrides: next };
    });
  },

  clearSlot: (hardpointId: string) => {
    set((state) => {
      const next = new Map(state.overrides);
      next.set(hardpointId, null);
      return { overrides: next };
    });
  },

  resetAll: () => set({ overrides: new Map() }),

  // ── Serialization for URL sharing ──

  toShareableString: () => {
    const { overrides } = get();
    if (overrides.size === 0) return "";
    const entries: Record<string, string | null> = {};
    overrides.forEach((item, hpId) => {
      entries[hpId] = item?.reference ?? null;
    });
    return btoa(JSON.stringify(entries));
  },

  fromShareableString: (encoded: string) => {
    if (!encoded) return;
    try {
      const entries: Record<string, string | null> = JSON.parse(atob(encoded));
      // We'd need to resolve references to full items via API
      // For now, store as placeholder — the UI can resolve on mount
      const next = new Map<string, EquippedItem | null>();
      for (const [hpId, ref] of Object.entries(entries)) {
        if (ref === null) {
          next.set(hpId, null);
        }
        // Items with references need async resolution — handled by the UI
      }
      set({ overrides: next });
    } catch {
      console.error("Failed to parse shareable loadout string");
    }
  },
}));
