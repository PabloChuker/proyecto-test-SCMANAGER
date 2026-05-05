"use client";

// =============================================================================
// SC LABS — AvailableShipsColumn (Chain Board v2, 2026-05-05)
//
// Columna izquierda: lista del catálogo entero de naves de SC. Cada row es
// draggable al canvas con el MIME application/x-sclabs-ship.
//
// Inspirado en el panel "Available Ships" del mockup Ship Upgrade Planner.
// Search por nombre + manufacturer. Foto, nombre, manufacturer, precio MSRP
// + badge WB si aplica.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { getShipThumbUrl } from "../HangarShipCard";
import { SHIP_MIME, type CatalogShip } from "./types";

interface AvailableShipsColumnProps {
  /** IDs de naves que ya están en el canvas — para deshabilitar duplicados. */
  usedShipIds: Set<string>;
}

interface RawCatalogRow {
  id: string;
  reference?: string;
  name: string;
  manufacturer: string | null;
  msrpUsd: number;
  warbondUsd: number | null;
  flightStatus?: string | null;
  pledgeAvailability?: string | null;
}

export function ChainBoardInventoryColumn({ usedShipIds }: AvailableShipsColumnProps) {
  const [catalog, setCatalog] = useState<CatalogShip[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ccu/ships")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const arr = Array.isArray(d?.ships) ? (d.ships as RawCatalogRow[]) : [];
        const mapped: CatalogShip[] = arr.map((x) => ({
          id: String(x.id ?? ""),
          reference: String(x.reference ?? ""),
          name: String(x.name ?? ""),
          manufacturer: x.manufacturer ?? null,
          role: x.flightStatus ?? null,
          msrpUsd: Number(x.msrpUsd) || 0,
          warbondUsd: x.warbondUsd != null ? Number(x.warbondUsd) : null,
          imageUrl: getShipThumbUrl(String(x.name ?? "")),
        }));
        // Sort por precio asc, luego por nombre.
        mapped.sort((a, b) => a.msrpUsd - b.msrpUsd || a.name.localeCompare(b.name));
        setCatalog(mapped);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.manufacturer ?? "").toLowerCase().includes(q),
    );
  }, [catalog, search]);

  return (
    <div className="h-full flex flex-col bg-zinc-900/40 border border-zinc-800/60 rounded-md overflow-hidden">
      <div className="px-3 pt-3 pb-2 border-b border-zinc-800/50">
        <h2 className="text-[12px] font-semibold tracking-wide text-zinc-200 mb-2">
          Available Ships
        </h2>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ships..."
          className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[11px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
        />
        <p className="mt-1.5 text-[9px] font-mono text-zinc-600">
          {loading ? "Cargando..." : `${filtered.length} naves`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {loading && (
          <p className="text-[11px] text-zinc-500 italic px-2 py-4 text-center">
            Cargando catálogo...
          </p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-[11px] text-zinc-500 italic px-2 py-4 text-center">
            Sin resultados.
          </p>
        )}
        {filtered.map((ship) => {
          const used = usedShipIds.has(ship.id);
          const hasWarbond =
            ship.warbondUsd != null && ship.warbondUsd > 0 && ship.warbondUsd !== ship.msrpUsd;
          return (
            <div
              key={ship.id}
              draggable={!used}
              onDragStart={(e) => {
                if (used) return;
                e.dataTransfer.setData(SHIP_MIME, JSON.stringify(ship));
                e.dataTransfer.effectAllowed = "copy";
              }}
              className={`group flex items-center gap-2 p-1.5 rounded-sm border transition-colors ${
                used
                  ? "bg-zinc-900/30 border-zinc-800/30 opacity-40 cursor-not-allowed"
                  : "bg-zinc-900/60 border-zinc-800/60 hover:border-amber-500/40 hover:bg-zinc-800/40 cursor-grab active:cursor-grabbing"
              }`}
              title={used ? "Ya está en la pizarra" : `Arrastrá ${ship.name} a la pizarra`}
            >
              {ship.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ship.imageUrl}
                  alt=""
                  className="w-12 h-9 object-cover rounded-sm border border-zinc-800/60 shrink-0"
                  draggable={false}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
                  }}
                />
              ) : (
                <div className="w-12 h-9 rounded-sm bg-zinc-800/60 border border-zinc-800/60 shrink-0 flex items-center justify-center text-zinc-700 text-sm">
                  🚀
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  {hasWarbond && (
                    <span className="text-[8px] font-mono uppercase tracking-wider px-1 rounded-[2px] bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      WB
                    </span>
                  )}
                  <p className="text-[11px] text-zinc-100 truncate font-medium">
                    {ship.name}
                  </p>
                </div>
                <p className="text-[9px] text-zinc-500 truncate italic">
                  {ship.manufacturer ?? "—"}
                </p>
                <div className="flex items-baseline gap-1.5">
                  {hasWarbond && (
                    <span className="text-[10px] font-mono text-zinc-600 line-through">
                      ${ship.msrpUsd.toFixed(0)}
                    </span>
                  )}
                  <span className="text-[11px] font-mono font-bold text-cyan-400">
                    ${(hasWarbond ? ship.warbondUsd! : ship.msrpUsd).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
