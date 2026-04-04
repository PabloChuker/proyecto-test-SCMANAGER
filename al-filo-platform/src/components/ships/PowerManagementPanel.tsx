// =============================================================================
// AL FILO — PowerManagementPanel v10 (Per-Instance Columns)
//
// Star Citizen cockpit Power Management MFD:
//   - 1 column per component INSTANCE (2 coolers = 2 columns)
//   - Segments per column = sum of PowerRanges RegisterRange values
//   - Segments bottom-to-top:
//       CYAN  = allocated power pips
//       GRAY  = available (can be assigned)
//       BLACK = locked (component off or no pips)
//   - PowerRanges tiers color the segments:
//       Tier 0: 70% performance (dim cyan)
//       Tier 1: 85% performance (medium cyan)
//       Tier 2: 100% performance (bright cyan)
//   - OUTPUT shows "allocated / total" (e.g., "8 / 16")
//   - Grouped by category with category headers
// =============================================================================

"use client";

import React from "react";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import type {
  FlightMode,
  PowerCategory,
  ComputedStats,
  ComponentPowerInstance,
} from "@/store/useLoadoutStore";

// ── Category display order & metadata ──
const CATEGORY_ORDER: PowerCategory[] = [
  "weapons",
  "shields",
  "coolers",
  "quantum",
  "radar",
  "thrusters",
];

interface CatMeta { label: string; icon: string; color: string; }

const CAT_META: Record<PowerCategory, CatMeta> = {
  weapons:   { label: "WPN", icon: "⬡", color: "#ef4444" },
  shields:   { label: "SHD", icon: "◇", color: "#3b82f6" },
  coolers:   { label: "CLR", icon: "❄", color: "#06b6d4" },
  quantum:   { label: "QDR", icon: "◈", color: "#8b5cf6" },
  radar:     { label: "RAD", icon: "◎", color: "#eab308" },
  thrusters: { label: "THR", icon: "△", color: "#22c55e" },
};

const SEG_H = 12;
const SEG_GAP = 2;
const MAX_SEGS = 6; // Visual cap per column

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
  const {
    autoAllocatePower,
    setInstancePower,
  } = useLoadoutStore();

  const pn = stats.powerNetwork;
  const totalOutput = pn.totalOutput;
  const totalAllocated = pn.totalAllocated;

  // OUTPUT color
  const outputColor =
    totalAllocated > totalOutput
      ? "#ef4444"
      : totalAllocated === totalOutput
        ? "#f97316"
        : "#22d3ee";

  // Group instances by category
  const grouped = new Map<PowerCategory, ComponentPowerInstance[]>();
  for (const cat of CATEGORY_ORDER) {
    grouped.set(cat, []);
  }
  for (const inst of pn.instances) {
    const arr = grouped.get(inst.category);
    if (arr) arr.push(inst);
  }

  // Click handler for a segment in an instance column
  const handleSegClick = (inst: ComponentPowerInstance, segIdx: number) => {
    if (!inst.isOn) return;
    const current = inst.allocatedPips;
    if (segIdx < current) {
      // Click below current → deallocate down
      setInstancePower(inst.hardpointName, segIdx);
    } else {
      // Click above current → allocate up
      setInstancePower(inst.hardpointName, segIdx + 1);
    }
  };

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-sm overflow-hidden">
      {/* ── Signatures Row ── */}
      <div className="flex items-center justify-center gap-4 px-3 py-1.5 border-b border-zinc-800/50 bg-zinc-950/40">
        <SigBadge icon="IR" value={stats.emSignature} color="#a855f7" />
        <SigBadge icon="⚡" value={stats.irSignature} color="#f97316" />
        <SigBadge icon="◈" value={stats.thermalOutput} color="#22c55e" />
      </div>

      <div className="p-3 space-y-3">
        {/* ── OUTPUT: allocated / total ── */}
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-mono text-zinc-500 tracking-[0.15em] uppercase">
            Output
          </span>
          <div className="flex items-baseline gap-0.5">
            <span
              className="text-xl font-mono font-bold tabular-nums"
              style={{ color: outputColor }}
            >
              {totalAllocated}
            </span>
            <span className="text-[12px] font-mono text-zinc-600">
              / {totalOutput}
            </span>
          </div>
        </div>

        {/* ── POWER GRID: grouped by category ── */}
        <div className="space-y-2">
          {CATEGORY_ORDER.map((cat) => {
            const instances = grouped.get(cat) ?? [];
            if (instances.length === 0) return null;
            const meta = CAT_META[cat];

            return (
              <div key={cat}>
                {/* Category header */}
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="text-[9px] font-mono"
                    style={{ color: meta.color, opacity: 0.7 }}
                  >
                    {meta.icon}
                  </span>
                  <span
                    className="text-[7px] font-mono tracking-[0.15em] uppercase"
                    style={{ color: meta.color, opacity: 0.6 }}
                  >
                    {meta.label}
                  </span>
                  <div className="flex-1 h-px bg-zinc-800/50" />
                </div>

                {/* Instance columns */}
                <div className="flex gap-1 px-1">
                  {instances.map((inst) => (
                    <InstanceColumn
                      key={inst.hardpointName}
                      inst={inst}
                      catColor={meta.color}
                      onSegClick={(segIdx) => handleSegClick(inst, segIdx)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Auto Balance ── */}
        <button
          onClick={autoAllocatePower}
          className="w-full py-1.5 text-[8px] font-mono text-zinc-600 tracking-widest uppercase border border-zinc-800/40 hover:border-cyan-800/40 hover:text-cyan-400/70 transition-colors rounded-sm"
        >
          AUTO-BALANCE
        </button>

        {/* ── SCM / NAV Mode ── */}
        <div className="flex gap-px">
          <ModeBtn label="SCM MODE" active={flightMode === "SCM"} c="#eab308" onClick={() => onModeChange("SCM")} />
          <ModeBtn label="NAV MODE" active={flightMode === "NAV"} c="#8b5cf6" onClick={() => onModeChange("NAV")} />
        </div>
      </div>

      {/* ── SIGNATURES DETAIL ── */}
      <div className="border-t border-zinc-800/50 p-2.5 space-y-2">
        <span className="text-[8px] font-mono text-zinc-600 tracking-[0.2em] uppercase">Signatures</span>
        <SignatureBar label="EM SIG" value={stats.emSignature} color="#a855f7" />
        <SignatureBar label="IR SIG" value={stats.irSignature} color="#f97316" />
      </div>

      {/* ── POWER & THERMAL ── */}
      <div className="border-t border-zinc-800/50 p-2.5 space-y-2">
        <PowerThermalBar label="POWER" value={stats.powerBalance} outLabel={`${Math.round(stats.powerOutput)} out`} drawLabel={`${Math.round(stats.powerDraw)} draw`} color={stats.powerBalance >= 0 ? "#22c55e" : "#ef4444"} />
        <PowerThermalBar label="THERMAL" value={stats.thermalBalance} outLabel={`${Math.round(stats.coolingRate)} out`} drawLabel={`${Math.round(stats.thermalOutput)} draw`} color={stats.thermalBalance >= 0 ? "#06b6d4" : "#ef4444"} />
      </div>
    </div>
  );
}

// =============================================================================
// InstanceColumn — one column per component instance
// =============================================================================

function InstanceColumn({
  inst,
  catColor,
  onSegClick,
}: {
  inst: ComponentPowerInstance;
  catColor: string;
  onSegClick: (segIdx: number) => void;
}) {
  const totalSegs = Math.min(inst.totalPips, MAX_SEGS);
  const allocated = Math.min(inst.allocatedPips, totalSegs);

  // Build segment tier colors based on PowerRanges
  // Each range has: start (cumulative pip), modifier (performance), range (# pips)
  const segTiers: number[] = []; // modifier for each segment
  for (const r of inst.ranges) {
    for (let i = 0; i < r.range; i++) {
      segTiers.push(r.modifier);
    }
  }
  // Fill remaining with 1.0 if needed
  while (segTiers.length < totalSegs) segTiers.push(1.0);

  // Modifier → brightness
  const modToOpacity = (mod: number): number => {
    if (mod >= 1.0) return 0.95;
    if (mod >= 0.85) return 0.7;
    return 0.5;
  };

  // Short name for label
  const shortName = inst.componentName.length > 8
    ? inst.componentName.slice(0, 7) + "…"
    : inst.componentName;

  return (
    <div
      className="flex flex-col items-center"
      style={{ flex: "1 1 0", maxWidth: "40px", minWidth: "28px" }}
      title={`${inst.componentName}\nPower: ${inst.allocatedPips}/${inst.totalPips} pips\nPerformance: ${allocated > 0 ? Math.round((segTiers[allocated - 1] ?? 1) * 100) : 0}%`}
    >
      {/* Segments: flex-col-reverse so index 0 = bottom */}
      <div className="w-full flex flex-col-reverse" style={{ gap: SEG_GAP + "px" }}>
        {totalSegs === 0 ? (
          // No interactive pips — show single locked segment
          <div
            style={{
              width: "100%",
              height: SEG_H + "px",
              backgroundColor: "#18181b",
              border: "1px solid #18181b",
              borderRadius: "2px",
              opacity: 0.4,
            }}
          />
        ) : (
          Array.from({ length: totalSegs }).map((_, i) => {
            let bgColor: string;
            let borderColor: string;
            let opacity: number;
            let cursor: string;

            if (!inst.isOn) {
              // Component off → all BLACK (locked)
              bgColor = "#18181b";
              borderColor = "#18181b";
              opacity = 0.4;
              cursor = "default";
            } else if (i < allocated) {
              // ASSIGNED → CYAN with tier brightness
              bgColor = "#22d3ee";
              borderColor = "rgba(34,211,238,0.5)";
              opacity = modToOpacity(segTiers[i] ?? 1);
              cursor = "pointer";
            } else {
              // AVAILABLE → GRAY
              bgColor = "#3f3f46";
              borderColor = "#2a2a2e";
              opacity = 0.5;
              cursor = "pointer";
            }

            return (
              <div
                key={i}
                onClick={() => inst.isOn && onSegClick(i)}
                style={{
                  width: "100%",
                  height: SEG_H + "px",
                  backgroundColor: bgColor,
                  border: `1px solid ${borderColor}`,
                  borderRadius: "2px",
                  opacity,
                  cursor,
                  transition: "all 150ms ease",
                }}
              />
            );
          })
        )}
      </div>

      {/* Component name */}
      <div
        className="mt-1.5 text-center select-none truncate w-full"
        style={{
          fontSize: "6px",
          fontFamily: "monospace",
          color: allocated > 0 ? "#22d3ee" : inst.isOn ? "#52525b" : "#27272a",
          letterSpacing: "0.05em",
          lineHeight: 1.2,
        }}
      >
        {shortName}
      </div>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function SigBadge({ icon, value, color }: { icon: string; value: number; color: string }) {
  const fmt = (v: number) => v >= 1000 ? (v / 1000).toFixed(1) + "K" : Math.round(v).toString();
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px]" style={{ color, opacity: 0.6 }}>{icon}</span>
      <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color }}>{fmt(value)}</span>
    </div>
  );
}

function SignatureBar({ label, value, color }: { label: string; value: number; color: string }) {
  const fmt = (v: number) => v >= 1000 ? (v / 1000).toFixed(1) + "K" : Math.round(v).toString();
  const pct = Math.min(100, (value / 10000) * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-mono text-zinc-500 tracking-wider uppercase">{label}</span>
        <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color }}>{fmt(value)}</span>
      </div>
      <div className="h-1 bg-zinc-800/60 rounded-sm overflow-hidden">
        <div className="h-full rounded-sm transition-all duration-300" style={{ width: pct + "%", backgroundColor: color, opacity: 0.7 }} />
      </div>
    </div>
  );
}

function PowerThermalBar({ label, value, outLabel, drawLabel, color }: { label: string; value: number; outLabel: string; drawLabel: string; color: string }) {
  const sign = value >= 0 ? "+" : "";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-mono text-zinc-500 tracking-wider uppercase">{label}</span>
        <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color }}>{sign}{Math.round(value)}</span>
      </div>
      <div className="h-1 bg-zinc-800/60 rounded-sm overflow-hidden">
        <div className="h-full rounded-sm transition-all duration-300" style={{ width: Math.min(100, Math.abs(value) * 3) + "%", backgroundColor: color, opacity: 0.6 }} />
      </div>
      <div className="flex justify-between">
        <span className="text-[7px] font-mono text-zinc-600">{outLabel}</span>
        <span className="text-[7px] font-mono text-zinc-600">{drawLabel}</span>
      </div>
    </div>
  );
}

function ModeBtn({ label, active, c, onClick }: { label: string; active: boolean; c: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={active
        ? "flex-1 py-1.5 text-[9px] font-mono font-bold tracking-[0.12em] uppercase text-center border rounded-sm"
        : "flex-1 py-1.5 text-[9px] font-mono tracking-[0.12em] uppercase text-center text-zinc-600 border border-zinc-800/50 hover:text-zinc-400 transition-colors rounded-sm"
      }
      style={active ? { backgroundColor: c + "20", color: c, borderColor: c + "60" } : undefined}
    >
      {label}
    </button>
  );
}
