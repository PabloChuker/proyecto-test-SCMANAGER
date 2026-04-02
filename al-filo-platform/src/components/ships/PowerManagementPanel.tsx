// =============================================================================
// AL FILO — PowerManagementPanel v3 (Click Toggle, No Right-Click)
// =============================================================================

"use client";

import { useLoadoutStore } from "@/store/useLoadoutStore";
import type { FlightMode, PowerCategory, ComputedStats } from "@/store/useLoadoutStore";
import { fmtStat } from "./loadout-utils";

const CAT_META: Record<PowerCategory, { icon: string; color: string; short: string }> = {
  weapons: { icon: "⬡", color: "#ef4444", short: "WPN" },
  thrusters: { icon: "△", color: "#a855f7", short: "THR" },
  shields: { icon: "◇", color: "#3b82f6", short: "SHD" },
  quantum: { icon: "◈", color: "#8b5cf6", short: "QT" },
  radar: { icon: "◎", color: "#22c55e", short: "RAD" },
  coolers: { icon: "❄", color: "#06b6d4", short: "CLR" },
};
const MAX_BLOCKS = 8;

export function PowerManagementPanel({ stats, flightMode, onModeChange }: { stats: ComputedStats; flightMode: FlightMode; onModeChange: (m: FlightMode) => void }) {
  const { allocatedPower, setAllocatedPower, autoAllocatePower } = useLoadoutStore();
  const pn = stats.powerNetwork;
  const activeCats = pn.activeCategories;
  const consumColor = pn.consumptionPercent > 100 ? "#ef4444" : pn.consumptionPercent > 80 ? "#f97316" : "#22c55e";
  const outputColor = pn.freePoints < 0 ? "#ef4444" : pn.freePoints === 0 ? "#f97316" : "#22c55e";

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-zinc-800/50 bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <Hdr icon="|||" val={fmtStat(stats.thermalOutput)} c="#f97316" />
          <Hdr icon="⚡" val={fmtStat(stats.powerDraw)} c="#eab308" />
        </div>
        <div className="flex items-center gap-3">
          <Hdr icon="⚡" val={fmtStat(stats.coolingRate)} c="#06b6d4" />
          <Hdr icon="◉" val={fmtStat(stats.emSignature)} c="#eab308" />
          <Hdr icon="◉" val={fmtStat(stats.irSignature)} c="#f97316" />
        </div>
      </div>
      <div className="p-2.5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-mono text-zinc-500 tracking-wider">⚡ OUTPUT</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-mono font-bold" style={{ color: outputColor }}>{pn.totalAllocated}</span>
            <span className="text-sm font-mono text-zinc-600">/ {pn.totalOutput}</span>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-zinc-500 tracking-wider">⚙ CONSUMPTION</span>
            <span className="text-sm font-mono font-bold" style={{ color: consumColor }}>{pn.consumptionPercent} %</span>
          </div>
          <div className="h-2 bg-zinc-800/60 rounded-sm overflow-hidden">
            <div className="h-full rounded-sm transition-all duration-300" style={{ width: Math.min(100, pn.consumptionPercent) + "%", backgroundColor: consumColor }} />
          </div>
        </div>
        {activeCats.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(" + activeCats.length + ", 1fr)", gap: "4px" }}>
            {activeCats.map(cat => (
              <EqCol key={cat} cat={cat} info={pn.categories[cat]} alloc={allocatedPower[cat]} free={pn.freePoints} onSet={(p) => setAllocatedPower(cat, p)} />
            ))}
          </div>
        )}
        <button onClick={autoAllocatePower} className="w-full py-1 text-[8px] font-mono text-zinc-600 tracking-widest uppercase border border-zinc-800/40 hover:border-zinc-600/40 hover:text-zinc-400 transition-colors">AUTO-BALANCE</button>
        <div className="flex gap-px">
          <ModeBtn label="SCM MODE" active={flightMode === "SCM"} c="#eab308" onClick={() => onModeChange("SCM")} />
          <ModeBtn label="NAV MODE" active={flightMode === "NAV"} c="#8b5cf6" onClick={() => onModeChange("NAV")} />
        </div>
      </div>
    </div>
  );
}

function Hdr({ icon, val, c }: { icon: string; val: string; c: string }) {
  return <div className="flex items-center gap-1"><span className="text-[10px]" style={{ color: c, opacity: 0.7 }}>{icon}</span><span className="text-[10px] font-mono" style={{ color: c }}>{val}</span></div>;
}
function ModeBtn({ label, active, c, onClick }: { label: string; active: boolean; c: string; onClick: () => void }) {
  return <button onClick={onClick} className={active ? "flex-1 py-1.5 text-[9px] font-mono font-bold tracking-[0.12em] uppercase text-center border" : "flex-1 py-1.5 text-[9px] font-mono tracking-[0.12em] uppercase text-center text-zinc-600 border border-zinc-800/50 hover:text-zinc-400 transition-colors"} style={active ? { backgroundColor: c + "20", color: c, borderColor: c + "60" } : undefined}>{label}</button>;
}

function EqCol({ cat, info, alloc, free, onSet }: { cat: PowerCategory; info: { minDraw: number }; alloc: number; free: number; onSet: (p: number) => void }) {
  const meta = CAT_META[cat];
  const minDraw = Math.ceil(info.minDraw);
  const numBlocks = Math.min(Math.max(MAX_BLOCKS, alloc + 1, minDraw + 1), MAX_BLOCKS);

  const blocks = [];
  for (let i = numBlocks - 1; i >= 0; i--) {
    const level = i + 1;
    const filled = level <= alloc;
    const deficit = level <= minDraw && level > alloc;
    const isMinMark = level === minDraw && minDraw > 0;

    // LEFT-CLICK TOGGLE: filled → remove, empty → add (if free > 0)
    const handleClick = () => {
      if (filled) {
        onSet(level - 1); // Click filled block → remove down to this level
      } else if (free > 0) {
        onSet(level); // Click empty block → fill up to this level
      }
    };

    let bg = "bg-zinc-800/30 border-zinc-800/40";
    let style: React.CSSProperties = {};
    if (filled) { bg = "border-transparent"; style = { backgroundColor: meta.color, opacity: 0.75 }; }
    else if (deficit) { bg = "border-transparent"; style = { backgroundColor: "#ef4444", opacity: 0.25 }; }

    blocks.push(
      <div key={i} onClick={handleClick} className={"w-full h-3.5 border rounded-[2px] transition-all duration-100 relative cursor-pointer hover:brightness-125 " + bg} style={style}>
        {isMinMark && <span className="absolute inset-0 flex items-center justify-center text-[7px] font-mono font-bold text-white/90">{minDraw}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px]" style={{ color: meta.color, opacity: 0.6 }}>{meta.icon}</span>
      <div className="w-full space-y-[2px]">{blocks}</div>
      <span className="text-[7px] font-mono text-zinc-600 tracking-wider mt-0.5">{meta.short}</span>
      <span className="text-[10px] font-mono font-bold" style={{ color: alloc < minDraw ? "#ef4444" : meta.color }}>{alloc}</span>
    </div>
  );
}
