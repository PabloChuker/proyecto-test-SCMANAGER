// =============================================================================
// AL FILO — PowerManagementPanel v5 (Erkul Power Triangle)
//
// Each column = one power CATEGORY (weapons, thrusters, shields, quantum,
// mining/turrets, radar, life support, coolers).
// Each square = 1 energy unit from the power plant.
// Green = allocated, Orange = minimum required, Dark = available but unassigned.
// Total available squares per column = max capacity that category can receive.
// Total energy units across all columns = power plant output.
//
// Click a dark square to allocate energy up to that level.
// Click a green square to deallocate down to that level.
// =============================================================================

"use client";

import { useLoadoutStore } from "@/store/useLoadoutStore";
import type { FlightMode, PowerCategory, ComputedStats } from "@/store/useLoadoutStore";
import { fmtStat } from "./loadout-utils";

// Category visual config — order matches Erkul left→right
const CATEGORY_ORDER: PowerCategory[] = ["weapons", "thrusters", "shields", "quantum", "radar", "coolers"];

const CAT_META: Record<PowerCategory, { icon: string; color: string; label: string }> = {
  weapons:   { icon: "⬡", color: "#22c55e", label: "WPN" },
  thrusters: { icon: "△", color: "#22c55e", label: "THR" },
  shields:   { icon: "◇", color: "#22c55e", label: "SHD" },
  quantum:   { icon: "◈", color: "#22c55e", label: "QT" },
  radar:     { icon: "◎", color: "#22c55e", label: "RAD" },
  coolers:   { icon: "❄", color: "#22c55e", label: "CLR" },
};

export function PowerManagementPanel({ stats, flightMode, onModeChange }: { stats: ComputedStats; flightMode: FlightMode; onModeChange: (m: FlightMode) => void }) {
  const { allocatedPower, setAllocatedPower, autoAllocatePower } = useLoadoutStore();
  const pn = stats.powerNetwork;
  const consumColor = pn.consumptionPercent > 100 ? "#ef4444" : pn.consumptionPercent > 80 ? "#f97316" : "#22c55e";
  const outputColor = pn.freePoints < 0 ? "#ef4444" : pn.freePoints === 0 ? "#f97316" : "#22c55e";

  // Only show categories that have components
  const visibleCats = CATEGORY_ORDER.filter(cat => pn.categories[cat].componentCount > 0);

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60">
      {/* ── Signature Indicators Row ── */}
      <div className="flex items-center justify-center gap-4 px-2.5 py-1.5 border-b border-zinc-800/50 bg-zinc-900/50">
        <SigIndicator icon="⦿" value={stats.emSignature} color="#a855f7" />
        <SigIndicator icon="⚡" value={stats.irSignature} color="#f97316" />
        <SigIndicator icon="◈" value={stats.thermalOutput} color="#22c55e" />
      </div>

      <div className="p-2.5 space-y-2.5">
        {/* ── OUTPUT ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-amber-600/60 text-[12px]">⚙</span>
            <span className="text-[9px] font-mono text-amber-600/80 tracking-[0.15em] uppercase">Output</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-mono font-bold tabular-nums" style={{ color: outputColor }}>{pn.totalAllocated}</span>
            <span className="text-[11px] font-mono text-zinc-600">/ {pn.totalOutput}</span>
          </div>
        </div>

        {/* ── CONSUMPTION ── */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-amber-600/60 text-[12px]">⊛</span>
              <span className="text-[9px] font-mono text-amber-600/80 tracking-[0.15em] uppercase">Consumption</span>
            </div>
            <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: consumColor }}>{pn.consumptionPercent} %</span>
          </div>
          <div className="h-1.5 bg-zinc-800/60 rounded-sm overflow-hidden">
            <div className="h-full rounded-sm transition-all duration-500" style={{ width: Math.min(100, pn.consumptionPercent) + "%", backgroundColor: consumColor }} />
          </div>
        </div>

        {/* ── Energy Allocation Grid (Erkul-style) ── */}
        {visibleCats.length > 0 && (
          <div className="py-1">
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${visibleCats.length}, 1fr)`, gap: "6px" }}>
              {visibleCats.map(cat => (
                <PowerColumn
                  key={cat}
                  cat={cat}
                  allocated={allocatedPower[cat]}
                  minDraw={Math.ceil(pn.categories[cat].minDraw)}
                  maxCapacity={getMaxCapacity(cat, pn.totalOutput, visibleCats.length)}
                  freePoints={pn.freePoints}
                  onSet={(p) => setAllocatedPower(cat, p)}
                  isDisabledByMode={cat === "quantum" && flightMode === "SCM"}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Auto Balance ── */}
        <button onClick={autoAllocatePower} className="w-full py-1 text-[8px] font-mono text-zinc-600 tracking-widest uppercase border border-zinc-800/40 hover:border-amber-800/40 hover:text-amber-500/70 transition-colors">
          AUTO-BALANCE
        </button>

        {/* ── SCM / NAV Mode ── */}
        <div className="flex gap-px">
          <ModeBtn label="SCM MODE" active={flightMode === "SCM"} c="#eab308" onClick={() => onModeChange("SCM")} />
          <ModeBtn label="NAV MODE" active={flightMode === "NAV"} c="#8b5cf6" onClick={() => onModeChange("NAV")} />
        </div>
      </div>
    </div>
  );
}

// ── Calculate max capacity per category ──
// In SC, each category has a max it can receive (roughly proportional).
// For now we use 8 as max per category (like Erkul), will be data-driven later.
function getMaxCapacity(_cat: PowerCategory, _totalOutput: number, _numCats: number): number {
  return 8; // Each category column shows up to 8 blocks. Will be refined with real data.
}

// ── Power Column: one category's energy allocation ──
function PowerColumn({ cat, allocated, minDraw, maxCapacity, freePoints, onSet, isDisabledByMode }: {
  cat: PowerCategory;
  allocated: number;
  minDraw: number;
  maxCapacity: number;
  freePoints: number;
  onSet: (p: number) => void;
  isDisabledByMode?: boolean;
}) {
  const meta = CAT_META[cat];
  // Show enough blocks: at least minDraw, at least allocated, up to maxCapacity
  const numBlocks = Math.min(maxCapacity, Math.max(maxCapacity, allocated + 2, minDraw + 2));

  const blocks = [];
  // Build from top (highest energy) to bottom (1 unit)
  for (let i = numBlocks - 1; i >= 0; i--) {
    const level = i + 1;
    const isFilled = level <= allocated;
    const isMinRequired = level <= minDraw;
    const isAboveAlloc = level > allocated;

    const handleClick = () => {
      if (isDisabledByMode) return;
      if (isFilled) {
        // Click green/orange block → deallocate down to level-1
        onSet(level - 1);
      } else if (freePoints > 0) {
        // Click dark block → allocate up to this level
        onSet(level);
      }
    };

    // Determine block color:
    // - Green (#22c55e): allocated energy above minimum
    // - Orange (#f97316): minimum required (whether allocated or not)
    // - Dark (#1a1a1a): available capacity, not allocated
    let bgColor: string;
    let opacity: number;
    let borderColor: string;

    if (isFilled && isMinRequired) {
      // Allocated AND at/below minimum → green (it's working, minimum met)
      bgColor = "#22c55e";
      opacity = 0.7;
      borderColor = "#22c55e";
    } else if (isFilled && !isMinRequired) {
      // Allocated above minimum → green
      bgColor = "#22c55e";
      opacity = 0.7;
      borderColor = "#22c55e";
    } else if (!isFilled && isMinRequired) {
      // NOT allocated but IS minimum required → orange (warning: underpowered!)
      bgColor = "#f97316";
      opacity = 0.5;
      borderColor = "#f97316";
    } else {
      // Not allocated, not minimum → dark (available capacity)
      bgColor = "#27272a";
      opacity = 0.4;
      borderColor = "#3f3f46";
    }

    if (isDisabledByMode) {
      opacity *= 0.3;
    }

    blocks.push(
      <div
        key={i}
        onClick={handleClick}
        className="w-full rounded-[2px] transition-all duration-100 relative flex items-center justify-center"
        style={{
          height: "14px",
          backgroundColor: bgColor,
          opacity,
          border: `1px solid ${borderColor}`,
          cursor: isDisabledByMode ? "not-allowed" : "pointer",
        }}
        title={`${meta.label}: level ${level}${isMinRequired ? " (min required)" : ""}${isFilled ? " (allocated)" : ""}`}
      >
        {/* Show the minimum number on the min-required boundary */}
        {level === minDraw && minDraw > 0 && (
          <span className="text-[8px] font-mono font-bold text-white/90 drop-shadow-sm">
            {minDraw}
          </span>
        )}
        {/* Show allocated number on top block */}
        {level === allocated && allocated > 0 && level !== minDraw && (
          <span className="text-[8px] font-mono font-bold text-white/90 drop-shadow-sm">
            {allocated}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-[2px]">
      {/* Blocks stack (top = highest, bottom = 1) */}
      <div className="w-full space-y-[2px]">
        {blocks}
      </div>
      {/* Category icon below */}
      <span className="text-[11px] mt-1" style={{ color: meta.color, opacity: isDisabledByMode ? 0.2 : 0.5 }}>
        {meta.icon}
      </span>
    </div>
  );
}

// ── Signature indicator ──
function SigIndicator({ icon, value, color }: { icon: string; value: number; color: string }) {
  const fmt = (v: number) => {
    if (v >= 10000) return (v / 1000).toFixed(1) + "K";
    if (v >= 1000) return (v / 1000).toFixed(1) + "K";
    return Math.round(v).toString();
  };
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px]" style={{ color, opacity: 0.6 }}>{icon}</span>
      <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color }}>{fmt(value)}</span>
    </div>
  );
}

// ── Mode button ──
function ModeBtn({ label, active, c, onClick }: { label: string; active: boolean; c: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={active
        ? "flex-1 py-1.5 text-[9px] font-mono font-bold tracking-[0.12em] uppercase text-center border"
        : "flex-1 py-1.5 text-[9px] font-mono tracking-[0.12em] uppercase text-center text-zinc-600 border border-zinc-800/50 hover:text-zinc-400 transition-colors"
      }
      style={active ? { backgroundColor: c + "20", color: c, borderColor: c + "60" } : undefined}
    >
      {label}
    </button>
  );
}
