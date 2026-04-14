"use client";
// =============================================================================
// SC LABS — CargoPage
// Sidebar: lista de naves con cargo grids.
// Viewer: todos los módulos de la nave seleccionada, expandidos por instance_count.
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
  scuCapacity: number;
  dimensions: { x: number; y: number; z: number };
  instanceCount: number;
  displayOrder: number;
}

interface ShipData {
  id: string;
  name: string;
  manufacturer: string;
  totalSCU: number;
  grids: CargoGridData[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CargoPage() {
  const [ships, setShips]           = useState<ShipData[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [search, setSearch]         = useState("");
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    fetch("/api/cargo-grids")
      .then((r) => r.json())
      .then((json) => {
        const data: ShipData[] = json.data ?? [];
        setShips(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch(() => setError("Error cargando naves"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return ships;
    return ships.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.manufacturer.toLowerCase().includes(q),
    );
  }, [ships, search]);

  const selectedShip = ships.find((s) => s.id === selectedId) ?? null;

  // Grids expandidos por instance_count → pasados al 3D
  const activeGrids = useMemo<CargoGridData[]>(() => {
    if (!selectedShip) return [];
    return selectedShip.grids.flatMap((g) =>
      Array.from({ length: g.instanceCount }, () => g),
    );
  }, [selectedShip]);

  return (
    <main className="relative flex flex-col h-screen overflow-hidden text-zinc-100">
      <PageVideoBackground src="/videos/comparador.mp4" opacity="0.12" />

      <div className="relative z-10 flex flex-col h-full">
        <Header subtitle="Cargo Grid" />

        <div className="flex flex-1 overflow-hidden">

          {/* ── Sidebar ── */}
          <aside className="w-64 flex-shrink-0 flex flex-col border-r border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl overflow-hidden">

            <div className="p-3 border-b border-zinc-800/50">
              <input
                type="text"
                placeholder="Buscar nave…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-colors"
              />
            </div>

            {loading && (
              <div className="flex-1 flex items-center justify-center text-zinc-600 text-[10px] tracking-widest uppercase">
                Cargando…
              </div>
            )}
            {error && (
              <div className="flex-1 flex items-center justify-center text-red-500/60 text-[10px] px-4 text-center">
                {error}
              </div>
            )}

            {!loading && !error && (
              <nav className="flex-1 overflow-y-auto py-1">
                {filtered.length === 0 && (
                  <p className="text-center text-zinc-600 text-[10px] py-8 tracking-widest uppercase">
                    Sin resultados
                  </p>
                )}
                {filtered.map((ship) => {
                  const isSelected = ship.id === selectedId;
                  // SCU real = suma de (scuCapacity * instanceCount) de cada módulo
                  const realSCU = ship.grids.reduce(
                    (s, g) => s + g.scuCapacity * g.instanceCount, 0,
                  );
                  const gridCount = ship.grids.reduce(
                    (s, g) => s + g.instanceCount, 0,
                  );
                  return (
                    <button
                      key={ship.id}
                      onClick={() => setSelectedId(ship.id)}
                      className="w-full text-left px-3 py-2 transition-colors"
                      style={
                        isSelected
                          ? { background: "rgba(245,158,11,0.12)", borderLeft: "2px solid rgb(245,158,11)" }
                          : { borderLeft: "2px solid transparent" }
                      }
                    >
                      <p
                        className="text-[11px] font-medium leading-tight truncate"
                        style={{ color: isSelected ? "rgb(251,191,36)" : "rgb(161,161,170)" }}
                      >
                        {ship.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-zinc-600 font-mono truncate">{ship.manufacturer}</span>
                        <span className="text-[9px] text-zinc-600">·</span>
                        <span className="text-[9px] text-zinc-500 font-mono whitespace-nowrap">{realSCU} SCU</span>
                        {gridCount > 1 && (
                          <>
                            <span className="text-[9px] text-zinc-600">·</span>
                            <span className="text-[9px] text-zinc-600 font-mono whitespace-nowrap">{gridCount} grids</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </nav>
            )}

            {/* Footer */}
            {selectedShip && (
              <div className="border-t border-zinc-800/50 px-3 py-2">
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider truncate">
                  {selectedShip.name}
                  {" · "}
                  {selectedShip.grids.reduce((s, g) => s + g.scuCapacity * g.instanceCount, 0)} SCU
                </p>
              </div>
            )}
          </aside>

          {/* ── Viewer 3D ── */}
          <div className="flex-1 relative overflow-hidden bg-zinc-950">
            {activeGrids.length > 0 ? (
              <CargoGrid3D key={selectedId} grids={activeGrids} />
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-600 text-xs tracking-widest uppercase">
                Selecciona una nave
              </div>
            )}
          </div>

        </div>
      </div>
    </main>
  );
}
