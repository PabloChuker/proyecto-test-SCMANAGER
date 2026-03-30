// =============================================================================
// AL FILO — ComponentPicker
// Modal de selección de componentes. Busca en /api/components por tipo y
// tamaño, y permite al usuario elegir un reemplazo para un hardpoint.
// =============================================================================

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { HARDPOINT_COLORS } from "@/types/ships";
import type {
  ComponentSearchResult,
  ComponentSearchResponse,
  FlatHardpoint,
} from "@/types/ships";

interface ComponentPickerProps {
  hardpoint: FlatHardpoint;
  onSelect: (item: ComponentSearchResult) => void;
  onClear: () => void;
  onClose: () => void;
}

export function ComponentPicker({
  hardpoint,
  onSelect,
  onClear,
  onClose,
}: ComponentPickerProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ComponentSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const catColor = HARDPOINT_COLORS[hardpoint.category] || "#71717a";

  // Focus en el input al abrir
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Fetch components con debounce
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          category: hardpoint.category,
          maxSize: hardpoint.maxSize.toString(),
          limit: "40",
        });
        if (hardpoint.minSize > 0) {
          params.set("minSize", hardpoint.minSize.toString());
        }
        if (search.trim()) {
          params.set("search", search.trim());
        }

        const res = await fetch(`/api/components?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ComponentSearchResponse = await res.json();
        setResults(json.data);
        setTotal(json.meta.total);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("ComponentPicker fetch error:", err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, hardpoint.category, hardpoint.maxSize, hardpoint.minSize]);

  // Helper: stat principal para mostrar en cada fila
  const getKeyStat = useCallback((item: ComponentSearchResult) => {
    const s = item.componentStats;
    if (!s) return null;

    switch (hardpoint.category) {
      case "WEAPON": case "TURRET":
        return s.dps ? { v: s.dps.toFixed(1), l: "DPS" } : null;
      case "SHIELD":
        return s.shieldHp ? { v: fmt(s.shieldHp), l: "HP" } : null;
      case "POWER_PLANT":
        return s.powerOutput ? { v: fmt(s.powerOutput), l: "Out" } : null;
      case "COOLER":
        return s.coolingRate ? { v: fmt(s.coolingRate), l: "Rate" } : null;
      case "QUANTUM_DRIVE":
        return s.quantumSpoolUp ? { v: `${s.quantumSpoolUp.toFixed(1)}s`, l: "Spool" } : null;
      default:
        return s.powerDraw ? { v: fmt(s.powerDraw), l: "Pwr" } : null;
    }
  }, [hardpoint.category]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-x-4 top-[10vh] bottom-[10vh] sm:inset-auto sm:left-1/2 sm:top-1/2
                      sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[460px] sm:max-h-[70vh]
                      bg-zinc-950 border border-zinc-800/70 rounded-sm
                      flex flex-col z-50 shadow-2xl shadow-black/50">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50">
          <div className="w-1 h-5 rounded-full" style={{ backgroundColor: catColor, opacity: 0.6 }} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-[0.15em] uppercase text-zinc-500">
              Seleccionar componente
            </div>
            <div className="text-sm text-zinc-300 truncate">
              {hardpoint.hardpointName}
              <span className="text-zinc-600 ml-2">S{hardpoint.maxSize}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-zinc-800/30">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar componente..."
            className="
              w-full px-3 py-2
              bg-zinc-900/60 border border-zinc-800/50 rounded-sm
              text-sm text-zinc-200 placeholder-zinc-600
              focus:outline-none focus:border-cyan-500/30
              transition-colors
            "
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-zinc-700 font-mono">
              {total} compatibles
            </span>
            <button
              onClick={onClear}
              className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors tracking-wide uppercase"
            >
              Vaciar slot
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-zinc-600 text-sm">
              <div className="w-4 h-4 border-2 border-zinc-700 border-t-cyan-500 rounded-full animate-spin mr-2" />
              Buscando...
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 text-sm">
              No se encontraron componentes compatibles.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/30">
              {results.map((item) => {
                const stat = getKeyStat(item);
                const isCurrentlyEquipped = item.id === hardpoint.equippedItem?.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item)}
                    disabled={isCurrentlyEquipped}
                    className={`
                      w-full flex items-center gap-3 px-4 py-2.5 text-left
                      transition-colors duration-150
                      ${isCurrentlyEquipped
                        ? "bg-cyan-500/5 cursor-default"
                        : "hover:bg-zinc-900/60 cursor-pointer"
                      }
                    `}
                  >
                    {/* Size badge */}
                    <div className="flex-shrink-0 w-8 text-center">
                      <span className="text-[11px] font-mono text-zinc-500">
                        S{item.size ?? "?"}
                      </span>
                    </div>

                    {/* Item info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-zinc-200 truncate">
                          {item.localizedName || item.name}
                        </span>
                        {item.grade && (
                          <span className="text-[9px] font-mono text-zinc-500 px-1 border border-zinc-800 rounded-sm">
                            {item.grade}
                          </span>
                        )}
                        {isCurrentlyEquipped && (
                          <span className="text-[9px] text-cyan-500 tracking-wide">ACTUAL</span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-600">
                        {item.manufacturer || "Unknown"}
                      </span>
                    </div>

                    {/* Key stat */}
                    {stat && (
                      <div className="flex-shrink-0 text-right">
                        <div className="text-sm font-mono" style={{ color: catColor }}>
                          {stat.v}
                        </div>
                        <div className="text-[9px] text-zinc-600 uppercase">{stat.l}</div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function fmt(v: number): string {
  if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(2)}k`;
  return v.toFixed(0);
}
