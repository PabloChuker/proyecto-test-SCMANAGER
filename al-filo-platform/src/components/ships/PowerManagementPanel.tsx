// =============================================================================
// AL FILO — PowerManagementPanel v6 (Erkul Component Grid)
//
// Each ROW = one power category (weapons, shields, coolers, quantum, radar).
// Each CELL in a row = one individual component (1 shield = 1 cell).
// Cell fill shows energy allocation level for that category.
// Total blocks per category = componentCount from powerNetwork stats.
// =============================================================================

"use client";

import { useLoadoutStore } from "@/store/useLoadoutStore";
import type {
  FlightMode,
  PowerCategory,
  ComputedStats,
} from "@/store/useLoadoutStore";

// Category visual config — order matches Erkul top→bottom
const CATEGORY_ORDER: PowerCategory[] = [
  "weapons",
  "thrusters",
  "shields",
  "quantum",
  "radar",
  "coolers",
];

const CAT_META: Record<
  PowerCategory,
  { icon: string; color: string; label: string }
> = {
  weapons: { icon: "⬡", color: "#22c55e", label: "WPN" },
  thrusters: { icon: "△", color: "#22c55e", label: "THR" },
  shields: { icon: "◇", color: "#22c55e", label: "SHD" },
  quantum: { icon: "◈", color: "#22c55e", label: "QT" },
  radar: { icon: "◎", color: "#22c55e", label: "RAD" },
  coolers: { icon: "❄", color: "#22c55e", label: "CLR" },
};

// Max number of component cells per row
const MAX_CELLS = 8;

export function PowerManagementPanel({
  stats,
  flightMode,
  onModeChange,
}: {
  stats: ComputedStats;
  flightMode: FlightMode;
  onModeChange: (m: FlightMode) => void;
}) {
  const { allocatedPower, setAllocatedPower, autoAllocatePower } =
    useLoadoutStore();
  const pn = stats.powerNetwork;
  const consumColor =
    pn.consumptionPercent > 100
      ? "#ef4444"
      : pn.consumptionPercent > 80
        ? "#f97316"
        : "#22c55e";
  const outputColor =
    pn.freePoints < 0
      ? "#ef4444"
      : pn.freePoints === 0
        ? "#f97316"
        : "#22c55e";

  // Only show categories that have components
  const visibleCats = CATEGORY_ORDER.filter(
    (cat) => pn.categories[cat].componentCount > 0,
  );

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
            <span className="text-[9px] font-mono text-amber-600/80 tracking-[0.15em] uppercase">
              Output
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className="text-lg font-mono font-bold tabular-nums"
              style={{ color: outputColor }}
            >
              {pn.totalAllocated}
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
              <span className="text-amber-600/60 text-[12px]">⊛</span>
              <span className="text-[9px] font-mono text-amber-600/80 tracking-[0.15em] uppercase">
                Consumption
              </span>
            </div>
            <span
              className="text-[11px] font-mono font-bold tabular-nums"
              style={{ color: consumColor }}
            >
              {pn.consumptionPercent} %
            </span>
          </div>
          <div className="h-1.5 bg-zinc-800/60 rounded-sm overflow-hidden">
            <div
              className="h-full rounded-sm transition-all duration-500"
              style={{
                width: Math.min(100, pn.consumptionPercent) + "%",
                backgroundColor: consumColor,
              }}
            />
          </div>
        </div>

        {/* ── Component Energy Grid (Erkul-style rows) ── */}
        {visibleCats.length > 0 && (
          <div className="py-1 space-y-[3px]">
            {visibleCats.map((cat) => {
              const catInfo = pn.categories[cat];
              const allocated = allocatedPower[cat] || 0;
              const minDraw = Math.ceil(catInfo.minDraw);
              const compCount = catInfo.componentCount;
              const isDisabled = cat === "quantum" && flightMode === "SCM";

              // Each cell represents one component
              // Fill level = how much of the category allocation each component "gets"
              // We distribute allocated energy evenly across components
              const perComponent =
                compCount > 0 ? allocated / compCount : 0;
              const perComponentMax =
                compCount > 0
                  ? Math.max(allocated, minDraw, 1) / compCount
                  : 0;

              return (
                <ComponentRow
                  key={cat}
                  cat={cat}
                  componentCount={compCount}
                  allocated={allocated}
                  minDraw={minDraw}
                  totalOutput={pn.totalOutput}
                  freePoints={pn.freePoints}
                  isDisabled={isDisabled}
                  onSet={(p) => setAllocatedPower(cat, p)}
                />
              );
            })}

            {/* ── Category Icons Row ── */}
            <div className="flex justify-between px-0.5 pt-1">
              {visibleCats.map((cat) => {
                const meta = CAT_META[cat];
                const isDisabled =
                  cat === "quantum" && flightMode === "SCM";
                return (
                  <span
                    key={cat}
                    className="text-[10px]"
                    style={{
                      color: meta.color,
                      opacity: isDisabled ? 0.2 : 0.5,
                      flex: 1,
                      textAlign: "center",
                    }}
                    title={meta.label}
                  >
                    {meta.icon}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Auto Balance ── */}
        <button
          onClick={autoAllocatePower}
          className="w-full py-1 text-[8px] font-mono text-zinc-600 tracking-widest uppercase border border-zinc-800/40 hover:border-amber-800/40 hover:text-amber-500/70 transition-colors"
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

      {/* ── SIGNATURES ── */}
      <div className="border-t border-zinc-800/50 p-2.5 space-y-2">
        <span className="text-[8px] font-mono text-amber-600/60 tracking-[0.2em] uppercase">
          Signatures
        </span>
        <SignatureBar label="EM SIG" value={stats.emSignature} color="#a855f7" />
        <SignatureBar label="IR SIG" value={stats.irSignature} color="#f97316" />
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

// ── Component Row: one category as a row of component cells ──
function ComponentRow({
  cat,
  componentCount,
  allocated,
  minDraw,
  totalOutput,
  freePoints,
  isDisabled,
  onSet,
}: {
  cat: PowerCategory;
  componentCount: number;
  allocated: number;
  minDraw: number;
  totalOutput: number;
  freePoints: number;
  isDisabled: boolean;
  onSet: (p: number) => void;
}) {
  const meta = CAT_META[cat];

  // Number of cells = number of components (max MAX_CELLS for display)
  const numCells = Math.min(componentCount, MAX_CELLS);
  if (numCells === 0) return null;

  // Fill ratio: how "full" each cell should be
  // Based on allocated vs. what the category needs
  const maxNeeded = Math.max(minDraw, 1);
  const fillRatio = Math.min(1, allocated / maxNeeded);

  // Is the category underpowered?
  const isUnderpowered = allocated < minDraw;

  const handleClick = () => {
    if (isDisabled) return;
    if (allocated > 0 && allocated >= minDraw) {
      // Deallocate (toggle off excess)
      onSet(Math.max(0, minDraw - 1));
    } else {
      // Allocate what's needed
      const needed = minDraw - allocated;
      if (freePoints >= needed) {
        onSet(minDraw);
      } else {
        onSet(allocated + freePoints);
      }
    }
  };

  // Pad with empty cells to fill the row to MAX_CELLS for alignment
  const cells = [];
  for (let i = 0; i < MAX_CELLS; i++) {
    const isComponent = i < numCells;

    if (!isComponent) {
      // Empty placeholder cell
      cells.push(
        <div
          key={i}
          style={{
            width: "100%",
            aspectRatio: "1.8 / 1",
          }}
        />,
      );
      continue;
    }

    // Determine cell color based on fill level
    let bgColor: string;
    let opacity: number;
    let borderColor: string;

    if (allocated > 0 && !isUnderpowered) {
      // Fully powered — green
      bgColor = "#22c55e";
      opacity = 0.6 + fillRatio * 0.3;
      borderColor = "#22c55e40";
    } else if (allocated > 0 && isUnderpowered) {
      // Partially powered — orange warning
      bgColor = "#f97316";
      opacity = 0.5;
      borderColor = "#f9731640";
    } else {
      // Not allocated — dark
      bgColor = "#27272a";
      opacity = 0.5;
      borderColor = "#3f3f4680";
    }

    if (isDisabled) {
      opacity *= 0.3;
    }

    cells.push(
      <div
        key={i}
        onClick={handleClick}
        style={{
          width: "100%",
          aspectRatio: "1.8 / 1",
          backgroundColor: bgColor,
          opacity,
          border: `1px solid ${borderColor}`,
          borderRadius: "2px",
          cursor: isDisabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 150ms ease",
        }}
        title={`${meta.label} component ${i + 1}`}
      >
        {/* Show allocated number on the first component cell */}
        {i === 0 && allocated > 0 && (
          <span
            style={{
              fontSize: "8px",
              fontFamily: "monospace",
              fontWeight: "bold",
              color: "rgba(255,255,255,0.9)",
              textShadow: "0 1px 2px rgba(0,0,0,0.5)",
            }}
          >
            {allocated}
          </span>
        )}
      </div>,
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${MAX_CELLS}, 1fr)`,
        gap: "3px",
      }}
    >
      {cells}
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

  // Approximate bar fill (normalized to a reasonable max)
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

// ── Power/Thermal Summary Bar ──
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

// ── Signature indicator (compact, for top bar) ──
function SigIndicator({
  icon,
  value,
  color,
}: {
  icon: string;
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
      <span className="text-[11px]" style={{ color, opacity: 0.6 }}>
        {icon}
      </span>
      <span
        className="text-[11px] font-mono font-bold tabular-nums"
        style={{ color }}
      >
        {fmt(value)}
      </span>
    </div>
  );
}

// ── Mode button ──
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
          ? "flex-1 py-1.5 text-[9px] font-mono font-bold tracking-[0.12em] uppercase text-center border"
          : "flex-1 py-1.5 text-[9px] font-mono tracking-[0.12em] uppercase text-center text-zinc-600 border border-zinc-800/50 hover:text-zinc-400 transition-colors"
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
