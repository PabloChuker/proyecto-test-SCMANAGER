"use client";

// =============================================================================
// SC LABS — ChainBoardInventoryColumn (CB.2)
//
// Columna izquierda: ships + CCUs del hangar/buyback con filtros y click
// para agregar a la pizarra. Re-usa la lógica de matching contra el catálogo
// de naves (ya cargado en `/api/ccu/ships`) para resolver shipId real, msrp
// y warbond del item del usuario.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useHangarStore, type HangarShip, type HangarCCU, type InsuranceType } from "@/store/useHangarStore";
import { getShipThumbUrl } from "../HangarShipCard";
import type { BoardCard, BoardShipRow } from "./types";

interface ChainBoardInventoryColumnProps {
  usedShipIds: Set<string>;
  onAddCard: (ship: Omit<BoardCard, "cardId">) => void;
}

type FilterType = "all" | "ship" | "ccu";
type FilterLoc = "all" | "hangar" | "buyback";

const INSURANCE_TAG: Record<InsuranceType, string> = {
  LTI: "LTI",
  "120_months": "120m",
  "72_months": "72m",
  "48_months": "48m",
  "24_months": "24m",
  "6_months": "6m",
  "3_months": "3m",
  unknown: "?",
};

const INSURANCE_COLOR: Record<InsuranceType, string> = {
  LTI: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  "120_months": "text-cyan-300 bg-cyan-500/10 border-cyan-500/30",
  "72_months": "text-amber-300 bg-amber-500/10 border-amber-500/30",
  "48_months": "text-amber-300 bg-amber-500/10 border-amber-500/30",
  "24_months": "text-amber-300 bg-amber-500/10 border-amber-500/30",
  "6_months": "text-rose-300 bg-rose-500/10 border-rose-500/30",
  "3_months": "text-rose-300 bg-rose-500/10 border-rose-500/30",
  unknown: "text-zinc-500 bg-zinc-800/50 border-zinc-700/50",
};

export function ChainBoardInventoryColumn({
  usedShipIds,
  onAddCard,
}: ChainBoardInventoryColumnProps) {
  const ships = useHangarStore((s) => s.ships);
  const ccus = useHangarStore((s) => s.ccus);

  // Catálogo de naves para matchear y obtener shipId/msrp/warbond
  const [catalog, setCatalog] = useState<BoardShipRow[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ccu/ships")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const arr = Array.isArray(d?.ships) ? d.ships : [];
        setCatalog(
          arr.map((x: any) => ({
            id: String(x.id ?? ""),
            reference: String(x.reference ?? ""),
            name: String(x.name ?? ""),
            manufacturer: x.manufacturer ?? null,
            msrpUsd: Number(x.msrpUsd) || 0,
            warbondUsd: x.warbondUsd != null ? Number(x.warbondUsd) : null,
            flightStatus: x.flightStatus ?? null,
            pledgeAvailability: x.pledgeAvailability ?? null,
          })),
        );
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoadingCatalog(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Filtros ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterLoc, setFilterLoc] = useState<FilterLoc>("all");
  const [filterIns, setFilterIns] = useState<"all" | InsuranceType>("all");
  // CB.8c (2026-05-04): sort por precio. "none" = orden natural (ships primero,
  // después CCUs, alfabético). "asc" / "desc" = por precio: ships usan msrpUsd
  // del catálogo, CCUs usan pricePaid del user. Mezcla en misma escala.
  const [sortOrder, setSortOrder] = useState<"none" | "asc" | "desc">("none");
  const cycleSort = () => {
    setSortOrder((prev) => (prev === "none" ? "asc" : prev === "asc" ? "desc" : "none"));
  };

  // CCU.13 (2026-05-04): matchea nombre de hangar contra catálogo siendo
  // estricto con variantes (longest-match wins).
  const findCatalogMatch = useMemo(() => {
    return (rawName: string): BoardShipRow | null => {
      const name = rawName.toLowerCase().trim();
      if (!name) return null;
      const candidates = catalog.filter((s) => {
        const sName = s.name.toLowerCase();
        return (
          sName === name ||
          sName.endsWith(" " + name) ||
          name.endsWith(" " + sName.split(" ").slice(1).join(" ").toLowerCase())
        );
      });
      if (candidates.length === 0) return null;
      return (
        candidates.find((s) => s.name.toLowerCase() === name) ??
        candidates.sort((a, b) => b.name.length - a.name.length)[0]
      );
    };
  }, [catalog]);

  // ─── Lista combinada ships + CCUs ─────────────────────────────────────────
  type InventoryRow =
    | { kind: "ship"; ship: HangarShip; match: BoardShipRow | null }
    | { kind: "ccu"; ccu: HangarCCU; fromMatch: BoardShipRow | null; toMatch: BoardShipRow | null };

  const rows = useMemo<InventoryRow[]>(() => {
    const result: InventoryRow[] = [];
    if (filterType === "all" || filterType === "ship") {
      for (const s of ships) {
        if (s.itemCategory !== "standalone_ship" && s.itemCategory !== "game_package") continue;
        if (s.isLoaner) continue;
        if (s.isLocked) continue;  // CCU.15: no se pueden CCU
        if (filterLoc !== "all" && s.location !== filterLoc) continue;
        if (filterIns !== "all" && s.insuranceType !== filterIns) continue;
        if (search) {
          const q = search.toLowerCase();
          if (!s.shipName.toLowerCase().includes(q) && !s.pledgeName.toLowerCase().includes(q)) continue;
        }
        result.push({ kind: "ship", ship: s, match: findCatalogMatch(s.shipName) });
      }
    }
    if (filterType === "all" || filterType === "ccu") {
      for (const c of ccus) {
        if (filterLoc !== "all" && c.location !== filterLoc) continue;
        if (search) {
          const q = search.toLowerCase();
          if (!c.fromShip.toLowerCase().includes(q) && !c.toShip.toLowerCase().includes(q)) continue;
        }
        result.push({
          kind: "ccu",
          ccu: c,
          fromMatch: findCatalogMatch(c.fromShip),
          toMatch: findCatalogMatch(c.toShip),
        });
      }
    }

    // CB.8c: sort por precio cuando aplica. Ships → msrpUsd, CCUs → pricePaid.
    if (sortOrder !== "none") {
      const dir = sortOrder === "asc" ? 1 : -1;
      const priceOf = (r: InventoryRow): number => {
        if (r.kind === "ship") return r.match?.msrpUsd ?? -1;
        return r.ccu.pricePaid ?? -1;
      };
      result.sort((a, b) => (priceOf(a) - priceOf(b)) * dir);
    }
    return result;
  }, [ships, ccus, filterType, filterLoc, filterIns, search, findCatalogMatch, sortOrder]);

  const buildCardFromShip = (
    match: BoardShipRow,
    sourceItemId: string,
  ): Omit<BoardCard, "cardId"> => ({
    shipId: match.id,
    shipName: match.name,
    shipReference: match.reference,
    manufacturer: match.manufacturer,
    msrpUsd: match.msrpUsd,
    warbondUsd: match.warbondUsd,
    imageUrl: getShipThumbUrl(match.name),
    origin: "fleet",
    sourceItemId,
  });

  return (
    <div className="h-full bg-zinc-900/40 border border-zinc-800/60 rounded-sm flex flex-col">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-zinc-800/50">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">📦</span>
          <h2 className="text-[12px] font-semibold tracking-wide text-zinc-200">
            Mi Inventario
          </h2>
          {/* CB.8c: sort toggle por precio */}
          <button
            onClick={cycleSort}
            className={`ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-sm border transition-colors ${
              sortOrder === "none"
                ? "bg-zinc-900/40 border-zinc-800/60 text-zinc-500 hover:text-zinc-300"
                : "bg-amber-500/15 border-amber-500/30 text-amber-300"
            }`}
            title={
              sortOrder === "none"
                ? "Orden natural — click para ordenar por precio ascendente"
                : sortOrder === "asc"
                ? "Precio ↑ menor primero — click para ↓ mayor primero"
                : "Precio ↓ mayor primero — click para volver al orden natural"
            }
          >
            {sortOrder === "none" ? "$ —" : sortOrder === "asc" ? "$ ↑" : "$ ↓"}
          </button>
          <span className="text-[10px] text-zinc-500 font-mono">{rows.length}</span>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar nave o CCU…"
          className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[11px] font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
        />

        {/* Filtros (compactos) */}
        <div className="grid grid-cols-3 gap-1 mt-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterType)}
            className="text-[10px] px-1.5 py-1 bg-zinc-950 border border-zinc-800/60 rounded-sm text-zinc-300 focus:outline-none focus:border-amber-500/50"
            title="Tipo"
          >
            <option value="all">Todo</option>
            <option value="ship">Ships</option>
            <option value="ccu">CCUs</option>
          </select>
          <select
            value={filterLoc}
            onChange={(e) => setFilterLoc(e.target.value as FilterLoc)}
            className="text-[10px] px-1.5 py-1 bg-zinc-950 border border-zinc-800/60 rounded-sm text-zinc-300 focus:outline-none focus:border-amber-500/50"
            title="Ubicación"
          >
            <option value="all">Lugar</option>
            <option value="hangar">Hangar</option>
            <option value="buyback">Buyback</option>
          </select>
          <select
            value={filterIns}
            onChange={(e) => setFilterIns(e.target.value as "all" | InsuranceType)}
            className="text-[10px] px-1.5 py-1 bg-zinc-950 border border-zinc-800/60 rounded-sm text-zinc-300 focus:outline-none focus:border-amber-500/50"
            title="Seguro"
          >
            <option value="all">Seguro</option>
            <option value="LTI">LTI</option>
            <option value="120_months">120m</option>
            <option value="72_months">72m</option>
            <option value="48_months">48m</option>
            <option value="24_months">24m</option>
            <option value="6_months">6m</option>
            <option value="3_months">3m</option>
            <option value="unknown">?</option>
          </select>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {loadingCatalog && (
          <p className="text-[11px] text-zinc-500 italic px-2 py-4 text-center">
            Cargando catálogo…
          </p>
        )}
        {!loadingCatalog && rows.length === 0 && (
          <p className="text-[11px] text-zinc-500 italic px-2 py-4 text-center">
            Sin resultados con estos filtros.
          </p>
        )}
        {rows.map((row, idx) => {
          if (row.kind === "ship") {
            const isUsed = row.match ? usedShipIds.has(row.match.id) : false;
            const insColor = INSURANCE_COLOR[row.ship.insuranceType];
            const insTag = INSURANCE_TAG[row.ship.insuranceType];
            const thumb = getShipThumbUrl(row.ship.shipName);
            return (
              <button
                key={`s-${row.ship.id}`}
                disabled={!row.match || isUsed}
                onClick={() =>
                  row.match && onAddCard(buildCardFromShip(row.match, row.ship.id))
                }
                className={`w-full text-left px-2 py-1.5 rounded-sm border transition-colors flex items-center gap-2 ${
                  isUsed
                    ? "bg-zinc-900/30 border-zinc-800/30 opacity-50 cursor-not-allowed"
                    : !row.match
                    ? "bg-zinc-900/30 border-rose-500/20 cursor-not-allowed"
                    : "bg-zinc-900/60 border-zinc-800/60 hover:border-amber-500/40 hover:bg-zinc-800/40"
                }`}
                title={
                  isUsed
                    ? "Ya está en la pizarra"
                    : !row.match
                    ? `Sin match en BD para "${row.ship.shipName}"`
                    : `Agregar a la pizarra como ${row.ship.shipName} (${row.ship.location} · ${insTag})`
                }
              >
                <img
                  src={thumb}
                  alt=""
                  className="w-9 h-9 object-cover rounded-sm border border-zinc-800/60 shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.opacity = "0.2";
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-zinc-100 truncate">
                    {row.ship.shipName}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span
                      className={`text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-[2px] border ${insColor}`}
                    >
                      {insTag}
                    </span>
                    <span className="text-[8px] font-mono uppercase text-zinc-500">
                      {row.ship.location === "buyback" ? "BB" : "Hgr"}
                    </span>
                    {row.match && (
                      <span className="text-[9px] font-mono text-amber-400/80 ml-auto">
                        ${row.match.msrpUsd}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          }
          // CCU row con 2 thumbnails (FROM ← → TO)
          const fromUsed = row.fromMatch ? usedShipIds.has(row.fromMatch.id) : false;
          const toUsed = row.toMatch ? usedShipIds.has(row.toMatch.id) : false;
          const fromThumb = getShipThumbUrl(row.ccu.fromShip);
          const toThumb = getShipThumbUrl(row.ccu.toShip);
          return (
            <div
              key={`c-${row.ccu.id}`}
              className="bg-zinc-900/60 border border-zinc-800/60 rounded-sm p-1.5"
            >
              {/* Header con badges */}
              <div className="flex items-center gap-1 mb-1.5">
                <span
                  className={`text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-[2px] border shrink-0 ${
                    row.ccu.isWarbond
                      ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                      : "bg-zinc-800/50 text-zinc-400 border-zinc-700/50"
                  }`}
                >
                  {row.ccu.isWarbond ? "WB" : "STD"}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono shrink-0">
                  ${row.ccu.pricePaid.toFixed(0)}
                </span>
                {row.ccu.grantsInsurance && (
                  <span
                    className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-[2px] border bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shrink-0"
                    title={`Otorga ${row.ccu.grantsInsurance.replace("_", " ")} al destino`}
                  >
                    ⭐ {row.ccu.grantsInsurance === "LTI" ? "LTI" : row.ccu.grantsInsurance.replace("_months", "m")}
                  </span>
                )}
                <span className="text-[8px] font-mono uppercase text-zinc-500 ml-auto shrink-0">
                  {row.ccu.location === "buyback" ? "BB" : "Hgr"}
                </span>
              </div>

              {/* CB.8c: 2 thumbnails (FROM ← → TO) clickables */}
              <div className="flex items-stretch gap-1">
                {/* FROM */}
                <button
                  disabled={!row.fromMatch || fromUsed}
                  onClick={() =>
                    row.fromMatch && onAddCard(buildCardFromShip(row.fromMatch, row.ccu.id))
                  }
                  className={`flex-1 min-w-0 flex flex-col rounded-sm border overflow-hidden transition-colors ${
                    fromUsed
                      ? "border-zinc-800/40 opacity-50 cursor-not-allowed"
                      : !row.fromMatch
                      ? "border-rose-500/30 cursor-not-allowed"
                      : "border-zinc-800/60 hover:border-amber-500/50 hover:bg-zinc-800/30"
                  }`}
                  title={
                    fromUsed
                      ? "Ya está en la pizarra"
                      : !row.fromMatch
                      ? `Sin match: ${row.ccu.fromShip}`
                      : `Agregar ${row.ccu.fromShip} a la pizarra como FROM`
                  }
                >
                  <img
                    src={fromThumb}
                    alt=""
                    className="w-full h-12 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.opacity = "0.2";
                    }}
                  />
                  <div className="px-1 py-0.5 bg-zinc-950/60">
                    <p className="text-[9px] text-zinc-300 truncate text-left leading-tight">
                      {row.ccu.fromShip}
                    </p>
                  </div>
                </button>

                {/* Arrow connector */}
                <div className="flex items-center justify-center w-3 shrink-0 text-zinc-600 text-[10px]">
                  →
                </div>

                {/* TO */}
                <button
                  disabled={!row.toMatch || toUsed}
                  onClick={() =>
                    row.toMatch && onAddCard(buildCardFromShip(row.toMatch, row.ccu.id))
                  }
                  className={`flex-1 min-w-0 flex flex-col rounded-sm border overflow-hidden transition-colors ${
                    toUsed
                      ? "border-zinc-800/40 opacity-50 cursor-not-allowed"
                      : !row.toMatch
                      ? "border-rose-500/30 cursor-not-allowed"
                      : "border-zinc-800/60 hover:border-cyan-500/50 hover:bg-zinc-800/30"
                  }`}
                  title={
                    toUsed
                      ? "Ya está en la pizarra"
                      : !row.toMatch
                      ? `Sin match: ${row.ccu.toShip}`
                      : `Agregar ${row.ccu.toShip} a la pizarra como TO`
                  }
                >
                  <img
                    src={toThumb}
                    alt=""
                    className="w-full h-12 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.opacity = "0.2";
                    }}
                  />
                  <div className="px-1 py-0.5 bg-zinc-950/60">
                    <p className="text-[9px] text-cyan-300/90 truncate text-left leading-tight">
                      {row.ccu.toShip}
                    </p>
                  </div>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
