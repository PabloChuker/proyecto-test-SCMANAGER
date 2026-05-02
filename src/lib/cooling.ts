// =============================================================================
// SC LABS — Cooling demand & supply (VerseTools §7)
//
// Modelos validados in-game por VerseTools (max error 2% en 5 ships):
// Aurora MK II, Guardian, Guardian MX, Crusader Intrepid, Asgard.
//
//   Total Demand = PP_IDLE + Σ( pips × weight )
//
//   PP_IDLE = 0.04
//
//   weights (heat units por pip):
//     High tier (~2.0):
//       Life Support  2.300
//       Quantum Drive 2.070
//       Radar         1.988
//       Shields       1.978
//     Low tier (~1.0):
//       Thrusters     1.032
//       Tools/Tractors 0.966
//       Coolers       0.939
//       Weapons       0.900
//
//   Cooler Supply = coolingRate × pips × bandMod(pips) / maxPips
//                   con maxPips = powerMax - 1
//                   si pips = 0 → 0
//
//   Cooling % = round( totalDemand / totalSupply × 100 )
//
// Existen overrides per-ship para Polaris y Mercury Star Runner que VerseTools
// no detalla. Los dejamos sin override por ahora — si reportan discrepancias
// puntuales agregamos overrides.
// =============================================================================

import type { PowerCategory } from "@/store/useLoadoutStore";

/** Heat generated por pip activo, según VerseTools §7.2. */
export const COOLING_WEIGHTS: Record<PowerCategory | "lifesupport", number> = {
  // High tier
  lifesupport: 2.300,
  quantum:     2.070,
  radar:       1.988,
  shields:     1.978,
  // Low tier
  thrusters:   1.032,
  // Tools/Tractors no son una PowerCategory — se mapea desde MINING/SALVAGE/UTILITY
  // a la weight 0.966 abajo.
  coolers:     0.939,
  weapons:     0.900,
  // QIG: VerseTools no lo separa; lo asociamos al tier de QD (es del mismo
  // grupo de drives interdictores), conservador para no subestimar.
  qig:         2.070,
};

/** Idle baseline de la planta de poder (VerseTools §7.2). */
export const PP_IDLE = 0.04;

/**
 * Devuelve el weight de cooling para una categoría de power instance. Las
 * categorías que VerseTools agrupa como "Tools" (mining/salvage/utility)
 * usan la weight 0.966.
 */
export function coolingWeightForCategory(cat: string): number {
  switch (cat) {
    case "weapons":     return COOLING_WEIGHTS.weapons;
    case "shields":     return COOLING_WEIGHTS.shields;
    case "coolers":     return COOLING_WEIGHTS.coolers;
    case "thrusters":   return COOLING_WEIGHTS.thrusters;
    case "quantum":     return COOLING_WEIGHTS.quantum;
    case "qig":         return COOLING_WEIGHTS.qig;
    case "radar":       return COOLING_WEIGHTS.radar;
    case "lifesupport": return COOLING_WEIGHTS.lifesupport;
    // Mining lasers, salvage, tractor beams, EMPs, etc. → tier "Tools"
    case "mining":
    case "salvage":
    case "utility":
    case "tractor":
      return 0.966;
    default:
      // Sin entry conocida: devolvemos un weight conservador medio (1.0)
      // para no perder la contribución por completo.
      return 1.0;
  }
}

export interface CoolingDemandInput {
  /** category, allocatedPips, isOn */
  category: string;
  allocatedPips: number;
  isOn: boolean;
}

/**
 * Suma la demanda de cooling de un set de instances de power.
 * Solo cuentan las instances ON con pips > 0.
 */
export function computeCoolingDemand(instances: CoolingDemandInput[]): number {
  let total = PP_IDLE;
  for (const i of instances) {
    if (!i.isOn) continue;
    const pips = Math.max(0, i.allocatedPips);
    if (pips <= 0) continue;
    total += pips * coolingWeightForCategory(i.category);
  }
  return total;
}

/**
 * Supply de un cooler individual.
 *   coolingRate × pips × bandMod / maxPips
 * Si maxPips ≤ 0 o pips ≤ 0 → 0.
 *
 * bandMod debe venir resuelto por el caller (eficiencia de la banda actual).
 */
export function computeCoolerSupply(opts: {
  coolingRate: number;
  pips: number;
  maxPips: number;
  bandMod: number;
}): number {
  const { coolingRate, pips, maxPips, bandMod } = opts;
  if (coolingRate <= 0 || pips <= 0 || maxPips <= 0) return 0;
  return (coolingRate * pips * bandMod) / maxPips;
}
