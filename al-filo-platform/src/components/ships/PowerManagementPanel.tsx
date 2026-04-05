// =============================================================================
// AL FILO — PowerManagementPanel v13 (Erkul/spviewer faithful replica)
//
// - ALWAYS 6 rows per column, tightly packed
// - 1 column per component INSTANCE
// - Tier number inside each allocated cell (operational blocks from PowerRanges)
// - Proper icon PER COLUMN matching the component type:
//   Weapons=ammunition, Thrusters=>>, QD=atom, Radar=waves, Shields=shield,
//   Coolers=fan, LifeSupport=lungs
// - Orange for weapons, Green for systems
// - Category icon + performance % per column below grid
// - OUTPUT x/y and CONSUMPTION bar
// - SCM MODE / NAV MODE toggle (NAV turns off shields)
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
const ROWS = 6;

// Category display ordering (weapons first, then systems in Erkul order)
const CATEGORY_ORDER: PowerCategory[] = [
  "weapons", "thrusters", "quantum", "radar", "shields", "coolers", "lifesupport",
];

// Whether category uses orange or green
function isOrangeCat(cat: PowerCategory): boolean {
  return cat === "weapons";
}
function catColor(cat: PowerCategory): string {
  return isOrangeCat(cat) ? "#f59e0b" : "#22c55e";
}

// ── SVG Icons per component type (inline, 14×14) ──
// Designed to match Erkul / spviewer visual style
function ComponentIcon({ cat, color }: { cat: PowerCategory; color: string }) {
  const s = { width: 14, height: 14, display: "block" };
  const f = color;

  switch (cat) {
    // Weapons: ammunition rounds (3 vertical bars like |||)
    case "weapons":
      return (
        <svg style={s} viewBox="0 0 14 14" fill="none">
          <rect x="2.5" y="3" width="2" height="8" rx="1" fill={f} />
          <rect x="6" y="3" width="2" height="8" rx="1" fill={f} />
          <rect x="9.5" y="3" width="2" height="8" rx="1" fill={f} />
        </svg>
      );

    // Thrusters: double chevron >> (Erkul style)
    case "thrusters":
      return (
        <svg style={s} viewBox="0 0 14 14" fill="none">
          <polyline points="1.5,3 6,7 1.5,11" stroke={f} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <polyline points="7,3 11.5,7 7,11" stroke={f} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );

    // Quantum Drive: atom orbits
    case "quantum":
      return (
        <svg style={s} viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="1.5" fill={f} />
          <ellipse cx="7" cy="7" rx="5.5" ry="2.5" stroke={f} strokeWidth="0.8" fill="none" />
          <ellipse cx="7" cy="7" rx="5.5" ry="2.5" stroke={f} strokeWidth="0.8" fill="none" transform="rotate(60 7 7)" />
          <ellipse cx="7" cy="7" rx="5.5" ry="2.5" stroke={f} strokeWidth="0.8" fill="none" transform="rotate(120 7 7)" />
        </svg>
      );

    // Radar: concentric arcs with antenna
    case "radar":
      return (
        <svg style={s} viewBox="0 0 14 14" fill="none">
          <path d="M4.5 9.5A3.5 3.5 0 0 1 7 6" stroke={f} strokeWidth="1.2" strokeLinecap="round" fill="none" />
          <path d="M2.5 11.5A6.5 6.5 0 0 1 7 3.5" stroke={f} strokeWidth="1.2" strokeLinecap="round" fill="none" />
          <circle cx="7" cy="12" r="1" fill={f} />
          <line x1="7" y1="11" x2="10.5" y2="3" stroke={f} strokeWidth="1" strokeLinecap="round" />
        </svg>
      );

    // Shields: shield outline
    case "shields":
      return (
        <svg style={s} viewBox="0 0 14 14" fill="none">
          <path d="M7 1L2.5 3.5V7C2.5 10 7 13 7 13S11.5 10 11.5 7V3.5L7 1Z" stroke={f} strokeWidth="1.3" fill="none" />
        </svg>
      );

    // Coolers: fan/ventilator (4 curved blades) like spviewer
    case "coolers":
      return (
        <svg style={s} viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="1" fill={f} />
          <path d="M7 6C7 4 5.5 2 4 2C5 3.5 6 4.5 7 6Z" fill={f} />
          <path d="M8 7C10 7 12 5.5 12 4C10.5 5 9.5 6 8 7Z" fill={f} />
          <path d="M7 8C7 10 8.5 12 10 12C9 10.5 8 9.5 7 8Z" fill={f} />
          <path d="M6 7C4 7 2 8.5 2 10C3.5 9 4.5 8 6 7Z" fill={f} />
        </svg>
      );

    // Life Support: lungs / breathing icon
    case "lifesupport":
      return (
        <svg style={s} viewBox="0 0 14 14" fill="none">
          <path d="M7 2V7" stroke={f} strokeWidth="1.2" strokeLinecap="round" />
          <path d="M7 7C7 7 4 7 3 8.5C2 10 2.5 12 4 12C5.5 12 6 10.5 7 9" stroke={f} strokeWidth="1.1" fill="none" strokeLinecap="round" />
          <path d="M7 7C7 7 10 7 11 8.5C12 10 11.5 12 10 12C8.5 12 8 10.5 7 9" stroke={f} strokeWidth="1.1" fill="none" strokeLinecap="round" />
        </svg>
      );

    // Fallback: power circle
    default:
      return (
        <svg style={s} viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="4" stroke={f} strokeWidth="1.2" fill="none" />
          <circle cx="7" cy="7" r="1.5" fill={f} />
        </svg>
      );
  }
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

  // Build ordered columns
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

  const totalOutput = pn.totalOutput;
  const totalAllocated = pn.totalAllocated;
  const consumptionPct = totalOutput > 0
    ? Math.round((pn.totalMinDraw / totalOutput) * 100)
    : 0;

  // Click handler
  const handleCellClick = (inst: ComponentPowerInstance, row: number) => {
    if (!inst.isOn || row >= inst.totalPips) return;
    const current = inst.allocatedPips;
    if (row < current) {
      setInstancePower(inst.hardpointName, row);
    } else {
      setInstancePower(inst.hardpointName, row + 1);
    }
  };

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-sm overflow-hidden">
      <div className="p-3 space-y-2">
        {/* ── OUTPUT & CONSUMPTION ── */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px]" style={{ color: "#f59e0b" }}>⚡</span>
            <span className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase">Output</span>
            <span
              className="text-lg font-mono font-bold tabular-nums ml-auto"
              style={{ color: totalAllocated > totalOutput ? "#ef4444" : "#f59e0b" }}
            >
              {totalAllocated}
            </span>
            <span className="text-[13px] font-mono text-zinc-600">/ {totalOutput}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px]" style={{ color: "#22c55e" }}>⚙</span>
            <span className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase">Consumption</span>
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden ml-1">
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
              {consumptionPct}%
            </span>
          </div>
        </div>

        {/* ── POWER GRID ── */}
        {columns.length > 0 && (
          <div className="space-y-1">
            {/* Grid: 6 rows × N columns */}
            <div className="flex" style={{ gap: "2px", justifyContent: "center" }}>
              {columns.map((inst, colIdx) => {
                const color = catColor(inst.category);
                const prevCat = colIdx > 0 ? columns[colIdx - 1].category : null;
                const showSep = prevCat !== null && prevCat !== inst.category;

                // Build tier for each pip position
                const tierLabels: number[] = [];
                for (const r of inst.ranges) {
                  for (let i = 0; i < r.range; i++) {
                    tierLabels.push(r.modifier >= 1.0 ? 3 : r.modifier >= 0.85 ? 2 : 1);
                  }
                }
                while (tierLabels.length < inst.totalPips) tierLabels.push(3);

                return (
                  <React.Fragment key={inst.hardpointName}>
                    {showSep && <div style={{ width: "3px" }} />}
                    <div className="flex flex-col-reverse" style={{ gap: "2px" }}>
                      {Array.from({ length: ROWS }).map((_, row) => {
                        const locked = row >= inst.totalPips;
                        const allocated = !locked && row < inst.allocatedPips && inst.isOn;
                        const available = !locked && !allocated && inst.isOn;
                        const tier = tierLabels[row] ?? 0;

                        let bg: string;
                        let borderC: string;

                        if (locked) {
                          bg = "#1a1a1d";
                          borderC = "#222225";
                        } else if (!inst.isOn) {
                          bg = "#1f1f23";
                          borderC = "#2a2a2e";
                        } else if (allocated) {
                          bg = color;
                          borderC = color;
                        } else {
                          // Available — darker shade
                          bg = "#2a2a2e";
                          borderC = "#3a3a3e";
                        }

                        return (
                          <div
                            key={row}
                            onClick={() => handleCellClick(inst, row)}
                            style={{
                              width: 20,
                              height: 14,
                              backgroundColor: bg,
                              border: `1px solid ${borderC}`,
                              borderRadius: 2,
                              cursor: locked || !inst.isOn ? "default" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              opacity: locked ? 0.25 : !inst.isOn ? 0.4 : 1,
                              transition: "all 100ms",
                            }}
                          >
                            {allocated && tier > 0 && (
                              <span style={{
                                fontSize: 8,
                                fontWeight: 800,
                                fontFamily: "monospace",
                                color: "#000",
                                lineHeight: 1,
                              }}>
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

            {/* Icons row: one icon per column, aligned */}
            <div className="flex" style={{ gap: "2px", justifyContent: "center" }}>
              {columns.map((inst, colIdx) => {
                const prevCat = colIdx > 0 ? columns[colIdx - 1].category : null;
                const showSep = prevCat !== null && prevCat !== inst.category;
                const color = catColor(inst.category);
                const pct = inst.totalPips > 0
                  ? Math.round((inst.allocatedPips / inst.totalPips) * 100)
                  : 0;

                return (
                  <React.Fragment key={inst.hardpointName + "-icon"}>
                    {showSep && <div style={{ width: "3px" }} />}
                    <div
                      className="flex flex-col items-center"
                      style={{ width: 20 }}
                      title={`${inst.componentName} — ${pct}%`}
                    >
                      <ComponentIcon cat={inst.category} color={color} />
                      <span
                        className="text-[7px] font-mono font-bold tabular-nums"
                        style={{ color: pct >= 100 ? color : "#52525b", marginTop: 1 }}
                      >
                        {pct}%
                      </span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* ── SCM / NAV mode ── */}
        <div className="flex gap-1 pt-0.5">
          <ModeBtn label="SCM MODE" active={flightMode === "SCM"} onClick={() => onModeChange("SCM")} />
          <ModeBtn label="NAV MODE" active={flightMode === "NAV"} onClick={() => onModeChange("NAV")} />
        </div>
      </div>

      {/* ── Signatures & Power/Thermal ── */}
      <div className="border-t border-zinc-800/50 px-3 py-2 grid grid-cols-2 gap-y-1 gap-x-4">
        <MiniStat icon="⚡" label="EM" value={stats.emSignature} color="#a855f7" />
        <MiniStat icon="🔥" label="IR" value={stats.irSignature} color="#f97316" />
        <MiniStat icon="⚡" label="PWR" value={stats.powerBalance} color={stats.powerBalance >= 0 ? "#22c55e" : "#ef4444"} signed />
        <MiniStat icon="❄" label="THM" value={stats.thermalBalance} color={stats.thermalBalance >= 0 ? "#06b6d4" : "#ef4444"} signed />
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

function MiniStat({ icon, label, value, color, signed }: {
  icon: string; label: string; value: number; color: string; signed?: boolean;
}) {
  const abs = Math.abs(value);
  const str = abs >= 1000 ? (abs / 1000).toFixed(1) + "K" : Math.round(abs).toString();
  const display = signed ? (value >= 0 ? "+" + str : "-" + str) : str;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px]" style={{ opacity: 0.5 }}>{icon}</span>
      <span className="text-[8px] font-mono text-zinc-500 tracking-wider uppercase">{label}</span>
      <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color }}>{display}</span>
    </div>
  );
}
