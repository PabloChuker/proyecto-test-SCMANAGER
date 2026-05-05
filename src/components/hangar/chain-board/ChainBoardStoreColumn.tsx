"use client";

// =============================================================================
// SC LABS — ChainBoardStoreColumn (CB.8 — CCU Builder estilo RSI)
//
// Reemplazo de la versión MVP que listaba ships sueltos. Ahora es un
// constructor de CCU análogo al de RSI (robertsspaceindustries.com/pledge):
//
//   ┌──────────────────────────┐
//   │ FROM:                    │
//   │ [Mi Inventario] [Todas]  │ ← tabs
//   │ <search...>              │
//   │ [imagen + nombre]        │
//   ├──────────────────────────┤
//   │ TO:                      │
//   │ <search...>              │
//   │ [imagen + nombre]        │
//   ├──────────────────────────┤
//   │ Precio:                  │
//   │   ⚡ Warbond $X           │
//   │   📋 Standard $Y          │
//   │   📌 Owned (en hangar)   │
//   │ [+ Agregar a la pizarra] │
//   └──────────────────────────┘
//
// Cuando el board ya tiene cards, FROM se auto-rellena con el último card
// → el user solo elige el TO. "Cuál es tu próximo paso desde X?".
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useHangarStore } from "@/store/useHangarStore";
import { getShipThumbUrl } from "../HangarShipCard";
import type { BoardCard, BoardShipRow, EdgeValidation } from "./types";

interface ChainBoardStoreColumnProps {
  usedShipIds: Set<string>;
  onAddCard: (ship: Omit<BoardCard, "cardId">) => void;
  /** Último card de la pizarra. Se usa como auto-default del FROM. */
  lastBoardCard?: BoardCard | null;
}

type FromMode = "fleet" | "all";

export function ChainBoardStoreColumn({
  usedShipIds,
  onAddCard,
  lastBoardCard,
}: ChainBoardStoreColumnProps) {
  // ─── Catálogo de ships ────────────────────────────────────────────────
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
            pledgeAvailability: null,
          })),
        );
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoadingCatalog(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Mi flota como subset del catálogo (matched por nombre)
  const hangarShips = useHangarStore((s) => s.ships);
  const ccus = useHangarStore((s) => s.ccus);
  const myFleetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const hs of hangarShips) {
      if (hs.itemCategory !== "standalone_ship" && hs.itemCategory !== "game_package") continue;
      if (hs.isLoaner || hs.isLocked) continue;
      const name = hs.shipName.toLowerCase();
      const candidates = catalog.filter((s) => {
        const sName = s.name.toLowerCase();
        return (
          sName === name ||
          sName.endsWith(" " + name) ||
          name.endsWith(" " + sName.split(" ").slice(1).join(" ").toLowerCase())
        );
      });
      const match =
        candidates.find((s) => s.name.toLowerCase() === name) ??
        candidates.sort((a, b) => b.name.length - a.name.length)[0];
      if (match) ids.add(match.id);
    }
    return ids;
  }, [hangarShips, catalog]);

  // ─── State del builder ─────────────────────────────────────────────────
  const [fromMode, setFromMode] = useState<FromMode>("fleet");
  const [fromShip, setFromShip] = useState<BoardShipRow | null>(null);
  const [toShip, setToShip] = useState<BoardShipRow | null>(null);
  const [pricing, setPricing] = useState<EdgeValidation | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);

  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  // Auto-default FROM al último card del board cuando este existe y el user
  // todavía no eligió otro from.
  useEffect(() => {
    if (lastBoardCard && (!fromShip || fromShip.id === lastBoardCard.shipId === false)) {
      // Buscar el ship en el catálogo por shipId del último card
      const match = catalog.find((s) => s.id === lastBoardCard.shipId);
      if (match) {
        setFromShip(match);
        setFromMode(myFleetIds.has(match.id) ? "fleet" : "all");
      }
    }
    // Si no hay último card, dejar fromShip como está (puede ser elegido manual)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastBoardCard?.shipId, catalog]);

  // ─── Pricing fetch cuando from+to están definidos ──────────────────────
  useEffect(() => {
    if (!fromShip || !toShip) {
      setPricing(null);
      return;
    }
    let cancelled = false;
    setPricingLoading(true);
    const ownedPayload = ccus.map((c) => ({
      fromShip: c.fromShip,
      toShip: c.toShip,
      pricePaid: c.pricePaid,
      location: c.location,
      isWarbond: c.isWarbond,
      grantsInsurance: c.grantsInsurance,
    }));
    fetch("/api/ccu/validate-edges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairs: [{ fromShipId: fromShip.id, toShipId: toShip.id }],
        ownedCCUs: ownedPayload,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const result = j?.results?.[0] as EdgeValidation | undefined;
        setPricing(result ?? null);
      })
      .catch(() => {
        if (!cancelled) setPricing(null);
      })
      .finally(() => {
        if (!cancelled) setPricingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromShip?.id, toShip?.id, ccus.length]);

  // ─── Derived: opciones del FROM segun modo ─────────────────────────────
  const fromOptions = useMemo(() => {
    if (fromMode === "fleet") {
      return catalog.filter((s) => myFleetIds.has(s.id));
    }
    return catalog;
  }, [catalog, fromMode, myFleetIds]);

  const filteredFrom = useMemo(() => {
    const q = fromSearch.trim().toLowerCase();
    let arr = fromOptions;
    if (q) {
      arr = arr.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.manufacturer ?? "").toLowerCase().includes(q),
      );
    }
    return arr.slice(0, 30);
  }, [fromOptions, fromSearch]);

  // TO siempre del catálogo, filtrado por valor > FROM (RSI rule)
  const filteredTo = useMemo(() => {
    const q = toSearch.trim().toLowerCase();
    let arr = catalog;
    if (fromShip) {
      arr = arr.filter((s) => s.id !== fromShip.id && s.msrpUsd > fromShip.msrpUsd);
    }
    if (q) {
      arr = arr.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.manufacturer ?? "").toLowerCase().includes(q),
      );
    }
    return arr.slice(0, 30);
  }, [catalog, toSearch, fromShip]);

  // ─── Handler agregar a la pizarra ──────────────────────────────────────
  const canAdd = !!toShip && !usedShipIds.has(toShip.id);
  const handleAdd = () => {
    if (!toShip) return;
    onAddCard({
      shipId: toShip.id,
      shipName: toShip.name,
      shipReference: toShip.reference,
      manufacturer: toShip.manufacturer,
      msrpUsd: toShip.msrpUsd,
      warbondUsd: toShip.warbondUsd,
      imageUrl: getShipThumbUrl(toShip.name),
      origin: "store",
    });
    // Limpiar el TO y dejar el FROM como estaba para encadenar
    setToShip(null);
    setToSearch("");
  };

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="h-full bg-zinc-900/40 border border-zinc-800/60 rounded-sm flex flex-col">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-zinc-800/50">
        <div className="flex items-center gap-2">
          <span className="text-base">🛒</span>
          <h2 className="text-[12px] font-semibold tracking-wide text-zinc-200">
            Constructor de CCU
          </h2>
        </div>
        <p className="text-[10px] text-zinc-500 mt-1 leading-snug">
          Construí un CCU paso a paso (estilo RSI) y agregálo a la pizarra.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loadingCatalog && (
          <p className="text-[11px] text-zinc-500 italic px-2 py-4 text-center">
            Cargando catálogo…
          </p>
        )}

        {!loadingCatalog && (
          <>
            {/* ─── FROM panel ─── */}
            <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-sm p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                  FROM
                </span>
                {/* Tabs Mi Inventario / Todas */}
                <div className="flex items-center gap-0.5 bg-zinc-900/60 rounded-sm p-0.5">
                  <button
                    onClick={() => setFromMode("fleet")}
                    className={`text-[9px] px-1.5 py-0.5 rounded-sm transition-colors ${
                      fromMode === "fleet"
                        ? "bg-amber-500/20 text-amber-300"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Mi Flota ({myFleetIds.size})
                  </button>
                  <button
                    onClick={() => setFromMode("all")}
                    className={`text-[9px] px-1.5 py-0.5 rounded-sm transition-colors ${
                      fromMode === "all"
                        ? "bg-amber-500/20 text-amber-300"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Todas ({catalog.length})
                  </button>
                </div>
              </div>

              {fromShip ? (
                <SelectedShipCard
                  ship={fromShip}
                  onClear={() => {
                    setFromShip(null);
                    setFromOpen(true);
                  }}
                />
              ) : (
                <ShipSearchInput
                  value={fromSearch}
                  onChange={setFromSearch}
                  open={fromOpen}
                  setOpen={setFromOpen}
                  options={filteredFrom}
                  onPick={(s) => {
                    setFromShip(s);
                    setFromOpen(false);
                    setFromSearch("");
                  }}
                  placeholder={
                    fromMode === "fleet"
                      ? "Buscar en Mi Flota…"
                      : "Buscar nave (catálogo completo)…"
                  }
                />
              )}
            </div>

            {/* Connector */}
            <div className="flex items-center justify-center text-zinc-600 text-base">
              ↓
            </div>

            {/* ─── TO panel ─── */}
            <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-sm p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                  TO
                </span>
                {fromShip && (
                  <span className="text-[9px] text-zinc-600">
                    Ships valor &gt; ${fromShip.msrpUsd}
                  </span>
                )}
              </div>

              {toShip ? (
                <SelectedShipCard
                  ship={toShip}
                  onClear={() => {
                    setToShip(null);
                    setToOpen(true);
                  }}
                  draggableToCanvas
                />
              ) : (
                <ShipSearchInput
                  value={toSearch}
                  onChange={setToSearch}
                  open={toOpen}
                  setOpen={setToOpen}
                  options={filteredTo}
                  onPick={(s) => {
                    setToShip(s);
                    setToOpen(false);
                    setToSearch("");
                  }}
                  placeholder={fromShip ? "Buscar destino…" : "Elegí FROM primero"}
                  disabled={!fromShip}
                />
              )}
            </div>

            {/* ─── Pricing display ─── */}
            {fromShip && toShip && (
              <PricingPanel
                pricing={pricing}
                loading={pricingLoading}
                onAdd={handleAdd}
                canAdd={canAdd}
                alreadyOnBoard={toShip ? usedShipIds.has(toShip.id) : false}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponentes ─────────────────────────────────────────────────────────

function SelectedShipCard({
  ship,
  onClear,
  draggableToCanvas = false,
}: {
  ship: BoardShipRow;
  onClear: () => void;
  /** CB.10 Fase 2 (2026-05-05): si true, la card es draggable al canvas con
   *  el MIME 'application/x-sc-ship-card'. Solo lo activamos en el panel TO
   *  del Constructor — el FROM no, porque el FROM ya viene del board. */
  draggableToCanvas?: boolean;
}) {
  return (
    <div
      draggable={draggableToCanvas}
      onDragStart={
        draggableToCanvas
          ? (e) => {
              const payload = {
                shipId: ship.id,
                shipName: ship.name,
                shipReference: ship.reference,
                manufacturer: ship.manufacturer,
                msrpUsd: ship.msrpUsd,
                warbondUsd: ship.warbondUsd,
                imageUrl: getShipThumbUrl(ship.name),
                origin: "store" as const,
              };
              e.dataTransfer.setData(
                "application/x-sc-ship-card",
                JSON.stringify(payload),
              );
              e.dataTransfer.effectAllowed = "copy";
            }
          : undefined
      }
      className={`bg-zinc-900/60 border border-zinc-800/40 rounded-sm p-1.5 flex items-center gap-2 ${
        draggableToCanvas ? "cursor-grab active:cursor-grabbing hover:border-cyan-500/40" : ""
      }`}
      title={draggableToCanvas ? "Arrastrá esta nave a la pizarra o usá el botón ＋" : undefined}
    >
      <img
        src={getShipThumbUrl(ship.name)}
        alt=""
        className="w-12 h-12 object-cover rounded-sm border border-zinc-800/60 shrink-0"
        onError={(e) => {
          (e.target as HTMLImageElement).style.opacity = "0.2";
        }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-zinc-100 truncate">{ship.name}</p>
        <p className="text-[10px] text-zinc-500 font-mono">
          ${ship.msrpUsd.toLocaleString()}
          {ship.warbondUsd != null && ship.warbondUsd !== ship.msrpUsd && (
            <span className="text-cyan-400 ml-1.5">
              WB ${ship.warbondUsd.toLocaleString()}
            </span>
          )}
        </p>
      </div>
      <button
        onClick={onClear}
        className="text-zinc-500 hover:text-rose-300 text-[12px] px-1.5 py-0.5 rounded shrink-0 transition-colors"
        title="Cambiar"
      >
        ✕
      </button>
    </div>
  );
}

function ShipSearchInput({
  value,
  onChange,
  open,
  setOpen,
  options,
  onPick,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  options: BoardShipRow[];
  onPick: (s: BoardShipRow) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[11px] font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      {open && options.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-sm shadow-xl z-30 space-y-0.5 p-0.5">
          {options.map((s) => (
            <button
              key={s.id}
              onClick={() => onPick(s)}
              className="w-full text-left px-2 py-1.5 rounded-sm text-[11px] font-mono text-zinc-200 hover:bg-zinc-800/60 hover:text-cyan-300 flex items-center gap-2"
            >
              <img
                src={getShipThumbUrl(s.name)}
                alt=""
                className="w-7 h-7 object-cover rounded-sm border border-zinc-800/60 shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.opacity = "0.2";
                }}
              />
              <span className="flex-1 truncate">{s.name}</span>
              <span className="text-amber-400/80 shrink-0">${s.msrpUsd}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PricingPanel({
  pricing,
  loading,
  onAdd,
  canAdd,
  alreadyOnBoard,
}: {
  pricing: EdgeValidation | null;
  loading: boolean;
  onAdd: () => void;
  canAdd: boolean;
  alreadyOnBoard: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-sm p-2.5 text-center text-[11px] text-zinc-500 italic">
        <span className="inline-block w-3 h-3 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin mr-1.5" />
        Calculando precio…
      </div>
    );
  }
  if (!pricing) {
    return null;
  }

  const isOwned = pricing.status === "valid-owned";
  const isInvalid = pricing.status === "invalid";
  const standard = pricing.standardPrice;
  const warbond = pricing.warbondPrice;
  const warbondAvail = pricing.warbondAvailable;

  return (
    <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-sm p-2.5 space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
        Opciones de upgrade
      </div>

      {isOwned && (
        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-sm p-2 flex items-center gap-2">
          <span className="text-base">📌</span>
          <div className="flex-1">
            <p className="text-[11px] text-cyan-300 font-medium">
              Ya tenés este CCU en {pricing.ownedLocation}
            </p>
            <p className="text-[10px] text-zinc-400 font-mono">
              Pagaste ${pricing.ownedPricePaid?.toFixed(0)}
              {pricing.ownedIsWarbond && " · Warbond"}
              {pricing.ownedGrantsInsurance && (
                <span className="text-emerald-300 ml-1.5">
                  ⭐ otorga {pricing.ownedGrantsInsurance.replace("_", " ")}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {!isOwned && warbond != null && warbond > 0 && warbondAvail && (
        <div className="bg-cyan-500/5 border border-cyan-500/30 rounded-sm p-2 flex items-center gap-2">
          <span className="text-base">⚡</span>
          <span className="text-[11px] text-cyan-300 font-medium flex-1">Warbond</span>
          <span className="text-sm font-mono font-bold text-cyan-300">
            ${warbond.toFixed(0)}
          </span>
        </div>
      )}

      {!isOwned && standard != null && standard > 0 && (
        <div className="bg-zinc-900/40 border border-zinc-800/40 rounded-sm p-2 flex items-center gap-2">
          <span className="text-base">📋</span>
          <span className="text-[11px] text-zinc-300 font-medium flex-1">Standard</span>
          <span className="text-sm font-mono font-bold text-amber-300">
            ${standard.toFixed(0)}
          </span>
        </div>
      )}

      {isInvalid && !standard && !isOwned && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-sm p-2">
          <p className="text-[10px] text-rose-300 leading-snug">
            <span className="font-medium">Sin CCU directo disponible.</span>{" "}
            {pricing.reason}
          </p>
          <p className="text-[9px] text-zinc-500 mt-1">
            Igual podés agregarlo a la pizarra y la flecha aparecerá en rojo. Útil para
            armar la cadena teórica con pasos intermedios.
          </p>
        </div>
      )}

      {alreadyOnBoard && (
        <div className="text-[10px] text-zinc-500 italic">
          Ya está en la pizarra — quitalo primero para agregarlo de nuevo.
        </div>
      )}

      <button
        onClick={onAdd}
        disabled={!canAdd}
        className={`w-full px-3 py-2 rounded-sm text-[12px] font-medium transition-colors flex items-center justify-center gap-1.5 ${
          canAdd
            ? isOwned
              ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30"
              : "bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30"
            : "bg-zinc-900/40 border border-zinc-800/40 text-zinc-600 cursor-not-allowed"
        }`}
      >
        <span>＋</span>
        Agregar a la pizarra
      </button>
    </div>
  );
}
