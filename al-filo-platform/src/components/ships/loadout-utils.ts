// =============================================================================
// AL FILO — Loadout UI constants
// Shared across LoadoutBuilder, HardpointSlot, ComponentPicker
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

export function getKeyStat(category: string, stats: Record<string, any> | null | undefined): { v: string; l: string } | null {
  if (!stats || typeof stats !== "object") return null;
  switch (category) {
    case "WEAPON": case "TURRET": return stats.dps ? { v: Number(stats.dps).toFixed(1), l: "DPS" } : (stats.alphaDamage ? { v: fmtStat(Number(stats.alphaDamage)), l: "Alpha" } : null);
    case "MISSILE_RACK": return stats.alphaDamage ? { v: fmtStat(Number(stats.alphaDamage)), l: "DMG" } : (stats.damage ? { v: fmtStat(Number(stats.damage)), l: "DMG" } : null);
    case "SHIELD": return stats.shieldHp ? { v: fmtStat(Number(stats.shieldHp)), l: "HP" } : (stats.maxHp ? { v: fmtStat(Number(stats.maxHp)), l: "HP" } : null);
    case "POWER_PLANT": return stats.powerOutput ? { v: fmtStat(Number(stats.powerOutput)), l: "OUT" } : null;
    case "COOLER": return stats.coolingRate ? { v: fmtStat(Number(stats.coolingRate)), l: "RATE" } : null;
    case "QUANTUM_DRIVE": return stats.quantumSpoolUp ? { v: Number(stats.quantumSpoolUp).toFixed(1) + "s", l: "SPOOL" } : (stats.spoolUpTime ? { v: Number(stats.spoolUpTime).toFixed(1) + "s", l: "SPOOL" } : null);
    default: return stats.powerDraw ? { v: fmtStat(Number(stats.powerDraw)), l: "PWR" } : null;
  }
}
