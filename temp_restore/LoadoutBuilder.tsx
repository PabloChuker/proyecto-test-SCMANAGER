// =============================================================================
// AL FILO — LoadoutBuilder (Client Component)
//
// Layout estilo Erkul: denso, horizontal, agrupado por categoría.
// Cada hardpoint es clickeable para abrir el ComponentPicker.
// Las stats se recalculan en tiempo real cuando el usuario cambia un componente.
//
// Estado:
//   - `overrides` (Map) guarda los cambios del usuario sobre el loadout default
//   - `stats` se recomputa con recomputeStats() cada vez que overrides cambia
//   - Al hacer Reset, se borran los overrides y se vuelve al loadout original
// =============================================================================

"use client";

import { useState, useMemo, useCallback } from "react";
import {
  HARDPOINT_GROUPS,
  HARDPOINT_GROUP_META,
  HARDPOINT_COLORS,
} from "@/types/ships";
import type {
  FlatHardpoint,
  EquippedItemFlat,
  ComputedLoadoutStats,
  LoadoutOverride,
  ComponentSearchResult,
  ShipDetailResponseV2,
} from "@/types/ships";
import { recomputeStats } from "@/lib/computeStats";
import { ComponentPicker } from "@/components/ships/ComponentPicker";

interface LoadoutBuilderProps {
  shipData: ShipDetailResponseV2;
}

export function LoadoutBuilder({ shipData }: LoadoutBuilderProps) {
  const { data: ship, flatHardpoints: baseHardpoints, computed: serverStats } = shipData;
  const shipInfo = ship.ship;

  // ── Estado de overrides ──
  const [overrides, setOverrides] = useState<Map<string, LoadoutOverride>>(new Map());
  const [pickerHardpoint, setPickerHardpoint] = useState<FlatHardpoint | null>(null);

  const hasChanges = overrides.size > 0;

  // ── Stats reactivas ──
  const stats: ComputedLoadoutStats = useMemo(
    () => hasChanges ? recomputeStats(baseHardpoints, overrides) : serverStats,
    [baseHardpoints, overrides, serverStats, hasChanges]
  );

  // ── Handlers ──
  const handleSelectComponent = useCallback((item: ComponentSearchResult) => {
    if (!pickerHardpoint) return;

    const equipped: EquippedItemFlat = {
      id: item.id,
      reference: item.reference,
      name: item.name,
      localizedName: item.localizedName,
      className: item.className,
      type: item.type,
      size: item.size,
      grade: item.grade,
      manufacturer: item.manufacturer,
      componentStats: item.componentStats,
    };

    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(pickerHardpoint.id, {
        hardpointId: pickerHardpoint.id,
        equippedItem: equipped,
      });
      return next;
    });
    setPickerHardpoint(null);
  }, [pickerHardpoint]);

  const handleClearSlot = useCallback(() => {
    if (!pickerHardpoint) return;
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(pickerHardpoint.id, {
        hardpointId: pickerHardpoint.id,
        equippedItem: null,
      });
      return next;
    });
    setPickerHardpoint(null);
  }, [pickerHardpoint]);

  const handleReset = useCallback(() => {
    setOverrides(new Map());
  }, []);

  // ── Agrupar hardpoints ──
  const grouped = useMemo(() => {
    const groups: Record<string, FlatHardpoint[]> = {};
    for (const key of Object.keys(HARDPOINT_GROUPS)) {
      groups[key] = [];
    }
    for (const hp of baseHardpoints) {
      let placed = false;
      for (const [gKey, cats] of Object.entries(HARDPOINT_GROUPS)) {
        if ((cats as readonly string[]).includes(hp.category)) {
          groups[gKey].push(hp);
          placed = true;
          break;
        }
      }
      if (!placed) groups.utility.push(hp);
    }
    return groups;
  }, [baseHardpoints]);

  // ── Resolver item actual para un hardpoint (override o default) ──
  const getEffectiveItem = useCallback(
    (hp: FlatHardpoint): EquippedItemFlat | null => {
      const override = overrides.get(hp.id);
      return override ? override.equippedItem : hp.equippedItem;
    },
    [overrides]
  );

  return (
    <div className="space-y-5">
      {/* ════════════════════════════════════════════════════════════════════
          STATS BAR — Fila horizontal de gauges tipo Erkul
          ════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-sm border border-zinc-800/50 bg-zinc-900/30 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] tracking-[0.2em] uppercase text-zinc-500">
            Loadout Stats
            {hasChanges && (
              <span className="ml-2 text-cyan-500">(modificado)</span>
            )}
          </h2>
          {hasChanges && (
            <button
              onClick={handleReset}
              className="text-[10px] tracking-wide uppercase text-zinc-600 hover:text-amber-400
                         border border-zinc-800/50 px-2 py-0.5 rounded-sm
                         hover:border-amber-400/30 transition-all"
            >
              Reset default
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <StatCell label="DPS" value={stats.totalDps} color="#ef4444" fmt={fmtDps} />
          <StatCell label="Alpha" value={stats.totalAlphaDamage} color="#f97316" />
          <StatCell label="Shields" value={stats.totalShieldHp} color="#3b82f6" unit="HP" />
          <StatCell
            label="Power"
            value={stats.powerBalance}
            color={stats.powerBalance >= 0 ? "#22c55e" : "#ef4444"}
            prefix={stats.powerBalance >= 0 ? "+" : ""}
          />
          <StatCell
            label="Thermal"
            value={stats.thermalBalance}
            color={stats.thermalBalance >= 0 ? "#06b6d4" : "#ef4444"}
            prefix={stats.thermalBalance >= 0 ? "+" : ""}
          />
          <StatCell label="SCM" value={shipInfo?.maxSpeed || 0} color="#a855f7" unit="m/s" />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          HARDPOINTS — Agrupados horizontalmente
          ════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-3">
        {(Object.keys(HARDPOINT_GROUPS) as (keyof typeof HARDPOINT_GROUPS)[]).map((groupKey) => {
          const hps = grouped[groupKey];
          if (!hps || hps.length === 0) return null;

          const meta = HARDPOINT_GROUP_META[groupKey];

          return (
            <div key={groupKey} className="rounded-sm border border-zinc-800/40 bg-zinc-900/20">
              {/* Group header */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/30">
                <span className="text-xs opacity-40">{meta.icon}</span>
                <span className="text-[10px] tracking-[0.15em] uppercase text-zinc-500 font-medium">
                  {meta.label}
                </span>
                <span className="text-[10px] text-zinc-700 font-mono ml-auto">
                  {hps.length}
                </span>
              </div>

              {/* Hardpoint rows */}
              <div className="divide-y divide-zinc-800/20">
                {hps.map((hp) => {
                  const item = getEffectiveItem(hp);
                  const isOverridden = overrides.has(hp.id);
                  const catColor = HARDPOINT_COLORS[hp.category] || "#71717a";
                  const keyStat = getKeyStatDisplay(hp.category, item?.componentStats);

                  return (
                    <div key={hp.id} className="group">
                      <button
                        onClick={() => setPickerHardpoint(hp)}
                        className="
                          w-full flex items-center gap-3 px-4 py-2
                          text-left transition-all duration-150
                          hover:bg-zinc-800/20
                        "
                      >
                        {/* Color bar */}
                        <div
                          className="w-0.5 h-7 rounded-full flex-shrink-0 opacity-40 group-hover:opacity-70 transition-opacity"
                          style={{ backgroundColor: catColor }}
                        />

                        {/* Slot info */}
                        <div className="flex-shrink-0 w-14 text-center">
                          <div className="text-[9px] text-zinc-700 uppercase">
                            {hp.isFixed ? "Fixed" : "Gimbal"}
                          </div>
                          <div className="text-xs font-mono text-zinc-500">
                            S{hp.maxSize}
                          </div>
                        </div>

                        {/* Divider */}
                        <div className="w-px h-6 bg-zinc-800/40 flex-shrink-0" />

                        {/* Equipped item */}
                        <div className="flex-1 min-w-0">
                          {item ? (
                            <div className="flex items-center gap-2">
                              <span className={`text-sm truncate ${isOverridden ? "text-cyan-200" : "text-zinc-300"}`}>
                                {item.localizedName || item.name}
                              </span>
                              {item.grade && (
                                <span className="text-[9px] font-mono text-zinc-600 px-1 border border-zinc-800/50 rounded-sm">
                                  {item.grade}
                                </span>
                              )}
                              {isOverridden && (
                                <span className="text-[8px] text-cyan-600 tracking-wider uppercase">mod</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-zinc-700 italic">Vacío</span>
                          )}
                          {item && (
                            <div className="text-[10px] text-zinc-600">
                              {item.manufacturer || "Unknown"}
                              {item.size != null && ` · S${item.size}`}
                            </div>
                          )}
                        </div>

                        {/* Key stat */}
                        {keyStat && (
                          <div className="flex-shrink-0 text-right w-16">
                            <div className="text-sm font-mono" style={{ color: catColor }}>
                              {keyStat.v}
                            </div>
                            <div className="text-[9px] text-zinc-600 uppercase">{keyStat.l}</div>
                          </div>
                        )}

                        {/* Child weapons indicator */}
                        {hp.isTurretOrGimbal && hp.childWeapons.length > 0 && (
                          <div className="flex-shrink-0 pl-1">
                            <div className="text-[9px] text-zinc-700 font-mono">
                              {hp.childWeapons.length}×
                            </div>
                          </div>
                        )}

                        {/* Edit indicator */}
                        <div className="flex-shrink-0 text-zinc-800 group-hover:text-zinc-500 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                  d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </div>
                      </button>

                      {/* Child weapons (turret internals) */}
                      {hp.isTurretOrGimbal && hp.childWeapons.length > 0 && (
                        <div className="pl-12 pr-4 pb-2 space-y-0.5">
                          {hp.childWeapons.map((child, idx) => {
                            const childItem = child.equippedItem;
                            const childStat = childItem?.componentStats?.dps;
                            return (
                              <div key={idx} className="flex items-center gap-2 py-1 text-zinc-600">
                                <span className="text-[9px] font-mono w-8 text-center">
                                  S{child.maxSize}
                                </span>
                                <span className="text-[10px] w-px h-3 bg-zinc-800/40" />
                                <span className="text-[11px] flex-1 truncate">
                                  {childItem
                                    ? (childItem.localizedName || childItem.name)
                                    : "Vacío"
                                  }
                                </span>
                                {childStat != null && childStat > 0 && (
                                  <span className="text-[10px] font-mono text-red-400/60">
                                    {childStat.toFixed(1)} dps
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          COMPONENT PICKER MODAL
          ════════════════════════════════════════════════════════════════════ */}
      {pickerHardpoint && (
        <ComponentPicker
          hardpoint={pickerHardpoint}
          onSelect={handleSelectComponent}
          onClear={handleClearSlot}
          onClose={() => setPickerHardpoint(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatCell({
  label, value, color, unit, prefix, fmt,
}: {
  label: string;
  value: number;
  color: string;
  unit?: string;
  prefix?: string;
  fmt?: (v: number) => string;
}) {
  const display = fmt ? fmt(value) : fmtStat(value);

  return (
    <div className="text-center py-2 px-1 rounded-sm bg-zinc-800/20">
      <div className="text-[9px] tracking-[0.12em] uppercase text-zinc-600 mb-0.5">{label}</div>
      <div className="font-mono text-base font-light" style={{ color }}>
        {prefix}{display}
      </div>
      {unit && <div className="text-[9px] text-zinc-700">{unit}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtStat(v: number): string {
  if (v === 0) return "0";
  if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(1)}k`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(2)}k`;
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(1);
}

function fmtDps(v: number): string {
  if (v === 0) return "0";
  if (v >= 1000) return `${(v / 1000).toFixed(2)}k`;
  return v.toFixed(1);
}

function getKeyStatDisplay(
  category: string,
  stats?: Record<string, any> | null
): { v: string; l: string } | null {
  if (!stats) return null;

  switch (category) {
    case "WEAPON": case "TURRET":
      return stats.dps ? { v: stats.dps.toFixed(1), l: "DPS" } : null;
    case "MISSILE_RACK":
      return stats.alphaDamage ? { v: fmtStat(stats.alphaDamage), l: "DMG" } : null;
    case "SHIELD":
      return stats.shieldHp ? { v: fmtStat(stats.shieldHp), l: "HP" } : null;
    case "POWER_PLANT":
      return stats.powerOutput ? { v: fmtStat(stats.powerOutput), l: "Out" } : null;
    case "COOLER":
      return stats.coolingRate ? { v: fmtStat(stats.coolingRate), l: "Rate" } : null;
    case "QUANTUM_DRIVE":
      return stats.quantumSpoolUp ? { v: `${stats.quantumSpoolUp.toFixed(1)}s`, l: "Spool" } : null;
    default:
      return stats.powerDraw ? { v: fmtStat(stats.powerDraw), l: "Pwr" } : null;
  }
}
