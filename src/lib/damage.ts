// =============================================================================
// SC LABS — Damage flow (Shield → Hull) según VerseTools §4 + §6
//
// Modela cómo un disparo se reparte entre escudo y casco. La fórmula completa
// junta resistencias, absorptions, deflection y damage modifier:
//
//   1. Si el shield está UP:
//       - Shield Damage = sum por tipo:
//             alpha_type × (1 - resist_type)
//         (resist > 0 reduce daño al shield; < 0 lo amplifica)
//       - Hull Bleedthrough = sum por tipo:
//             alpha_type × (1 - absorption_type)
//         (1.0 = nada bleeds, 0.0 = todo bleeds)
//
//   2. Si el shield está DOWN:
//       - Armor Deflection check (per type Physical/Energy):
//             si alpha_type ≤ deflect_type → daño 0 (deflectado)
//             si > → pasa el alpha completo al hull
//       - Hull Damage por tipo = alpha_type × dmgMult_type
//
// Las resist/absorption escalan con los pips del shield:
//
//   resist_type(pips)     = resistMin + (resistMax - resistMin) × pipFraction
//   absorption_type(pips) = absMin   + (absMax   - absMin)   × pipFraction
//
// Los campos resist/absorption viven en `ship_resistances`. Hoy SC Labs los
// guarda pero no los aplica al display de daño (no hay TTK calculator). Esta
// lib queda preparada para cuando el feature se construya — puede usarse en:
//   - Stats panel "Time-to-Kill vs Weapon X"
//   - Comparador de naves (¿qué nave aguanta más?)
//   - Armor Check ampliado con cálculo de daño efectivo
// =============================================================================

export interface DamageResistances {
  /** Por tipo: factor en [-1, 1]. Positivo = reduce daño al shield. */
  resistPhysical?: number | null;
  resistEnergy?: number | null;
  resistDistortion?: number | null;
  /** Por tipo: 1 = todo absorbido, 0 = todo bleeds al hull. */
  absorptionPhysical?: number | null;
  absorptionEnergy?: number | null;
  absorptionDistortion?: number | null;
}

export interface ArmorProperties {
  /** Umbral debajo del cual el armor deflecta (alpha ≤ threshold → 0). */
  deflectionPhysical?: number | null;
  deflectionEnergy?: number | null;
  /** Multiplicadores damage per type aplicados al hull cuando shield down. */
  dmgMultPhysical?: number | null;
  dmgMultEnergy?: number | null;
  dmgMultDistortion?: number | null;
}

export interface WeaponAlpha {
  physical?: number | null;
  energy?: number | null;
  distortion?: number | null;
  thermal?: number | null;
}

export interface DamageFlowResult {
  /** Daño que pega al pool de shield HP. */
  shieldDamage: number;
  /** Daño que bleeds al hull a través del shield. */
  hullBleedthrough: number;
  /** Daño que pega directo al hull (cuando shield down). */
  hullDirect: number;
  /** Por tipo: cuánto efectivo. */
  byType: {
    physical: { shield: number; hull: number };
    energy: { shield: number; hull: number };
    distortion: { shield: number; hull: number };
  };
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Interpola lineal entre min y max según pip fraction (0..1).
 * Si solo uno está definido, lo devuelve. Si no hay nada, default = 0.
 */
function interpolateRange(
  min: number | null | undefined,
  max: number | null | undefined,
  pipFraction: number,
): number {
  const hasMin = min != null && Number.isFinite(min);
  const hasMax = max != null && Number.isFinite(max);
  if (!hasMin && !hasMax) return 0;
  if (!hasMin) return num(max);
  if (!hasMax) return num(min);
  const f = Math.max(0, Math.min(1, pipFraction));
  return num(min) + (num(max) - num(min)) * f;
}

/**
 * Resuelve resist/absorption efectivos al pip ratio actual del shield.
 *
 * Si las resists vienen como `resistMin/Max`, interpolamos. Si solo hay
 * un valor estático (compatibilidad), lo usamos tal cual.
 */
export function resolveShieldResists(
  baseMin: DamageResistances,
  baseMax: DamageResistances | null,
  shieldPipFraction: number,
): Required<{
  resistPhysical: number;
  resistEnergy: number;
  resistDistortion: number;
  absorptionPhysical: number;
  absorptionEnergy: number;
  absorptionDistortion: number;
}> {
  const f = Math.max(0, Math.min(1, shieldPipFraction));
  return {
    resistPhysical:
      baseMax != null
        ? interpolateRange(baseMin.resistPhysical, baseMax.resistPhysical, f)
        : num(baseMin.resistPhysical),
    resistEnergy:
      baseMax != null
        ? interpolateRange(baseMin.resistEnergy, baseMax.resistEnergy, f)
        : num(baseMin.resistEnergy),
    resistDistortion:
      baseMax != null
        ? interpolateRange(baseMin.resistDistortion, baseMax.resistDistortion, f)
        : num(baseMin.resistDistortion),
    absorptionPhysical:
      baseMax != null
        ? interpolateRange(baseMin.absorptionPhysical, baseMax.absorptionPhysical, f)
        : num(baseMin.absorptionPhysical),
    absorptionEnergy:
      baseMax != null
        ? interpolateRange(baseMin.absorptionEnergy, baseMax.absorptionEnergy, f)
        : num(baseMin.absorptionEnergy),
    absorptionDistortion:
      baseMax != null
        ? interpolateRange(baseMin.absorptionDistortion, baseMax.absorptionDistortion, f)
        : num(baseMin.absorptionDistortion),
  };
}

/**
 * Calcula el flujo de daño de UN disparo contra una nave.
 *
 * @param alpha   damage breakdown del arma
 * @param shield  resistances+absorptions del shield (efectivas a pips actuales)
 * @param armor   propiedades del armor
 * @param shieldUp  true si el shield todavía tiene HP
 */
export function computeDamageFlow(
  alpha: WeaponAlpha,
  shield: ReturnType<typeof resolveShieldResists>,
  armor: ArmorProperties,
  shieldUp: boolean,
): DamageFlowResult {
  const ap = num(alpha.physical);
  const ae = num(alpha.energy);
  const ad = num(alpha.distortion);

  if (shieldUp) {
    // Daño al shield: alpha × (1 - resist).
    const sp = ap * (1 - shield.resistPhysical);
    const se = ae * (1 - shield.resistEnergy);
    const sd = ad * (1 - shield.resistDistortion);
    // Bleedthrough al hull: alpha × (1 - absorption).
    const hp = ap * (1 - shield.absorptionPhysical);
    const he = ae * (1 - shield.absorptionEnergy);
    const hd = ad * (1 - shield.absorptionDistortion);
    return {
      shieldDamage: Math.max(0, sp + se + sd),
      hullBleedthrough: Math.max(0, hp + he + hd),
      hullDirect: 0,
      byType: {
        physical: { shield: sp, hull: hp },
        energy: { shield: se, hull: he },
        distortion: { shield: sd, hull: hd },
      },
    };
  }

  // Shield down: armor deflection + damage modifier per type.
  const deflectP = num(armor.deflectionPhysical);
  const deflectE = num(armor.deflectionEnergy);
  const passP = ap > deflectP ? ap : 0;
  const passE = ae > deflectE ? ae : 0;
  // Distortion no tiene deflect umbral en VerseTools, pasa siempre.
  const passD = ad;
  const hp = passP * (armor.dmgMultPhysical ?? 1);
  const he = passE * (armor.dmgMultEnergy ?? 1);
  const hd = passD * (armor.dmgMultDistortion ?? 1);
  return {
    shieldDamage: 0,
    hullBleedthrough: 0,
    hullDirect: Math.max(0, hp + he + hd),
    byType: {
      physical: { shield: 0, hull: hp },
      energy: { shield: 0, hull: he },
      distortion: { shield: 0, hull: hd },
    },
  };
}

/**
 * Time-To-Kill aproximado: cuántos segundos tarda un loadout (DPS efectivo)
 * en bajar el escudo + el casco de un objetivo.
 *
 * No considera regen del shield mientras el atacante dispara — solo regen
 * cuando el shield baja a 0. Suficiente para comparar loadouts.
 */
export function estimateTimeToKill(opts: {
  shieldHp: number;
  hullHp: number;
  shieldDpsIncoming: number;
  hullBleedthroughDpsIncoming: number;
  hullDirectDpsIncoming: number;
}): { timeToShieldDown: number; timeToHullKill: number; timeTotalSec: number } | null {
  const { shieldHp, hullHp, shieldDpsIncoming, hullBleedthroughDpsIncoming, hullDirectDpsIncoming } = opts;
  if (shieldDpsIncoming <= 0 && shieldHp > 0) {
    // No podemos romper el shield; loadout no daña.
    return null;
  }
  const tShield = shieldHp > 0 ? shieldHp / Math.max(shieldDpsIncoming, 1e-6) : 0;
  // Mientras dura el shield, el hull recibe bleedthrough.
  const hullLossDuringShield = tShield * hullBleedthroughDpsIncoming;
  const hullRemaining = Math.max(0, hullHp - hullLossDuringShield);
  const tHull = hullDirectDpsIncoming > 0
    ? hullRemaining / hullDirectDpsIncoming
    : Infinity;
  return {
    timeToShieldDown: tShield,
    timeToHullKill: tHull,
    timeTotalSec: tShield + (Number.isFinite(tHull) ? tHull : 0),
  };
}
