// =============================================================================
// AL FILO — computeStats.ts
// Función pura que recalcula todas las stats del loadout.
// Se usa tanto con los datos originales de la API como con overrides locales.
// =============================================================================

import type {
  FlatHardpoint,
  EquippedItemFlat,
  ComputedLoadoutStats,
  LoadoutOverride,
} from "@/types/ships";

/**
 * Recalcula las stats del loadout aplicando los overrides del usuario.
 *
 * @param baseHardpoints  — hardpoints originales de la API
 * @param overrides       — cambios del usuario (Map: hardpointId → nuevo item)
 */
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

  const hardpointSummary = {
    weapons: 0, missiles: 0, shields: 0,
    coolers: 0, powerPlants: 0, quantumDrives: 0,
  };

  for (const hp of baseHardpoints) {
    // Usar el override si existe, sino el item original
    const override = overrides.get(hp.id);
    const equipped: EquippedItemFlat | null = override
      ? override.equippedItem
      : hp.equippedItem;

    const stats = equipped?.componentStats;

    // Contar por categoría
    switch (hp.category) {
      case "WEAPON": case "TURRET": hardpointSummary.weapons++; break;
      case "MISSILE_RACK":          hardpointSummary.missiles++; break;
      case "SHIELD":                hardpointSummary.shields++; break;
      case "COOLER":                hardpointSummary.coolers++; break;
      case "POWER_PLANT":           hardpointSummary.powerPlants++; break;
      case "QUANTUM_DRIVE":         hardpointSummary.quantumDrives++; break;
    }

    if (stats) {
      if (!hp.isTurretOrGimbal) {
        totalDps += stats.dps || 0;
        totalAlphaDamage += stats.alphaDamage || 0;
      }
      totalShieldHp += stats.shieldHp || 0;
      totalShieldRegen += stats.shieldRegen || 0;
      totalPowerDraw += stats.powerDraw || 0;
      totalPowerOutput += stats.powerOutput || 0;
      totalCooling += stats.coolingRate || 0;
      totalThermalOutput += stats.thermalOutput || 0;
    }

    // Child weapons (turret internals) — no overrideables por ahora
    if (hp.isTurretOrGimbal && !override) {
      for (const child of hp.childWeapons) {
        const cs = child.equippedItem?.componentStats;
        if (!cs) continue;
        totalDps += cs.dps || 0;
        totalAlphaDamage += cs.alphaDamage || 0;
        totalPowerDraw += cs.powerDraw || 0;
        totalThermalOutput += cs.thermalOutput || 0;
      }
    }
  }

  const r = (n: number) => Math.round(n * 100) / 100;

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
    hardpointSummary,
  };
}
