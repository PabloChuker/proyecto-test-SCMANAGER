// =============================================================================
// AL FILO — LoadoutBuilder v14 (ShipSelector + Recursive Children)
// =============================================================================

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import type { ResolvedHardpoint, EquippedItem, ResolvedChild } from "@/store/useLoadoutStore";
import { HardpointSlot, isUsefulSlot } from "./HardpointSlot";
import { ComponentPicker } from "./ComponentPicker";
import { PowerManagementPanel } from "./PowerManagementPanel";
import { ShipSelector } from "./ShipSelector";
import { fmtStat, fmtDps } from "./loadout-utils";

const WEAPON_GROUPS = new Set(["WEAPON", "TURRET"]);
const MISSILE_GROUPS = new Set(["MISSILE_RACK"]);
const SYSTEM_ORDER = ["SHIELD", "POWER_PLANT", "COOLER", "QUANTUM_DRIVE", "MINING", "UTILITY"] as const;
const CAT_LABELS: Record<string, string> = { SHIELD: "SHIELDS", POWER_PLANT: "POWER PLANTS", COOLER: "COOLERS", QUANTUM_DRIVE: "QUANTUM DRIVES", MINING: "MINING", UTILITY: "UTILITY" };
const CAT_ICONS: Record<string, string> = { SHIELD: "◇", POWER_PLANT: "⚡", COOLER: "❄", QUANTUM_DRIVE: "◈", MINING: "⛏", UTILITY: "◎" };
const CAT_ACCENT: Record<string, string> = { SHIELD: "#3b82f6", POWER_PLANT: "#22c55e", COOLER: "#06b6d4", QUANTUM_DRIVE: "#a855f7", MINING: "#f472b6", UTILITY: "#94a3b8" };

export function LoadoutBuilder({ shipId }: { shipId: string }) {
  const searchParams = useSearchParams();
  const store = useLoadoutStore();
  const { shipInfo, isLoading, error, loadShip, getStats, getEffectiveItem, hasChanges, hardpoints, equipItem, clearSlot, resetAll, overrides, encodeBuild, toggleComponent, isComponentOn, flightMode, setFlightMode } = store;

  const [pickerHp, setPickerHp] = useState<ResolvedHardpoint | null>(null);
  const [copied, setCopied] = useState(false);
  const mountedRef = useRef(false);
  const overrideCountRef = useRef(0);

  useEffect(() => { if (mountedRef.current) return; mountedRef.current = true; loadShip(shipId, searchParams.get("build") || null); }, [shipId]);
  useEffect(() => { const c = overrides.size; if (!mountedRef.current) return; if (c === overrideCountRef.current && c === 0) return; overrideCountRef.current = c; const encoded = encodeBuild(); const url = new URL(window.location.href); if (encoded) url.searchParams.set("build", encoded); else url.searchParams.delete("build"); window.history.replaceState({}, "", url.toString()); }, [overrides, encodeBuild]);

  const stats = getStats();
  const useful = hardpoints.filter(hp => isUsefulSlot(hp, getEffectiveItem(hp.id)));
  const weaponHps = useful.filter(hp => WEAPON_GROUPS.has(hp.resolvedCategory));
  const missileHps = useful.filter(hp => MISSILE_GROUPS.has(hp.resolvedCategory));
  const systemGroups = SYSTEM_ORDER.map(cat => ({ cat, hps: useful.filter(hp => hp.resolvedCategory === cat) })).filter(g => g.hps.length > 0);

  const handleSelect = useCallback((item: EquippedItem) => { if (!pickerHp) return; equipItem(pickerHp.id, item); setPickerHp(null); }, [pickerHp, equipItem]);
  const handleClear = useCallback(() => { if (!pickerHp) return; clearSlot(pickerHp.id); setPickerHp(null); }, [pickerHp, clearSlot]);
  const handleCopyLink = useCallback(() => { navigator.clipboard.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }, []);

  if (isLoading) return (<div className="flex items-center justify-center py-20"><div className="w-4 h-4 border-2 border-zinc-800 border-t-yellow-500 rounded-full animate-spin mr-3" /><span className="text-xs text-zinc-600 font-mono uppercase tracking-widest">Loading...</span></div>);
  if (error) return <div className="border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-400 font-mono">{error}</div>;
  if (!shipInfo) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-2 py-1.5 bg-zinc-900/80 border border-zinc-800/60">
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-mono text-zinc-600 tracking-wider">{stats.summary.activeComponents}/{stats.summary.totalComponents} ACTIVE</span>
          {hasChanges() && <span className="text-[9px] font-mono text-yellow-500/80 tracking-wider">{overrides.size} MOD</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleCopyLink} className={copied ? "text-[9px] font-mono uppercase tracking-wider px-2 py-1 border bg-green-950/30 text-green-500 border-green-800/50" : "text-[9px] font-mono uppercase tracking-wider px-2 py-1 border text-zinc-500 border-zinc-800 hover:text-yellow-500 hover:border-yellow-800/50 transition-colors"}>{copied ? "COPIED" : "SHARE"}</button>
          {hasChanges() && <button onClick={resetAll} className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 border text-orange-500/80 border-zinc-800 hover:border-orange-800/50 transition-colors">RESET</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_320px] gap-2">
        <div className="space-y-2">
          <HpGroup title="WEAPONS" icon="▪" hps={weaponHps} store={store} onClickHp={setPickerHp} accent="#eab308" />
          <HpGroup title="MISSILES & BOMBS" icon="◆" hps={missileHps} store={store} onClickHp={setPickerHp} accent="#f97316" />
        </div>
        <div className="space-y-2">
          {systemGroups.map(({ cat, hps }) => (
            <HpGroup key={cat} title={CAT_LABELS[cat] || cat} icon={CAT_ICONS[cat] || "▫"} hps={hps} store={store} onClickHp={setPickerHp} accent={CAT_ACCENT[cat] || "#71717a"} />
          ))}
        </div>
        <div className="space-y-2">
          {/* Ship Selector */}
          <ShipSelector currentRef={shipInfo.reference} />

          {/* Ship Card */}
          <div className="bg-zinc-900/80 border border-zinc-800/60">
            <div className="h-24 bg-zinc-800/30 border-b border-zinc-800/50 flex items-center justify-center"><span className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">Ship Preview</span></div>
            <div className="p-2.5 space-y-2">
              <div>
                <div className="text-[9px] font-mono text-zinc-600 tracking-[0.15em] uppercase">{shipInfo.manufacturer || "Unknown"}</div>
                <div className="text-sm font-medium text-zinc-200 tracking-wide">{shipInfo.localizedName || shipInfo.name}</div>
                {shipInfo.role && <div className="text-[10px] text-yellow-500/70 font-mono uppercase tracking-wider">{shipInfo.role}</div>}
              </div>
              <div className="grid grid-cols-3 gap-px bg-zinc-800/40">
                <SS l="CREW" v={shipInfo.crew != null ? String(shipInfo.crew) : "—"} />
                <SS l="SCU" v={shipInfo.cargo != null && shipInfo.cargo > 0 ? String(Math.round(shipInfo.cargo)) : "—"} />
                <SS l={stats.effectiveSpeedLabel} v={stats.effectiveSpeed ? Math.round(stats.effectiveSpeed) + "" : "—"} u="m/s" />
                <SS l="SCM" v={shipInfo.scmSpeed ? Math.round(shipInfo.scmSpeed) + "" : "—"} u="m/s" />
                <SS l="NAV" v={shipInfo.afterburnerSpeed ? Math.round(shipInfo.afterburnerSpeed) + "" : "—"} u="m/s" />
                <SS l="PITCH" v={shipInfo.pitchRate ? Math.round(shipInfo.pitchRate) + "" : "—"} u="°/s" />
              </div>
            </div>
          </div>
          <PowerManagementPanel stats={stats} flightMode={flightMode} onModeChange={setFlightMode} />
          <div className="bg-zinc-900/80 border border-zinc-800/60 p-2.5 space-y-1.5">
            <div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase border-b border-zinc-800/40 pb-1">Combat</div>
            <SR l="DPS" v={fmtDps(stats.totalDps)} s={flightMode === "NAV" ? "LOCKED" : "α " + fmtStat(stats.totalAlpha)} c={flightMode === "NAV" ? "#52525b" : "#ef4444"} />
            <SR l="SHIELD" v={fmtStat(stats.shieldHp)} s={flightMode === "NAV" ? "NO REGEN" : "↑ " + fmtStat(stats.shieldRegen) + "/s"} c="#3b82f6" />
            <BR l="POWER" v={stats.powerBalance} a={stats.powerOutput} b={stats.powerDraw} pc="#22c55e" nc="#ef4444" />
            <BR l="THERMAL" v={stats.thermalBalance} a={stats.coolingRate} b={stats.thermalOutput} pc="#06b6d4" nc="#ef4444" />
          </div>
          <div className="bg-zinc-900/80 border border-zinc-800/60 p-2.5">
            <div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase border-b border-zinc-800/40 pb-1 mb-2">Blades</div>
            <div className="py-3 text-center text-[10px] text-zinc-700 font-mono italic">Coming in Phase 3</div>
          </div>
        </div>
      </div>
      {pickerHp && <ComponentPicker hardpoint={pickerHp} currentItemId={getEffectiveItem(pickerHp.id)?.id ?? null} onSelect={handleSelect} onClear={handleClear} onClose={() => setPickerHp(null)} />}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function HpGroup({ title, icon, hps, store, onClickHp, accent }: { title: string; icon: string; hps: ResolvedHardpoint[]; store: ReturnType<typeof useLoadoutStore>; onClickHp: (hp: ResolvedHardpoint) => void; accent: string }) {
  if (hps.length === 0) return null;
  const { getEffectiveItem, overrides, isComponentOn, toggleComponent } = store;
  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-zinc-800/50 bg-zinc-900/50">
        <span className="text-[10px]" style={{ color: accent, opacity: 0.6 }}>{icon}</span>
        <span className="text-[9px] font-mono font-medium tracking-[0.15em] uppercase text-zinc-400">{title}</span>
        <span className="text-[9px] font-mono text-zinc-700 ml-auto">{hps.length}</span>
      </div>
      <div>
        {hps.map(hp => (
          <HardpointSlot key={hp.id} hp={hp} item={getEffectiveItem(hp.id)} isOverridden={overrides.has(hp.id)} isOn={isComponentOn(hp.hardpointName)} onClick={() => onClickHp(hp)} onTogglePower={() => toggleComponent(hp.hardpointName)} childSlots={hp.children} isComponentOn={isComponentOn} toggleComponent={toggleComponent} />
        ))}
      </div>
    </div>
  );
}

function SS({ l, v, u }: { l: string; v: string; u?: string }) {
  return <div className="px-1.5 py-1 bg-zinc-900/60 text-center"><div className="text-[7px] font-mono text-zinc-600 tracking-wider">{l}</div><div className="text-[11px] font-mono text-zinc-300">{v}{u && <span className="text-[8px] text-zinc-600"> {u}</span>}</div></div>;
}
function SR({ l, v, s, c }: { l: string; v: string; s: string; c: string }) {
  return <div className="flex items-baseline justify-between py-0.5"><span className="text-[8px] font-mono text-zinc-600 tracking-wider uppercase">{l}</span><div className="flex items-baseline gap-1.5"><span className="text-[10px] font-mono text-zinc-500">{s}</span><span className="text-sm font-mono font-medium tabular-nums" style={{ color: c }}>{v}</span></div></div>;
}
function BR({ l, v, a, b, pc, nc }: { l: string; v: number; a: number; b: number; pc: string; nc: string }) {
  const pos = v >= 0; const mx = Math.max(a, b, 1); const pct = Math.min(50, (Math.abs(v) / mx) * 50); const color = pos ? pc : nc;
  const bs = pos ? { left: "50%", width: pct + "%", backgroundColor: color } : { left: (50 - pct) + "%", width: pct + "%", backgroundColor: color };
  return <div className="space-y-0.5"><div className="flex items-baseline justify-between"><span className="text-[8px] font-mono text-zinc-600 tracking-wider uppercase">{l}</span><span className="text-[10px] font-mono" style={{ color }}>{pos ? "+" : ""}{fmtStat(v)}</span></div><div className="relative h-1 w-full bg-zinc-800/60 rounded-full overflow-hidden"><div className="absolute left-1/2 top-0 w-px h-full bg-zinc-600/30 z-10" /><div className="absolute top-0 h-full rounded-full transition-all duration-500" style={bs} /></div><div className="flex justify-between text-[7px] font-mono text-zinc-700"><span>{fmtStat(a)} out</span><span>{fmtStat(b)} draw</span></div></div>;
}
