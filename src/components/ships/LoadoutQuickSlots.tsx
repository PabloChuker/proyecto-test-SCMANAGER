"use client";

// =============================================================================
// SC LABS — LoadoutQuickSlots (2026-05-05)
//
// 6 slots de acceso rápido para naves+loadouts en el LoadoutBuilder. Permite
// pinear el ship+build actual en un slot y volver al toque con un click —
// ideal para comparar stats entre 2-3 naves rápido sin perder configs.
//
// Persistencia: localStorage `sc-labs-loadout-quick-slots-v1`.
// Cada slot: { shipReference, shipName, imageUrl, buildCode | null, savedAt }.
//
// Click en slot lleno    → navega a /loadout?ship=X&build=Y
// Click "+" en slot vacío → captura ship+build de la URL actual
// Hover ✕ en slot lleno   → libera el slot
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getShipThumbUrl } from "@/components/hangar/HangarShipCard";

const LS_KEY = "sc-labs-loadout-quick-slots-v1";
const SLOT_COUNT = 6;

interface QuickSlot {
  shipReference: string;
  shipName: string;
  imageUrl: string;
  /** Build code encoded en la URL (?build=). null si es loadout default. */
  buildCode: string | null;
  savedAt: string;
}

interface LoadoutQuickSlotsProps {
  /** Ship currently loaded — necesario para pinear. */
  currentShipReference: string | null;
  currentShipName: string | null;
}

export function LoadoutQuickSlots({
  currentShipReference,
  currentShipName,
}: LoadoutQuickSlotsProps) {
  const router = useRouter();
  const [slots, setSlots] = useState<(QuickSlot | null)[]>(() =>
    Array(SLOT_COUNT).fill(null),
  );
  const [hydrated, setHydrated] = useState(false);

  // Hidratar de localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Padear/truncar a SLOT_COUNT
          const next: (QuickSlot | null)[] = Array(SLOT_COUNT).fill(null);
          for (let i = 0; i < Math.min(SLOT_COUNT, parsed.length); i++) {
            const s = parsed[i];
            if (s && typeof s === "object" && s.shipReference && s.shipName) {
              next[i] = s as QuickSlot;
            }
          }
          setSlots(next);
        }
      }
    } catch {}
    setHydrated(true);
  }, []);

  // Persistir cuando cambian los slots
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(slots));
    } catch {}
  }, [slots, hydrated]);

  // Pin: captura ship + build code de la URL actual y lo guarda en el slot
  // dado. Si idx no se especifica, busca el primer slot vacío. Si no hay
  // ninguno libre, sobreescribe el más viejo.
  const pinCurrent = useCallback(
    (idx: number | null = null) => {
      if (!currentShipReference || !currentShipName) return;
      const url = new URL(window.location.href);
      const buildCode = url.searchParams.get("build");

      const newSlot: QuickSlot = {
        shipReference: currentShipReference,
        shipName: currentShipName,
        imageUrl: getShipThumbUrl(currentShipName),
        buildCode,
        savedAt: new Date().toISOString(),
      };

      setSlots((prev) => {
        const next = prev.slice();
        let target = idx;
        if (target === null) {
          target = next.findIndex((s) => s === null);
          if (target === -1) {
            // Todos llenos — sobrescribir el más viejo
            let oldestIdx = 0;
            let oldestAt = next[0]?.savedAt ?? new Date().toISOString();
            for (let i = 1; i < next.length; i++) {
              const at = next[i]?.savedAt;
              if (at && at < oldestAt) {
                oldestAt = at;
                oldestIdx = i;
              }
            }
            target = oldestIdx;
          }
        }
        // Si ya hay otro slot apuntando al mismo ship+build, lo dedupeamos
        for (let i = 0; i < next.length; i++) {
          if (i === target) continue;
          const s = next[i];
          if (
            s &&
            s.shipReference === newSlot.shipReference &&
            (s.buildCode ?? null) === (newSlot.buildCode ?? null)
          ) {
            next[i] = null;
          }
        }
        next[target] = newSlot;
        return next;
      });
    },
    [currentShipReference, currentShipName],
  );

  const clearSlot = useCallback((idx: number) => {
    setSlots((prev) => {
      const next = prev.slice();
      next[idx] = null;
      return next;
    });
  }, []);

  const navigateToSlot = useCallback(
    (idx: number) => {
      const slot = slots[idx];
      if (!slot) return;
      const url = new URL("/loadout", window.location.origin);
      url.searchParams.set("ship", slot.shipReference);
      if (slot.buildCode) url.searchParams.set("build", slot.buildCode);
      router.push(url.pathname + url.search);
    },
    [slots, router],
  );

  // Detectar si el slot apunta al ship+build actual
  const isCurrentSlot = useCallback(
    (slot: QuickSlot | null) => {
      if (!slot || !currentShipReference) return false;
      if (slot.shipReference !== currentShipReference) return false;
      const url = new URL(window.location.href);
      const currentBuild = url.searchParams.get("build");
      return (slot.buildCode ?? null) === currentBuild;
    },
    [currentShipReference],
  );

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 hidden md:inline"
        title="Acceso rápido — pineá hasta 6 naves para cambiar entre ellas con un click"
      >
        Pinned
      </span>
      <div className="flex items-center gap-1">
        {slots.map((slot, idx) => {
          if (!slot) {
            // Slot vacío — botón "+" si hay ship actual para pinear
            const canPin = !!currentShipReference;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => canPin && pinCurrent(idx)}
                disabled={!canPin}
                className={`w-9 h-9 rounded-sm border border-dashed flex items-center justify-center text-[14px] transition-colors ${
                  canPin
                    ? "border-zinc-700 text-zinc-600 hover:border-amber-500/60 hover:text-amber-400 hover:bg-amber-500/5 cursor-pointer"
                    : "border-zinc-800/60 text-zinc-800 cursor-not-allowed"
                }`}
                title={canPin ? "Pinear nave actual" : "Cargá una nave primero"}
              >
                +
              </button>
            );
          }
          const active = isCurrentSlot(slot);
          return (
            <div
              key={idx}
              className={`group relative w-9 h-9 rounded-sm border overflow-hidden transition-all ${
                active
                  ? "border-amber-400 ring-1 ring-amber-400/40"
                  : "border-zinc-700 hover:border-amber-500/60"
              }`}
              title={`${slot.shipName}${slot.buildCode ? " · build custom" : ""}`}
            >
              <button
                type="button"
                onClick={() => navigateToSlot(idx)}
                className="w-full h-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slot.imageUrl}
                  alt={slot.shipName}
                  className="w-full h-full object-cover"
                  draggable={false}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
                  }}
                />
                {/* Indicador de build custom (no es el default del ship) */}
                {slot.buildCode && (
                  <span
                    className="absolute bottom-0 left-0 text-[7px] font-mono px-1 leading-tight bg-cyan-500/80 text-zinc-950 rounded-tr-sm"
                    title="Build custom"
                  >
                    M
                  </span>
                )}
                {/* Indicador "actual" */}
                {active && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-amber-400 rounded-bl-sm" />
                )}
              </button>
              {/* ✕ borrar (solo en hover) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearSlot(idx);
                }}
                className="absolute top-0 right-0 w-4 h-4 bg-rose-600/90 hover:bg-rose-500 text-white text-[9px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Quitar de los pinned"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
      {/* Botón rápido "pin actual" — siempre visible si hay ship actual */}
      {currentShipReference && (
        <button
          type="button"
          onClick={() => pinCurrent()}
          className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-1 border border-zinc-800 text-zinc-600 hover:text-amber-400 hover:border-amber-500/40 transition-colors hidden lg:inline-block"
          title="Agregar nave actual al primer slot vacío"
        >
          📌 Pin
        </button>
      )}
    </div>
  );
}
