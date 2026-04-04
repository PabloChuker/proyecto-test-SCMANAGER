// =============================================================================
// AL FILO — PowerManagementPanel v4 (Erkul-style Power Grid)
//
// Matches Erkul's power management layout:
//   - Signature indicators row (EM, IR, CS)
//   - OUTPUT number / total
//   - CONSUMPTION bar with percentage
//   - Component blocks grid (colored by category, showing sizes)
//   - Category icons row
//   - SCM / NAV mode toggles
// =============================================================================

"use client";

import { useLoadoutStore } from "@/store/useLoadoutStore";
import type { FlightMode, PowerCategory, ComputedStats, ResolvedHardpoint } from "@/store/useLoadoutStore";
import { fmtStat, CAT_COLORS } from "./loadout-utils";

// Category metadata for power grid
const CAT_META: Record<string, { icon: string; color: string; short: string }> = {
  WEAPON: { icon: "⬡", color: "#ef4444", short: "WPN" },
  TURRET: { icon: "⬡", color: "#f59e0b", short: "TUR" },
  MISSILE_RACK: { icon: "◆", color: "#f97316", short: "MSL" },
  SHIELD: { icon: "◇", color: "#3b82f6", short: "SHD" },
  POWER_PLANT: { icon: "⚡", color: "#22c55e", short: "PWR" },
  COOLER: { icon: "❄", color: "#06b6d4", short: "CLR" },
  QUANTUM_DRIVE: { icon: "◈", color: "#8b5cf6", short: "QT" },
  RADAR: { icon: "◎", color: "#22c55e", short: "RAD" },
  COUNTERMEASURE: { icon: "◌", color: "#94a3b8", short: "CM" },
  MINING: { icon: "⛏", color: "#f472b6", short: "MIN" },
};

const POWER_CAT_META: Record<PowerCategory, { icon: string; color: string; short: string }> = {
  weapons: { icon: "⬡", color: "#ef4444", short: "WPN" },
  thrusters: { icon: "△", color: "#a855f7", short: "THR" },
  shields: { icon: "◇", color: "#3b82f6", short: "SHD" },
  quantum: { icon: "◈", color: "#8b5cf6", short: "QT" },
  radar: { icon: "◎", color: "#22c55e", short: "RAD" },
  coolers: { icon: "❄", color: "#06b6d4", short: "CLR" },
};

// Categories to show in the visual block grid
const BLOCK_CATS = new Set(["WEAPON", "TURRET", "MISSILE_RACK", "SHIELD", "POWER_PLANT", "COOLER", "QUANTUM_DRIVE", "RADAR", "COUNTERMEASURE", "MINING"]);

export function PowerManagementPanel({ stats, flightMode, onModeChange }: { stats: ComputedStats; flightMode: FlightMode; onModeChange: (m: FlightMode) => void }) {
  const { allocatedPower, setAllocatedPower, autoAllocatePower, hardpoints, getEffectiveItem, isComponentOn } = useLoadoutStore();
  const pn = stats.powerNetwork;
  const consumColor = pn.consumptionPercent > 100 ? "#ef4444" : pn.consumptionPercent > 80 ? "#f97316" : "#22c55e";
  const outputColor = pn.freePoints < 0 ? "#ef4444" : pn.freePoints === 0 ? "#f97316" : "#22c55e";

  // Build component blocks for the visual grid
  const blocks: { cat: string; size: number; name: string; isOn: boolean }[] = [];
  for (const hp of hardpoints) {
    if (!BLOCK_CATS.has(hp.resolvedCategory)) continue;
    const item = getEffectiveItem(hp.id);
    const size = hp.maxSize > 0 ? hp.maxSize : (item?.size ?? 0);
    const isOn = isComponentOn(hp.hardpointName);
    blocks.push({
      cat: hp.resolvedCategory,
      size,
      name: item?.name ?? hp.hardpointName,
      isOn,
    });
  }

  // Sort blocks: by category order, then by size descending
  const catOrder = ["WEAPON", "TURRET", "MISSILE_RACK", "SHIELD", "POWER_PLANT", "COOLER", "QUANTUM_DRIVE", "RADAR", "COUNTERMEASURE", "MINING"];
  blocks.sort((a, b) => {
    const ai = catOrder.indexOf(a.cat), bi = catOrder.indexOf(b.cat);
    if (ai !== bi) return ai - bi;
    return b.size - a.size;
  });

  // Arrange blocks into grid rows (Erkul uses ~8 columns)
  const GRID_COLS = 8;
  const gridRows: typeof blocks[] = [];
  let currentRow: typeof blocks = [];
  let colsUsed = 0;
  for (const block of blocks) {
    const w = Math.max(1, Math.min(block.size, 4)); // each block takes 1-4 cols based on size
    if (colsUsed + w > GRID_COLS && currentRow.length > 0) {
      gridRows.push(currentRow);
      currentRow = [];
      colsUsed = 0;
    }
    currentRow.push(block);
    colsUsed += w;
  }
  if (currentRow.length > 0) gridRows.push(currentRow);

  // Get active power categories for the allocation columns
  const activePowerCats = pn.activeCategories;

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
            <span className="text-zinc-500 text-[12px]">⚙</span>
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
              <span className="text-zinc-500 text-[12px]">⊛</span>
              <span className="text-[9px] font-mono text-amber-600/80 tracking-[0.15em] uppercase">Consumption</span>
            </div>
            <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: consumColor }}>{pn.consumptionPercent} %</span>
          </div>
          <div className="h-1.5 bg-zinc-800/60 rounded-sm overflow-hidden">
            <div className="h-full rounded-sm transition-all duration-500" style={{ width: Math.min(100, pn.consumptionPercent) + "%", backgroundColor: consumColor }} />
          </div>
        </div>

        {/* ── Component Blocks Grid (Erkul-style) ── */}
        {blocks.length > 0 && (
          <div className="space-y-[3px] py-1">
            {gridRows.map((row, ri) => (
              <div key={ri} className="flex gap-[3px]">
                {row.map((block, bi) => {
                  const meta = CAT_META[block.cat];
                  const w = Math.max(1, Math.min(block.size, 4));
                  const color = meta?.color ?? "#52525b";
                  return (
                    <div
                      key={`${ri}-${bi}`}
                      className="relative h-7 rounded-[3px] flex items-center justify-center transition-all duration-200"
                      style={{
                        flex: w,
                        backgroundColor: block.isOn ? color : "#27272a",
                        opacity: block.isOn ? 0.75 : 0.25,
                        border: `1px solid ${block.isOn ? color : "#3f3f46"}`,
                      }}
                      title={block.name}
                    >
                      {block.size > 0 && (
                        <span className="text-[10px] font-mono font-bold text-white/90 drop-shadow-sm">
                          {block.size}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* ── Category Icons Row ── */}
        <div className="flex items-center justify-center gap-2 py-0.5">
          {catOrder.filter(cat => blocks.some(b => b.cat === cat)).map(cat => {
            const meta = CAT_META[cat];
            if (!meta) return null;
            return (
              <span key={cat} className="text-[12px]" style={{ color: meta.color, opacity: 0.6 }} title={meta.short}>
                {meta.icon}
              </span>
            );
          })}
        </div>

        {/* ── Power Allocation Columns (per-category click to add/remove) ── */}
        {activePowerCats.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(" + activePowerCats.length + ", 1fr)", gap: "4px" }}>
            {activePowerCats.map(cat => (
              <PowerCol key={cat} cat={cat} info={pn.categories[cat]} alloc={allocatedPower[cat]} free={pn.freePoints} onSet={(p) => setAllocatedPower(cat, p)} />
            ))}
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

// ── Signature indicator (top row) ──
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

// ── Power allocation column (click blocks to add/remove points) ──
function PowerCol({ cat, info, alloc, free, onSet }: { cat: PowerCategory; info: { minDraw: number }; alloc: number; free: number; onSet: (p: number) => void }) {
  const meta = POWER_CAT_META[cat];
  const minDraw = Math.ceil(info.minDraw);
  const MAX_BLOCKS = 8;

  const blocks = [];
  for (let i = MAX_BLOCKS - 1; i >= 0; i--) {
    const level = i + 1;
    const filled = level <= alloc;
    const deficit = level <= minDraw && level > alloc;
    const isMinMark = level === minDraw && minDraw > 0;

    const handleClick = () => {
      if (filled) {
        onSet(level - 1);
      } else if (free > 0) {
        onSet(level);
      }
    };

    let bg = "bg-zinc-800/30 border-zinc-800/40";
    let style: React.CSSProperties = {};
    if (filled) {
      bg = "border-transparent";
      style = { backgroundColor: meta.color, opacity: 0.75 };
    } else if (deficit) {
      bg = "border-transparent";
      style = { backgroundColor: "#ef4444", opacity: 0.25 };
    }

    blocks.push(
      <div
        key={i}
        onClick={handleClick}
        className={"w-full h-3 border rounded-[2px] transition-all duration-100 relative cursor-pointer hover:brightness-125 " + bg}
        style={style}
      >
        {isMinMark && (
          <span className="absolute inset-0 flex items-center justify-center text-[7px] font-mono font-bold text-white/90">
            {minDraw}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="w-full space-y-[2px]">{blocks}</div>
      <span className="text-[10px] mt-0.5" style={{ color: meta.color, opacity: 0.5 }}>{meta.icon}</span>
      <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color: alloc < minDraw ? "#ef4444" : meta.color }}>
        {alloc}
      </span>
    </div>
  );
}
