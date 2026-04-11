// =============================================================================
// AL FILO — ShipsGrid (Client Component)
//
// Grilla interactiva que consume /api/ships con búsqueda debounced,
// filtros y paginación. Usa useSearchParams para que el estado de filtros
// sea compartible por URL.
// =============================================================================

"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ShipCard } from "@/components/ships/ShipCard";
import { ShipFilters } from "@/components/ships/ShipFilters";
import {
  ShipContextMenu,
  type ShipContextMenuTarget,
} from "@/components/ships/ShipContextMenu";
import type { ShipListResponse, ShipListItem } from "@/types/ships";

const DEBOUNCE_MS = 300;

export function ShipsGrid() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Estado derivado de URL params ──
  const urlSearch       = searchParams.get("search") || "";
  const urlManufacturer = searchParams.get("manufacturer") || "";
  const urlSortBy       = searchParams.get("sortBy") || "name";
  const urlPage         = parseInt(searchParams.get("page") || "1", 10);

  // ── Estado local (input inmediato, antes del debounce) ──
  const [inputSearch, setInputSearch] = useState(urlSearch);
  const [data, setData] = useState<ShipListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Context menu state ──
  const [contextMenu, setContextMenu] = useState<ShipContextMenuTarget | null>(null);

  // ── Sincronizar URL → estado local cuando se navega con back/forward ──
  useEffect(() => {
    setInputSearch(urlSearch);
  }, [urlSearch]);

  // ── Actualizar URL params (shallow, sin scroll) ──
  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      // Reset a página 1 si cambian los filtros
      if (!("page" in updates)) {
        params.delete("page");
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  // ── Debounce para búsqueda por texto ──
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputSearch !== urlSearch) {
        updateParams({ search: inputSearch });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputSearch, urlSearch, updateParams]);

  // ── Fetch de datos cuando cambian los params de URL ──
  useEffect(() => {
    // Cancelar request anterior
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    async function fetchShips() {
      setLoading(true);
      setError(null);

      try {
        const body: Record<string, any> = { limit: 24 };
        if (urlSearch)       body.search = urlSearch;
        if (urlManufacturer) body.manufacturer = urlManufacturer;
        if (urlSortBy)       body.sortBy = urlSortBy;
        if (urlPage > 1)     body.page = urlPage;

        const res = await fetch('/api/ships', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json: ShipListResponse = await res.json();
        setData(json);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Error fetching ships:", err);
        setError("No se pudieron cargar las naves. Verificá que la API esté corriendo.");
      } finally {
        setLoading(false);
      }
    }

    fetchShips();

    return () => controller.abort();
  }, [urlSearch, urlManufacturer, urlSortBy, urlPage]);

  // ── Handlers de filtros ──
  const handleManufacturerChange = useCallback(
    (value: string) => updateParams({ manufacturer: value }),
    [updateParams]
  );
  const handleSortChange = useCallback(
    (value: string) => updateParams({ sortBy: value }),
    [updateParams]
  );

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Filtros */}
      <ShipFilters
        search={inputSearch}
        manufacturer={urlManufacturer}
        manufacturers={data?.meta.manufacturers || []}
        sortBy={urlSortBy}
        onSearchChange={setInputSearch}
        onManufacturerChange={handleManufacturerChange}
        onSortChange={handleSortChange}
        totalResults={data?.meta.total || 0}
      />

      {/* Error */}
      {error && (
        <div className="rounded-sm border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Grid de naves */}
      <div className={`
        grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4
        transition-opacity duration-200
        ${loading ? "opacity-50" : "opacity-100"}
      `}>
        {data?.data.map((ship, index) => (
          <div
            key={ship.id}
            className="animate-in fade-in slide-in-from-bottom-2"
            style={{ animationDelay: `${index * 30}ms`, animationFillMode: "both" }}
          >
            <ShipCard
              ship={ship}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({
                  reference: ship.reference,
                  name: ship.localizedName || ship.name,
                  manufacturer: ship.manufacturer,
                  x: e.clientX,
                  y: e.clientY,
                });
              }}
            />
          </div>
        ))}
      </div>

      {/* Context menu global */}
      <ShipContextMenu target={contextMenu} onClose={() => setContextMenu(null)} />

      {/* Estado vacío */}
      {!loading && data?.data.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3 opacity-20">🚀</div>
          <p className="text-zinc-500 text-sm">
            No se encontraron naves con esos filtros.
          </p>
          <button
            onClick={() => {
              setInputSearch("");
              updateParams({ search: "", manufacturer: "", sortBy: "name" });
            }}
            className="mt-3 text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
          >
            Limpiar búsqueda
          </button>
        </div>
      )}

      {/* Paginación */}
      {data && data.meta.totalPages > 1 && (
        <Pagination
          currentPage={urlPage}
          totalPages={data.meta.totalPages}
          onPageChange={(page) => updateParams({ page: page.toString() })}
        />
      )}
    </div>
  );
}

// ── Componente de paginación ──
function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  // Generar rango de páginas visibles
  const pages = useMemo(() => {
    const range: (number | "...")[] = [];
    const delta = 2;

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - delta && i <= currentPage + delta)
      ) {
        range.push(i);
      } else if (range[range.length - 1] !== "...") {
        range.push("...");
      }
    }

    return range;
  }, [currentPage, totalPages]);

  return (
    <div className="flex items-center justify-center gap-2 pt-6 pb-2">
      {/* Prev */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="
          px-3 py-2 rounded-sm text-sm font-mono
          border border-zinc-700 text-zinc-300 bg-zinc-800/50
          hover:border-cyan-500/50 hover:text-cyan-300 hover:bg-zinc-800
          disabled:opacity-30 disabled:cursor-not-allowed
          transition-all duration-200
        "
      >
        ←
      </button>

      {/* Números */}
      {pages.map((page, idx) =>
        page === "..." ? (
          <span key={`dots-${idx}`} className="px-1 text-zinc-500 text-sm">
            ···
          </span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`
              min-w-[36px] py-2 rounded-sm text-sm font-mono
              border transition-all duration-200
              ${
                page === currentPage
                  ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-300 shadow-[0_0_8px_-2px_rgba(6,182,212,0.3)]"
                  : "border-zinc-700 text-zinc-300 bg-zinc-800/50 hover:border-zinc-600 hover:text-zinc-100 hover:bg-zinc-800"
              }
            `}
          >
            {page}
          </button>
        )
      )}

      {/* Next */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="
          px-3 py-2 rounded-sm text-sm font-mono
          border border-zinc-700 text-zinc-300 bg-zinc-800/50
          hover:border-cyan-500/50 hover:text-cyan-300 hover:bg-zinc-800
          disabled:opacity-30 disabled:cursor-not-allowed
          transition-all duration-200
        "
      >
        →
      </button>
    </div>
  );
}
