// =============================================================================
// SC LABS — Sustained DPS (10-second window)
//
// Adapted from VerseTools (https://versetools.games/formulas, "Sustained DPS"):
//
//   Energy weapons:
//     Time to deplete = magazine / (RPM / 60)
//     Regen window    = regenCooldown + magazine / regenRatePerSec
//     Cycle Time      = depleteTime + regen window
//     Sustained Ratio = depleteTime / cycleTime    (fraction of time firing)
//
//   Ballistic weapons:
//     Burst Rounds = floor(overheatTemperature / heatPerShot)
//     Burst Time   = burstRounds / (RPM / 60)
//     Cooldown     = overheatFixTime
//     Cycle Time   = burstTime + cooldown
//     Sustained Ratio = burstTime / cycleTime
//
//   Sustained DPS = Burst DPS × Sustained Ratio
//
// Si los campos necesarios no están presentes, el ratio queda 1.0 (sustained
// = burst). Pure energy weapons sin regen data pero con magazine y RPM aún
// pueden estimarse (asumiendo recarga instantánea no funciona, así que
// usamos solo el RPM real para sostenido). En la práctica, la BD de SC Labs
// trae estos campos para la mayoría de armas energy y balísticas.
// =============================================================================

export interface SustainedDpsInput {
  /** Real fire rate (post-tick-quantization) in RPM. */
  fireRateRpm: number;
  /** Burst DPS at the listed alpha — what comes from the catalogue (corrected for fire-rate quantization). */
  burstDps: number;
  /** True when this is an energy / laser weapon. */
  isEnergy: boolean;
  /** Energy: magazine size before regen kicks in. */
  magazine?: number | null;
  /** Energy: ammo regenerated per second once cooldown clears. */
  regenRatePerSec?: number | null;
  /** Energy: delay before regen starts (seconds). */
  regenCooldown?: number | null;
  /** Ballistic: heat capacity (e.g. overheat_temperature). */
  heatCapacity?: number | null;
  /** Ballistic: heat generated per shot. */
  heatPerShot?: number | null;
  /** Ballistic: time it takes to recover from overheat (seconds). */
  overheatFixTime?: number | null;
}

export interface SustainedDpsResult {
  sustainedDps: number;
  sustainedRatio: number;
  /** Why this ratio was applied — useful for tooltips. */
  reason: "energy-cycle" | "ballistic-burst" | "no-data" | "invalid";
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Returns sustained DPS over a long enough window to capture the burst/regen
 * cycle. Burst DPS is multiplied by the duty-cycle ratio.
 */
export function computeSustainedDps(input: SustainedDpsInput): SustainedDpsResult {
  const rpm = num(input.fireRateRpm);
  const burst = num(input.burstDps);
  if (rpm <= 0 || burst <= 0) {
    return { sustainedDps: 0, sustainedRatio: 0, reason: "invalid" };
  }
  const rps = rpm / 60;

  if (input.isEnergy) {
    // Energy weapons: deplete magazine, wait cooldown, refill at regen rate.
    const mag = num(input.magazine);
    const regen = num(input.regenRatePerSec);
    const delay = num(input.regenCooldown);
    if (mag > 0 && regen > 0) {
      const depleteTime = mag / rps;
      const refillTime = mag / regen;
      const cycleTime = depleteTime + delay + refillTime;
      const ratio = cycleTime > 0 ? depleteTime / cycleTime : 1;
      return {
        sustainedDps: burst * ratio,
        sustainedRatio: ratio,
        reason: "energy-cycle",
      };
    }
    // Fallback: sin data de regen, asumimos sostenido = burst (límite ideal).
    return { sustainedDps: burst, sustainedRatio: 1, reason: "no-data" };
  }

  // Ballistic: el límite lo pone el calor.
  const heatCap = num(input.heatCapacity);
  const heatShot = num(input.heatPerShot);
  const fixTime = num(input.overheatFixTime);
  if (heatCap > 0 && heatShot > 0 && fixTime > 0) {
    const burstRounds = Math.floor(heatCap / heatShot);
    if (burstRounds > 0) {
      const burstTime = burstRounds / rps;
      const cycleTime = burstTime + fixTime;
      const ratio = cycleTime > 0 ? burstTime / cycleTime : 1;
      return {
        sustainedDps: burst * ratio,
        sustainedRatio: ratio,
        reason: "ballistic-burst",
      };
    }
  }
  // Fallback ballistic sin overheat data: full sustained.
  return { sustainedDps: burst, sustainedRatio: 1, reason: "no-data" };
}
