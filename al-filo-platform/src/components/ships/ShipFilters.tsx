// =============================================================================
// AL FILO — ShipFilters Component
// Barra de búsqueda y filtros para la grilla de naves.
// =============================================================================

"use client";

import { useCallback } from "react";

interface ShipFiltersProps {
  search: string;
  manufacturer: string;
  manufacturers: string[];
  sortBy: string;
  onSearchChange: (value: string) => void;
  onManufacturerChange: (value: string) => void;
  onSortChange: (value: string) => void;
  totalResults: number;
}

export function ShipFilters({
  search,
  manufacturer,
  manufacturers,
  sortBy,
  onSearchChange,
  onManufacturerChange,
  onSortChange,
  totalResults,
}: ShipFiltersProps) {
  const handleClearAll = useCallback(() => {
    onSearchChange("");
    onManufacturerChange("");
    onSortChange("name");
  }, [onSearchChange, onManufacturerChange, onSortChange]);

  const hasFilters = search || manufacturer || sortBy !== "name";

  return (
    <div className="space-y-4">
      {/* ── Fila principal de controles ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Búsqueda */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar nave por nombre, clase o fabricante..."
            className="
              w-full pl-10 pr-4 py-2.5
              bg-zinc-900/60 border border-zinc-800/70 rounded-sm
              text-sm text-zinc-200 placeholder-zinc-600
              focus:outline-none focus:border-cyan-500/40 focus:bg-zinc-900/80
              transition-all duration-200
            "
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-600 hover:text-zinc-400"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filtro de fabricante */}
        <select
          value={manufacturer}
          onChange={(e) => onManufacturerChange(e.target.value)}
          className="
            px-3 py-2.5 min-w-[180px]
            bg-zinc-900/60 border border-zinc-800/70 rounded-sm
            text-sm text-zinc-300
            focus:outline-none focus:border-cyan-500/40
            transition-all duration-200
            appearance-none cursor-pointer
          "
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 12px center",
          }}
        >
          <option value="">Todos los fabricantes</option>
          {manufacturers.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* Ordenamiento */}
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          className="
            px-3 py-2.5 min-w-[150px]
            bg-zinc-900/60 border border-zinc-800/70 rounded-sm
            text-sm text-zinc-300
            focus:outline-none focus:border-cyan-500/40
            transition-all duration-200
            appearance-none cursor-pointer
          "
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 12px center",
          }}
        >
          <option value="name">Nombre A→Z</option>
          <option value="manufacturer">Fabricante</option>
          <option value="maxSpeed">Velocidad</option>
          <option value="cargo">Carga (SCU)</option>
          <option value="maxCrew">Tripulación</option>
        </select>
      </div>

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between text-xs text-zinc-600">
        <span className="font-mono tracking-wide">
          {totalResults} {totalResults === 1 ? "nave" : "naves"} encontradas
        </span>
        {hasFilters && (
          <button
            onClick={handleClearAll}
            className="text-zinc-500 hover:text-cyan-400 transition-colors tracking-wide uppercase"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}
