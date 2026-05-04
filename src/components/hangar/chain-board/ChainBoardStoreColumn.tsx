"use client";

// =============================================================================
// SC LABS — ChainBoardStoreColumn (CB.3)
//
// Columna derecha: ships actualmente en venta en RSI según
// ship_prices_canonical.pledge_availability. MVP usa esa fuente cacheada
// (sync periódico via load_rsi_prices_canonical.mjs). CB.6 cambiará la fuente
// a un scraper en vivo de robertsspaceindustries.com sin tocar este componente.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { getShipThumbUrl } from "../HangarShipCard";
import type { BoardCard } from "./types";

interface ChainBoardStoreColumnProps {
  usedShipIds: Set<string>;
  onAddCard: (ship: Omit<BoardCard, "cardId">) => void;
}

interface StoreShipRow {
  id: string;
  reference: string;
  name: string;
  manufacturer: string | null;
  msrpUsd: number;
  warbondUsd: number | null;
  pledgeAvailability: string | null;
  flightStatus: string | null;
}

interface StoreSnapshotResponse {
  ships: StoreShipRow[];
  total: number;
  lastSynced: string | null;
  source: string;
}

type AvailabilityFilter = "all" | "always" | "limited";

function fmtRelativeTime(iso: string | null): string {
  if (!iso) return "nunca";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const mins = Math.floor((now - then) / 60_000);
  if (mins < 1) return "recién";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

export function ChainBoardStoreColumn({
  usedShipIds,
  onAddCard,
}: ChainBoardStoreColumnProps) {
  const [data, setData] = useState<StoreSnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AvailabilityFilter>("all");

  // Fetch al montar + refrescar cada 10 min mientras la pestaña esté abierta.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/ccu/store-snapshot");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j: StoreSnapshotResponse = await r.json();
        if (!cancelled) {
          setData(j);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 10 * 60 * 1000); // refresh c/10min
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Filtro y búsqueda
  const filteredShips = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.ships.filter((s) => {
      if (filter === "always" && s.pledgeAvailability !== "Always available") return false;
      if (
        filter === "limited" &&
        s.pledgeAvailability !== "Time-limited sales" &&
        s.pledgeAvailability !== "Time Limited" &&
        s.pledgeAvailability !== "Quantity-limited sales"
      )
        return false;
      if (q) {
        const hay =
          s.name.toLowerCase().includes(q) ||
          s.reference.toLowerCase().includes(q) ||
          (s.manufacturer ?? "").toLowerCase().includes(q);
        if (!hay) return false;
      }
      return true;
    });
  }, [data, search, filter]);

  return (
    <div className="h-full bg-zinc-900/40 border border-zinc-800/60 rounded-sm flex flex-col">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-zinc-800/50">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">🛒</span>
          <h2 className="text-[12px] font-semibold tracking-wide text-zinc-200">
            En venta · RSI
          </h2>
          <span className="text-[10px] text-zinc-500 font-mono ml-auto">
            {filteredShips.length}
            {data && filteredShips.length !== data.ships.length && (
              <span className="text-zinc-600">/{data.ships.length}</span>
            )}
          </span>
        </div>

        {/* Last sync */}
        <div className="flex items-center justify-between gap-1 mb-2">
          <span className="text-[9px] font-mono text-zinc-500">
            🕒 {fmtRelativeTime(data?.lastSynced ?? null)}
          </span>
          <span
            className="text-[9px] font-mono text-zinc-600 truncate"
            title={data?.source}
          >
            {data?.source.includes("Wiki") ? "Wiki cache" : data?.source ?? ""}
          </span>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar nave…"
          className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[11px] font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
        />

        {/* Filtros (compactos) */}
        <div className="grid grid-cols-3 gap-1 mt-2">
          {(
            [
              { id: "all", label: "Todo" },
              { id: "always", label: "Siempre" },
              { id: "limited", label: "Eventos" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`text-[10px] px-1.5 py-1 rounded-sm border transition-colors ${
                filter === f.id
                  ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                  : "bg-zinc-950 text-zinc-400 border-zinc-800/60 hover:text-zinc-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {loading && !data && (
          <p className="text-[11px] text-zinc-500 italic px-2 py-4 text-center">
            Cargando RSI store…
          </p>
        )}
        {error && !data && (
          <p className="text-[11px] text-rose-400 px-2 py-4 text-center">
            Error: {error}
          </p>
        )}
        {!loading && filteredShips.length === 0 && (
          <p className="text-[11px] text-zinc-500 italic px-2 py-4 text-center">
            Sin resultados.
          </p>
        )}
        {filteredShips.map((s) => {
          const isUsed = usedShipIds.has(s.id);
          const isLimited =
            s.pledgeAvailability === "Time-limited sales" ||
            s.pledgeAvailability === "Time Limited" ||
            s.pledgeAvailability === "Quantity-limited sales";
          return (
            <button
              key={s.id}
              disabled={isUsed}
              onClick={() =>
                onAddCard({
                  shipId: s.id,
                  shipName: s.name,
                  shipReference: s.reference,
                  manufacturer: s.manufacturer,
                  msrpUsd: s.msrpUsd,
                  warbondUsd: s.warbondUsd,
                  imageUrl: getShipThumbUrl(s.name),
                  origin: "store",
                })
              }
              className={`w-full text-left px-2 py-1.5 rounded-sm border transition-colors flex items-center gap-2 ${
                isUsed
                  ? "bg-zinc-900/30 border-zinc-800/30 opacity-50 cursor-not-allowed"
                  : "bg-zinc-900/60 border-zinc-800/60 hover:border-cyan-500/40 hover:bg-zinc-800/40"
              }`}
              title={
                isUsed
                  ? "Ya está en la pizarra"
                  : `Agregar ${s.name} a la pizarra (${s.pledgeAvailability ?? "?"})`
              }
            >
              <img
                src={getShipThumbUrl(s.name)}
                alt=""
                className="w-9 h-9 object-cover rounded-sm border border-zinc-800/60 shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.opacity = "0.2";
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-zinc-100 truncate">{s.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {isLimited && (
                    <span className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-[2px] border bg-amber-500/15 text-amber-300 border-amber-500/30">
                      🕒 Evento
                    </span>
                  )}
                  <span className="text-[9px] font-mono text-amber-400/80 ml-auto">
                    ${s.msrpUsd}
                  </span>
                  {s.warbondUsd && s.warbondUsd !== s.msrpUsd && (
                    <span className="text-[9px] font-mono text-cyan-400/80">
                      WB ${s.warbondUsd}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
