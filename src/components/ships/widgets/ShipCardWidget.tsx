// =============================================================================
// AL FILO — ShipCardWidget
// Self-contained: reads shipInfo, getStats, overrides, hardpoints from store.
// Re-renders when ship changes or items are equipped (stats / CM counts update).
// Does NOT re-render when flightMode changes.
// =============================================================================
"use client";

import { memo, useState } from "react";
import Image from "next/image";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { useShallow } from "zustand/react/shallow";
import { fmtStat, fmtNum, fmtDec, fmtMass } from "@/components/ships/loadout-utils";

// ── Ship thumbnail URL helper ─────────────────────────────────────────────────
const MANUFACTURERS = [
  "Aegis", "RSI", "Drake", "MISC", "Anvil", "Origin", "Crusader", "Argo",
  "Aopoa", "Consolidated Outland", "Esperia", "Gatac", "Greycat", "Kruger",
  "Musashi Industrial", "Tumbril", "Banu", "Vanduul", "Roberts Space Industries",
  "Crusader Industries", "Musashi", "CO",
];
export function getShipImageUrl(name: string, manufacturer?: string | null): string {
  let shipName = name || "";
  if (manufacturer) {
    const mfr = manufacturer.trim();
    if (shipName.startsWith(mfr + " ")) shipName = shipName.slice(mfr.length + 1);
  }
  for (const mfr of MANUFACTURERS) {
    if (shipName.startsWith(mfr + " ")) { shipName = shipName.slice(mfr.length + 1); break; }
  }
  const slug = shipName
    .toLowerCase()
    .replace(/[''()]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/-$/, "");
  return `/ships/${slug}.webp`;
}

// ── Ship image with fallback ──────────────────────────────────────────────────
// Split layout: fill the full height of the card side-by-side with the stats.
function ShipCardImage({ name, manufacturer }: { name: string; manufacturer: string | null }) {
  const [imgError, setImgError] = useState(false);
  const src = getShipImageUrl(name, manufacturer);
  return (
    <div className="relative bg-zinc-800/20 border-r border-zinc-800/50 overflow-hidden w-[60%] min-h-full">
      {!imgError ? (
        <Image src={src} alt={name} fill className="object-cover" draggable={false} onError={() => setImgError(true)} sizes="(max-width: 1024px) 60vw, 480px" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">Ship Preview</span>
        </div>
      )}
    </div>
  );
}

// ── Stat row (compact — fits 10+ rows in the side panel) ─────────────────────
function StatRow({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1 py-[1px] border-b border-zinc-800/20 last:border-b-0">
      <span className="text-[10px] font-mono text-amber-600/80 tracking-wider uppercase whitespace-nowrap shrink-0">{label}</span>
      <span className="text-[11px] font-mono text-zinc-300 tabular-nums truncate text-right">
        {value}{unit && <span className="text-[10px] text-zinc-600 ml-0.5">{unit}</span>}
      </span>
    </div>
  );
}

// ── Store-connected export ────────────────────────────────────────────────────
// Re-renders when shipInfo, hardpoints, or overrides change — NOT on flightMode.
export const ShipCardContent = memo(function ShipCardContent() {
  // Loadout.4c: previewItem incluido para forzar re-render durante hover del picker.
  const { shipInfo, hardpoints, overrides, previewItem } = useLoadoutStore(
    useShallow(s => ({ shipInfo: s.shipInfo, hardpoints: s.hardpoints, overrides: s.overrides, previewItem: s.previewItem }))
  );
  void previewItem;
  const getStats = useLoadoutStore(s => s.getStats);

  if (!shipInfo) return null;

  const si    = shipInfo as any;
  const stats = getStats();

  // Countermeasure counts
  const cmHps        = hardpoints.filter(hp => hp.resolvedCategory === "COUNTERMEASURE");
  const cmDecoyCount = cmHps.filter(hp => hp.hardpointName.toLowerCase().includes("decoy")).length;
  const cmNoiseCount = cmHps.filter(hp => hp.hardpointName.toLowerCase().includes("noise")).length;

  // overrides is subscribed so we re-render when items are equipped (stats change)
  void overrides;

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 flex flex-row h-full min-h-[220px]">
      {/* Foto ocupando ~60% del ancho, full height del card */}
      <ShipCardImage name={shipInfo.name} manufacturer={shipInfo.manufacturer ?? null} />

      {/* Panel de datos a la derecha — flex-1 toma el ~40% restante */}
      <div className="flex-1 min-w-0 p-2 flex flex-col gap-1.5 overflow-y-auto">
        <div className="shrink-0">
          <div className="text-[11px] font-medium text-zinc-200 tracking-wide leading-tight truncate">{shipInfo.localizedName || shipInfo.name}</div>
          <div className="text-[10px] font-mono text-zinc-600 tracking-[0.12em] truncate">{shipInfo.manufacturer || "Unknown"}</div>
        </div>
        <div className="space-y-0 flex-1 min-h-0">
          {si.role   && <StatRow label="ROLE"  value={si.role} />}
          {si.size   && <StatRow label="SIZE"  value={"S" + si.size} />}
          <StatRow label="CREW"            value={fmtNum(si.crew)} />
          <StatRow label="SCM"             value={fmtNum(si.scmSpeed)}           unit="m/s" />
          <StatRow label="BOOST FWD"       value={fmtNum(si.boostSpeedForward)}  unit="m/s" />
          <StatRow label="BOOST BWD"       value={fmtNum(si.boostSpeedBackward)} unit="m/s" />
          <StatRow label="NAV MAX"         value={fmtNum(si.afterburnerSpeed)}   unit="m/s" />
          <StatRow label="P/Y/R"
            value={`${fmtNum(si.pitchRate)}/${fmtNum(si.yawRate)}/${fmtNum(si.rollRate)}`}
            unit="°/s" />
          {(si.boostedPitch || si.boostedYaw || si.boostedRoll) && (
            <StatRow label="BOOSTED"
              value={`${fmtNum(si.boostedPitch)}/${fmtNum(si.boostedYaw)}/${fmtNum(si.boostedRoll)}`}
              unit="°/s" />
          )}
          <StatRow label="POWER"           value={String(Math.round(stats.powerDraw))} />
          <StatRow label="CM D/N"          value={`${cmDecoyCount} / ${cmNoiseCount}`} />
          <StatRow label="HP"
            value={si.hullHp ? fmtMass(si.hullHp) : (si.shieldHpTotal ? fmtStat(si.shieldHpTotal) : "—")} />
          <StatRow label="CARGO"
            value={si.cargo > 0 ? Math.round(si.cargo).toString() : "—"} unit="SCU" />
          {si.mass && si.mass > 0 && <StatRow label="MASS" value={fmtMass(si.mass)} unit="kg" />}
          <StatRow label="H2"
            value={si.hydrogenCapacity ? fmtStat(si.hydrogenCapacity) : "—"} unit="SCU" />
          {si.quantumFuelCapacity && (
            <StatRow label="QT FUEL" value={fmtDec(si.quantumFuelCapacity)} unit="SCU" />
          )}
        </div>
      </div>
    </div>
  );
});
