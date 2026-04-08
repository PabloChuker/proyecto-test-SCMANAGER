// =============================================================================
// AL FILO — Tipos v3
// Cambio: ComputedLoadoutStats ahora incluye EM/IR signatures.
// Sin saltos de línea en className strings (hydration-safe).
// =============================================================================

// ── Ship list ──

export interface ShipListItem {
  id: string;
  reference: string;
  name: string;
  localizedName: string | null;
  type: string;
  size: number;
  manufacturer: string | null;
  gameVersion: string;
  ship: {
    maxCrew: number;
    cargo: number;
    maxSpeed: number;
    role: string;
    focus: string;
    career: string;
    lengthMeters: number;
    beamMeters: number;
    heightMeters: number;
  } | null;
}

export interface ShipListResponse {
  data: ShipListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    manufacturers: string[];
  };
}

// ── Component stats data ──

export interface ComponentStatsData {
  dps: number | null;
  alphaDamage: number | null;
  fireRate: number | null;
  range: number | null;
  speed: number | null;
  ammoCount: number | null;
  damageType: string | null;
  shieldHp: number | null;
  shieldRegen: number | null;
  shieldDownDelay: number | null;
  powerOutput: number | null;
  coolingRate: number | null;
  quantumSpeed: number | null;
  quantumRange: number | null;
  quantumCooldown: number | null;
  quantumSpoolUp: number | null;
  powerDraw: number | null;
  thermalOutput: number | null;
  emSignature: number | null;
  irSignature: number | null;
}

// ── Equipped item ──

export interface EquippedItemFlat {
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

// ── Flat hardpoint ──

export interface FlatHardpoint {
  id: string;
  hardpointName: string;
  category: string;
  minSize: number;
  maxSize: number;
  isFixed: boolean;
  isManned: boolean;
  isInternal: boolean;
  equippedItem: EquippedItemFlat | null;
  childWeapons: {
    hardpointName: string;
    maxSize: number;
    equippedItem: EquippedItemFlat | null;
  }[];
  isTurretOrGimbal: boolean;
}

// ── Computed stats v3 ──

export interface ComputedLoadoutStats {
  totalDps: number;
  totalAlphaDamage: number;
  totalShieldHp: number;
  totalShieldRegen: number;
  totalPowerDraw: number;
  totalPowerOutput: number;
  totalCooling: number;
  totalThermalOutput: number;
  powerBalance: number;
  thermalBalance: number;
  totalEmSignature: number;
  totalIrSignature: number;
  hardpointSummary: {
    weapons: number;
    missiles: number;
    shields: number;
    coolers: number;
    powerPlants: number;
    quantumDrives: number;
  };
}

// ── Ship detail API response ──

export interface ShipDetailResponseV2 {
  data: {
    id: string;
    reference: string;
    name: string;
    localizedName: string | null;
    className: string | null;
    type: string;
    manufacturer: string | null;
    gameVersion: string;
    ship: {
      maxCrew: number | null;
      cargo: number | null;
      maxSpeed: number | null;
      afterburnerSpeed: number | null;
      pitchRate: number | null;
      yawRate: number | null;
      rollRate: number | null;
      hydrogenFuelCap: number | null;
      quantumFuelCap: number | null;
      isSpaceship: boolean;
      isGravlev: boolean;
      lengthMeters: number | null;
      beamMeters: number | null;
      heightMeters: number | null;
      role: string | null;
      focus: string | null;
      career: string | null;
    } | null;
    hardpoints: any[];
  };
  flatHardpoints: FlatHardpoint[];
  computed: ComputedLoadoutStats;
}

// ── Component search ──

export interface ComponentSearchResult {
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

export interface ComponentSearchResponse {
  data: ComponentSearchResult[];
  meta: { total: number; limit: number };
}

// ── Loadout override ──

export interface LoadoutOverride {
  hardpointId: string;
  equippedItem: EquippedItemFlat | null;
}

// ── Constants ──

/** Only these categories are shown in the UI */
export const USEFUL_CATEGORIES = new Set([
  "WEAPON", "TURRET", "MISSILE_RACK",
  "SHIELD", "POWER_PLANT", "COOLER",
  "QUANTUM_DRIVE", "MINING",
]);

export const HARDPOINT_GROUPS = {
  offensive: ["WEAPON", "MISSILE_RACK", "TURRET"],
  defensive: ["SHIELD", "ARMOR", "COUNTERMEASURE"],
  systems: ["POWER_PLANT", "COOLER", "QUANTUM_DRIVE", "RADAR", "AVIONICS"],
  propulsion: ["THRUSTER_MAIN", "THRUSTER_MANEUVERING", "FUEL_TANK", "FUEL_INTAKE"],
  utility: ["MINING", "UTILITY", "OTHER"],
} as const;

export const HARDPOINT_GROUP_META: Record<
  keyof typeof HARDPOINT_GROUPS,
  { label: string; icon: string }
> = {
  offensive:  { label: "Weapons",    icon: "⬡" },
  defensive:  { label: "Defense",    icon: "◈" },
  systems:    { label: "Systems",    icon: "⚙" },
  propulsion: { label: "Propulsion", icon: "△" },
  utility:    { label: "Utility",    icon: "◎" },
};

export const HARDPOINT_COLORS: Record<string, string> = {
  WEAPON: "#ef4444",
  MISSILE_RACK: "#f97316",
  TURRET: "#f59e0b",
  SHIELD: "#3b82f6",
  ARMOR: "#6366f1",
  COUNTERMEASURE: "#8b5cf6",
  POWER_PLANT: "#22c55e",
  COOLER: "#06b6d4",
  QUANTUM_DRIVE: "#a855f7",
  RADAR: "#14b8a6",
  AVIONICS: "#64748b",
  THRUSTER_MAIN: "#eab308",
  THRUSTER_MANEUVERING: "#84cc16",
  FUEL_TANK: "#78716c",
  FUEL_INTAKE: "#a8a29e",
  MINING: "#f472b6",
  UTILITY: "#94a3b8",
  OTHER: "#71717a",
};
