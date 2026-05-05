"use client";

// =============================================================================
// SC LABS — MyHangarColumn (Chain Board v2.2, 2026-05-05)
//
// Columna 2: tabs "Mis Naves" / "Mis CCUs" del hangar.
// Naves: etiqueta de seguro (LTI/120m/72m/...) + filtro por seguro.
// CCUs: precio FROM (MSRP) + precio TO (MSRP) + lo pagado.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import {
  useHangarStore,
  type HangarShip,
  type InsuranceType,
} from "@/store/useHangarStore";
import { getShipThumbUrl } from "../HangarShipCard";
import {
  HANGAR_CCU_MIME,
  SHIP_MIME,
  type CatalogShip,
  type HangarCcuPayload,
  type UpgradeKind,
} from "./types";

interface RawCatalogRow {
  id: string;
  reference?: string;
  name: string;
  manufacturer: string | null;
  msrpUsd: number;
  warbondUsd: number | null;
  flightStatus?: string | null;
}

type Tab = "ships" | "ccus";
type SortDir = "asc" | "desc";
type InsFilter = "all" | InsuranceType;

const INS_TAG: Record<InsuranceType, string> = {
  LTI: "LTI",
  "120_months": "120m",
  "72_months": "72m",
  "48_months": "48m",
  "24_months": "24m",
  "6_months": "6m",
  "3_months": "3m",
  unknown: "?",
};

const INS_COLOR: Record<InsuranceType, string> = {
  LTI: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  "120_months": "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
  "72_months": "bg-amber-500/15 text-amber-300 border-amber-500/40",
  "48_months": "bg-amber-500/15 text-amber-300 border-amber-500/40",
  "24_months": "bg-amber-500/15 text-amber-300 border-amber-500/40",
  "6_months": "bg-rose-500/15 text-rose-300 border-rose-500/40",
  "3_months": "bg-rose-500/15 text-rose-300 border-rose-500/40",
  unknown: "bg-zinc-800/50 text-zinc-500 border-zinc-700/50",
};

interface MyHangarProps {
  usedShipIds: Set<string>;
}

export function ChainBoardStoreColumn({ usedShipIds }: MyHangarProps) {
  const ships = useHangarStore((s) => s.ships);
  const ccus = useHangarStore((s) => s.ccus);

  const [catalog, setCatalog] = useState<CatalogShip[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ccu/ships")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const arr = Array.isArray(d?.ships) ? (d.ships as RawCatalogRow[]) : [];
        setCatalog(
          arr.map((x) => ({
            id: String(x.id ?? ""),
            reference: String(x.reference ?? ""),
            name: String(x.name ?? ""),
            manufacturer: x.manufacturer ?? null,
            role: x.flightStatus ?? null,
            msrpUsd: Number(x.msrpUsd) || 0,
            warbondUsd: x.warbondUsd != null ? Number(x.warbondUsd) : null,
            imageUrl: getShipThumbUrl(String(x.name ?? "")),
          })),
        );
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoadingCatalog(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const findShip = useMemo(() => {
    return (rawName: string): CatalogShip | null => {
      const name = (rawName ?? "").toLowerCase().trim();
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

  const [tab, setTab] = useState<Tab>("ships");
  const [search, setSearch] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [insFilter, setInsFilter] = useState<InsFilter>("all");

  const min = minPrice ? parseFloat(minPrice) : -Infinity;
  const max = maxPrice ? parseFloat(maxPrice) : Infinity;
  const dir = sortDir === "asc" ? 1 : -1;

  // ─── Mis Naves ─────────────────────────────────────────────────────────
  type ShipRow = { hangar: HangarShip; ship: CatalogShip };
  const shipRows = useMemo<ShipRow[]>(() => {
    const q = search.trim().toLowerCase();
    const rows: ShipRow[] = [];
    for (const hs of ships) {
      if (hs.itemCategory !== "standalone_ship" && hs.itemCategory !== "game_package") continue;
      if (hs.isLoaner || hs.isLocked) continue;
      if (insFilter !== "all" && hs.insuranceType !== insFilter) continue;
      const match = findShip(hs.shipName);
      if (!match) continue;
      if (q && !match.name.toLowerCase().includes(q) && !(match.manufacturer ?? "").toLowerCase().includes(q)) continue;
      if (match.msrpUsd < min || match.msrpUsd > max) continue;
      rows.push({ hangar: hs, ship: match });
    }
    rows.sort((a, b) => (a.ship.msrpUsd - b.ship.msrpUsd) * dir);
    return rows;
  }, [ships, findShip, search, min, max, dir, insFilter]);

  // ─── Mis CCUs ─────────────────────────────────────────────────────────
  type CcuRow = {
    id: string;
    fromName: string;
    toName: string;
    fromShip: CatalogShip | null;
    toShip: CatalogShip | null;
    pricePaid: number;
    isWarbond: boolean;
    location: "hangar" | "buyback";
  };
  const ccuRows = useMemo<CcuRow[]>(() => {
    const q = search.trim().toLowerCase();
    const rows: CcuRow[] = ccus.map((c) => ({
      id: c.id,
      fromName: c.fromShip,
      toName: c.toShip,
      fromShip: findShip(c.fromShip),
      toShip: findShip(c.toShip),
      pricePaid: c.pricePaid,
      isWarbond: !!c.isWarbond,
      location: c.location,
    }));
    let filtered = rows.filter((r) => {
      if (q && !r.fromName.toLowerCase().includes(q) && !r.toName.toLowerCase().includes(q)) return false;
      if (r.pricePaid < min || r.pricePaid > max) return false;
      return true;
    });
    filtered.sort((a, b) => (a.pricePaid - b.pricePaid) * dir);
    return filtered;
  }, [ccus, findShip, search, min, max, dir]);

  return (
    <div className="h-full flex flex-col bg-zinc-900/40 border border-zinc-800/60 rounded-md overflow-hidden">
      {/* Header */}
      <div className="px-2.5 pt-2.5 pb-2 border-b border-zinc-800/50 space-y-1.5">
        <h2 className="text-[12px] font-semibold tracking-wide text-zinc-200">
          My Hangar
        </h2>
        <div className="flex gap-0.5 p-0.5 bg-zinc-950/60 rounded-sm">
          <button
            onClick={() => setTab("ships")}
            className={`flex-1 text-[10px] py-1 rounded-sm transition-colors ${
              tab === "ships"
                ? "bg-amber-500/20 text-amber-300"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Naves ({shipRows.length})
          </button>
          <button
            onClick={() => setTab("ccus")}
            className={`flex-1 text-[10px] py-1 rounded-sm transition-colors ${
              tab === "ccus"
                ? "bg-cyan-500/20 text-cyan-300"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            CCUs ({ccuRows.length})
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full px-2 py-1 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[11px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
        />
        <div className="flex gap-1 items-center">
          <input
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="Min $"
            className="flex-1 min-w-0 px-1.5 py-1 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[10px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
          />
          <span className="text-zinc-700 text-[9px]">—</span>
          <input
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Max $"
            className="flex-1 min-w-0 px-1.5 py-1 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[10px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
          />
          <button
            onClick={() => setSortDir((p) => (p === "asc" ? "desc" : "asc"))}
            className={`px-2 py-1 rounded-sm border text-[11px] font-mono transition-colors shrink-0 ${
              sortDir === "asc"
                ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                : "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
            }`}
            title={sortDir === "asc" ? "Menor a mayor" : "Mayor a menor"}
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
        </div>
        {/* Filtro seguro (solo en tab Naves) */}
        {tab === "ships" && (
          <select
            value={insFilter}
            onChange={(e) => setInsFilter(e.target.value as InsFilter)}
            className="w-full px-1.5 py-1 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[10px] text-zinc-300 focus:outline-none focus:border-emerald-500/50"
            title="Filtro de seguro"
          >
            <option value="all">Seguro: Todos</option>
            <option value="LTI">LTI</option>
            <option value="120_months">120 months</option>
            <option value="72_months">72 months</option>
            <option value="48_months">48 months</option>
            <option value="24_months">24 months</option>
            <option value="6_months">6 months</option>
            <option value="3_months">3 months</option>
            <option value="unknown">Unknown</option>
          </select>
        )}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {loadingCatalog && (
          <p className="text-[11px] text-zinc-500 italic px-2 py-4 text-center">
            Cargando...
          </p>
        )}

        {!loadingCatalog && tab === "ships" && shipRows.length === 0 && (
          <p className="text-[11px] text-zinc-500 italic px-2 py-6 text-center leading-snug">
            Sin naves con esos filtros.
          </p>
        )}

        {!loadingCatalog && tab === "ccus" && ccuRows.length === 0 && (
          <p className="text-[11px] text-zinc-500 italic px-2 py-6 text-center leading-snug">
            Sin CCUs en el hangar.
          </p>
        )}

        {/* Tab Naves */}
        {tab === "ships" &&
          shipRows.map((row) => {
            const used = usedShipIds.has(row.ship.id);
            const insType = row.hangar.insuranceType;
            const insCls = INS_COLOR[insType];
            const insTag = INS_TAG[insType];
            return (
              <div
                key={row.hangar.id}
                draggable={!used}
                onDragStart={(e) => {
                  if (used) return;
                  e.dataTransfer.setData(SHIP_MIME, JSON.stringify(row.ship));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className={`flex items-center gap-2 p-1.5 rounded-sm border transition-colors ${
                  used
                    ? "bg-zinc-900/30 border-zinc-800/30 opacity-40 cursor-not-allowed"
                    : "bg-zinc-900/60 border-zinc-800/60 hover:border-amber-500/40 hover:bg-zinc-800/40 cursor-grab active:cursor-grabbing"
                }`}
                title={used ? "Ya está en la pizarra" : `Arrastrá tu ${row.ship.name} (${insTag}) a la pizarra`}
              >
                {row.ship.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.ship.imageUrl}
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
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className={`text-[8px] font-mono uppercase tracking-wider px-1 rounded-[2px] border ${insCls}`}>
                      {insTag}
                    </span>
                    <span className="text-[8px] font-mono uppercase tracking-wider px-1 rounded-[2px] bg-zinc-800/50 text-zinc-400 border border-zinc-700/50">
                      {row.hangar.location === "buyback" ? "BB" : "HGR"}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-100 truncate font-medium leading-tight">
                    {row.ship.name}
                  </p>
                  <p className="text-[9px] text-zinc-500 truncate italic leading-tight">
                    {row.ship.manufacturer ?? "—"}
                  </p>
                  <span className="text-[11px] font-mono font-bold text-amber-400">
                    ${row.ship.msrpUsd.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}

        {/* Tab CCUs */}
        {tab === "ccus" &&
          ccuRows.map((row) => {
            const draggable = !!row.fromShip && !!row.toShip;
            const kind: UpgradeKind = row.location === "buyback"
              ? "hanger"
              : row.isWarbond
              ? "warbond"
              : "normal";

            return (
              <div
                key={row.id}
                draggable={draggable}
                onDragStart={(e) => {
                  if (!draggable || !row.fromShip || !row.toShip) return;
                  const payload: HangarCcuPayload = {
                    from: row.fromShip,
                    to: row.toShip,
                    kind,
                    price: row.pricePaid,
                    owned: true,
                  };
                  e.dataTransfer.setData(HANGAR_CCU_MIME, JSON.stringify(payload));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className={`bg-zinc-900/60 border border-zinc-800/60 rounded-sm overflow-hidden transition-colors ${
                  draggable
                    ? "hover:border-cyan-500/40 cursor-grab active:cursor-grabbing"
                    : "opacity-50 cursor-not-allowed"
                }`}
                title={
                  draggable
                    ? `Arrastrá el CCU ${row.fromName} → ${row.toName} (bloque inmutable)`
                    : "Faltan datos en el catálogo"
                }
              >
                {/* Header con tipo + pagado */}
                <div className="px-2 py-1 bg-zinc-950/40 border-b border-zinc-800/40 flex items-center justify-between">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-400 truncate flex items-center gap-1">
                    🔒 {row.isWarbond ? "Warbond" : row.location === "buyback" ? "Buyback" : "Standard"}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-300 font-bold">
                    Pagaste ${row.pricePaid.toFixed(2)}
                  </span>
                </div>
                {/* FROM con MSRP */}
                <div className="flex items-center gap-1.5 p-1.5">
                  {row.fromShip?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.fromShip.imageUrl}
                      alt=""
                      className="w-10 h-7 object-cover rounded-sm border border-zinc-800/60 shrink-0"
                      draggable={false}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
                      }}
                    />
                  ) : (
                    <div className="w-10 h-7 rounded-sm bg-zinc-800/60 border border-zinc-800/60 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-zinc-200 truncate">{row.fromName}</p>
                    <p className="text-[9px] text-zinc-500 italic truncate">
                      {row.fromShip?.manufacturer ?? "—"}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400 shrink-0" title="Precio MSRP en tienda">
                    ${row.fromShip?.msrpUsd.toFixed(0) ?? "—"}
                  </span>
                </div>
                <div className="px-2 py-0.5 text-center text-[9px] font-mono text-cyan-500/70 border-y border-zinc-800/40">
                  ↓ Upgrade
                </div>
                {/* TO con MSRP */}
                <div className="flex items-center gap-1.5 p-1.5">
                  {row.toShip?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.toShip.imageUrl}
                      alt=""
                      className="w-10 h-7 object-cover rounded-sm border border-zinc-800/60 shrink-0"
                      draggable={false}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
                      }}
                    />
                  ) : (
                    <div className="w-10 h-7 rounded-sm bg-zinc-800/60 border border-zinc-800/60 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-cyan-300 truncate">{row.toName}</p>
                    <p className="text-[9px] text-zinc-500 italic truncate">
                      {row.toShip?.manufacturer ?? "—"}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400 shrink-0" title="Precio MSRP en tienda">
                    ${row.toShip?.msrpUsd.toFixed(0) ?? "—"}
                  </span>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
