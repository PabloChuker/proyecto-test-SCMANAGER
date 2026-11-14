"use client";
// =============================================================================
// SC LABS — StatCards (Loadout.20, 2026-11-14)
//
// Contenido de las tarjetas de resumen del loadout en formato denso:
//   · DamageContent  — alpha / sostenido / ráfaga, desglose por montaje,
//                      tipo de daño y misiles.
//   · DefenseContent — escudo, resistencias, armadura, firmas, contramedidas.
//   · HullContent    — casco, masa, carga, tripulación, combustibles.
//   · FlightContent  — pitch/yaw/roll y velocidades (base → con boost).
//   · ThermalStrip   — balance térmico (oferta vs demanda de refrigeración).
//
// Todas leen del store directamente y recalculan con getStats(), igual que
// los widgets anteriores. Las cifras son las mismas que ya calculaba el
// loadout: acá solo se presentan todas juntas y a la vista.
//
// OJO (lección de W.11 / W.16b): los selectores de zustand devuelven
// referencias estables o primitivos — nunca objetos/arrays nuevos, que
// disparan un re-render infinito y tumban /loadout.
// =============================================================================

import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import type { EquippedItem } from "@/store/useLoadoutStore";
import { STAT_COLOR } from "@/lib/loadout/stat-tokens";
import { isGhostItem, isTurretOrRack } from "../HardpointSlot";
import { Chip, StatRow, StatTile, fmtInt, fmtSmall } from "./DeckCard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = Record<string, any>;

function n(v: unknown): number {
  const x = Number(v);
  return isFinite(x) ? x : 0;
}

/** Suscripción común: re-renderiza cuando cambia cualquier cosa que mueva stats. */
function useLoadoutSnapshot() {
  return useLoadoutStore(
    useShallow((s) => ({
      shipInfo: s.shipInfo,
      hardpoints: s.hardpoints,
      overrides: s.overrides,
      componentStates: s.componentStates,
      instancePower: s.instancePower,
      flightMode: s.flightMode,
      previewItem: s.previewItem,
    }))
  );
}

function pct(v: number | null | undefined): string {
  if (v == null) return "0%";
  return Math.round(v * 100) + "%";
}

// =============================================================================
// DAMAGE
// =============================================================================

interface SourceRow { label: string; count: number; alpha: number; burst: number; sust: number }

export const DamageContent = memo(function DamageContent() {
  const snap = useLoadoutSnapshot();
  const getStats = useLoadoutStore((s) => s.getStats);
  const getEffectiveItem = useLoadoutStore((s) => s.getEffectiveItem);
  const isComponentOn = useLoadoutStore((s) => s.isComponentOn);
  if (!snap.shipInfo) return null;

  const stats = getStats();
  const navMode = snap.flightMode === "NAV";

  // ── Desglose por montaje ──
  // Se suma el aporte crudo de cada arma y después se escala al total del
  // store (que ya aplica el reparto de energía a armas). Así las filas
  // siempre suman exactamente lo que dicen los mosaicos de arriba.
  const rows = new Map<string, SourceRow>();
  let rawAlpha = 0, rawBurst = 0, rawSust = 0;
  let typePhys = 0, typeEnergy = 0, typeDist = 0;

  const add = (label: string, item: EquippedItem | null) => {
    const cs = item?.componentStats as AnyRec | null | undefined;
    if (!cs) return;
    const alpha = n(cs.alphaDamage) || n(cs.damage);
    let burst = n(cs.dps);
    if (!burst && alpha > 0 && n(cs.fireRate) > 0) burst = alpha * (n(cs.fireRate) / 60);
    if (alpha <= 0 && burst <= 0) return;
    const sust = n(cs.sustainedDps) > 0 ? n(cs.sustainedDps) : burst;
    const row = rows.get(label) ?? { label, count: 0, alpha: 0, burst: 0, sust: 0 };
    row.count += 1; row.alpha += alpha; row.burst += burst; row.sust += sust;
    rows.set(label, row);
    rawAlpha += alpha; rawBurst += burst; rawSust += sust;
    const aP = n(cs.alphaPhysical), aE = n(cs.alphaEnergy), aD = n(cs.alphaDistortion);
    const aT = aP + aE + aD;
    if (aT > 0) {
      typePhys += burst * (aP / aT); typeEnergy += burst * (aE / aT); typeDist += burst * (aD / aT);
    }
  };

  for (const hp of snap.hardpoints) {
    const cat = hp.resolvedCategory;
    if (cat !== "WEAPON" && cat !== "TURRET") continue;
    if (!isComponentOn(hp.hardpointName)) continue;
    const raw = getEffectiveItem(hp.id);
    const item = isGhostItem(raw) ? null : raw;
    if (!item) continue;
    const isMount = cat === "TURRET" && (!snap.overrides.has(hp.id) || isTurretOrRack(item));
    if (isMount && hp.children.length > 0) {
      const label = item.localizedName || item.name || "Mount";
      for (const ch of hp.children) {
        if (!isComponentOn(ch.hardpointName)) continue;
        const chItem = snap.overrides.has(ch.id) ? (snap.overrides.get(ch.id) ?? null) : ch.equippedItem;
        add(label, chItem);
      }
    } else {
      add("Direct mount", item);
    }
  }

  const kA = rawAlpha > 0 ? stats.weaponAlpha / rawAlpha : 0;
  const kB = rawBurst > 0 ? stats.burstDps / rawBurst : 0;
  const kS = rawSust > 0 ? stats.sustainedDps / rawSust : 0;
  const sourceRows = [...rows.values()].sort((a, b) => b.burst - a.burst);

  const typeTotal = typePhys + typeEnergy + typeDist;
  const types = [
    { label: "Ballistic", v: typePhys, color: STAT_COLOR.physical },
    { label: "Energy", v: typeEnergy, color: STAT_COLOR.energy },
    { label: "Distortion", v: typeDist, color: STAT_COLOR.distortion },
  ].filter((t) => t.v > 0);

  return (
    <div className={"flex flex-col gap-2.5 " + (navMode ? "opacity-40" : "")}>
      <div className="grid grid-cols-3 gap-2">
        <StatTile value={fmtInt(stats.weaponAlpha)} label="Σ alpha" color={STAT_COLOR.alpha} />
        <StatTile value={fmtInt(stats.sustainedDps)} label="Sust. dps" color={STAT_COLOR.dpsSustained} accent />
        <StatTile value={fmtInt(stats.burstDps)} label="Burst dps" color={STAT_COLOR.dpsBurst} />
      </div>

      {sourceRows.length > 0 && (
        <table className="w-full table-fixed text-[11px] font-mono tabular-nums">
          <thead>
            <tr className="text-[9px] uppercase tracking-[0.12em] text-zinc-600">
              <th className="text-left font-normal py-1">Source</th>
              <th className="text-right font-normal py-1 w-[62px]">Alpha</th>
              <th className="text-right font-normal py-1 w-[62px]">Sust.</th>
              <th className="text-right font-normal py-1 w-[62px]">Burst</th>
            </tr>
          </thead>
          <tbody>
            {sourceRows.map((r) => (
              <tr key={r.label} className="border-t border-zinc-800/40">
                <td className="py-[5px] pr-2 text-zinc-300 font-sans truncate">
                  {r.label}
                  <span className="ml-1.5 text-zinc-600 font-mono">×{r.count}</span>
                </td>
                <td className="py-[5px] text-right text-zinc-200">{fmtInt(r.alpha * kA)}</td>
                <td className="py-[5px] text-right text-zinc-200">{fmtInt(r.sust * kS)}</td>
                <td className="py-[5px] text-right text-zinc-200">{fmtInt(r.burst * kB)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {types.length > 0 && typeTotal > 0 && (
        <div>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-zinc-800/70">
            {types.map((t) => (
              <span key={t.label} style={{ width: `${(t.v / typeTotal) * 100}%`, backgroundColor: t.color }} />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {types.map((t) => (
              <Chip key={t.label} label={t.label} value={Math.round((t.v / typeTotal) * 100) + "%"} color={t.color} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <StatTile
          value={stats.summary.missiles > 0 ? fmtInt(stats.missileAlpha) : "—"}
          label="Missile dmg"
          color={STAT_COLOR.missile}
          sub={
            stats.summary.missiles > 0
              ? `${stats.summary.missiles} rack${stats.summary.missiles === 1 ? "" : "s"} · full salvo`
              : "no ordnance"
          }
        />
        <StatTile
          value={String(stats.summary.weapons)}
          label="Guns online"
          sub={navMode ? "NAV mode — weapons offline" : `${sourceRows.length} mount${sourceRows.length === 1 ? "" : "s"}`}
        />
      </div>
    </div>
  );
});

// =============================================================================
// DEFENSE
// =============================================================================

export const DefenseContent = memo(function DefenseContent() {
  const snap = useLoadoutSnapshot();
  const getStats = useLoadoutStore((s) => s.getStats);
  const getEffectiveItem = useLoadoutStore((s) => s.getEffectiveItem);
  const isComponentOn = useLoadoutStore((s) => s.isComponentOn);
  if (!snap.shipInfo) return null;

  const si = snap.shipInfo;
  const stats = getStats();
  const res = si.resistances;

  // Resistencias / absorción: del primer generador de escudo encendido.
  let shieldCs: AnyRec | null = null;
  for (const hp of snap.hardpoints) {
    if (hp.resolvedCategory !== "SHIELD" || !isComponentOn(hp.hardpointName)) continue;
    const cs = getEffectiveItem(hp.id)?.componentStats as AnyRec | null | undefined;
    if (cs) { shieldCs = cs; break; }
  }
  const hasResist = shieldCs != null && (
    shieldCs.physicalResistanceMax != null || shieldCs.energyResistanceMax != null || shieldCs.distortionResistanceMax != null
  );
  const hasAbsorb = shieldCs != null && (
    shieldCs.physicalAbsorptionMax != null || shieldCs.energyAbsorptionMax != null || shieldCs.distortionAbsorptionMax != null
  );

  const shieldHp = stats.shieldHp > 0 ? stats.shieldHp : (si.shieldHpTotal ?? 0);
  const regenTime = stats.shieldRegen > 0 ? shieldHp / stats.shieldRegen : null;

  const cmHps = snap.hardpoints.filter((hp) => hp.resolvedCategory === "COUNTERMEASURE");
  const decoy = cmHps.filter((hp) => hp.hardpointName.toLowerCase().includes("decoy")).length;
  const noise = cmHps.filter((hp) => hp.hardpointName.toLowerCase().includes("noise")).length;

  const hasDeflection = (si.deflectionPhysical ?? 0) > 0 || (si.deflectionEnergy ?? 0) > 0;
  const hasHullRes = res != null && (res.dmgMultPhysical != null || res.dmgMultEnergy != null);
  const reduction = (mult: number | null | undefined) =>
    mult == null ? "—" : Math.round((1 - mult) * 100) + "%";

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2">
        <StatTile value={fmtInt(shieldHp)} label="Shield hp" color={STAT_COLOR.shield} />
        <StatTile
          value={stats.shieldRegen > 0 ? fmtInt(stats.shieldRegen) : "—"}
          label="Regen hp/s"
          color={STAT_COLOR.shieldRegen}
          accent
          sub={regenTime != null ? `${fmtSmall(regenTime)} s to full` : undefined}
        />
      </div>

      <div>
        {hasResist && shieldCs && (
          <StatRow label="Shield resistance">
            <Chip label="Phys" value={pct(shieldCs.physicalResistanceMax)} color={STAT_COLOR.physical} />
            <Chip label="Energy" value={pct(shieldCs.energyResistanceMax)} color={STAT_COLOR.energy} />
            <Chip label="Distort" value={pct(shieldCs.distortionResistanceMax)} color={STAT_COLOR.distortion} />
          </StatRow>
        )}
        {hasAbsorb && shieldCs && (
          <StatRow label="Absorption">
            <Chip label="Phys" value={pct(shieldCs.physicalAbsorptionMax)} color={STAT_COLOR.physical} />
            <Chip label="Energy" value={pct(shieldCs.energyAbsorptionMax)} color={STAT_COLOR.energy} />
            <Chip label="Distort" value={pct(shieldCs.distortionAbsorptionMax)} color={STAT_COLOR.distortion} />
          </StatRow>
        )}
        {res?.armorHp != null && res.armorHp > 0 && (
          <StatRow label="Armor HP">
            <span className="text-[15px] font-mono font-bold tabular-nums" style={{ color: STAT_COLOR.armor }}>
              {fmtInt(res.armorHp)}
            </span>
          </StatRow>
        )}
        {hasDeflection && (
          <StatRow label="Deflection">
            <Chip label="Phys" value={fmtInt(si.deflectionPhysical ?? 0)} color={STAT_COLOR.physical} />
            <Chip label="Energy" value={fmtInt(si.deflectionEnergy ?? 0)} color={STAT_COLOR.energy} />
          </StatRow>
        )}
        {hasHullRes && res && (
          <StatRow label="Hull resistance">
            <Chip label="Phys" value={reduction(res.dmgMultPhysical)} color={STAT_COLOR.physical} />
            <Chip label="Energy" value={reduction(res.dmgMultEnergy)} color={STAT_COLOR.energy} />
            {res.dmgMultDistortion != null && res.dmgMultDistortion !== 1 && (
              <Chip label="Distort" value={reduction(res.dmgMultDistortion)} color={STAT_COLOR.distortion} />
            )}
          </StatRow>
        )}
        <StatRow label="Signature">
          <Chip label="EM" value={fmtInt(stats.emSignature)} color={STAT_COLOR.em} />
          <Chip label="IR" value={fmtInt(stats.irSignature)} color={STAT_COLOR.ir} />
          {stats.csSignature > 0 && (
            <Chip
              label="CS"
              value={(stats.csIsEstimate ? "~" : "") + fmtInt(stats.csSignature)}
              color={STAT_COLOR.crossSection}
            />
          )}
        </StatRow>
        {(decoy > 0 || noise > 0) && (
          <StatRow label="Countermeasures">
            <Chip label="Decoy" value={String(decoy)} />
            <Chip label="Noise" value={String(noise)} />
          </StatRow>
        )}
      </div>
    </div>
  );
});

// =============================================================================
// HULL
// =============================================================================

export const HullContent = memo(function HullContent() {
  const shipInfo = useLoadoutStore((s) => s.shipInfo);
  if (!shipInfo) return null;
  const si = shipInfo;
  const cell = (label: string, value: string, unit?: string) => (
    <div className="min-w-0 rounded-md border border-zinc-800/70 bg-zinc-900/60 px-2 py-1.5">
      <div className="text-[9px] font-mono uppercase tracking-[0.12em] text-zinc-500 truncate">{label}</div>
      <div className="mt-0.5 text-[14px] font-mono font-bold tabular-nums text-zinc-100 truncate">
        {value}
        {unit && <span className="ml-1 text-[9px] font-normal text-zinc-500">{unit}</span>}
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="text-[26px] leading-none font-mono font-bold tabular-nums" style={{ color: STAT_COLOR.hull }}>
            {si.hullHp && si.hullHp > 0 ? fmtInt(si.hullHp) : "—"}
          </span>
          <span className="ml-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">hull hp</span>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-mono uppercase tracking-[0.12em] text-zinc-500">Mass</div>
          <div className="text-[13px] font-mono font-semibold tabular-nums text-zinc-200">
            {si.mass && si.mass > 0 ? fmtInt(si.mass) + " kg" : "—"}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {cell("Crew", si.crew != null && si.crew > 0 ? String(si.crew) : "—")}
        {cell("Cargo", si.cargo != null && si.cargo > 0 ? fmtInt(si.cargo) : "—", "SCU")}
        {cell("H₂ fuel", si.hydrogenCapacity ? fmtSmall(si.hydrogenCapacity) : "—", "SCU")}
        {cell("QT fuel", si.quantumFuelCapacity ? fmtSmall(si.quantumFuelCapacity) : "—", "SCU")}
      </div>
    </div>
  );
});

// =============================================================================
// FLIGHT
// =============================================================================

function AxisTile({ label, base, boosted, color }: {
  label: string; base: number | null; boosted: number | null; color: string;
}) {
  const hasBoost = boosted != null && boosted > 0 && base != null && Math.abs(boosted - base) > 0.05;
  return (
    <div className="min-w-0 rounded-md border border-zinc-800/70 bg-zinc-900/60 px-1.5 py-2 text-center">
      <div className="text-[19px] leading-none font-mono font-bold tabular-nums text-zinc-100 whitespace-nowrap">
        {base != null && base > 0 ? fmtSmall(base) : "—"}
        <span className="ml-0.5 text-[9px] font-normal text-zinc-500">°/s</span>
      </div>
      {/* El valor con boost va en su propia línea: al lado no entra en columnas angostas. */}
      <div className="mt-1 h-[13px] text-[11px] leading-none font-mono font-semibold tabular-nums text-amber-400 whitespace-nowrap">
        {hasBoost ? <>› {fmtSmall(boosted)} <span className="text-[8px] font-normal text-amber-400/60">boost</span></> : null}
      </div>
      <div className="mt-1.5 text-[9px] font-mono font-semibold uppercase tracking-[0.16em]" style={{ color }}>
        {label}
      </div>
    </div>
  );
}

export const FlightContent = memo(function FlightContent() {
  const shipInfo = useLoadoutStore((s) => s.shipInfo);
  if (!shipInfo) return null;
  const si = shipInfo;
  const speed = (v: number | null) => (v != null && v > 0 ? fmtInt(v) : "—");
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-3 gap-1.5">
        <AxisTile label="Pitch" base={si.pitchRate} boosted={si.boostedPitch} color="#22c55e" />
        <AxisTile label="Yaw" base={si.yawRate} boosted={si.boostedYaw} color="#3b82f6" />
        <AxisTile label="Roll" base={si.rollRate} boosted={si.boostedRoll} color="#ef4444" />
      </div>
      <div>
        <StatRow label="SCM speed">
          <span className="text-[12px] font-mono tabular-nums text-zinc-100">
            <b>{speed(si.scmSpeed)}</b>
            {si.boostSpeedForward != null && si.boostSpeedForward > 0 && (
              <>
                <span className="mx-1 text-zinc-600">›</span>
                <b className="text-amber-400">{speed(si.boostSpeedForward)}</b>
              </>
            )}
            <span className="ml-1 text-[10px] text-zinc-500">m/s boosted</span>
          </span>
        </StatRow>
        {si.boostSpeedBackward != null && si.boostSpeedBackward > 0 && (
          <StatRow label="Boost backward">
            <span className="text-[12px] font-mono tabular-nums text-zinc-100">
              <b>{speed(si.boostSpeedBackward)}</b>
              <span className="ml-1 text-[10px] text-zinc-500">m/s</span>
            </span>
          </StatRow>
        )}
        <StatRow label="NAV max">
          <span className="text-[12px] font-mono tabular-nums" style={{ color: STAT_COLOR.speed }}>
            <b>{speed(si.afterburnerSpeed)}</b>
            <span className="ml-1 text-[10px] text-zinc-500">m/s</span>
          </span>
        </StatRow>
      </div>
    </div>
  );
});

// =============================================================================
// THERMAL
// =============================================================================

export const ThermalStrip = memo(function ThermalStrip() {
  const snap = useLoadoutSnapshot();
  const getStats = useLoadoutStore((s) => s.getStats);
  if (!snap.shipInfo) return null;
  const stats = getStats();
  if (!(stats.coolingRate > 0 || stats.thermalOutput > 0)) return null;
  const ok = stats.thermalBalance >= 0;
  const load = stats.coolingRate > 0 ? Math.min(1, stats.thermalOutput / stats.coolingRate) : 1;
  return (
    <div className="mt-2.5 pt-2.5 border-t border-zinc-800/60">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-zinc-500">Cooling load</span>
        <span className="text-[11px] font-mono tabular-nums text-zinc-400">
          <b style={{ color: ok ? STAT_COLOR.thermal : STAT_COLOR.thermalBad }}>
            {fmtSmall(stats.thermalOutput)}
          </b>
          <span className="text-zinc-600"> / {fmtSmall(stats.coolingRate)}</span>
          {!ok && <span className="ml-1.5 text-red-400">⚠ overload</span>}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-zinc-800/70 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${load * 100}%`, backgroundColor: ok ? STAT_COLOR.thermal : STAT_COLOR.thermalBad }}
        />
      </div>
    </div>
  );
});
