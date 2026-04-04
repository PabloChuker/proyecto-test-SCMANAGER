// =============================================================================
// AL FILO — PowerManagementPanel v7 (Erkul Column Grid)
//
// LAYOUT: Vertical columns per component, stacked segments bottom-to-top.
// - Each column = 1 component instance (2 coolers = 2 columns)
// - Weapons/missiles grouped into 1 column
// - Segments: green=allocated, gray=available capacity
// - Category icons at bottom
// - OUTPUT (free/total), CONSUMPTION %, signatures at top
// =============================================================================

"use client";

import React, { useMemo } from "react";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import type {
  FlightMode,
  PowerCategory,
  ComputedStats,
  ResolvedHardpoint,
} from "@/store/useLoadoutStore";

// ── Category display config ──
const CATEGORY_ORDER: PowerCategory[] = [
  "weapons",
  "thrusters",
  "shields",
  "quantum",
  "radar",
  "coolers",
];

interface CatMeta {
  label: string;
  icon: string;
  color: string;
}

const CAT_META: Record<PowerCategory, CatMeta> = {
  weapons: { label: "WPN", icon: "⬡", color: "#f97316" },
  thrusters: { label: "THR", icon: "△", color: "#f97316" },
  shields: { label: "SHD", icon: "◇", color: "#f97316" },
  quantum: { label: "QDR", icon: "◈", color: "#f97316" },
  radar: { label: "RAD", icon: "◎", color: "#f97316" },
  coolers: { label: "CLR", icon: "❄", color: "#f97316" },
};

// Map resolved category to power category
const RESOLVED_TO_POWER: Record<string, PowerCategory> = {
  WEAPON: "weapons",
  TURRET: "weapons",
  MISSILE_RACK: "weapons",
  SHIELD: "shields",
  COOLER: "coolers",
  QUANTUM_DRIVE: "quantum",
  MINING: "weapons",
  UTILITY: "weapons",
};

// Categories where components are GROUPED into one column
const GROUPED_CATS = new Set<PowerCategory>(["weapons", "thrusters"]);

// ── Types for the grid ──
interface PowerColumn {
  id: string;
  powerCat: PowerCategory;
  label: string;
  /** Max segments this column can have (power capacity) */
  maxSegments: number;
  /** Currently allocated segments */
  allocated: number;
  /** Whether this component is active */
  isActive: boolean;
  /** Whether this column is disabled (e.g., QD in SCM) */
  isDisabled: boolean;
}

// ── Build columns from hardpoints and power network ──
//
// Erkul model: every column gets the SAME max height (segment count).
// The total power points = powerOutput from power plant(s).
// Points are distributed across columns (categories).
// Each column's "allocated" = how many green segments it shows.
// Max segments per column = uniform height for all columns.
//
function buildPowerColumns(
  hardpoints: ResolvedHardpoint[],
  stats: ComputedStats,
  componentStates: Record<string, boolean>,
  allocatedPower: Record<PowerCategory, number>,
  flightMode: FlightMode,
): PowerColumn[] {
  const columns: PowerColumn[] = [];
  const pn = stats.powerNetwork;
  const totalOutput = pn.totalOutput || 1;

  // Group hardpoints by power category
  const catHardpoints: Partial<Record<PowerCategory, ResolvedHardpoint[]>> = {};
  for (const hp of hardpoints) {
    const pCat = RESOLVED_TO_POWER[hp.resolvedCategory];
    if (!pCat) continue;
    if (!catHardpoints[pCat]) catHardpoints[pCat] = [];
    catHardpoints[pCat]!.push(hp);
  }

  // First pass: count total columns to determine uniform height
  let totalCols = 0;
  for (const cat of CATEGORY_ORDER) {
    const hps = catHardpoints[cat];
    if (!hps || hps.length === 0) continue;
    if (GROUPED_CATS.has(cat)) {
      totalCols += 1; // grouped into one column
    } else {
      totalCols += hps.length; // one column per component
    }
  }

  // Uniform max segments: aim for 4-6 rows based on total power
  // Erkul uses roughly: maxSegments ≈ ceil(totalOutput / numColumns)
  // but capped to keep it visually clean
  const uniformMax = Math.max(
    3,
    Math.min(6, Math.ceil(totalOutput / Math.max(totalCols, 1))),
  );

  for (const cat of CATEGORY_ORDER) {
    const hps = catHardpoints[cat];
    if (!hps || hps.length === 0) continue;

    const catAlloc = allocatedPower[cat] || 0;
    const isDisabled = cat === "quantum" && flightMode === "SCM";

    if (GROUPED_CATS.has(cat)) {
      // Grouped: one column for all components in this category
      const activeCount = hps.filter(
        (hp) => componentStates[hp.hardpointName] !== false,
      ).length;

      columns.push({
        id: `group-${cat}`,
        powerCat: cat,
        label: CAT_META[cat].label,
        maxSegments: uniformMax,
        allocated: Math.min(catAlloc, uniformMax),
        isActive: activeCount > 0,
        isDisabled,
      });
    } else {
      // Individual: one column per component
      // Divide category allocation evenly among components
      const perComp =
        hps.length > 0 ? Math.floor(catAlloc / hps.length) : 0;
      const remainder = hps.length > 0 ? catAlloc % hps.length : 0;

      hps.forEach((hp, idx) => {
        const isOn = componentStates[hp.hardpointName] !== false;
        const compAlloc = perComp + (idx < remainder ? 1 : 0);
        const item = hp.defaultItem;

        columns.push({
          id: hp.id,
          powerCat: cat,
          label: item?.name?.split(" ").pop() || CAT_META[cat].label,
          maxSegments: uniformMax,
          allocated: Math.min(compAlloc, uniformMax),
          isActive: isOn,
          isDisabled,
        });
      });
    }
  }

  return columns;
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
  const {
    hardpoints,
    componentStates,
    allocatedPower,
    setAllocatedPower,
    autoAllocatePower,
  } = useLoadoutStore();

  const pn = stats.powerNetwork;

  // Build columns
  const columns = useMemo(
    () =>
      buildPowerColumns(
        hardpoints,
        stats,
        componentStates,
        allocatedPower,
        flightMode,
      ),
    [hardpoints, stats, componentStates, allocatedPower, flightMode],
  );

  // Colors
  const consumColor =
    pn.consumptionPercent > 100
      ? "#ef4444"
      : pn.consumptionPercent > 80
        ? "#f97316"
        : "#22c55e";
  const outputColor =
    pn.freePoints < 0
      ? "#ef4444"
      : pn.freePoints <= 2
        ? "#f97316"
        : "#22c55e";

  // Handle segment click on a column
  const handleColumnClick = (col: PowerColumn, segIdx: number) => {
    if (col.isDisabled) return;
    const cat = col.powerCat;
    const currentCatAlloc = allocatedPower[cat] || 0;

    // Count how many columns share this category
    const catColumns = columns.filter((c) => c.powerCat === cat);
    const colIndex = catColumns.indexOf(col);

    if (segIdx < col.allocated) {
      // Clicking a selected segment -> deallocate down to that level
      const reduction = col.allocated - segIdx;
      const newCatAlloc = Math.max(0, currentCatAlloc - reduction);
      setAllocatedPower(cat, newCatAlloc);
    } else {
      // Clicking an unselected segment -> allocate up to that level
      const increase = segIdx + 1 - col.allocated;
      if (pn.freePoints >= increase) {
        setAllocatedPower(cat, currentCatAlloc + increase);
      } else if (pn.freePoints > 0) {
        setAllocatedPower(cat, currentCatAlloc + pn.freePoints);
      }
    }
  };

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-sm overflow-hidden">
      {/* ── Signatures Row ── */}
      <div className="flex items-center justify-center gap-4 px-3 py-1.5 border-b border-zinc-800/50 bg-zinc-950/40">
        <SigBadge icon="⦿" label="EM" value={stats.emSignature} color="#a855f7" />
        <SigBadge icon="⚡" label="IR" value={stats.irSignature} color="#f97316" />
        <SigBadge icon="◈" label="TH" value={stats.thermalOutput} color="#22c55e" />
      </div>

      <div className="p-2.5 space-y-2">
        {/* ── OUTPUT ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-amber-600/60 text-[11px]">⚙</span>
            <span className="text-[9px] font-mono text-amber-600/80 tracking-[0.15em] uppercase">
              Output
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className="text-lg font-mono font-bold tabular-nums"
              style={{ color: outputColor }}
            >
              {pn.freePoints}
            </span>
            <span className="text-[11px] font-mono text-zinc-600">
              / {pn.totalOutput}
            </span>
          </div>
        </div>

        {/* ── CONSUMPTION ── */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-amber-600/60 text-[11px]">⊛</span>
              <span className="text-[9px] font-mono text-amber-600/80 tracking-[0.15em] uppercase">
                Consumption
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="h-1 rounded-sm"
                style={{
                  width: Math.min(100, pn.consumptionPercent) * 0.6 + "px",
                  backgroundColor: consumColor,
                  opacity: 0.7,
                }}
              />
              <span
                className="text-[11px] font-mono font-bold tabular-nums"
                style={{ color: consumColor }}
              >
                {pn.consumptionPercent} %
              </span>
            </div>
          </div>
        </div>

        {/* ── Power Grid (Erkul-style columns) ── */}
        {columns.length > 0 && (
          <div className="py-1">
            <div
              className="flex justify-center gap-[2px]"
              style={{ minHeight: "60px" }}
            >
              {columns.map((col) => (
                <PowerColumn
                  key={col.id}
                  col={col}
                  onSegmentClick={(segIdx) => handleColumnClick(col, segIdx)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Auto Balance ── */}
        <button
          onClick={autoAllocatePower}
          className="w-full py-1 text-[8px] font-mono text-zinc-600 tracking-widest uppercase border border-zinc-800/40 hover:border-amber-800/40 hover:text-amber-500/70 transition-colors rounded-sm"
        >
          AUTO-BALANCE
        </button>

        {/* ── SCM / NAV Mode ── */}
        <div className="flex gap-px">
          <ModeBtn
            label="SCM MODE"
            active={flightMode === "SCM"}
            c="#eab308"
            onClick={() => onModeChange("SCM")}
          />
          <ModeBtn
            label="NAV MODE"
            active={flightMode === "NAV"}
            c="#8b5cf6"
            onClick={() => onModeChange("NAV")}
          />
        </div>
      </div>

      {/* ── SIGNATURES DETAIL ── */}
      <div className="border-t border-zinc-800/50 p-2.5 space-y-2">
        <span className="text-[8px] font-mono text-amber-600/60 tracking-[0.2em] uppercase">
          Signatures
        </span>
        <SignatureBar
          label="EM SIG"
          value={stats.emSignature}
          color="#a855f7"
        />
        <SignatureBar
          label="IR SIG"
          value={stats.irSignature}
          color="#f97316"
        />
      </div>

      {/* ── POWER & THERMAL ── */}
      <div className="border-t border-zinc-800/50 p-2.5 space-y-2">
        <PowerThermalBar
          label="POWER"
          value={stats.powerBalance}
          outLabel={`${Math.round(stats.powerOutput)} out`}
          drawLabel={`${Math.round(stats.powerDraw)} draw`}
          color={stats.powerBalance >= 0 ? "#22c55e" : "#ef4444"}
        />
        <PowerThermalBar
          label="THERMAL"
          value={stats.thermalBalance}
          outLabel={`${Math.round(stats.coolingRate)} out`}
          drawLabel={`${Math.round(stats.thermalOutput)} draw`}
          color={stats.thermalBalance >= 0 ? "#3b82f6" : "#ef4444"}
        />
      </div>
    </div>
  );
}

// ── Power Column: one component as a vertical stack of segments ──
function PowerColumn({
  col,
  onSegmentClick,
}: {
  col: PowerColumn;
  onSegmentClick: (segIdx: number) => void;
}) {
  const meta = CAT_META[col.powerCat];

  return (
    <div
      className="flex flex-col items-center"
      style={{
        width: "24px",
        minWidth: "20px",
        flex: "1 1 24px",
        maxWidth: "32px",
      }}
    >
      {/* Segments: flex-col-reverse so index 0 renders at bottom */}
      <div
        className="w-full flex flex-col-reverse gap-[1px]"
        style={{ flex: 1 }}
      >
        {Array.from({ length: col.maxSegments }).map((_, i) => {
          const isAllocated = i < col.allocated;
          const isDisabled = col.isDisabled;

          let bgColor: string;
          let borderColor: string;
          let opacity: number;

          if (isAllocated && col.isActive) {
            bgColor = "#22c55e";
            borderColor = "rgba(34,197,94,0.3)";
            opacity = 0.85;
          } else if (isAllocated && !col.isActive) {
            bgColor = "#22c55e";
            borderColor = "rgba(34,197,94,0.2)";
            opacity = 0.3;
          } else {
            bgColor = "#333333";
            borderColor = "#262626";
            opacity = 1;
          }

          if (isDisabled) opacity *= 0.25;

          return (
            <div
              key={i}
              onClick={() => !isDisabled && onSegmentClick(i)}
              style={{
                width: "100%",
                height: "10px",
                backgroundColor: bgColor,
                border: `1px solid ${borderColor}`,
                borderRadius: "1px",
                opacity,
                cursor: isDisabled ? "not-allowed" : "pointer",
                transition: "all 150ms ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title={`${meta.label} — level ${i + 1}/${col.maxSegments}`}
            >
              {isAllocated &&
                i === col.allocated - 1 &&
                col.allocated > 1 && (
                  <span
                    style={{
                      fontSize: "7px",
                      fontFamily: "monospace",
                      fontWeight: "bold",
                      color: "rgba(255,255,255,0.9)",
                      lineHeight: 1,
                    }}
                  >
                    {col.allocated}
                  </span>
                )}
            </div>
          );
        })}
      </div>

      {/* Category Icon */}
      <div
        className="mt-1 text-center"
        style={{
          fontSize: "10px",
          color: meta.color,
          opacity: col.isDisabled ? 0.2 : 0.7,
          lineHeight: 1,
        }}
        title={col.label}
      >
        {meta.icon}
      </div>
    </div>
  );
}

// ── Signature Badge (compact) ──
function SigBadge({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
}) {
  const fmt = (v: number) => {
    if (v >= 10000) return (v / 1000).toFixed(1) + "K";
    if (v >= 1000) return (v / 1000).toFixed(1) + "K";
    return Math.round(v).toString();
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px]" style={{ color, opacity: 0.6 }}>
        {icon}
      </span>
      <span
        className="text-[10px] font-mono font-bold tabular-nums"
        style={{ color }}
      >
        {fmt(value)}
      </span>
    </div>
  );
}

// ── Signature Bar ──
function SignatureBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const fmt = (v: number) => {
    if (v >= 10000) return (v / 1000).toFixed(1) + "K";
    if (v >= 1000) return (v / 1000).toFixed(1) + "K";
    return Math.round(v).toString();
  };
  const maxRef = 10000;
  const pct = Math.min(100, (value / maxRef) * 100);

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-mono text-zinc-500 tracking-wider uppercase">
          {label}
        </span>
        <span
          className="text-[11px] font-mono font-bold tabular-nums"
          style={{ color }}
        >
          {fmt(value)}
        </span>
      </div>
      <div className="h-1 bg-zinc-800/60 rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm transition-all duration-300"
          style={{
            width: pct + "%",
            backgroundColor: color,
            opacity: 0.7,
          }}
        />
      </div>
    </div>
  );
}

// ── Power/Thermal Bar ──
function PowerThermalBar({
  label,
  value,
  outLabel,
  drawLabel,
  color,
}: {
  label: string;
  value: number;
  outLabel: string;
  drawLabel: string;
  color: string;
}) {
  const sign = value >= 0 ? "+" : "";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-mono text-zinc-500 tracking-wider uppercase">
          {label}
        </span>
        <span
          className="text-[11px] font-mono font-bold tabular-nums"
          style={{ color }}
        >
          {sign}
          {Math.round(value)}
        </span>
      </div>
      <div className="h-1 bg-zinc-800/60 rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm transition-all duration-300"
          style={{
            width: Math.min(100, Math.abs(value) * 3) + "%",
            backgroundColor: color,
            opacity: 0.6,
          }}
        />
      </div>
      <div className="flex justify-between">
        <span className="text-[7px] font-mono text-zinc-600">{outLabel}</span>
        <span className="text-[7px] font-mono text-zinc-600">{drawLabel}</span>
      </div>
    </div>
  );
}

// ── Mode Button ──
function ModeBtn({
  label,
  active,
  c,
  onClick,
}: {
  label: string;
  active: boolean;
  c: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "flex-1 py-1.5 text-[9px] font-mono font-bold tracking-[0.12em] uppercase text-center border rounded-sm"
          : "flex-1 py-1.5 text-[9px] font-mono tracking-[0.12em] uppercase text-center text-zinc-600 border border-zinc-800/50 hover:text-zinc-400 transition-colors rounded-sm"
      }
      style={
        active
          ? { backgroundColor: c + "20", color: c, borderColor: c + "60" }
          : undefined
      }
    >
      {label}
    </button>
  );
}
