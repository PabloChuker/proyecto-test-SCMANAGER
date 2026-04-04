// =============================================================================
// AL FILO — PowerManagementPanel v9 (In-Game Cockpit Exact)
//
// Star Citizen cockpit Power Management MFD:
//   - ALWAYS 6 columns: WPN, THR, SHD, QDR, RAD, CLR
//   - Each column has EXACTLY 6 segments tall (fixed)
//   - Segments bottom-to-top:
//       CYAN  = assigned power points for this category
//       GRAY  = available (can be assigned)
//       BLACK = locked (no room / no components)
//   - OUTPUT shows "allocated / total" (e.g., "3 / 16")
//   - Total pool = totalOutput (e.g., 16). Distributed among 6 categories.
//   - Each segment in a column = 1 power point assigned to that category.
//   - Max per column = 6 (visual cap), but actual allocation can be higher.
// =============================================================================

"use client";

import React from "react";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import type {
  FlightMode,
  PowerCategory,
  ComputedStats,
} from "@/store/useLoadoutStore";

// ── 6 fixed categories, same order as in-game MFD ──
const CATEGORY_ORDER: PowerCategory[] = [
  "weapons",
  "thrusters",
  "shields",
  "quantum",
  "radar",
  "coolers",
];

interface CatMeta { label: string; icon: string; }

const CAT_META: Record<PowerCategory, CatMeta> = {
  weapons:   { label: "WPN", icon: "⬡" },
  thrusters: { label: "THR", icon: "△" },
  shields:   { label: "SHD", icon: "◇" },
  quantum:   { label: "QDR", icon: "◈" },
  radar:     { label: "RAD", icon: "◎" },
  coolers:   { label: "CLR", icon: "❄" },
};

// FIXED: 6 segments per column, just like the in-game cockpit
const SEGS_PER_COL = 6;
const SEG_H = 14;
const SEG_GAP = 2;

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
    allocatedPower,
    setAllocatedPower,
    autoAllocatePower,
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

  // Click handler: assign/deallocate power to a category
  const handleSegClick = (cat: PowerCategory, segIdx: number) => {
    const currentAlloc = allocatedPower[cat] || 0;

    if (segIdx < currentAlloc) {
      // Clicking an assigned (cyan) segment → deallocate down to segIdx
      setAllocatedPower(cat, segIdx);
    } else {
      // Clicking a gray segment → allocate up to segIdx+1
      const desired = segIdx + 1;
      const increase = desired - currentAlloc;
      const freePoints = totalOutput - totalAllocated;

      if (increase <= freePoints) {
        setAllocatedPower(cat, desired);
      } else if (freePoints > 0) {
        setAllocatedPower(cat, currentAlloc + freePoints);
      }
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

        {/* ── POWER GRID: 6 columns × 6 segments ── */}
        <div
          className="flex justify-between items-end gap-1 px-1"
          style={{ height: SEGS_PER_COL * (SEG_H + SEG_GAP) + 30 + "px" }}
        >
          {CATEGORY_ORDER.map((cat) => (
            <PowerColumn
              key={cat}
              cat={cat}
              allocated={Math.min(allocatedPower[cat] || 0, SEGS_PER_COL)}
              hasComponents={pn.categories[cat].componentCount > 0}
              isActive={pn.categories[cat].activeCount > 0}
              onSegClick={(segIdx) => handleSegClick(cat, segIdx)}
            />
          ))}
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
// PowerColumn — one of the 6 category bars, exactly 6 segments tall
// =============================================================================

function PowerColumn({
  cat,
  allocated,
  hasComponents,
  isActive,
  onSegClick,
}: {
  cat: PowerCategory;
  allocated: number;
  hasComponents: boolean;
  isActive: boolean;
  onSegClick: (segIdx: number) => void;
}) {
  const meta = CAT_META[cat];

  return (
    <div className="flex flex-col items-center" style={{ flex: "1 1 0", maxWidth: "42px" }}>
      {/* Segments: flex-col-reverse so index 0 = bottom */}
      <div className="w-full flex flex-col-reverse" style={{ gap: SEG_GAP + "px" }}>
        {Array.from({ length: SEGS_PER_COL }).map((_, i) => {
          // i=0 bottom, i=5 top
          // Bottom segments fill first (cyan), then gray, then black at top

          let bgColor: string;
          let borderColor: string;
          let opacity: number;
          let cursor: string;

          if (!hasComponents) {
            // No components in this category → all BLACK (locked)
            bgColor = "#18181b";
            borderColor = "#18181b";
            opacity = 0.4;
            cursor = "default";
          } else if (i < allocated) {
            // ASSIGNED → CYAN
            bgColor = "#22d3ee";
            borderColor = "rgba(34,211,238,0.5)";
            opacity = isActive ? 0.9 : 0.4;
            cursor = "pointer";
          } else {
            // AVAILABLE → GRAY
            bgColor = "#3f3f46";
            borderColor = "#2a2a2e";
            opacity = 0.7;
            cursor = "pointer";
          }

          return (
            <div
              key={i}
              onClick={() => hasComponents && onSegClick(i)}
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
        })}
      </div>

      {/* Category icon */}
      <div
        className="mt-2 text-center select-none"
        style={{
          fontSize: "11px",
          color: allocated > 0 ? "#22d3ee" : hasComponents ? "#71717a" : "#27272a",
          lineHeight: 1,
        }}
      >
        {meta.icon}
      </div>
      {/* Category label */}
      <div
        className="text-center select-none"
        style={{
          fontSize: "7px",
          fontFamily: "monospace",
          color: allocated > 0 ? "#22d3ee" : "#52525b",
          opacity: hasComponents ? 0.8 : 0.3,
          letterSpacing: "0.08em",
          marginTop: "1px",
        }}
      >
        {meta.label}
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
