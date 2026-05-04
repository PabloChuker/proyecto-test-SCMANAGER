// =============================================================================
// AL FILO — LoadoutDetailWidget (unified)
// Merged with former CombatSummaryWidget: un solo bloque con DPS, alfa,
// misiles, escudos + resistencias, casco y deflexion de armadura +
// multiplicadores de daño. El toggle SCM/NAV vive en POWER GRID — acá solo
// se usa `flightMode` para dimmear secciones en NAV.
// =============================================================================
"use client";

import { memo } from "react";
import Image from "next/image";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { useShallow } from "zustand/react/shallow";
import { fmtStat, fmtDps } from "@/components/ships/loadout-utils";
// Loadout.3 (2026-05-04): ArmorCheckPanel se movió a su propio widget
// (ArmorCheckWidget.tsx) para que sea reordenable/redimensionable aparte.

// ── Pequeña píldora de resistencia (shield) ──────────────────────────────────
function ResistancePill({ label, pct, color }: { label: string; pct: number | null | undefined; color: string }) {
  if (pct == null) return null;
  // physicalResistanceMax viene en 0..1 (ej 0.35) → mostrar como %
  const v = Math.round(pct * 100);
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 border border-zinc-800/60 rounded-[2px] bg-zinc-950/40">
      <span className="text-[10px] font-mono text-zinc-500 tracking-wider uppercase">{label}</span>
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
    <div className="flex flex-col items-center gap-1 flex-1 min-w-0 px-1.5 py-2 bg-zinc-950/40 border border-zinc-800/60 rounded-[2px]">
      <span className="text-[11px] font-mono text-zinc-400 tracking-[0.08em] uppercase text-center leading-tight">{label}</span>
      {deflection != null && (
        <div className="flex items-baseline gap-1">
          <span className="text-base font-mono font-bold tabular-nums" style={{ color }}>{deflection}</span>
          <span className="text-[10px] font-mono text-zinc-600 uppercase">defl</span>
        </div>
      )}
      {dmgMult != null && (
        <div className="flex items-baseline gap-1">
          <span className="text-xs font-mono font-medium tabular-nums text-zinc-300">×{dmgMult.toFixed(2)}</span>
          <span className="text-[10px] font-mono text-zinc-600 uppercase">dmg</span>
        </div>
      )}
    </div>
  );
}

// ── Store-connected export ────────────────────────────────────────────────────
export const LoadoutDetailContent = memo(function LoadoutDetailContent() {
  // Loadout.4c (2026-05-04): incluir previewItem en el selector para que el
  // widget re-renderice cuando el user pasa el mouse por el ComponentPicker.
  // Sin esto, getStats() retorna el mismo cache + componente memoizado no
  // detecta cambios → stats no se actualizan en el hover preview.
  const { shipInfo, overrides, flightMode, previewItem } = useLoadoutStore(
    useShallow(s => ({ shipInfo: s.shipInfo, overrides: s.overrides, flightMode: s.flightMode, previewItem: s.previewItem }))
  );
  void previewItem; // suscribir solamente, no se usa directamente
  const getStats = useLoadoutStore(s => s.getStats);

  // Fase W.13 (2026-05-02): Radar Lock Range. Solo renderizamos cuando los
  // datos REALES están en BD. La fórmula §10 de VerseTools es trivial; el
  // dato faltante es range_min_m/max_m. Suscribir a PRIMITIVOS evita el
  // infinite re-render bug que rompió en W.9 (arreglado en W.11).
  //
  // NOTA: hoy la tabla `radars` tiene esos campos en NULL para todos los
  // radares (Garnok no los importó — el scunpacked tampoco los expone, hay
  // que recolectarlos in-game igual que las accelerations). Mientras la
  // tabla no se complete, esta sección queda oculta — preferimos no mostrar
  // nada antes que mostrar números inventados. Ver Fase X (backlog).
  const radarRangeMin = useLoadoutStore(s => {
    const hp = s.hardpoints.find(h => h.resolvedCategory === "RADAR");
    const cs: any = hp?.defaultItem?.componentStats;
    const v = cs?.rangeMinM;
    return typeof v === "number" && v > 0 ? v : null;
  });
  const radarRangeMax = useLoadoutStore(s => {
    const hp = s.hardpoints.find(h => h.resolvedCategory === "RADAR");
    const cs: any = hp?.defaultItem?.componentStats;
    const v = cs?.rangeMaxM;
    return typeof v === "number" && v > 0 ? v : null;
  });
  const radarPipFraction = useLoadoutStore(s => {
    const inst = s.getStats().powerNetwork.instances.find(i => i.category === "radar");
    if (!inst || inst.totalPips <= 0) return 1;
    return Math.min(1, Math.max(0, inst.allocatedPips / inst.totalPips));
  });

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
      {/* ── WEAPONS — sustained primary, burst+alpha secondary ────────────── */}
      <div className={navMode ? "opacity-30" : ""}>
        <div className="text-[10px] font-mono text-zinc-600 tracking-[0.15em] uppercase mb-0.5">Sustained DPS</div>
        <div className="flex items-baseline gap-3">
          <Image src="/icons/weapons.png" alt="" width={16} height={16} style={{ opacity: 0.5 }} />
          <span className="text-2xl font-mono font-bold tabular-nums text-orange-400">{fmtDps(stats.sustainedDps)}</span>
          <span className="text-[10px] font-mono text-zinc-500">dps</span>
        </div>
        <div className="flex items-baseline gap-2 mt-1 pl-6">
          <span className="text-[10px] font-mono text-zinc-600 tracking-wider uppercase">Burst</span>
          <span className="text-xs font-mono font-bold tabular-nums text-red-500">{fmtDps(stats.burstDps)}</span>
          <span className="text-[10px] font-mono text-zinc-600 tracking-wider uppercase ml-2">Alpha</span>
          <span className="text-xs font-mono font-bold tabular-nums text-red-400/80">{fmtStat(stats.weaponAlpha)}</span>
        </div>
      </div>

      {/* ── MISSILES ───────────────────────────────────────────────────────── */}
      {stats.summary.missiles > 0 && (
        <div className={navMode ? "opacity-30" : ""}>
          <div className="flex items-baseline gap-3">
            <Image src="/icons/missile.png" alt="" width={16} height={16} style={{ opacity: 0.5 }} />
            <span className="text-lg font-mono font-bold tabular-nums text-orange-500">{fmtStat(stats.missileAlpha)}</span>
            <span className="text-[10px] font-mono text-zinc-500">dmg</span>
            <span className="text-[11px] font-mono text-zinc-600 ml-2">×{stats.summary.missiles}</span>
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
            <ResistancePill label="Physical"   pct={si.physicalResistanceMax}   color="#fbbf24" />
            <ResistancePill label="Energy"     pct={si.energyResistanceMax}     color="#22d3ee" />
            <ResistancePill label="Distortion" pct={si.distortionResistanceMax} color="#a78bfa" />
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

      {/* ── COOLING BALANCE (Fase W.7/W.8) ────────────────────────────────────
          Demand viene de la fórmula 2-tier de VerseTools §7.2 (Life Support
          2.300/pip, QD 2.070, Radar 1.988, Shields 1.978, Thrusters 1.032,
          Tools 0.966, Coolers 0.939, Weapons 0.900 + PP_IDLE 0.04). Supply
          de coolers escala por pips × bandMod / maxPips. Si demand > supply
          la nave entra en overload térmico (color rojo). */}
      {(stats.coolingRate > 0 || stats.thermalOutput > 0) && (
        <div className="border-t border-zinc-800/40 pt-2">
          <div className="text-[11px] font-mono text-zinc-500 tracking-[0.15em] uppercase mb-1">
            Thermal balance
          </div>
          <div className="flex items-baseline gap-3">
            <Image src="/icons/coolers.png" alt="" width={16} height={16} style={{ opacity: 0.5 }} />
            <span
              className="text-lg font-mono font-bold tabular-nums"
              style={{
                color:
                  stats.thermalBalance >= 0 ? "#06b6d4" : "#ef4444",
              }}
            >
              {stats.thermalBalance >= 0 ? "+" : ""}{fmtStat(stats.thermalBalance)}
            </span>
            <span className="text-[10px] font-mono text-zinc-500">balance</span>
            <span className="text-[10px] font-mono text-zinc-600 ml-2">
              supply {fmtStat(stats.coolingRate)} · demand {fmtStat(stats.thermalOutput)}
            </span>
            {stats.thermalBalance < 0 && (
              <span className="text-[11px] font-mono text-red-500 ml-1">⚠ overload</span>
            )}
          </div>
        </div>
      )}

      {/* ── ARMOR DEFLECTION + DAMAGE MULTIPLIERS ──────────────────────────── */}
      {hasArmorBlock && (
        <div className="border-t border-zinc-800/40 pt-2">
          <div className="text-[11px] font-mono text-zinc-500 tracking-[0.15em] uppercase mb-2">Armor Deflection</div>
          <div className="flex gap-2">
            <DeflectionChip label="Physical"   deflection={si.deflectionPhysical}   dmgMult={res.dmgMultPhysical}   color="#fbbf24" />
            <DeflectionChip label="Energy"     deflection={si.deflectionEnergy}     dmgMult={res.dmgMultEnergy}     color="#22d3ee" />
            <DeflectionChip label="Distortion" deflection={si.deflectionDistortion} dmgMult={res.dmgMultDistortion} color="#a78bfa" />
          </div>
        </div>
      )}

      {/* ── ARMOR CHECK (Fase W.12, VerseTools §6.1) ─────────────────────────
          Loadout.3 (2026-05-04): movido a su propio widget ArmorCheckWidget
          para que se pueda reordenar/redimensionar independientemente. */}

      {/* ── RADAR LOCK RANGE (Fase W.13, VerseTools §10) ────────────────────
          Solo renderizamos cuando rangeMin y rangeMax tienen valores REALES
          en BD. Hoy todos los radares tienen NULL en esos campos (ver Fase X
          backlog). Cuando se importen los datos reales, esta sección
          empezará a mostrarse automáticamente sin más cambios. */}
      {radarRangeMin != null && radarRangeMax != null && radarRangeMax > 0 && (
        <div className="border-t border-zinc-800/40 pt-2">
          <div className="text-[11px] font-mono text-zinc-500 tracking-[0.15em] uppercase mb-1">
            Radar Lock Range
          </div>
          <div className="flex items-baseline gap-3">
            <Image src="/icons/interdict_pulse.png" alt="" width={16} height={16} style={{ opacity: 0.5 }} />
            <span className="text-xl font-mono font-bold tabular-nums text-cyan-400">
              {fmtStat(
                Math.round(
                  radarRangeMin + (radarRangeMax - radarRangeMin) * radarPipFraction,
                ) / 1000,
              )}
            </span>
            <span className="text-[10px] font-mono text-zinc-500">km</span>
            <span className="text-[10px] font-mono text-zinc-600 ml-2">
              ({fmtStat(radarRangeMin / 1000)}–{fmtStat(radarRangeMax / 1000)} km · {Math.round(radarPipFraction * 100)}% pips)
            </span>
          </div>
        </div>
      )}
    </div>
  );
});
