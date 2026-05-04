"use client";

// =============================================================================
// SC LABS — ChainBoardWorkspace (CB.1)
//
// Orquestador de la pizarra de CCU. Layout 3-columnas:
//   - Izquierda: Mi Inventario (ships + CCUs del hangar/buyback) — CB.2
//   - Centro:    Pizarra con cards encadenadas + flechas — CB.4
//   - Derecha:   Naves en venta en RSI (cacheado de wiki, scraper en CB.6) — CB.3
//
// El estado del board (`cards: BoardCard[]`) vive acá y se pasa a los hijos.
// El click en una card del costado izquierdo o derecho llama a `addCard()`.
// La pizarra puede pedir reorder/insert/remove via callbacks.
//
// Mobile: las 3 columnas colapsan a 3 tabs (Inventario / Pizarra / RSI).
// =============================================================================

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useHangarStore, type HangarCCU } from "@/store/useHangarStore";
import { getShipThumbUrl } from "../HangarShipCard";
import type { BoardCard } from "./types";
import { ChainBoardInventoryColumn } from "./ChainBoardInventoryColumn";
import { ChainBoardStoreColumn } from "./ChainBoardStoreColumn";
import { ChainBoardCanvas } from "./ChainBoardCanvas";

type MobileTab = "inventory" | "canvas" | "store";

const cardId = () => `card_${Math.random().toString(36).slice(2, 10)}`;

export function ChainBoardWorkspace() {
  // ─── State ────────────────────────────────────────────────────────────────
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [mobileTab, setMobileTab] = useState<MobileTab>("canvas");
  const [autoSuggesting, setAutoSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [chainName, setChainName] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const ccus = useHangarStore((s) => s.ccus);
  const addChain = useHangarStore((s) => s.addChain);

  // ─── Mutations ────────────────────────────────────────────────────────────

  /**
   * Añade una nave a la pizarra. Por default va al final (target).
   * Si el board está vacío, se considera "base ship".
   */
  const addCard = useCallback(
    (ship: Omit<BoardCard, "cardId">) => {
      setCards((prev) => {
        // No agregar si ya está en la pizarra (por shipId)
        if (prev.some((c) => c.shipId === ship.shipId)) return prev;
        return [...prev, { ...ship, cardId: cardId() }];
      });
      // En mobile saltar a la canvas para ver el resultado
      setMobileTab("canvas");
    },
    [],
  );

  /** Elimina una card por cardId. */
  const removeCard = useCallback((cId: string) => {
    setCards((prev) => prev.filter((c) => c.cardId !== cId));
  }, []);

  /** Reordena las cards (drag & drop). */
  const reorderCards = useCallback((fromIdx: number, toIdx: number) => {
    setCards((prev) => {
      if (fromIdx === toIdx) return prev;
      if (fromIdx < 0 || fromIdx >= prev.length) return prev;
      if (toIdx < 0 || toIdx >= prev.length) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  /** Inserta una card en una posición específica (entre dos cards). */
  const insertCardAt = useCallback(
    (idx: number, ship: Omit<BoardCard, "cardId">) => {
      setCards((prev) => {
        if (prev.some((c) => c.shipId === ship.shipId)) return prev;
        const next = prev.slice();
        next.splice(idx, 0, { ...ship, cardId: cardId() });
        return next;
      });
      setMobileTab("canvas");
    },
    [],
  );

  /** Vacía la pizarra. */
  const clearBoard = useCallback(() => {
    setCards([]);
    setStatusMessage(null);
  }, []);

  // ─── Auto-suggest (CB.5) ─────────────────────────────────────────────────
  // Toma el primer y último card de la pizarra como base/target y corre el
  // solver clásico. Reemplaza los intermedios con la cadena óptima.
  const runAutoSuggest = useCallback(async () => {
    if (cards.length < 2) {
      setStatusMessage({
        kind: "err",
        text: "Necesitás al menos una nave base y una target en la pizarra.",
      });
      return;
    }
    const base = cards[0];
    const target = cards[cards.length - 1];
    setAutoSuggesting(true);
    setStatusMessage(null);
    try {
      const ownedCCUs = ccus.map((c: HangarCCU) => ({
        fromShip: c.fromShip,
        toShip: c.toShip,
        pricePaid: c.pricePaid,
        location: c.location,
      }));
      const r = await fetch("/api/ccu/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromShipId: base.shipId,
          toShipId: target.shipId,
          ownedCCUs,
          preferWarbond: true,
          hasBuybackToken: false,
          paymentPriority: "balanced",
          onlyAvailable: true,
          maxSteps: 15,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.chain) {
        throw new Error(data.error || "El solver no encontró cadena válida.");
      }

      // Reconstruimos el board: base + intermedios del solver + target.
      // El solver devuelve steps con fromShip/toShip; los intermedios son
      // los toShip de cada step EXCEPTO el último (que es el target).
      const solverSteps = data.chain.steps as Array<{
        toShip: { id: string; name: string; manufacturer: string | null; msrpUsd: number; warbondUsd: number | null; reference: string };
      }>;
      const newCards: BoardCard[] = [base];
      for (let i = 0; i < solverSteps.length - 1; i++) {
        const s = solverSteps[i].toShip;
        newCards.push({
          cardId: cardId(),
          shipId: s.id,
          shipName: s.name,
          shipReference: s.reference,
          manufacturer: s.manufacturer,
          msrpUsd: s.msrpUsd,
          warbondUsd: s.warbondUsd,
          imageUrl: getShipThumbUrl(s.name),
          origin: "manual",
        });
      }
      newCards.push(target);
      setCards(newCards);
      setStatusMessage({
        kind: "ok",
        text: `Sugerencia lista: ${solverSteps.length} pasos · costo $${data.chain.totalCost.toFixed(0)}`,
      });
    } catch (e: any) {
      setStatusMessage({
        kind: "err",
        text: e.message || "No se pudo correr el solver.",
      });
    } finally {
      setAutoSuggesting(false);
    }
  }, [cards, ccus]);

  // ─── Save chain (CB.5) ───────────────────────────────────────────────────
  const saveChain = useCallback(() => {
    if (cards.length < 2) {
      setStatusMessage({
        kind: "err",
        text: "La cadena necesita al menos base y target.",
      });
      return;
    }
    if (!chainName.trim()) {
      setStatusMessage({ kind: "err", text: "Poné un nombre a la cadena." });
      return;
    }
    setSaving(true);
    try {
      const base = cards[0];
      const target = cards[cards.length - 1];
      const steps = [];
      for (let i = 0; i < cards.length - 1; i++) {
        const from = cards[i];
        const to = cards[i + 1];
        // Si tenemos un owned CCU que cubre este par, lo marcamos.
        const owned = ccus.find(
          (c) =>
            c.fromShip.toLowerCase() === from.shipName.toLowerCase() &&
            c.toShip.toLowerCase() === to.shipName.toLowerCase(),
        );
        steps.push({
          fromShip: from.shipName,
          fromShipReference: from.shipReference,
          toShip: to.shipName,
          toShipReference: to.shipReference,
          ccuPrice: owned?.pricePaid ?? Math.max(0, to.msrpUsd - from.msrpUsd),
          isOwned: !!owned,
          isCompleted: false,
          isWarbond: owned?.isWarbond ?? false,
        });
      }
      addChain({
        name: chainName.trim(),
        startShip: base.shipName,
        startShipReference: base.shipReference,
        targetShip: target.shipName,
        targetShipReference: target.shipReference,
        steps,
        status: "planning",
      });
      setStatusMessage({
        kind: "ok",
        text: `Cadena "${chainName.trim()}" guardada en Mi Hangar.`,
      });
      setChainName("");
      setShowSaveDialog(false);
    } catch (e: any) {
      setStatusMessage({
        kind: "err",
        text: e.message || "No se pudo guardar.",
      });
    } finally {
      setSaving(false);
    }
  }, [cards, chainName, ccus, addChain]);

  // ─── Derived ──────────────────────────────────────────────────────────────
  const isEmpty = cards.length === 0;

  // Set de shipIds ya en el board — los hijos lo usan para deshabilitar cards
  // que ya fueron agregadas.
  const usedShipIds = useMemo(
    () => new Set(cards.map((c) => c.shipId)),
    [cards],
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-2xl">🎨</span>
            <h1 className="text-lg sm:text-xl font-semibold text-zinc-100 tracking-wide">
              CCU Chain Board
            </h1>
            <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-amber-500/15 text-amber-300 border border-amber-500/30">
              Beta
            </span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Armá tu cadena visualmente — arrastrá ships del inventario o de RSI store al centro.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {cards.length >= 2 && (
            <button
              onClick={runAutoSuggest}
              disabled={autoSuggesting}
              className="text-[11px] px-3 py-1.5 bg-amber-500/15 border border-amber-500/40 rounded-sm text-amber-300 hover:bg-amber-500/25 hover:border-amber-500/60 transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center gap-1.5"
              title="Corre el solver y rellena los pasos intermedios entre la nave base y la target"
            >
              {autoSuggesting ? (
                <span className="w-3 h-3 border-2 border-amber-500/30 border-t-amber-300 rounded-full animate-spin" />
              ) : (
                <span>⚡</span>
              )}
              Sugerencia auto
            </button>
          )}
          {cards.length >= 2 && (
            <button
              onClick={() => setShowSaveDialog(true)}
              className="text-[11px] px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/40 rounded-sm text-emerald-300 hover:bg-emerald-500/25 hover:border-emerald-500/60 transition-colors flex items-center gap-1.5"
            >
              💾 Guardar
            </button>
          )}
          {!isEmpty && (
            <button
              onClick={clearBoard}
              className="text-[10px] px-2.5 py-1.5 bg-zinc-900/60 border border-zinc-700/60 rounded-sm text-zinc-400 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
            >
              Vaciar
            </button>
          )}
          <Link
            href="/hangar?tab=ccu-chains"
            className="text-[10px] px-2.5 py-1.5 bg-zinc-900/60 border border-zinc-700/60 rounded-sm text-zinc-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
          >
            ← Calculator clásico
          </Link>
        </div>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div
          className={`px-3 py-2 rounded-sm border text-[11px] ${
            statusMessage.kind === "ok"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          {statusMessage.text}
          <button
            onClick={() => setStatusMessage(null)}
            className="float-right text-zinc-500 hover:text-zinc-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm w-full max-w-md p-5 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-100">Guardar cadena</h3>
            <p className="text-[11px] text-zinc-400">
              Va a aparecer en <span className="text-cyan-300">Cadenas Guardadas</span> con
              status "Planning". Podés trackear el progreso desde ahí.
            </p>
            <input
              type="text"
              value={chainName}
              onChange={(e) => setChainName(e.target.value)}
              placeholder="Nombre de la cadena (ej. 'Hacia Polaris LTI')"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[12px] font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/50"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="text-[11px] px-3 py-1.5 text-zinc-400 hover:text-zinc-200"
              >
                Cancelar
              </button>
              <button
                onClick={saveChain}
                disabled={saving || !chainName.trim()}
                className="text-[11px] px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/40 rounded-sm text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile tab switcher (oculto en md+) */}
      <div className="md:hidden flex items-center gap-1 p-1 bg-zinc-900/60 border border-zinc-800/60 rounded-sm">
        {(
          [
            { id: "inventory", label: "Mi Inventario", icon: "📦" },
            { id: "canvas", label: "Pizarra", icon: "🎨" },
            { id: "store", label: "RSI Store", icon: "🛒" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setMobileTab(t.id)}
            className={`flex-1 text-[11px] py-1.5 rounded-sm transition-colors ${
              mobileTab === t.id
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <span className="mr-1">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* 3-column grid (desktop) / single panel (mobile) */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr_280px] lg:grid-cols-[320px_1fr_320px] gap-3">
        {/* Left — Mi Inventario */}
        <section
          className={`min-h-[400px] ${mobileTab !== "inventory" ? "hidden md:block" : ""}`}
        >
          <ChainBoardInventoryColumn
            usedShipIds={usedShipIds}
            onAddCard={addCard}
          />
        </section>

        {/* Center — Pizarra */}
        <section
          className={`min-h-[400px] ${mobileTab !== "canvas" ? "hidden md:block" : ""}`}
        >
          <ChainBoardCanvas
            cards={cards}
            onRemove={removeCard}
            onReorder={reorderCards}
            onInsertAt={insertCardAt}
          />
        </section>

        {/* Right — En venta RSI */}
        <section
          className={`min-h-[400px] ${mobileTab !== "store" ? "hidden md:block" : ""}`}
        >
          <ChainBoardStoreColumn
            usedShipIds={usedShipIds}
            onAddCard={addCard}
          />
        </section>
      </div>
    </div>
  );
}
