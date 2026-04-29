// =============================================================================
// AL FILO — PowerManagementPanel v15 (Erkul-faithful, pool-aware)
//
// Uses powerNetwork.pips + ship_power_reference pools as ground truth.
// - 1 column per component INSTANCE (except power plants which generate power)
// - Max 8 cells per column (game mechanic)
// - Cells: green/orange = allocated, grey = available, black = locked (beyond max)
// - Orange for weapons, Green for systems
// - OUTPUT x/y bar, CONSUMPTION % bar
// - SCM / NAV toggle (NAV disables shields)
// - Signature stats row (EM, IR, PWR, THM)
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
const ROWS = 8;

// Category display ordering (weapons first, then systems in Erkul order)
const CATEGORY_ORDER: PowerCategory[] = [
  "weapons", "thrusters", "quantum", "qig", "radar", "shields", "coolers", "lifesupport",
];

// Whether category uses orange or green
function isOrangeCat(cat: PowerCategory): boolean {
  return cat === "weapons";
}
function catColor(cat: PowerCategory): string {
  return isOrangeCat(cat) ? "#f59e0b" : "#22c55e";
}

// Available (unfilled) cells — neutral grey regardless of category
const AVAILABLE_BG = "#3f3f46";     // zinc-700
const AVAILABLE_BORDER = "#52525b"; // zinc-600

// ── PNG Icons per component type (from /icons/ folder) ──
const CAT_ICON_MAP: Record<PowerCategory, string> = {
  weapons: "/icons/weapons.png",
  thrusters: "/icons/Ships.png",
  shields: "/icons/shilds.png",
  quantum: "/icons/Quantum_drives.png",
  // QIG: ícono dedicado interdict.png para que no se confunda con el QT drive
  // (Quantum_drives.png). La barra debe leerse "interdictor" a primera vista.
  qig: "/icons/interdict.png",
  radar: "/icons/interdict_pulse.png",
  coolers: "/icons/coolers.png",
  lifesupport: "/icons/shilds.png",
};

function ComponentIcon({ cat, isOn }: { cat: PowerCategory; isOn: boolean }) {
  const src = CAT_ICON_MAP[cat] || "/icons/weapons.png";
  // Fase Q.2: blanco si ON, gris si OFF — efecto visual claro y consistente
  // sin importar la categoría (antes cada cat tenía un color distinto que
  // distraía). brightness invierte el png oscuro a blanco; saturate(0)
  // deja gris cuando está apagado.
  return (
    <img
      src={src}
      alt={cat}
      width={24}
      height={24}
      style={{
        display: "block",
        filter: isOn
          ? "brightness(0) invert(1)"
          : "brightness(0) invert(1) opacity(0.35)",
        transition: "filter 0.15s ease",
      }}
    />
  );
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
  const setInstancePower = useLoadoutStore(s => s.setInstancePower);
  const toggleComponent  = useLoadoutStore(s => s.toggleComponent);
  const pn = stats.powerNetwork;

  // Build ordered columns (skip power plants — they generate, not consume)
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

  // Click handler — toggle pip allocation
  const handleCellClick = (inst: ComponentPowerInstance, row: number) => {
    if (row >= inst.totalPips) return;
    // If component is off, turn it on and allocate up to row+1
    if (!inst.isOn) {
      toggleComponent(inst.hardpointName);
      return;
    }
    const current = inst.allocatedPips;
    if (row < current) {
      setInstancePower(inst.hardpointName, row);
    } else {
      setInstancePower(inst.hardpointName, row + 1);
    }
  };

  // Click handler for merged min cell — toggle between min allocation and off
  const handleMinCellClick = (inst: ComponentPowerInstance, minPips: number) => {
    if (!inst.isOn) {
      // Turn on and allocate minimum
      toggleComponent(inst.hardpointName);
      return;
    }
    // If currently allocated, turn off completely
    setInstancePower(inst.hardpointName, 0);
    toggleComponent(inst.hardpointName);
  };

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-sm overflow-hidden">
      <div className="p-3 space-y-2">
        {/* ── OUTPUT & CONSUMPTION ── */}
        <div className="space-y-1.5">
          {/* Output bar */}
          <div className="flex items-center gap-2">
            <span className="text-[11px]" style={{ color: "#f59e0b" }}>⚡</span>
            <span className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase">Output</span>
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden ml-1">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: totalOutput > 0
                    ? Math.min(100, (totalAllocated / totalOutput) * 100) + "%"
                    : "0%",
                  backgroundColor: totalAllocated > totalOutput ? "#ef4444" : "#f59e0b",
                }}
              />
            </div>
            <span
              className="text-sm font-mono font-bold tabular-nums"
              style={{ color: totalAllocated > totalOutput ? "#ef4444" : "#f59e0b" }}
            >
              {totalAllocated}
            </span>
            <span className="text-[11px] font-mono text-zinc-600">/ {totalOutput}</span>
          </div>

          {/* Consumption bar removed — users don't need it */}
        </div>

        {/* ── POWER GRID ── */}
        {columns.length > 0 && (
          <div className="space-y-1">
            {/* Grid: 8 rows × N columns, bottom-to-top fill */}
            <div className="flex" style={{ gap: "2px", justifyContent: "center" }}>
              {columns.map((inst, colIdx) => {
                const color = catColor(inst.category);
                const prevCat = colIdx > 0 ? columns[colIdx - 1].category : null;
                const showSep = prevCat !== null && prevCat !== inst.category;

                // Determine minimum pips needed (from powerMin)
                const minPips = inst.powerMin > 0
                  ? Math.min(inst.totalPips, Math.max(1, Math.ceil(inst.powerMin)))
                  : 0;

                // Build cell list: merge min-zone cells into one big cell.
                // We render bottom-to-top (flex-col-reverse), so row 0 = bottom.
                //
                // Fase U.5b (2026-04-29): si la instance trae `subShields[]`
                // (caso de la columna combinada de shields), la min-zone se
                // subdivide en N sub-bloques (uno por shield físico) en vez
                // del único bloque grande con el número total. Cada sub-bloque
                // togglea su propio hardpoint independientemente — Pablo
                // quería poder apagar 1 generador de la Avenger Titan sin
                // tirar el otro.
                const cells: React.ReactNode[] = [];
                let row = 0;
                while (row < ROWS) {
                  const locked = row >= inst.totalPips;
                  const allocated = !locked && row < inst.allocatedPips && inst.isOn;
                  const isMinZone = !locked && row < minPips;

                  // Special case: shields with sub-shields → render the min
                  // zone as N stacked sub-blocks, each toggling its own hardpoint.
                  if (
                    row === 0 &&
                    minPips > 0 &&
                    !locked &&
                    inst.subShields &&
                    inst.subShields.length > 1
                  ) {
                    let subStart = 0;
                    inst.subShields.forEach((sub, subIdx) => {
                      const subPips = Math.max(1, Math.min(minPips - subStart, sub.pipsForMin));
                      if (subPips <= 0) return;
                      const subHeight = subPips * 14 + (subPips - 1) * 2;
                      const subAllocated = sub.isOn && inst.isOn && inst.allocatedPips > subStart;

                      let bg: string;
                      let borderC: string;
                      let opacity = 1;
                      if (!sub.isOn) {
                        bg = "#1f1f23"; borderC = "#2a2a2e"; opacity = 0.35;
                      } else if (subAllocated) {
                        bg = color; borderC = color;
                      } else {
                        bg = AVAILABLE_BG; borderC = AVAILABLE_BORDER;
                      }

                      cells.push(
                        <div
                          key={`sub-${subIdx}-${sub.hardpointName}`}
                          onClick={() => toggleComponent(sub.hardpointName)}
                          style={{
                            width: 24,
                            height: subHeight,
                            backgroundColor: bg,
                            border: `1px solid ${borderC}`,
                            borderRadius: 2,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity,
                            transition: "all 100ms",
                          }}
                          title={`${sub.componentName} — ${sub.isOn ? "ON" : "OFF"} · click para alternar`}
                        >
                          {sub.isOn && subAllocated && (
                            <span style={{
                              fontSize: 8,
                              fontWeight: 800,
                              fontFamily: "monospace",
                              color: "#000",
                              lineHeight: 1,
                            }}>
                              {subPips}
                            </span>
                          )}
                        </div>
                      );
                      subStart += subPips;
                    });
                    row = minPips;
                    continue;
                  }

                  // If this is the start of the min zone and minPips > 1, merge into one cell
                  if (row === 0 && minPips > 1 && !locked) {
                    const allMinAllocated = inst.isOn && inst.allocatedPips >= minPips;
                    const someMinAllocated = inst.isOn && inst.allocatedPips > 0 && inst.allocatedPips < minPips;
                    const mergedHeight = minPips * 14 + (minPips - 1) * 2; // cells + gaps

                    let bg: string;
                    let borderC: string;
                    let opacity = 1;
                    if (!inst.isOn) {
                      bg = "#1f1f23"; borderC = "#2a2a2e"; opacity = 0.35;
                    } else if (allMinAllocated || someMinAllocated) {
                      bg = color; borderC = color;
                    } else {
                      bg = AVAILABLE_BG; borderC = AVAILABLE_BORDER;
                    }

                    cells.push(
                      <div
                        key="min-merged"
                        onClick={() => handleMinCellClick(inst, minPips)}
                        style={{
                          width: 24,
                          height: mergedHeight,
                          backgroundColor: bg,
                          border: `1px solid ${borderC}`,
                          borderRadius: 2,
                          cursor: !inst.isOn ? "default" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity,
                          transition: "all 100ms",
                        }}
                        title={`${inst.componentName} — min ${minPips} pips`}
                      >
                        {(allMinAllocated || someMinAllocated) && (
                          <span style={{
                            fontSize: 8,
                            fontWeight: 800,
                            fontFamily: "monospace",
                            color: "#000",
                            lineHeight: 1,
                          }}>
                            {minPips}
                          </span>
                        )}
                      </div>
                    );
                    row = minPips;
                    continue;
                  }

                  // Regular cell — capture row in const for closure
                  const currentRow = row;
                  let bg: string;
                  let borderC: string;
                  let opacity = 1;

                  if (locked) {
                    bg = "#1a1a1d"; borderC = "#222225"; opacity = 0.2;
                  } else if (!inst.isOn) {
                    bg = "#1f1f23"; borderC = "#2a2a2e"; opacity = 0.35;
                  } else if (allocated) {
                    bg = color; borderC = color;
                  } else {
                    bg = AVAILABLE_BG; borderC = AVAILABLE_BORDER;
                  }

                  cells.push(
                    <div
                      key={currentRow}
                      onClick={() => handleCellClick(inst, currentRow)}
                      style={{
                        width: 24,
                        height: 14,
                        backgroundColor: bg,
                        border: `1px solid ${borderC}`,
                        borderRadius: 2,
                        cursor: locked || !inst.isOn ? "default" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity,
                        transition: "all 100ms",
                      }}
                      title={
                        locked ? "" :
                        `${inst.componentName} — pip ${currentRow + 1}/${inst.totalPips}`
                      }
                    />
                  );
                  row++;
                }

                return (
                  <React.Fragment key={inst.hardpointName}>
                    {showSep && <div style={{ width: "4px" }} />}
                    <div className="flex flex-col-reverse" style={{ gap: "2px" }}>
                      {cells}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Icons row: cada icono es un toggle ON/OFF del componente.
                Fase Q.2: click apaga/enciende. Blanco=ON, gris=OFF.
                Apagar acá NO oscurece la tarjeta del HardpointSlot
                (ese efecto se removió en HardpointSlot). */}
            <div className="flex" style={{ gap: "2px", justifyContent: "center" }}>
              {columns.map((inst, colIdx) => {
                const prevCat = colIdx > 0 ? columns[colIdx - 1].category : null;
                const showSep = prevCat !== null && prevCat !== inst.category;
                return (
                  <React.Fragment key={inst.hardpointName + "-icon"}>
                    {showSep && <div style={{ width: "4px" }} />}
                    <button
                      type="button"
                      onClick={() => toggleComponent(inst.hardpointName)}
                      className="flex items-center justify-center cursor-pointer hover:bg-zinc-800/40 rounded-sm transition-colors"
                      style={{ width: 24, height: 24, border: 0, padding: 0, background: "transparent" }}
                      title={`${inst.componentName} — ${inst.isOn ? "ON" : "OFF"} · click para alternar\n${inst.allocatedPips}/${inst.totalPips} pips · Draw: ${(inst.powerMin + (inst.powerMax - inst.powerMin) * (inst.totalPips > 0 ? inst.allocatedPips / inst.totalPips : 0)).toFixed(1)} / ${inst.powerMax} pwr`}
                    >
                      <ComponentIcon cat={inst.category} isOn={inst.isOn} />
                    </button>
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

      {/* ── Signatures (EM / IR) — Fase Q.4: PWR y THM removidos.
          EM e IR son los relevantes en este panel; el balance de power
          ya se ve en la barra superior y el thermal en los bars. */}
      <div className="border-t border-zinc-800/50 px-3 py-3 grid grid-cols-2 gap-x-6">
        <BigStat icon="⚡" label="EM" value={stats.emSignature} color="#a855f7" />
        <BigStat icon="🔥" label="IR" value={stats.irSignature} color="#f97316" />
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

// Fase Q.4: stat grande para EM/IR. Usa la misma forma de fmt que MiniStat
// (1.2K / 17K) pero con tipografía mucho más prominente y label arriba.
function BigStat({ icon, label, value, color }: {
  icon: string; label: string; value: number; color: string;
}) {
  const abs = Math.abs(value);
  const str = abs >= 1000 ? (abs / 1000).toFixed(1) + "K" : Math.round(abs).toString();
  return (
    <div className="flex items-center gap-3">
      <span className="text-2xl" style={{ opacity: 0.7 }}>{icon}</span>
      <div className="flex flex-col">
        <span className="text-[10px] font-mono text-zinc-500 tracking-[0.15em] uppercase">{label}</span>
        <span className="text-2xl font-mono font-bold tabular-nums leading-none" style={{ color }}>{str}</span>
      </div>
    </div>
  );
}
