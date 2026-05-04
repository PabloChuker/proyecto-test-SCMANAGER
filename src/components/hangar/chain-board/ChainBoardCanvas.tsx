"use client";

// =============================================================================
// SC LABS — ChainBoardCanvas (CB.4)
//
// Pizarra central — donde se arman las cadenas visuales.
// Cards apiladas verticalmente con flechas verde (CCU disponible),
// azul (CCU owned), o roja (gap inválido).
//
// Cada vez que cambian los cards, llamamos a /api/ccu/validate-edges con
// todos los pares adyacentes para pintar la flecha apropiada y mostrar
// precio + razón del fail.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useHangarStore, type HangarCCU } from "@/store/useHangarStore";
import { getShipThumbUrl } from "../HangarShipCard";
import type { BoardCard, BoardShipRow, EdgeValidation } from "./types";

interface ChainBoardCanvasProps {
  cards: BoardCard[];
  onRemove: (cardId: string) => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
  onInsertAt: (idx: number, ship: Omit<BoardCard, "cardId">) => void;
  /** CB.8g (2026-05-04): cuando el user dropea un CCU desde el inventario,
   *  el canvas mete las dos naves al board en orden. El handler vive en el
   *  Workspace (mismo que el botón "+ Pizarra"). */
  onAddCcuPair?: (
    fromShip: Omit<BoardCard, "cardId">,
    toShip: Omit<BoardCard, "cardId">,
  ) => void;
}

// CB.8g: MIME type custom para drag-and-drop de CCUs. dataTransfer.types
// tiene un check "includes" así que el match es exacto.
const CCU_PAIR_MIME = "application/x-sc-ccu-pair";

export function ChainBoardCanvas({ cards, onRemove, onReorder, onInsertAt, onAddCcuPair }: ChainBoardCanvasProps) {
  const isEmpty = cards.length === 0;
  const ccus = useHangarStore((s) => s.ccus);

  // ─── Validation ───────────────────────────────────────────────────────────
  // Cada vez que cambian los cards o los owned CCUs, validamos los pares
  // adyacentes. Usamos un debounce trivial para no spamear la API mientras
  // el user reordena rápido.
  const [validations, setValidations] = useState<EdgeValidation[]>([]);
  const [validating, setValidating] = useState(false);

  // Key estable que cambia cuando cambia la secuencia de shipIds
  const sequenceKey = useMemo(
    () => cards.map((c) => c.shipId).join("|"),
    [cards],
  );

  useEffect(() => {
    if (cards.length < 2) {
      setValidations([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setValidating(true);
      try {
        const pairs = [];
        for (let i = 0; i < cards.length - 1; i++) {
          pairs.push({
            fromShipId: cards[i].shipId,
            toShipId: cards[i + 1].shipId,
          });
        }
        const ownedPayload = ccus.map((c: HangarCCU) => ({
          fromShip: c.fromShip,
          toShip: c.toShip,
          pricePaid: c.pricePaid,
          location: c.location,
        }));
        const r = await fetch("/api/ccu/validate-edges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pairs, ownedCCUs: ownedPayload }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!cancelled) setValidations(j.results ?? []);
      } catch {
        if (!cancelled) setValidations([]);
      } finally {
        if (!cancelled) setValidating(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequenceKey, ccus.length]);

  // ─── Reorder via simple HTML5 drag ─────────────────────────────────────
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // CB.8g (2026-05-04): drop zone para CCUs arrastrados desde el inventario.
  // isDragOverCcu marca el container con un highlight cuando el user está
  // arrastrando un CCU encima — feedback visual fundamental para que el
  // gesto se "sienta natural" (Pablo: "esto de clikear es molesto prefiero
  // arrastrarlo se siente mas natural").
  const [isDragOverCcu, setIsDragOverCcu] = useState(false);

  /** True si el dataTransfer del evento contiene un CCU pair (no otro
   *  tipo de drag — ej. la reorder interna usa otro mecanismo). */
  const hasCcuPayload = (e: React.DragEvent): boolean => {
    return Array.from(e.dataTransfer.types).includes(CCU_PAIR_MIME);
  };

  const handleCcuDragOver = (e: React.DragEvent) => {
    if (!hasCcuPayload(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isDragOverCcu) setIsDragOverCcu(true);
  };

  const handleCcuDragLeave = (e: React.DragEvent) => {
    // Solo limpiar el highlight cuando el cursor sale del container — no
    // de un hijo. relatedTarget=null o fuera de currentTarget = leave real.
    if (
      !e.relatedTarget ||
      !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)
    ) {
      setIsDragOverCcu(false);
    }
  };

  const handleCcuDrop = (e: React.DragEvent) => {
    if (!hasCcuPayload(e)) return;
    e.preventDefault();
    setIsDragOverCcu(false);
    const raw = e.dataTransfer.getData(CCU_PAIR_MIME);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as {
        from?: Omit<BoardCard, "cardId">;
        to?: Omit<BoardCard, "cardId">;
      };
      if (payload.from && payload.to && onAddCcuPair) {
        onAddCcuPair(payload.from, payload.to);
      }
    } catch {
      // Silenciamos — payload corrupto no rompe la UI.
    }
  };

  // ─── Totales ──────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let valid = 0;
    let invalid = 0;
    let owned = 0;
    let cost = 0;
    let allValid = validations.length > 0;
    for (const v of validations) {
      if (v.status === "valid") {
        valid++;
        cost += v.minPrice ?? 0;
      } else if (v.status === "valid-owned") {
        owned++;
        // CCUs owned no se cuentan como costo nuevo (ya se pagó)
      } else {
        invalid++;
        allValid = false;
      }
    }
    return { valid, invalid, owned, cost, allValid: allValid && invalid === 0 };
  }, [validations]);

  return (
    <div
      className={`relative h-full bg-gradient-to-b from-zinc-900/50 to-zinc-950/30 border rounded-sm flex flex-col transition-colors ${
        isDragOverCcu
          ? "border-amber-500/70 ring-2 ring-amber-500/40 bg-amber-500/5"
          : "border-zinc-800/60"
      }`}
      onDragOver={handleCcuDragOver}
      onDragLeave={handleCcuDragLeave}
      onDrop={handleCcuDrop}
    >
      {/* CB.8g: indicador de drop activo — overlay sutil cuando el user
          está arrastrando un CCU encima del canvas. */}
      {isDragOverCcu && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
          <div className="bg-amber-500/15 border border-amber-500/50 rounded-sm px-4 py-2 backdrop-blur-sm">
            <span className="text-[12px] font-mono uppercase tracking-wider text-amber-300">
              ⬇ Soltá para agregar el CCU
            </span>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-zinc-800/50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🎨</span>
            <h2 className="text-[12px] font-semibold tracking-wide text-zinc-200">
              Pizarra · {cards.length} {cards.length === 1 ? "paso" : "pasos"}
            </h2>
            {validating && (
              <span className="w-3 h-3 border-2 border-zinc-700 border-t-amber-400 rounded-full animate-spin" />
            )}
          </div>
          {!isEmpty && cards.length >= 2 && (
            <span className="text-[10px] text-zinc-500 font-mono truncate max-w-[60%]">
              {cards[0].shipName} → {cards[cards.length - 1].shipName}
            </span>
          )}
        </div>

        {cards.length >= 2 && validations.length > 0 && (
          <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono">
            <span
              className={`px-1.5 py-0.5 rounded-sm border ${
                totals.allValid
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  : "bg-rose-500/15 text-rose-300 border-rose-500/30"
              }`}
            >
              {totals.allValid ? "✓ Cadena válida" : `${totals.invalid} gap${totals.invalid === 1 ? "" : "s"}`}
            </span>
            <span className="text-zinc-500">
              {totals.valid}✓ · {totals.owned}📌 · {totals.invalid}✗
            </span>
            {totals.allValid && totals.cost > 0 && (
              <span className="text-amber-300 ml-auto">
                ${totals.cost.toFixed(0)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8 mx-3 my-3 border border-dashed border-zinc-800/60 rounded-sm">
          <span className="text-3xl mb-3 opacity-40">🎯</span>
          <p className="text-sm font-medium text-zinc-400 mb-1.5">
            Empezá tu cadena
          </p>
          <p className="text-[11px] text-zinc-500 leading-relaxed max-w-[280px]">
            Hacé click en cualquier nave del{" "}
            <span className="text-zinc-300">📦 inventario</span> o de la{" "}
            <span className="text-zinc-300">🛒 store</span> para agregarla.
            La primera será tu base, la última tu objetivo.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-0">
            {cards.map((card, i) => {
              const validation = i < cards.length - 1 ? validations[i] : null;
              const isLast = i === cards.length - 1;
              return (
                <li key={card.cardId}>
                  <CanvasCard
                    card={card}
                    index={i}
                    isFirst={i === 0}
                    isLast={isLast}
                    onRemove={onRemove}
                    isDragging={dragIdx === i}
                    isDragOver={dragOverIdx === i}
                    onDragStart={() => setDragIdx(i)}
                    onDragEnd={() => {
                      setDragIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverIdx(i);
                    }}
                    onDrop={() => {
                      if (dragIdx !== null && dragIdx !== i) {
                        onReorder(dragIdx, i);
                      }
                      setDragIdx(null);
                      setDragOverIdx(null);
                    }}
                  />
                  {!isLast && validation && (
                    <ArrowAndInsert
                      validation={validation}
                      fromShip={card}
                      toShip={cards[i + 1]}
                      ownedCCUs={ccus}
                      onInsertAt={(ship) => onInsertAt(i + 1, ship)}
                    />
                  )}
                  {!isLast && !validation && validating && (
                    <div className="my-1.5 ml-4 text-[10px] text-zinc-600 italic">
                      validando…
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Card individual ──────────────────────────────────────────────────────

function CanvasCard({
  card,
  index,
  isFirst,
  isLast,
  onRemove,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  card: BoardCard;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onRemove: (cardId: string) => void;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  const role = isFirst ? "BASE" : isLast ? "TARGET" : `STEP ${index}`;
  const roleColor = isFirst
    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
    : isLast
    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
    : "bg-zinc-800/60 text-zinc-400 border-zinc-700/50";

  const originIcon = card.origin === "fleet" ? "📦" : card.origin === "store" ? "🛒" : "✏️";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`bg-zinc-900/60 border rounded-sm p-2.5 flex items-center gap-3 transition-all ${
        isDragging
          ? "opacity-40 border-amber-500/60"
          : isDragOver
          ? "border-cyan-500/60 bg-cyan-500/5"
          : "border-zinc-800/60 hover:border-zinc-700/80"
      } cursor-grab active:cursor-grabbing`}
    >
      <span className="text-zinc-600 shrink-0" title="Arrastrá para reordenar">⋮⋮</span>
      {card.imageUrl ? (
        <img
          src={card.imageUrl}
          alt={card.shipName}
          className="w-12 h-12 object-cover rounded-sm border border-zinc-800/60 shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.opacity = "0.2";
          }}
        />
      ) : (
        <div className="w-12 h-12 bg-zinc-800/50 border border-zinc-700/50 rounded-sm flex items-center justify-center text-zinc-600 shrink-0">
          🚀
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className={`text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-[2px] border ${roleColor}`}
          >
            {role}
          </span>
          <span className="text-[10px] text-zinc-500" title={`Origen: ${card.origin}`}>
            {originIcon}
          </span>
        </div>
        <p className="text-[12px] text-zinc-100 truncate">{card.shipName}</p>
        <p className="text-[10px] text-zinc-500 font-mono">
          ${card.msrpUsd.toLocaleString()}
          {card.warbondUsd != null && card.warbondUsd !== card.msrpUsd && (
            <span className="text-cyan-400 ml-1.5">
              WB ${card.warbondUsd.toLocaleString()}
            </span>
          )}
        </p>
      </div>
      <button
        onClick={() => onRemove(card.cardId)}
        className="text-[10px] text-zinc-500 hover:text-rose-400 px-1.5 py-0.5 rounded shrink-0 transition-colors"
        title="Quitar de la pizarra"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Flecha + insert + sugerencias ─────────────────────────────────────────

function ArrowAndInsert({
  validation,
  fromShip,
  toShip,
  ownedCCUs,
  onInsertAt,
}: {
  validation: EdgeValidation;
  fromShip: BoardCard;
  toShip: BoardCard;
  ownedCCUs: HangarCCU[];
  onInsertAt: (ship: Omit<BoardCard, "cardId">) => void;
}) {
  const isValid = validation.status === "valid";
  const isOwned = validation.status === "valid-owned";
  const isInvalid = validation.status === "invalid";
  const [showInsertSearch, setShowInsertSearch] = useState(false);

  const color = isValid
    ? "text-emerald-400 border-emerald-500/40"
    : isOwned
    ? "text-cyan-400 border-cyan-500/40"
    : "text-rose-400 border-rose-500/40";

  const bg = isValid
    ? "bg-emerald-500/5"
    : isOwned
    ? "bg-cyan-500/5"
    : "bg-rose-500/10";

  const icon = isOwned ? "📌" : isInvalid ? "✗" : "↓";
  const label = isOwned
    ? "Ya tenés este CCU"
    : isInvalid
    ? "Gap"
    : validation.bestPriceKind === "warbond"
    ? "Warbond"
    : "Standard";

  // CB.5: Sugerencias contextuales para gaps inválidos.
  // Buscar CCUs owned cuyo fromShip == fromShip.shipName (chained) o
  // toShip == toShip.shipName (cubre directo). Limitado a 3.
  const ownedSuggestions = useMemo(() => {
    if (!isInvalid) return [] as HangarCCU[];
    const fromName = fromShip.shipName.toLowerCase();
    const toName = toShip.shipName.toLowerCase();
    const matches: HangarCCU[] = [];
    for (const ccu of ownedCCUs) {
      const cFrom = ccu.fromShip.toLowerCase();
      const cTo = ccu.toShip.toLowerCase();
      // Match útil: el CCU empieza desde fromShip o termina en toShip
      // (puede servir como puente si insertamos su otro extremo)
      if (cFrom === fromName || cTo === toName) {
        matches.push(ccu);
        if (matches.length >= 3) break;
      }
    }
    return matches;
  }, [isInvalid, fromShip.shipName, toShip.shipName, ownedCCUs]);

  return (
    <div className="ml-5 my-1">
      <div
        className={`px-2 py-1 border-l-2 flex items-center gap-2 text-[10px] font-mono ${color} ${bg}`}
        title={validation.reason}
      >
        <span className="text-base">{icon}</span>
        <span>{label}</span>
        {validation.minPrice != null && (
          <span className="text-zinc-200 font-bold ml-auto">
            ${validation.minPrice.toFixed(0)}
          </span>
        )}
        {isInvalid && (
          <span
            className="text-rose-300/80 ml-auto truncate max-w-[180px]"
            title={validation.reason}
          >
            {validation.reason.length > 40
              ? validation.reason.slice(0, 38) + "…"
              : validation.reason}
          </span>
        )}
      </div>

      {/* Botón "+ insertar paso" */}
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={() => setShowInsertSearch((v) => !v)}
          className="text-[10px] px-2 py-0.5 bg-zinc-900/60 border border-zinc-800/60 rounded-sm text-zinc-400 hover:text-amber-300 hover:border-amber-500/40 transition-colors"
          title="Insertar nave intermedia entre estas dos"
        >
          {showInsertSearch ? "✕ cerrar" : "+ insertar paso"}
        </button>
        {ownedSuggestions.length > 0 && (
          <span className="text-[9px] text-cyan-400/80 font-mono">
            {ownedSuggestions.length} CCU owned podrían servir
          </span>
        )}
      </div>

      {/* Sugerencias de CCUs owned */}
      {ownedSuggestions.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {ownedSuggestions.map((ccu) => {
            // Sugerimos insertar la "otra punta" del CCU (la que NO es ya un endpoint)
            const fromMatches = ccu.fromShip.toLowerCase() === fromShip.shipName.toLowerCase();
            const otherName = fromMatches ? ccu.toShip : ccu.fromShip;
            const otherRef = fromMatches ? ccu.toShipReference : ccu.fromShipReference;
            return (
              <button
                key={ccu.id}
                onClick={() => {
                  // Construir BoardCard con datos mínimos. Sin lookup contra
                  // catálogo en este punto — el shipId va a ser igual a ref
                  // (string), y la validación lo flagueará si no matchea.
                  // En la práctica el user debería ya haberlo insertado desde
                  // el inventario; este botón es atajo.
                  onInsertAt({
                    shipId: otherRef, // best-effort
                    shipName: otherName,
                    shipReference: otherRef,
                    manufacturer: null,
                    msrpUsd: 0,
                    warbondUsd: null,
                    imageUrl: getShipThumbUrl(otherName),
                    origin: "manual",
                    sourceItemId: ccu.id,
                  });
                }}
                className="w-full text-left text-[10px] px-2 py-1 bg-cyan-500/5 border border-cyan-500/20 rounded-sm text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-500/40 transition-colors flex items-center gap-1"
                title={`Insertar ${otherName} usando tu CCU owned (${ccu.fromShip} → ${ccu.toShip}, $${ccu.pricePaid})`}
              >
                <span className="text-[10px]">📌</span>
                <span className="truncate">+ {otherName}</span>
                <span className="text-cyan-400/60 ml-auto shrink-0">
                  ${ccu.pricePaid.toFixed(0)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Buscador inline para insertar nave manual */}
      {showInsertSearch && (
        <InsertShipSearch
          fromMsrp={fromShip.msrpUsd}
          toMsrp={toShip.msrpUsd}
          onPick={(ship) => {
            onInsertAt(ship);
            setShowInsertSearch(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Inline ship search para insertar paso intermedio ──────────────────────

function InsertShipSearch({
  fromMsrp,
  toMsrp,
  onPick,
}: {
  fromMsrp: number;
  toMsrp: number;
  onPick: (ship: Omit<BoardCard, "cardId">) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BoardShipRow[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(
          `/api/ccu/ships?search=${encodeURIComponent(query)}&minPrice=${fromMsrp}&maxPrice=${toMsrp}`,
        );
        if (!r.ok) throw new Error("search fail");
        const j = await r.json();
        const arr = Array.isArray(j?.ships) ? j.ships : [];
        if (!cancelled) {
          setResults(
            arr.slice(0, 8).map((x: any) => ({
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
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, fromMsrp, toMsrp]);

  return (
    <div className="mt-1 bg-zinc-900/70 border border-amber-500/30 rounded-sm p-1.5">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Buscar nave entre $${fromMsrp.toFixed(0)} y $${toMsrp.toFixed(0)}…`}
        autoFocus
        className="w-full px-2 py-1 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[10px] font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
      />
      {searching && (
        <p className="text-[9px] text-zinc-500 italic px-1 py-0.5 mt-1">buscando…</p>
      )}
      {results.length > 0 && (
        <div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
          {results.map((s) => (
            <button
              key={s.id}
              onClick={() =>
                onPick({
                  shipId: s.id,
                  shipName: s.name,
                  shipReference: s.reference,
                  manufacturer: s.manufacturer,
                  msrpUsd: s.msrpUsd,
                  warbondUsd: s.warbondUsd,
                  imageUrl: getShipThumbUrl(s.name),
                  origin: "manual",
                })
              }
              className="w-full text-left text-[10px] px-2 py-1 bg-zinc-900/60 border border-zinc-800/40 rounded-sm text-zinc-200 hover:bg-zinc-800/60 hover:border-amber-500/40 transition-colors flex items-center gap-1.5"
            >
              <span className="truncate flex-1">{s.name}</span>
              <span className="text-amber-400/80 font-mono shrink-0">${s.msrpUsd}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
