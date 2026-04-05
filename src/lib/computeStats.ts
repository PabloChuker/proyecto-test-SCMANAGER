// =============================================================================
// AL FILO — computeStats.ts (v5 — CATEGORY INFERENCE)
//
// Matches LoadoutBuilder v5: when hp.category is "OTHER", infers the real
// category from equippedItem.type before deciding how to count/sum.
// =============================================================================

import type {
  FlatHardpoint,
  EquippedItemFlat,
  ComputedLoadoutStats,
  LoadoutOverride,
} from "@/types/ships";

const TYPE_TO_CATEGORY: Record<string, string> = {
  WEAPON: "WEAPON",
  TURRET: "TURRET",
  MISSILE: "MISSILE_RACK",
  MISSILE_RACK: "MISSILE_RACK",
  SHIELD: "SHIELD",
  POWER_PLANT: "POWER_PLANT",
  COOLER: "COOLER",
  QUANTUM_DRIVE: "QUANTUM_DRIVE",
  MINING_LASER: "MINING",
  MINING: "MINING",
};

const USEFUL = new Set(["WEAPON", "TURRET", "MISSILE_RACK", "MISSILE", "SHIELD", "POWER_PLANT", "COOLER", "QUANTUM_DRIVE", "MINING", "MINING_LASER"]);

function resolveCategory(hp: FlatHardpoint, equipped: EquippedItemFlat | null): string {
  // If category is already useful, use it
  if (hp.category && hp.category !== "OTHER" && USEFUL.has(hp.category)) return hp.category;
  // Infer from equipped item type
  if (equipped && equipped.type) {
    const mapped = TYPE_TO_CATEGORY[equipped.type];
    if (mapped) return mapped;
  }
  return hp.category || "OTHER";
}

function nn(val: any): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

export function recomputeStats(
  baseHardpoints: FlatHardpoint[],
  overrides: Map<string, LoadoutOverride>
): ComputedLoadoutStats {
  let totalDps = 0;
  let totalAlphaDamage = 0;
  let totalShieldHp = 0;
  let totalShieldRegen = 0;
  let totalPowerDraw = 0;
  let totalPowerOutput = 0;
  let totalCooling = 0;
  let totalThermalOutput = 0;
  let totalEmSignature = 0;
  let totalIrSignature = 0;

  const hardpointSummary = {
    weapons: 0, missiles: 0, shields: 0,
    coolers: 0, powerPlants: 0, quantumDrives: 0,
  };

  for (const hp of baseHardpoints) {
    const override = overrides.get(hp.id);
    const equipped: EquippedItemFlat | null = override ? override.equippedItem : hp.equippedItem;

    const cat = resolveCategory(hp, equipped);

    if (!USEFUL.has(cat)) continue;

    switch (cat) {
      case "WEAPON": case "TURRET": hardpointSummary.weapons++; break;
      case "MISSILE_RACK": case "MISSILE": hardpointSummary.missiles++; break;
      case "SHIELD": hardpointSummary.shields++; break;
      case "COOLER": hardpointSummary.coolers++; break;
      case "POWER_PLANT": hardpointSummary.powerPlants++; break;
      case "QUANTUM_DRIVE": hardpointSummary.quantumDrives++; break;
    }

    const s = equipped?.componentStats;
    if (!s || typeof s !== "object") continue;

    totalDps += nn(s.dps);
    totalAlphaDamage += nn(s.alphaDamage);
    totalShieldHp += nn(s.shieldHp);
    totalShieldRegen += nn(s.shieldRegen);
    totalPowerDraw += nn(s.powerDraw);
    totalPowerOutput += nn(s.powerOutput);
    totalCooling += nn(s.coolingRate);
    totalThermalOutput += nn(s.thermalOutput);
    totalEmSignature += nn(s.emSignature);
    totalIrSignature += nn(s.irSignature);

    if (hp.childWeapons && hp.childWeapons.length > 0) {
      for (const child of hp.childWeapons) {
        const cs = child.equippedItem?.componentStats;
        if (!cs || typeof cs !== "object") continue;
        totalDps += nn(cs.dps);
        totalAlphaDamage += nn(cs.alphaDamage);
        totalPowerDraw += nn(cs.powerDraw);
        totalThermalOutput += nn(cs.thermalOutput);
      }
    }
  }

  const r = (v: number) => Math.round(v * 100) / 100;

  return {
    totalDps: r(totalDps),
    totalAlphaDamage: r(totalAlphaDamage),
    totalShieldHp: r(totalShieldHp),
    totalShieldRegen: r(totalShieldRegen),
    totalPowerDraw: r(totalPowerDraw),
    totalPowerOutput: r(totalPowerOutput),
    totalCooling: r(totalCooling),
    totalThermalOutput: r(totalThermalOutput),
    powerBalance: r(totalPowerOutput - totalPowerDraw),
    thermalBalance: r(totalCooling - totalThermalOutput),
    totalEmSignature: r(totalEmSignature),
    totalIrSignature: r(totalIrSignature),
    hardpointSummary,
  };
}
