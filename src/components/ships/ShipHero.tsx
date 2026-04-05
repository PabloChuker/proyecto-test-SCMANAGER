// =============================================================================
// AL FILO — ShipHero v6
// Reads from Zustand store. Shows ship identity + quick specs.
// =============================================================================

"use client";

import { useLoadoutStore } from "@/store/useLoadoutStore";

export function ShipHero({ shipId }: { shipId: string }) {
  const { shipInfo, isLoading } = useLoadoutStore();

  if (isLoading || !shipInfo) {
    return (
      <div className="pt-8 pb-6 border-b border-zinc-800/30">
        <div className="h-6 w-32 bg-zinc-900/60 rounded-sm animate-pulse mb-2" />
        <div className="h-10 w-64 bg-zinc-900/40 rounded-sm animate-pulse" />
      </div>
    );
  }

  const name = shipInfo.localizedName || shipInfo.name;

  return (
    <section className="pt-8 pb-6 border-b border-zinc-800/30">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] tracking-[0.2em] uppercase text-zinc-600 font-mono">{shipInfo.manufacturer || "Unknown"}</span>
            {shipInfo.role && (
              <>
                <span className="text-zinc-800">·</span>
                <span className="text-[10px] tracking-widest uppercase text-cyan-600/70">{shipInfo.role}</span>
              </>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-extralight tracking-wide text-zinc-50">{name}</h1>
          {shipInfo.focus && shipInfo.focus !== shipInfo.role && (
            <p className="text-sm text-zinc-500 mt-1">{shipInfo.focus}</p>
          )}
        </div>
        <div className="flex gap-4 text-center">
          {shipInfo.crew !== null && <QS label="Crew" value={String(shipInfo.crew)} />}
          {shipInfo.cargo !== null && shipInfo.cargo > 0 && <QS label="SCU" value={String(shipInfo.cargo)} />}
          {shipInfo.scmSpeed !== null && <QS label="SCM" value={Math.round(shipInfo.scmSpeed) + ""} unit="m/s" />}
        </div>
      </div>
      <div className="mt-2 text-[10px] text-zinc-700 font-mono">v{shipInfo.gameVersion}</div>
    </section>
  );
}

function QS({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <div className="text-[9px] tracking-widest uppercase text-zinc-600">{label}</div>
      <div className="text-sm font-mono text-zinc-300">{value}{unit && <span className="text-[10px] text-zinc-600 ml-0.5">{unit}</span>}</div>
    </div>
  );
}
