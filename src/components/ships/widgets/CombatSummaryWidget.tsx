// =============================================================================
// AL FILO — CombatSummaryWidget
// Self-contained: reads stats, flightMode, shipInfo from store.
// Re-renders when overrides change (weapons equipped) or flightMode changes.
// Does NOT re-render due to unrelated store mutations.
// =============================================================================
"use client";

import { memo } from "react";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { useShallow } from "zustand/react/shallow";
import { fmtStat, fmtDps } from "@/components/ships/loadout-utils";

// ── Compact stat tile ─────────────────────────────────────────────────────────
function CompactStat({ label, value, color, locked }: {
  label: string; value: string; color: string; locked?: boolean;
}) {
  return (
    <div className="bg-zinc-950/40 border border-zinc-800/40 p-1.5 relative overflow-hidden">
      {locked && (
        <div className="absolute inset-0 bg-zinc-950/50 z-10 flex items-center justify-center">
          <span className="text-[7px] font-mono text-zinc-600 tracking-wider uppercase">NAV</span>
        </div>
      )}
      <div className="text-[7px] font-mono text-zinc-600 tracking-[0.15em] uppercase">{label}</div>
      <div className="text-sm font-mono font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

// ── Store-connected export ────────────────────────────────────────────────────
export const CombatSummaryContent = memo(function CombatSummaryContent() {
  const { shipInfo, overrides, flightMode } = useLoadoutStore(
    useShallow(s => ({ shipInfo: s.shipInfo, overrides: s.overrides, flightMode: s.flightMode }))
  );
  const getStats = useLoadoutStore(s => s.getStats);

  if (!shipInfo) return null;

  const si    = shipInfo as any;
  const stats = getStats();
  // overrides subscribed for re-render when items change
  void overrides;

  const navMode = flightMode === "NAV";

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-2.5 space-y-1.5">
      <div className="grid grid-cols-2 gap-2">
        <CompactStat label="DPS"      value={fmtDps(stats.totalDps)}    color={navMode ? "#52525b" : "#ef4444"} locked={navMode} />
        <CompactStat label="ALPHA"    value={fmtStat(stats.totalAlpha)} color={navMode ? "#52525b" : "#f97316"} locked={navMode} />
        <CompactStat label="SHIELD HP" value={fmtStat(stats.shieldHp)}  color="#3b82f6" />
        <CompactStat label="SH REGEN" value={fmtStat(stats.shieldRegen)} color={navMode ? "#52525b" : "#60a5fa"} />
      </div>
      {(si.deflectionPhysical || si.deflectionEnergy || si.deflectionDistortion) ? (
        <div className="border-t border-zinc-800/40 pt-1.5">
          <div className="text-[8px] font-mono text-zinc-600 tracking-wider uppercase mb-1">Armor Deflection</div>
          <div className="flex gap-3">
            {si.deflectionPhysical   && <div className="flex items-center gap-1"><span className="text-[8px] font-mono text-zinc-500">PHY</span><span className="text-[11px] font-mono font-bold text-amber-400">{si.deflectionPhysical}</span></div>}
            {si.deflectionEnergy     && <div className="flex items-center gap-1"><span className="text-[8px] font-mono text-zinc-500">ENG</span><span className="text-[11px] font-mono font-bold text-cyan-400">{si.deflectionEnergy}</span></div>}
            {si.deflectionDistortion && <div className="flex items-center gap-1"><span className="text-[8px] font-mono text-zinc-500">DST</span><span className="text-[11px] font-mono font-bold text-purple-400">{si.deflectionDistortion}</span></div>}
          </div>
        </div>
      ) : null}
    </div>
  );
});
