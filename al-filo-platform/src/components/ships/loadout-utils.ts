// =============================================================================
// AL FILO — Loadout UI constants v2
// Fixed: getKeyStat reads both v1 and v2 stat field names
// =============================================================================

export const CAT_COLORS: Record<string, string> = {
  WEAPON: "#ef4444", TURRET: "#f59e0b", MISSILE_RACK: "#f97316",
  SHIELD: "#3b82f6", POWER_PLANT: "#22c55e", COOLER: "#06b6d4",
  QUANTUM_DRIVE: "#a855f7", MINING: "#f472b6", UTILITY: "#94a3b8",
  OTHER: "#71717a",
};

export function fmtStat(v: number): string {
  if (v === 0) return "0";
  if (Math.abs(v) >= 10000) return (v / 1000).toFixed(1) + "k";
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(2) + "k";
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(1);
}

export function fmtDps(v: number): string {
  if (v === 0) return "0";
  if (v >= 1000) return (v / 1000).toFixed(2) + "k";
  return v.toFixed(1);
}

export function fmtPrice(v: number): string {
  if (v >= 1000000) return (v / 1000000).toFixed(2) + "M";
  if (v >= 1000) return (v / 1000).toFixed(1) + "k";
  return v.toString();
}

/** Try multiple field names, return first non-null number */
function tryNum(stats: Record<string, any>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = stats[k];
    if (v !== null && v !== undefined) {
      const n = Number(v);
      if (!isNaN(n) && n !== 0) return n;
    }
  }
  return null;
}

export function getKeyStat(category: string, stats: Record<string, any> | null | undefined): { v: string; l: string } | null {
  if (!stats || typeof stats !== "object") return null;

  switch (category) {
    case "WEAPON":
    case "TURRET": {
      const dps = tryNum(stats, "dps");
      if (dps !== null) return { v: dps.toFixed(1), l: "DPS" };
      const alpha = tryNum(stats, "alphaDamage", "damage");
      if (alpha !== null) return { v: fmtStat(alpha), l: "Alpha" };
      return null;
    }
    case "MISSILE_RACK": {
      const dmg = tryNum(stats, "alphaDamage", "damage");
      return dmg !== null ? { v: fmtStat(dmg), l: "DMG" } : null;
    }
    case "SHIELD": {
      const hp = tryNum(stats, "shieldHp", "maxHp");
      return hp !== null ? { v: fmtStat(hp), l: "HP" } : null;
    }
    case "POWER_PLANT": {
      const out = tryNum(stats, "powerOutput");
      return out !== null ? { v: fmtStat(out), l: "OUT" } : null;
    }
    case "COOLER": {
      const rate = tryNum(stats, "coolingRate");
      return rate !== null ? { v: fmtStat(rate), l: "RATE" } : null;
    }
    case "QUANTUM_DRIVE": {
      const spool = tryNum(stats, "quantumSpoolUp", "spoolUpTime");
      return spool !== null ? { v: spool.toFixed(1) + "s", l: "SPOOL" } : null;
    }
    default: {
      const pwr = tryNum(stats, "powerDraw");
      return pwr !== null ? { v: fmtStat(pwr), l: "PWR" } : null;
    }
  }
}
