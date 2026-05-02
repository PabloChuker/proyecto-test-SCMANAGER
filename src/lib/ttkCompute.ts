// =============================================================================
// SC LABS — TTK Compute (Time To Kill)
//
// Combina los breakdowns de daño por tipo de cada arma del attacker con las
// resistencias / absorciones / deflección del target para calcular cuánto
// tarda el loadout en bajar el shield + el casco del objetivo.
//
// Modelo (VerseTools §4 + §6, ver src/lib/damage.ts):
//
//   Por arma:
//     shareP = alphaPhysical / alphaTotal
//     shareE = alphaEnergy   / alphaTotal
//     shareD = alphaDistortion / alphaTotal
//
//     shieldFactor = shareP × (1 - resistP)
//                  + shareE × (1 - resistE)
//                  + shareD × (1 - resistD)
//     bleedFactor  = shareP × (1 - absorptionP)
//                  + shareE × (1 - absorptionE)
//                  + shareD × (1 - absorptionD)
//     directFactor = (alpha[type] > deflect[type] ? 1 : 0) × dmgMult[type]
//                    sumado por type / alphaTotal  (con deflect cero p/Distortion)
//
//     shieldDps_w  = sustainedDps × shieldFactor
//     bleedDps_w   = sustainedDps × bleedFactor
//     directDps_w  = sustainedDps × directFactor
//
//   Total: sum sobre todas las armas activas.
//
//   ttkShield = shieldHp / sum(shieldDps_w)
//   ttkHull   = (hullHp - ttkShield × sum(bleedDps_w)) / sum(directDps_w)
//   ttkTotal  = ttkShield + ttkHull
//
// Resistencias y absorciones se interpolan al pip ratio actual del shield del
// target. Por defecto asumimos pip ratio = 1 (shield al máximo) — el caso
// "peor" para el atacante. Si en el futuro queremos modelar combat dinámico,
// extender con el pipFraction del target loadout cuando lo conozcamos.
// =============================================================================

import { resolveShieldResists, computeDamageFlow, estimateTimeToKill } from "./damage";

export interface AttackerWeapon {
  hardpointName: string;
  weaponName: string;
  size: number | null;
  alphaPhysical: number;
  alphaEnergy: number;
  alphaDistortion: number;
  alphaTotal: number;
  /** Sustained DPS por arma (post-W.2). Si es 0 el arma no contribuye. */
  sustainedDps: number;
}

export interface TargetShipDef {
  name: string;
  shipId: string;
  /** HP total del shield (suma primary + reserve). */
  shieldHp: number;
  /** HP del casco. */
  hullHp: number;
  /** Resistencias min/max del shield primary (interpoladas por pipFraction). */
  shieldResistMin: {
    physical: number | null;
    energy: number | null;
    distortion: number | null;
  };
  shieldResistMax: {
    physical: number | null;
    energy: number | null;
    distortion: number | null;
  };
  shieldAbsMin: {
    physical: number | null;
    energy: number | null;
    distortion: number | null;
  };
  shieldAbsMax: {
    physical: number | null;
    energy: number | null;
    distortion: number | null;
  };
  /** Armor deflection thresholds (alpha ≤ deflect → 0). */
  deflectionPhysical: number | null;
  deflectionEnergy: number | null;
  /** Damage multipliers when shield down. */
  dmgMultPhysical: number | null;
  dmgMultEnergy: number | null;
  dmgMultDistortion: number | null;
}

export interface TtkResult {
  shieldDpsTotal: number;
  bleedDpsTotal: number;
  directDpsTotal: number;
  shieldHp: number;
  hullHp: number;
  ttkShieldSec: number | null; // null = no rompe shield
  ttkHullSec: number | null;
  ttkTotalSec: number | null;
  perWeapon: Array<{
    hardpointName: string;
    weaponName: string;
    size: number | null;
    shieldDps: number;
    bleedDps: number;
    directDps: number;
  }>;
}

/**
 * Calcula TTK contra un target. Asume shield del target a full pips (1.0 ratio)
 * por default — caso peor para el attacker.
 */
export function computeTtk(
  attacker: AttackerWeapon[],
  target: TargetShipDef,
  shieldPipFraction = 1,
): TtkResult {
  const resists = resolveShieldResists(
    {
      resistPhysical: target.shieldResistMin.physical,
      resistEnergy: target.shieldResistMin.energy,
      resistDistortion: target.shieldResistMin.distortion,
      absorptionPhysical: target.shieldAbsMin.physical,
      absorptionEnergy: target.shieldAbsMin.energy,
      absorptionDistortion: target.shieldAbsMin.distortion,
    },
    {
      resistPhysical: target.shieldResistMax.physical,
      resistEnergy: target.shieldResistMax.energy,
      resistDistortion: target.shieldResistMax.distortion,
      absorptionPhysical: target.shieldAbsMax.physical,
      absorptionEnergy: target.shieldAbsMax.energy,
      absorptionDistortion: target.shieldAbsMax.distortion,
    },
    shieldPipFraction,
  );

  const armor = {
    deflectionPhysical: target.deflectionPhysical,
    deflectionEnergy: target.deflectionEnergy,
    dmgMultPhysical: target.dmgMultPhysical,
    dmgMultEnergy: target.dmgMultEnergy,
    dmgMultDistortion: target.dmgMultDistortion,
  };

  const perWeapon: TtkResult["perWeapon"] = [];
  let shieldDpsTotal = 0;
  let bleedDpsTotal = 0;
  let directDpsTotal = 0;

  for (const w of attacker) {
    if (w.sustainedDps <= 0 || w.alphaTotal <= 0) {
      perWeapon.push({
        hardpointName: w.hardpointName,
        weaponName: w.weaponName,
        size: w.size,
        shieldDps: 0,
        bleedDps: 0,
        directDps: 0,
      });
      continue;
    }

    // Flow per shot, normalizado al alphaTotal del arma:
    const flowUp = computeDamageFlow(
      {
        physical: w.alphaPhysical,
        energy: w.alphaEnergy,
        distortion: w.alphaDistortion,
      },
      resists,
      armor,
      true, // shield up
    );
    const flowDown = computeDamageFlow(
      {
        physical: w.alphaPhysical,
        energy: w.alphaEnergy,
        distortion: w.alphaDistortion,
      },
      resists,
      armor,
      false, // shield down
    );

    // Convertir el flow per-shot a DPS multiplicando por la fracción de daño
    // que el sustainedDps representa relativa al alphaTotal del arma.
    const shieldFactor = flowUp.shieldDamage / w.alphaTotal;
    const bleedFactor = flowUp.hullBleedthrough / w.alphaTotal;
    const directFactor = flowDown.hullDirect / w.alphaTotal;

    const shieldDps = w.sustainedDps * shieldFactor;
    const bleedDps = w.sustainedDps * bleedFactor;
    const directDps = w.sustainedDps * directFactor;

    shieldDpsTotal += shieldDps;
    bleedDpsTotal += bleedDps;
    directDpsTotal += directDps;
    perWeapon.push({
      hardpointName: w.hardpointName,
      weaponName: w.weaponName,
      size: w.size,
      shieldDps,
      bleedDps,
      directDps,
    });
  }

  const ttk = estimateTimeToKill({
    shieldHp: target.shieldHp,
    hullHp: target.hullHp,
    shieldDpsIncoming: shieldDpsTotal,
    hullBleedthroughDpsIncoming: bleedDpsTotal,
    hullDirectDpsIncoming: directDpsTotal,
  });

  return {
    shieldDpsTotal,
    bleedDpsTotal,
    directDpsTotal,
    shieldHp: target.shieldHp,
    hullHp: target.hullHp,
    ttkShieldSec: ttk?.timeToShieldDown ?? null,
    ttkHullSec: ttk?.timeToHullKill ?? null,
    ttkTotalSec: ttk
      ? Number.isFinite(ttk.timeToHullKill)
        ? ttk.timeTotalSec
        : null
      : null,
    perWeapon,
  };
}
