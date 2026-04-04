// =============================================================================
// AL FILO — PowerManagementPanel v11 (Erkul-style Grid)
//
// Replicates the Erkul / spviewer power grid:
//   - ALWAYS 6 rows (cells) per column, fixed height
//   - 1 column per component INSTANCE (2 coolers = 2 columns)
//   - Columns tightly packed side by side, no gaps between groups
//   - Tier number shown inside each allocated cell
//   - Colors: ORANGE for weapons, GREEN for systems, DARK for empty/locked
//   - Below: category icons with % performance
//   - Above: OUTPUT x/y, CONSUMPTION z%
//   - SCM MODE / NAV MODE toggle
// =============================================================================

"use client";

import React, { useMemo } from "react";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import type {
  FlightMode,
  PowerCategory,
  ComputedStats,
  ComponentPowerInstance,
} from "@/store/useLoadoutStore";

// ── Constants ──
const ROWS = 6; // Always 6 cells high, like in-game

// ── Category metadata ──
const CATEGORY_ORDER: PowerCategory[] = [
  "weapons", "quantum", "radar", "shields", "coolers", "thrusters",
];

interface CatMeta { label: string; icon: string; color: string; }
const CAT_META: Record<PowerCategory, CatMeta> = {
  weapons:   { label: "WPN", icon: "▮▮▮", color: "#f59e0b" },   // amber/orange
  shields:   { label: "SHD", icon: "◇",   color: "#22c55e" },   // green
  coolers:   { label: "CLR", icon: "❄",   color: "#22c55e" },   // green
  quantum:   { label: "QDR", icon: "◈",   color: "#f59e0b" },   // orange
  radar:     { label: "RAD", icon: "◎",   color: "#f59e0b" },   // orange
  thrusters: { label: "THR", icon: "▷▷",  color: "#22c55e" },   // green
};

// Weapons are orange, everything else is green (like Erkul)
function cellColor(cat: PowerCategory): string {
  return cat === "weapons" || cat === "quantum" || cat === "radar"
    ? "#f59e0b" // amber/orange
    : "#22c55e"; // green
}

// =============================================================================
// Main Component
// =============================================================================

export function PowerManagementPanel({
  stats,
  flightMode,
  onModeChange,
}: {
  stats: ComputedStats;
  flightMode: FlightMode;
  onModeChange: (m: FlightMode) => void;
}) {
  const { autoAllocatePower, setInstancePower } = useLoadoutStore();
  const pn = stats.powerNetwork;

  // Build ordered columns: group by category in CATEGORY_ORDER
  const columns = useMemo(() => {
    const cols: ComponentPowerInstance[] = [];
    for (const cat of CATEGORY_ORDER) {
      const catInstances = pn.instances
        .filter((i) => i.category === cat)
        .sort((a, b) => a.hardpointName.localeCompare(b.hardpointName));
      cols.push(...catInstances);
    }
    return cols;
  }, [pn.instances]);

  // Per-category performance % (allocated / max pips * 100)
  const catPerf = useMemo(() => {
    const perf: Record<PowerCategory, { alloc: number; max: number; count: number }> = {} as any;
    for (const c of CATEGORY_ORDER) perf[c] = { alloc: 0, max: 0, count: 0 };
    for (const inst of pn.instances) {
      perf[inst.category].alloc += inst.allocatedPips;
      perf[inst.category].max += inst.totalPips;
      perf[inst.category].count++;
    }
    return perf;
  }, [pn.instances]);

  const totalOutput = pn.totalOutput;
  const totalAllocated = pn.totalAllocated;
  const consumptionPct = totalOutput > 0 ? Math.round((pn.totalMinDraw / totalOutput) * 100) : 0;

  // Click handler: toggle pip at row index
  const handleCellClick = (inst: ComponentPowerInstance, row: number) => {
    if (!inst.isOn) return;
    // row 0 = bottom, row 5 = top
    // Pip index = row (0-based from bottom)
    const pipIdx = row;
    if (pipIdx >= inst.totalPips) return; // locked cell

    const current = inst.allocatedPips;
    if (pipIdx < current) {
      // Deallocate: set to this pip level
      setInstancePower(inst.hardpointName, pipIdx);
    } else {
      // Allocate: set to pip+1
      setInstancePower(inst.hardpointName, pipIdx + 1);
    }
  };

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-sm overflow-hidden">
      <div className="p-3 space-y-2.5">
        {/* ── OUTPUT & CONSUMPTION ── */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 font-mono tracking-wider">⚡ OUTPUT</span>
            <span
              className="text-lg font-mono font-bold tabular-nums"
              style={{ color: totalAllocated > totalOutput ? "#ef4444" : "#f59e0b" }}
            >
              {totalAllocated}
            </span>
            <span className="text-[13px] font-mono text-zinc-600">/ {totalOutput}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 font-mono tracking-wider">⚙ CONSUMPTION</span>
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: Math.min(100, consumptionPct) + "%",
                  backgroundColor: consumptionPct > 100 ? "#ef4444" : "#22c55e",
                }}
              />
            </div>
            <span
              className="text-[11px] font-mono font-bold tabular-nums"
              style={{ color: consumptionPct > 100 ? "#ef4444" : "#22c55e" }}
            >
              {consumptionPct} %
            </span>
          </div>
        </div>

        {/* ── POWER GRID: 6 rows × N columns ── */}
        {columns.length > 0 && (
          <div
            className="flex gap-0"
            style={{ justifyContent: "flex-start" }}
          >
            {columns.map((inst, colIdx) => {
              const color = cellColor(inst.category);

              // Build tier labels for each pip
              // PowerRanges: each range has .range pips at .modifier performance
              const tierLabels: number[] = [];
              for (const r of inst.ranges) {
                for (let i = 0; i < r.range; i++) {
                  // Tier number: 1=lowest, 2=mid, 3=highest
                  const tier = r.modifier >= 1.0 ? 3 : r.modifier >= 0.85 ? 2 : 1;
                  tierLabels.push(tier);
                }
              }

              // Detect category boundary for visual separator
              const prevCat = colIdx > 0 ? columns[colIdx - 1].category : null;
              const showSep = prevCat !== null && prevCat !== inst.category;

              return (
                <React.Fragment key={inst.hardpointName}>
                  {showSep && <div className="w-px bg-zinc-700/40 mx-0.5" />}
                  <div className="flex flex-col-reverse" style={{ gap: "2px" }}>
                    {Array.from({ length: ROWS }).map((_, row) => {
                      // row 0 = bottom cell, row 5 = top cell
                      const isLocked = row >= inst.totalPips;
                      const isAllocated = !isLocked && row < inst.allocatedPips;
                      const isAvailable = !isLocked && !isAllocated;
                      const isOff = !inst.isOn;
                      const tier = tierLabels[row] ?? 0;

                      let bg: string;
                      let border: string;
                      let textColor: string;
                      let opacity: number;

                      if (isOff || isLocked) {
                        // Dark / locked
                        bg = "#1c1c1f";
                        border = "#27272a";
                        textColor = "transparent";
                        opacity = row >= inst.totalPips ? 0.3 : 0.5;
                      } else if (isAllocated) {
                        // Filled: orange or green
                        bg = color;
                        border = color;
                        textColor = "#000";
                        opacity = 0.9;
                      } else {
                        // Available: dark with subtle border
                        bg = "#2a2a2e";
                        border = "#3f3f46";
                        textColor = "transparent";
                        opacity = 0.6;
                      }

                      return (
                        <div
                          key={row}
                          onClick={() => !isLocked && !isOff && handleCellClick(inst, row)}
                          style={{
                            width: "22px",
                            height: "16px",
                            backgroundColor: bg,
                            border: `1px solid ${border}`,
                            borderRadius: "2px",
                            opacity,
                            cursor: isLocked || isOff ? "default" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 120ms ease",
                            margin: "0 0.5px",
                          }}
                        >
                          {isAllocated && tier > 0 && (
                            <span
                              style={{
                                fontSize: "9px",
                                fontWeight: 700,
                                fontFamily: "monospace",
                                color: textColor,
                                lineHeight: 1,
                              }}
                            >
                              {tier}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* ── Category icons + performance % ── */}
        <div className="flex gap-0 items-end" style={{ justifyContent: "flex-start" }}>
          {CATEGORY_ORDER.map((cat) => {
            const p = catPerf[cat];
            if (p.count === 0) return null;
            const pct = p.max > 0 ? Math.round((p.alloc / p.max) * 100) : 0;
            const meta = CAT_META[cat];
            // Width should roughly match the columns
            const w = p.count * 23 + (p.count > 0 ? 4 : 0);

            return (
              <div
                key={cat}
                className="flex flex-col items-center"
                style={{ width: w + "px", minWidth: w + "px" }}
              >
                <span
                  className="text-[10px] leading-none"
                  style={{ color: meta.color, opacity: 0.8 }}
                  title={meta.label}
                >
                  {meta.icon}
                </span>
                <span
                  className="text-[8px] font-mono font-bold tabular-nums mt-0.5"
                  style={{ color: pct >= 100 ? meta.color : "#71717a" }}
                >
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>

        {/* ── SCM / NAV mode toggle ── */}
        <div className="flex gap-1 pt-1">
          <ModeBtn label="SCM MODE" active={flightMode === "SCM"} onClick={() => onModeChange("SCM")} />
          <ModeBtn label="NAV MODE" active={flightMode === "NAV"} onClick={() => onModeChange("NAV")} />
        </div>
      </div>

      {/* ── SIGNATURE & POWER/THERMAL SUMMARY ── */}
      <div className="border-t border-zinc-800/50 px-3 py-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <MiniStat icon="⚡" label="EM" value={stats.emSignature} color="#a855f7" />
          <MiniStat icon="🔥" label="IR" value={stats.irSignature} color="#f97316" />
        </div>
        <div className="flex items-center justify-between">
          <MiniStat icon="⚡" label="PWR" value={stats.powerBalance} color={stats.powerBalance >= 0 ? "#22c55e" : "#ef4444"} signed />
          <MiniStat icon="❄" label="THM" value={stats.thermalBalance} color={stats.thermalBalance >= 0 ? "#06b6d4" : "#ef4444"} signed />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function ModeBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-1.5 text-[9px] font-mono font-bold tracking-[0.1em] uppercase text-center border rounded-sm transition-colors"
      style={
        active
          ? { backgroundColor: "#f59e0b20", color: "#f59e0b", borderColor: "#f59e0b60" }
          : { backgroundColor: "transparent", color: "#52525b", borderColor: "#27272a" }
      }
    >
      {label}
    </button>
  );
}

function MiniStat({ icon, label, value, color, signed }: { icon: string; label: string; value: number; color: string; signed?: boolean }) {
  const fmt = (v: number) => {
    const abs = Math.abs(v);
    const str = abs >= 1000 ? (abs / 1000).toFixed(1) + "K" : Math.round(abs).toString();
    return signed && v >= 0 ? "+" + str : signed && v < 0 ? "-" + str : str;
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px]" style={{ opacity: 0.5 }}>{icon}</span>
      <span className="text-[8px] font-mono text-zinc-500 tracking-wider uppercase">{label}</span>
      <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color }}>{fmt(value)}</span>
    </div>
  );
}
