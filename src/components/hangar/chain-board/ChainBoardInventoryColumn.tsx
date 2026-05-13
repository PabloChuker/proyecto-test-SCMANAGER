"use client";

// =============================================================================
// SC LABS — AvailableShipsColumn (Chain Board v2.1, 2026-05-05)
//
// Columna 1: catálogo entero de SC. Search + filtros de precio mín/máx + sort
// asc/desc por precio o nombre. Cada row es draggable al canvas.
// =============================================================================

import { useMemo, useState } from "react";
import { SHIP_MIME, type CatalogShip } from "./types";
import { useShipsCatalog } from "./useShipsCatalog";

interface AvailableShipsColumnProps {
  usedShipIds: Set<string>;
}

type SortField = "price" | "name";
type SortDir = "asc" | "desc";

export function ChainBoardInventoryColumn({ usedShipIds }: AvailableShipsColumnProps) {
  // 2026-05-13 (P1-6): catalog desde hook compartido. Antes este componente
  // hacía su propio fetch independiente — ahora todos los consumers comparten
  // un cache module-level y una sola request in-flight.
  const { catalog, loading } = useShipsCatalog();
  const [search, setSearch] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sortField, setSortField] = useState<SortField>("price");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = minPrice ? parseFloat(minPrice) : -Infinity;
    const max = maxPrice ? parseFloat(maxPrice) : Infinity;
    let arr = catalog.filter((s) => {
      // 2026-05-13 (Audit P0-2c): incluir reference (class_name) en el search
      // para buscar por código de clase ej. "DRAK_Ironclad" además del name.
      if (q) {
        const matchName = s.name.toLowerCase().includes(q);
        const matchMfr = (s.manufacturer ?? "").toLowerCase().includes(q);
        const matchRef = (s.reference ?? "").toLowerCase().includes(q);
        if (!matchName && !matchMfr && !matchRef) return false;
      }
      if (s.msrpUsd < min || s.msrpUsd > max) return false;
      return true;
    });
    arr = arr.slice().sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortField === "price") return (a.msrpUsd - b.msrpUsd) * dir;
      return a.name.localeCompare(b.name) * dir;
    });
    return arr;
  }, [catalog, search, minPrice, maxPrice, sortField, sortDir]);

  return (
    <div className="h-full flex flex-col bg-zinc-900/40 border border-zinc-800/60 rounded-md overflow-hidden">
      <div className="px-2.5 pt-2.5 pb-2 border-b border-zinc-800/50 space-y-1.5">
        <h2 className="text-[12px] font-semibold tracking-wide text-zinc-200">
          Available Ships
        </h2>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full px-2 py-1 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[11px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
        />
        {/* Filtros precio */}
        <div className="flex gap-1 items-center">
          <input
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="Min $"
            className="flex-1 min-w-0 px-1.5 py-1 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[10px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
          />
          <span className="text-zinc-700 text-[9px]">—</span>
          <input
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Max $"
            className="flex-1 min-w-0 px-1.5 py-1 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[10px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>
        {/* Sort */}
        <div className="flex gap-1 items-center">
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="flex-1 px-1.5 py-1 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[10px] text-zinc-300 focus:outline-none focus:border-amber-500/50"
          >
            <option value="price">Precio</option>
            <option value="name">Nombre</option>
          </select>
          <button
            onClick={() => setSortDir((p) => (p === "asc" ? "desc" : "asc"))}
            className={`px-2 py-1 rounded-sm border text-[11px] font-mono transition-colors ${
              sortDir === "asc"
                ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                : "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
            }`}
            title={sortDir === "asc" ? "Menor a mayor" : "Mayor a menor"}
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
        </div>
        <p className="text-[9px] font-mono text-zinc-600">
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
              className={`flex items-center gap-2 p-1.5 rounded-sm border transition-colors ${
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
                <div className="w-12 h-9 rounded-sm bg-zinc-800/60 border border-zinc-800/60 shrink-0" />
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
