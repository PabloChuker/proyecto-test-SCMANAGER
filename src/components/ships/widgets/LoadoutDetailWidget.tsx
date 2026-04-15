// =============================================================================
// AL FILO — LoadoutDetailWidget
// Self-contained: reads stats, flightMode, setFlightMode, shipInfo from store.
// Re-renders when overrides change (stats update) or flightMode changes.
// =============================================================================
"use client";

import { memo } from "react";
import Image from "next/image";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { useShallow } from "zustand/react/shallow";
import { fmtStat, fmtDps } from "@/components/ships/loadout-utils";

// ── Mode toggle button ────────────────────────────────────────────────────────
function ModeBtn({ label, active, c, onClick }: {
  label: string; active: boolean; c: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={active
        ? "px-3 py-1 text-[9px] font-mono font-bold tracking-[0.12em] uppercase text-center border"
        : "px-3 py-1 text-[9px] font-mono tracking-[0.12em] uppercase text-center text-zinc-600 border border-zinc-800/50 hover:text-zinc-400 transition-colors"}
      style={active ? { backgroundColor: c + "20", color: c, borderColor: c + "60" } : undefined}
    >
      {label}
    </button>
  );
}

// ── Store-connected export ────────────────────────────────────────────────────
export const LoadoutDetailContent = memo(function LoadoutDetailContent() {
  const { shipInfo, overrides, flightMode } = useLoadoutStore(
    useShallow(s => ({ shipInfo: s.shipInfo, overrides: s.overrides, flightMode: s.flightMode }))
  );
  const getStats      = useLoadoutStore(s => s.getStats);
  const setFlightMode = useLoadoutStore(s => s.setFlightMode);

  if (!shipInfo) return null;

  const si    = shipInfo as any;
  const stats = getStats();
  // overrides subscribed so we re-render when items change
  void overrides;

  const navMode = flightMode === "NAV";

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-2.5 space-y-2.5">
      {/* Mode toggle */}
      <div className="flex gap-1.5">
        <ModeBtn label="SCM" active={flightMode === "SCM"} c="#eab308" onClick={() => setFlightMode("SCM")} />
        <ModeBtn label="NAV" active={navMode}              c="#8b5cf6" onClick={() => setFlightMode("NAV")} />
      </div>

      {/* Weapons DPS / Alpha */}
      <div className={navMode ? "opacity-30" : ""}>
        <div className="text-[7px] font-mono text-zinc-600 tracking-wider uppercase mb-0.5">Sustained</div>
        <div className="flex items-baseline gap-3">
          <Image src="/icons/weapons.png" alt="" width={16} height={16} style={{ opacity: 0.5 }} />
          <span className="text-2xl font-mono font-bold tabular-nums text-red-500">{fmtDps(stats.totalDps)}</span>
          <span className="text-[10px] font-mono text-zinc-500">dps</span>
          <span className="text-lg font-mono font-bold tabular-nums text-red-400/70">{fmtStat(stats.totalAlpha)}</span>
          <span className="text-[10px] font-mono text-zinc-500">alpha</span>
        </div>
      </div>

      {/* Missiles */}
      <div className={navMode ? "opacity-30" : ""}>
        <div className="flex items-baseline gap-3">
          <Image src="/icons/missile.png" alt="" width={16} height={16} style={{ opacity: 0.5 }} />
          <span className="text-lg font-mono font-bold tabular-nums text-orange-500">
            {stats.summary.missiles > 0 ? fmtStat(stats.totalAlpha) : "0"}
          </span>
          <span className="text-[10px] font-mono text-zinc-500">dmg</span>
        </div>
      </div>

      {/* Shield regen time */}
      <div>
        <div className="flex items-baseline gap-3">
          <span className="text-[11px]" style={{ color: "#eab308", opacity: 0.5 }}>⏱</span>
          <span className="text-lg font-mono font-bold tabular-nums text-amber-500">
            {stats.shieldRegen > 0 ? (stats.shieldHp / Math.max(stats.shieldRegen, 0.01)).toFixed(1) : "—"}
          </span>
          <span className="text-[10px] font-mono text-zinc-500">s full regen time</span>
        </div>
      </div>

      {/* Shield HP + regen rate */}
      <div>
        <div className="flex items-baseline gap-3">
          <Image src="/icons/shilds.png" alt="" width={16} height={16} style={{ opacity: 0.5 }} />
          <span className="text-xl font-mono font-bold tabular-nums text-blue-500">
            {stats.shieldHp > 0 ? fmtStat(stats.shieldHp) : (si.shieldHpTotal ? fmtStat(si.shieldHpTotal) : "0")}
          </span>
          <span className="text-[10px] font-mono text-zinc-500">hp</span>
          {stats.shieldRegen > 0 && (
            <>
              <span className="text-sm font-mono tabular-nums text-blue-400/70">{fmtStat(stats.shieldRegen)}</span>
              <span className="text-[10px] font-mono text-zinc-500">hp/s</span>
            </>
          )}
        </div>
      </div>

      {/* Hull HP */}
      {si.hullHp && si.hullHp > 0 && (
        <div>
          <div className="flex items-baseline gap-3">
            <Image src="/icons/Ships.png" alt="" width={16} height={16} style={{ opacity: 0.5 }} />
            <span className="text-lg font-mono font-bold tabular-nums text-zinc-400">{fmtStat(si.hullHp)}</span>
            <span className="text-[10px] font-mono text-zinc-500">hp</span>
          </div>
        </div>
      )}
    </div>
  );
});
