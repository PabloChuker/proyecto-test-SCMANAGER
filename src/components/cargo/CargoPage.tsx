"use client";
// =============================================================================
// SC LABS — CargoPage
// Layout: Header + sidebar izquierdo con lista de grids + viewer 3D.
//
// Lógica de selección:
//   - Cada cargo grid es una entrada individual en el sidebar.
//   - Al seleccionar una entrada, se buscan TODOS los grids con el mismo
//     prefijo de nave (parte antes de "_CargoGrid_") y se pasan juntos
//     al viewer 3D → muestra todos los módulos de la nave simultáneamente.
// =============================================================================

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Header from "@/app/assets/header/Header";
import { PageVideoBackground } from "@/components/shared/PageVideoBackground";

const CargoGrid3D = dynamic(
  () => import("@/components/cargo/CargoGrid3D").then((m) => ({ default: m.CargoGrid3D })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-zinc-600 text-xs tracking-widest uppercase">
        Inicializando motor 3D…
      </div>
    ),
  },
);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CargoGridData {
  id: string;
  className: string;
  name: string;
  scuCapacity: number;
  dimensions: { x: number; y: number; z: number };
}

interface ParsedGrid extends CargoGridData {
  /** MANUFACTURER_ShipWords  — clave de agrupación */
  shipPrefix: string;
  /** Nombre limpio para mostrar: "Avenger Stalker", "Starfarer Side", etc. */
  displayName: string;
  /** Código de fabricante */
  manufacturer: string;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

function parseGrid(g: CargoGridData): ParsedGrid {
  const parts  = g.className.split("_");
  const cgIdx  = parts.findIndex((p) => p.toLowerCase() === "cargogrid");

  if (cgIdx === -1) {
    return { ...g, shipPrefix: g.className, displayName: g.className, manufacturer: parts[0] ?? "" };
  }

  const manufacturer = parts[0] ?? "";
  const shipWords    = parts.slice(1, cgIdx);           // entre fabricante y CargoGrid
  const moduleWords  = parts.slice(cgIdx + 1);          // después de CargoGrid

  const shipPrefix  = `${manufacturer}_${shipWords.join("_")}`;
  const displayName = [...shipWords, ...moduleWords].join(" ");

  return { ...g, shipPrefix, displayName, manufacturer };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CargoPage() {
  const [allGrids, setAllGrids]     = useState<ParsedGrid[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [search, setSearch]         = useState("");
  /** ID del grid que el usuario ha seleccionado en el sidebar */
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    fetch("/api/cargo-grids")
      .then((r) => r.json())
      .then((json) => {
        const parsed = (json.data ?? []).map(parseGrid);
        setAllGrids(parsed);
        if (parsed.length > 0) setSelectedId(parsed[0].id);
      })
      .catch(() => setError("Error cargando cargo grids"))
      .finally(() => setLoading(false));
  }, []);

  // Grids filtrados por búsqueda (sidebar)
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return allGrids;
    return allGrids.filter(
      (g) =>
        g.displayName.toLowerCase().includes(q) ||
        g.manufacturer.toLowerCase().includes(q) ||
        g.className.toLowerCase().includes(q),
    );
  }, [allGrids, search]);

  // Grid seleccionado actualmente
  const selectedGrid = allGrids.find((g) => g.id === selectedId) ?? null;

  // Todos los grids de la misma nave que el seleccionado → se muestran juntos
  const activeGrids = useMemo<ParsedGrid[]>(() => {
    if (!selectedGrid) return [];
    return allGrids.filter((g) => g.shipPrefix === selectedGrid.shipPrefix);
  }, [allGrids, selectedGrid]);

  return (
    <main className="relative flex flex-col h-screen overflow-hidden text-zinc-100">
      <PageVideoBackground src="/videos/comparador.mp4" opacity="0.12" />

      <div className="relative z-10 flex flex-col h-full">
        <Header subtitle="Cargo Grid" />

        <div className="flex flex-1 overflow-hidden">

          {/* ── Sidebar izquierdo ── */}
          <aside className="w-64 flex-shrink-0 flex flex-col border-r border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl overflow-hidden">

            {/* Búsqueda */}
            <div className="p-3 border-b border-zinc-800/50">
              <input
                type="text"
                placeholder="Buscar nave…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-colors"
              />
            </div>

            {/* Estado de carga / error */}
            {loading && (
              <div className="flex-1 flex items-center justify-center text-zinc-600 text-[10px] tracking-widest uppercase">
                Cargando…
              </div>
            )}
            {error && (
              <div className="flex-1 flex items-center justify-center text-red-500/60 text-[10px] tracking-widest uppercase px-4 text-center">
                {error}
              </div>
            )}

            {/* Lista de grids */}
            {!loading && !error && (
              <nav className="flex-1 overflow-y-auto py-1">
                {filtered.length === 0 && (
                  <p className="text-center text-zinc-600 text-[10px] py-8 tracking-widest uppercase">
                    Sin resultados
                  </p>
                )}
                {filtered.map((g) => {
                  const isSelected = g.id === selectedId;
                  const isInGroup  = selectedGrid?.shipPrefix === g.shipPrefix;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedId(g.id)}
                      className="w-full text-left px-3 py-2 transition-colors group"
                      style={
                        isSelected
                          ? { background: "rgba(245,158,11,0.12)", borderLeft: "2px solid rgb(245,158,11)" }
                          : isInGroup
                          ? { background: "rgba(245,158,11,0.05)", borderLeft: "2px solid rgba(245,158,11,0.3)" }
                          : { borderLeft: "2px solid transparent" }
                      }
                    >
                      <p
                        className="text-[11px] font-medium leading-tight truncate"
                        style={{ color: isSelected ? "rgb(251,191,36)" : "rgb(161,161,170)" }}
                      >
                        {g.displayName}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-zinc-600 font-mono">{g.manufacturer}</span>
                        <span className="text-[9px] text-zinc-600">·</span>
                        <span className="text-[9px] text-zinc-500 font-mono">{g.scuCapacity} SCU</span>
                        <span className="text-[9px] text-zinc-600">·</span>
                        <span className="text-[9px] text-zinc-600 font-mono">
                          {g.dimensions.x}×{g.dimensions.y}×{g.dimensions.z}m
                        </span>
                      </div>
                    </button>
                  );
                })}
              </nav>
            )}

            {/* Footer: total SCU del grupo activo */}
            {activeGrids.length > 0 && (
              <div className="border-t border-zinc-800/50 px-3 py-2">
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider">
                  {activeGrids.length > 1
                    ? `${activeGrids.length} módulos · ${activeGrids.reduce((s, g) => s + g.scuCapacity, 0)} SCU total`
                    : `${activeGrids[0].scuCapacity} SCU`}
                </p>
              </div>
            )}
          </aside>

          {/* ── Viewer 3D ── */}
          <div className="flex-1 relative overflow-hidden bg-zinc-950">
            {activeGrids.length > 0 ? (
              <CargoGrid3D key={selectedGrid?.shipPrefix} grids={activeGrids} />
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-600 text-xs tracking-widest uppercase">
                Selecciona un cargo grid
              </div>
            )}
          </div>

        </div>
      </div>
    </main>
  );
}
