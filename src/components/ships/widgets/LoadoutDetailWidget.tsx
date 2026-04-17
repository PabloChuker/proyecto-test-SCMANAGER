// =============================================================================
// AL FILO — LoadoutDetailWidget (unified)
// Merged with former CombatSummaryWidget: un solo bloque con DPS, alfa,
// misiles, escudos + resistencias, casco y deflexion de armadura +
// multiplicadores de daño. Mantiene el toggle SCM/NAV.
// =============================================================================
"use client";

import { memo } from "react";
import Image from "next/image";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { useShallow } from "zustand/react/shallow";
import { fmtStat, fmtDps } from "@/components/ships/loadout-utils";

// ── Mode toggle button ────────────────────────────────────────────────────────
function ModeBtn({ label, active, c, onClick }: {
  label: string; active: boolean; c: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={active
        ? "px-3 py-1 text-[9px] font-mono font-bold tracking-[0.12em] uppercase text-center border"
        : "px-3 py-1 text-[9px] font-mono tracking-[0.12em] uppercase text-center text-zinc-600 border border-zinc-800/50 hover:text-zinc-400 transition-colors"}
      style={active ? { backgroundColor: c + "20", color: c, borderColor: c + "60" } : undefined}
    >
      {label}
    </button>
  );
}

// ── Pequeña píldora de resistencia (shield) ──────────────────────────────────
function ResistancePill({ label, pct, color }: { label: string; pct: number | null | undefined; color: string }) {
  if (pct == null) return null;
  // physicalResistanceMax viene en 0..1 (ej 0.35) → mostrar como %
  const v = Math.round(pct * 100);
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 border border-zinc-800/60 rounded-[2px] bg-zinc-950/40">
      <span className="text-[8px] font-mono text-zinc-500 tracking-wider uppercase">{label}</span>
      <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color }}>{v}%</span>
    </div>
  );
}

// ── Chip de deflexión (armor) + damage multiplier ────────────────────────────
function DeflectionChip({ label, deflection, dmgMult, color }: {
  label: string; deflection: number | null | undefined; dmgMult: number | null | undefined; color: string;
}) {
  if (deflection == null && dmgMult == null) return null;
  return (
    <div className="flex flex-col items-center gap-0.5 flex-1 min-w-0 px-1.5 py-1 bg-zinc-950/40 border border-zinc-800/60 rounded-[2px]">
      <span className="text-[7px] font-mono text-zinc-600 tracking-[0.15em] uppercase">{label}</span>
      {deflection != null && (
        <div className="flex items-baseline gap-0.5">
          <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color }}>{deflection}</span>
          <span className="text-[7px] font-mono text-zinc-600 uppercase">defl</span>
        </div>
      )}
      {dmgMult != null && (
        <div className="flex items-baseline gap-0.5">
          <span className="text-[10px] font-mono font-medium tabular-nums text-zinc-400">×{dmgMult.toFixed(2)}</span>
          <span className="text-[7px] font-mono text-zinc-600 uppercase">dmg</span>
        </div>
      )}
    </div>
  );
}

// ── Store-connected export ────────────────────────────────────────────────────
export const LoadoutDetailContent = memo(function LoadoutDetailContent() {
  const { shipInfo, overrides, flightMode } = useLoadoutStore(
    useShallow(s => ({ shipInfo: s.shipInfo, overrides: s.overrides, flightMode: s.flightMode }))
  );
  const getStats      = useLoadoutStore(s => s.getStats);
  const setFlightMode = useLoadoutStore(s => s.setFlightMode);

  if (!shipInfo) return null;

  const si    = shipInfo as any;
  const stats = getStats();
  // overrides subscribed so we re-render when items change
  void overrides;

  const navMode = flightMode === "NAV";
  const res = si.resistances ?? {};
  const hasDeflection = si.deflectionPhysical != null || si.deflectionEnergy != null || si.deflectionDistortion != null;
  const hasDmgMult    = res.dmgMultPhysical != null || res.dmgMultEnergy != null || res.dmgMultDistortion != null;
  const hasArmorBlock = hasDeflection || hasDmgMult;

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-2.5 space-y-2.5">
      {/* Mode toggle */}
      <div className="flex gap-1.5">
        <ModeBtn label="SCM" active={flightMode === "SCM"} c="#eab308" onClick={() => setFlightMode("SCM")} />
        <ModeBtn label="NAV" active={navMode}              c="#8b5cf6" onClick={() => setFlightMode("NAV")} />
      </div>

      {/* ── WEAPONS — sustained primary, burst+alpha secondary ────────────── */}
      <div className={navMode ? "opacity-30" : ""}>
        <div className="text-[7px] font-mono text-zinc-600 tracking-[0.15em] uppercase mb-0.5">Sustained DPS</div>
        <div className="flex items-baseline gap-3">
          <Image src="/icons/weapons.png" alt="" width={16} height={16} style={{ opacity: 0.5 }} />
          <span className="text-2xl font-mono font-bold tabular-nums text-orange-400">{fmtDps(stats.sustainedDps)}</span>
          <span className="text-[10px] font-mono text-zinc-500">dps</span>
        </div>
        <div className="flex items-baseline gap-2 mt-1 pl-6">
          <span className="text-[8px] font-mono text-zinc-600 tracking-wider uppercase">Burst</span>
          <span className="text-xs font-mono font-bold tabular-nums text-red-500">{fmtDps(stats.burstDps)}</span>
          <span className="text-[8px] font-mono text-zinc-600 tracking-wider uppercase ml-2">Alpha</span>
          <span className="text-xs font-mono font-bold tabular-nums text-red-400/80">{fmtStat(stats.totalAlpha)}</span>
        </div>
      </div>

      {/* ── MISSILES ───────────────────────────────────────────────────────── */}
      {stats.summary.missiles > 0 && (
        <div className={navMode ? "opacity-30" : ""}>
          <div className="flex items-baseline gap-3">
            <Image src="/icons/missile.png" alt="" width={16} height={16} style={{ opacity: 0.5 }} />
            <span className="text-lg font-mono font-bold tabular-nums text-orange-500">{fmtStat(stats.totalAlpha)}</span>
            <span className="text-[10px] font-mono text-zinc-500">dmg</span>
            <span className="text-[9px] font-mono text-zinc-600 ml-2">×{stats.summary.missiles}</span>
          </div>
        </div>
      )}

      {/* ── SHIELDS ────────────────────────────────────────────────────────── */}
      <div className="border-t border-zinc-800/40 pt-2 space-y-1.5">
        <div className="flex items-baseline gap-3">
          <span className="text-[11px]" style={{ color: "#eab308", opacity: 0.5 }}>⏱</span>
          <span className="text-lg font-mono font-bold tabular-nums text-amber-500">
            {stats.shieldRegen > 0 ? (stats.shieldHp / Math.max(stats.shieldRegen, 0.01)).toFixed(1) : "—"}
          </span>
          <span className="text-[10px] font-mono text-zinc-500">s full regen time</span>
        </div>
        <div className="flex items-baseline gap-3">
          <Image src="/icons/shilds.png" alt="" width={16} height={16} style={{ opacity: 0.5 }} />
          <span className="text-xl font-mono font-bold tabular-nums text-blue-500">
            {stats.shieldHp > 0 ? fmtStat(stats.shieldHp) : (si.shieldHpTotal ? fmtStat(si.shieldHpTotal) : "0")}
          </span>
          <span className="text-[10px] font-mono text-zinc-500">hp</span>
          {stats.shieldRegen > 0 && (
            <>
              <span className="text-sm font-mono tabular-nums text-blue-400/70">{fmtStat(stats.shieldRegen)}</span>
              <span className="text-[10px] font-mono text-zinc-500">hp/s</span>
            </>
          )}
        </div>
        {/* Shield resistance pills — usan *Max (el pico del rango ship-level) */}
        {(si.physicalResistanceMax != null || si.energyResistanceMax != null || si.distortionResistanceMax != null) && (
          <div className="flex flex-wrap gap-1 pl-6">
            <ResistancePill label="PHY" pct={si.physicalResistanceMax}   color="#fbbf24" />
            <ResistancePill label="ENG" pct={si.energyResistanceMax}     color="#22d3ee" />
            <ResistancePill label="DST" pct={si.distortionResistanceMax} color="#a78bfa" />
          </div>
        )}
      </div>

      {/* ── HULL HP ────────────────────────────────────────────────────────── */}
      {si.hullHp != null && si.hullHp > 0 && (
        <div className="border-t border-zinc-800/40 pt-2">
          <div className="flex items-baseline gap-3">
            <Image src="/icons/Ships.png" alt="" width={16} height={16} style={{ opacity: 0.5 }} />
            <span className="text-lg font-mono font-bold tabular-nums text-zinc-400">{fmtStat(si.hullHp)}</span>
            <span className="text-[10px] font-mono text-zinc-500">hull hp</span>
            {res.armorHp != null && res.armorHp > 0 && (
              <>
                <span className="text-sm font-mono tabular-nums text-zinc-500 ml-2">{fmtStat(res.armorHp)}</span>
                <span className="text-[10px] font-mono text-zinc-600">armor</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ARMOR DEFLECTION + DAMAGE MULTIPLIERS ──────────────────────────── */}
      {hasArmorBlock && (
        <div className="border-t border-zinc-800/40 pt-2">
          <div className="text-[8px] font-mono text-zinc-600 tracking-[0.15em] uppercase mb-1.5">Armor Deflection</div>
          <div className="flex gap-1.5">
            <DeflectionChip label="PHY" deflection={si.deflectionPhysical}   dmgMult={res.dmgMultPhysical}   color="#fbbf24" />
            <DeflectionChip label="ENG" deflection={si.deflectionEnergy}     dmgMult={res.dmgMultEnergy}     color="#22d3ee" />
            <DeflectionChip label="DST" deflection={si.deflectionDistortion} dmgMult={res.dmgMultDistortion} color="#a78bfa" />
          </div>
        </div>
      )}
    </div>
  );
});
