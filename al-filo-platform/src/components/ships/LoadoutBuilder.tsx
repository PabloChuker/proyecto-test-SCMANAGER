// =============================================================================
// AL FILO — LoadoutBuilder v6 (Zustand-powered)
//
// Zero internal math. All data from useLoadoutStore.
// Calls loadShip() on mount, reads getStats()/getEffectiveItem() for display.
// User interactions dispatch equipItem()/clearSlot()/resetAll() to the store.
// =============================================================================

"use client";

import { useEffect, useState, useCallback } from "react";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import type { ResolvedHardpoint, EquippedItem } from "@/store/useLoadoutStore";
import { HardpointSlot } from "./HardpointSlot";
import { ComponentPicker } from "./ComponentPicker";
import { CAT_COLORS, fmtStat, fmtDps } from "./loadout-utils";

interface LoadoutBuilderProps {
  shipId: string;
}

export function LoadoutBuilder({ shipId }: LoadoutBuilderProps) {
  const {
    shipInfo, isLoading, error,
    loadShip, getStats, getEffectiveItem, hasChanges,
    getWeaponHardpoints, getSystemHardpoints,
    equipItem, clearSlot, resetAll, overrides,
  } = useLoadoutStore();

  const [pickerHp, setPickerHp] = useState<ResolvedHardpoint | null>(null);

  // Load ship on mount or when shipId changes
  useEffect(() => { loadShip(shipId); }, [shipId, loadShip]);

  const stats = getStats();
  const weaponHps = getWeaponHardpoints();
  const systemHps = getSystemHardpoints();
  const changed = hasChanges();

  const handleSelect = useCallback((item: EquippedItem) => {
    if (!pickerHp) return;
    equipItem(pickerHp.id, item);
    setPickerHp(null);
  }, [pickerHp, equipItem]);

  const handleClear = useCallback(() => {
    if (!pickerHp) return;
    clearSlot(pickerHp.id);
    setPickerHp(null);
  }, [pickerHp, clearSlot]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-zinc-700 border-t-cyan-500 rounded-full animate-spin mr-3" />
        <span className="text-sm text-zinc-500">Loading ship data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-sm border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">{error}</div>
    );
  }

  if (!shipInfo) return null;

  return (
    <div className="space-y-4">
      {/* Reset bar */}
      {changed && (
        <div className="flex items-center justify-between px-3 py-2 rounded-sm border border-cyan-500/20 bg-cyan-500/5">
          <span className="text-[10px] tracking-widest uppercase text-cyan-500">{overrides.size} modification{overrides.size > 1 ? "s" : ""}</span>
          <button onClick={resetAll} className="text-[10px] tracking-wide uppercase text-amber-400 hover:text-amber-300 transition-colors">Reset to Default</button>
        </div>
      )}

      {/* 3-COLUMN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* ═══ LEFT: WEAPONS ═══ */}
        <div className="space-y-1">
          <SectionHead icon="⬡" label="Weapons" count={weaponHps.length} />
          <div className="rounded-sm border border-zinc-800/40 bg-zinc-900/20 divide-y divide-zinc-800/20">
            {weaponHps.length === 0 ? (
              <Empty text="No weapon hardpoints" />
            ) : weaponHps.map(hp => (
              <HardpointSlot key={hp.id} hp={hp} item={getEffectiveItem(hp.id)} isOverridden={overrides.has(hp.id)} onClick={() => setPickerHp(hp)} />
            ))}
          </div>
        </div>

        {/* ═══ CENTER: SYSTEMS ═══ */}
        <div className="space-y-1">
          <SectionHead icon="⚙" label="Systems" count={systemHps.length} />
          <div className="rounded-sm border border-zinc-800/40 bg-zinc-900/40 divide-y divide-zinc-800/20">
            {systemHps.length === 0 ? (
              <Empty text="No system hardpoints" />
            ) : systemHps.map(hp => {
              const item = getEffectiveItem(hp.id);
              const bar = getContextBar(hp.resolvedCategory, item, stats);
              return (
                <div key={hp.id}>
                  <HardpointSlot hp={hp} item={item} isOverridden={overrides.has(hp.id)} onClick={() => setPickerHp(hp)} />
                  {bar && (
                    <div className="px-4 pb-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-zinc-800/60 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: Math.min(100, bar.pct) + "%", backgroundColor: bar.color }} />
                        </div>
                        <span className="text-[9px] font-mono text-zinc-600">{bar.label}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ RIGHT: STATS ═══ */}
        <div className="space-y-1">
          <SectionHead icon="◈" label="Ship Stats" />
          <div className="rounded-sm border border-zinc-800/40 bg-zinc-900/30 p-3 space-y-3">
            <BigStat label="Total DPS" value={fmtDps(stats.totalDps)} sub={"Alpha: " + fmtStat(stats.totalAlpha)} color="#ef4444" />
            <BigStat label="Shield HP" value={fmtStat(stats.shieldHp)} sub={"Regen: " + fmtStat(stats.shieldRegen) + "/s"} color="#3b82f6" />

            <BalanceGauge label="Power Balance" value={stats.powerBalance} maxAbs={Math.max(stats.powerOutput, 1)} posColor="#22c55e" negColor="#ef4444" leftText={"Out: " + fmtStat(stats.powerOutput)} rightText={"Draw: " + fmtStat(stats.powerDraw)} />
            <BalanceGauge label="Thermal Balance" value={stats.thermalBalance} maxAbs={Math.max(stats.coolingRate, 1)} posColor="#06b6d4" negColor="#ef4444" leftText={"Cool: " + fmtStat(stats.coolingRate)} rightText={"Heat: " + fmtStat(stats.thermalOutput)} />

            <div className="grid grid-cols-2 gap-2">
              <Mini label="EM Sig" value={fmtStat(stats.emSignature)} color="#eab308" />
              <Mini label="IR Sig" value={fmtStat(stats.irSignature)} color="#f97316" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Mini label="SCM" value={shipInfo.scmSpeed ? Math.round(shipInfo.scmSpeed) + " m/s" : "—"} color="#a855f7" />
              <Mini label="AFB" value={shipInfo.afterburnerSpeed ? Math.round(shipInfo.afterburnerSpeed) + " m/s" : "—"} color="#a855f7" />
            </div>

            {/* Summary chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {stats.summary.weapons > 0 && <Chip label="Weapons" n={stats.summary.weapons} color="#ef4444" />}
              {stats.summary.missiles > 0 && <Chip label="Missiles" n={stats.summary.missiles} color="#f97316" />}
              {stats.summary.shields > 0 && <Chip label="Shields" n={stats.summary.shields} color="#3b82f6" />}
              {stats.summary.powerPlants > 0 && <Chip label="Power" n={stats.summary.powerPlants} color="#22c55e" />}
              {stats.summary.coolers > 0 && <Chip label="Coolers" n={stats.summary.coolers} color="#06b6d4" />}
              {stats.summary.quantumDrives > 0 && <Chip label="QT" n={stats.summary.quantumDrives} color="#a855f7" />}
            </div>
          </div>
        </div>
      </div>

      {/* Component picker modal */}
      {pickerHp && (
        <ComponentPicker hardpoint={pickerHp} currentItemId={getEffectiveItem(pickerHp.id)?.id ?? null} onSelect={handleSelect} onClear={handleClear} onClose={() => setPickerHp(null)} />
      )}
    </div>
  );
}

// =============================================================================
// Sub-components — all className strings single-line
// =============================================================================

function SectionHead({ icon, label, count }: { icon: string; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <span className="text-xs opacity-40">{icon}</span>
      <span className="text-[10px] tracking-widest uppercase text-zinc-500 font-medium">{label}</span>
      {count !== undefined && <span className="text-[10px] text-zinc-700 font-mono ml-auto">{count}</span>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-4 py-6 text-center text-[11px] text-zinc-700">{text}</div>;
}

function BigStat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="p-2.5 rounded-sm bg-zinc-800/20">
      <div className="text-[9px] tracking-widest uppercase text-zinc-600 mb-0.5">{label}</div>
      <div className="font-mono text-xl font-light" style={{ color }}>{value}</div>
      <div className="text-[10px] text-zinc-600 font-mono mt-0.5">{sub}</div>
    </div>
  );
}

function BalanceGauge({ label, value, maxAbs, posColor, negColor, leftText, rightText }: { label: string; value: number; maxAbs: number; posColor: string; negColor: string; leftText: string; rightText: string }) {
  const pos = value >= 0;
  const pct = maxAbs > 0 ? Math.min(50, (Math.abs(value) / maxAbs) * 50) : 0;
  const bColor = pos ? posColor : negColor;
  const bStyle = pos ? { left: "50%", width: pct + "%", backgroundColor: bColor } : { left: (50 - pct) + "%", width: pct + "%", backgroundColor: bColor };

  return (
    <div className="p-2.5 rounded-sm bg-zinc-800/20">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] tracking-widest uppercase text-zinc-600">{label}</span>
        <span className="text-sm font-mono" style={{ color: bColor }}>{pos ? "+" : ""}{fmtStat(value)}</span>
      </div>
      <div className="relative h-1.5 w-full bg-zinc-800/60 rounded-full overflow-hidden">
        <div className="absolute left-1/2 top-0 w-px h-full bg-zinc-600/40 z-10" />
        <div className="absolute top-0 h-full rounded-full transition-all duration-500" style={bStyle} />
      </div>
      <div className="flex justify-between mt-1 text-[9px] font-mono text-zinc-700">
        <span>{leftText}</span>
        <span>{rightText}</span>
      </div>
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="p-2 rounded-sm bg-zinc-800/20 text-center">
      <div className="text-[8px] tracking-widest uppercase text-zinc-700">{label}</div>
      <div className="text-[13px] font-mono mt-0.5" style={{ color }}>{value}</div>
    </div>
  );
}

function Chip({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded-sm border border-zinc-800/40 bg-zinc-900/30">
      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, opacity: 0.5 }} />
      <span className="text-[9px] text-zinc-600">{n}x {label}</span>
    </div>
  );
}

// Context bar helper (same as before but reads from store stats)
function getContextBar(cat: string, item: EquippedItem | null, stats: ReturnType<typeof useLoadoutStore.getState>["getStats"] extends () => infer R ? R : never): { pct: number; color: string; label: string } | null {
  if (!item?.componentStats) return null;
  const s = item.componentStats as Record<string, any>;
  if (cat === "POWER_PLANT" && (s.powerOutput ?? 0) > 0) {
    const v = Number(s.powerOutput);
    return { pct: stats.powerOutput > 0 ? (v / stats.powerOutput) * 100 : 0, color: "#22c55e", label: fmtStat(v) + " pwr" };
  }
  if (cat === "COOLER" && (s.coolingRate ?? 0) > 0) {
    const v = Number(s.coolingRate);
    return { pct: stats.coolingRate > 0 ? (v / stats.coolingRate) * 100 : 0, color: "#06b6d4", label: fmtStat(v) + " cool" };
  }
  if (cat === "SHIELD" && (s.maxHp ?? s.shieldHp ?? 0) > 0) {
    const v = Number(s.maxHp ?? s.shieldHp);
    return { pct: stats.shieldHp > 0 ? (v / stats.shieldHp) * 100 : 0, color: "#3b82f6", label: fmtStat(v) + " hp" };
  }
  return null;
}
