"use client";
// =============================================================================
// SC LABS — CargoPage
// Ship/grid selector shell. Fetches cargo grids from /api/cargo-grids,
// groups them by parsed ship name, and renders the 3D viewer via CargoGrid3D.
// =============================================================================

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";

// Dynamic import prevents Three.js from running on the server
const CargoGrid3D = dynamic(
  () =>
    import("@/components/cargo/CargoGrid3D").then((m) => ({ default: m.CargoGrid3D })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-white/20 text-xs tracking-widest uppercase">
        Initializing 3D engine...
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
  shipName: string;
  manufacturer: string;
  variant: string;
}

interface ShipGroup {
  key: string;
  label: string;
  grids: ParsedGrid[];
}

// ─── Parser ──────────────────────────────────────────────────────────────────

function parseClassName(className: string): { manufacturer: string; shipName: string; variant: string } {
  const parts = className.split("_");
  const cgIdx = parts.findIndex((p) => p.toLowerCase() === "cargogrid");

  if (cgIdx === -1) {
    return { manufacturer: parts[0] ?? "", shipName: parts.slice(1).join(" "), variant: "Main" };
  }

  const manufacturer = parts[0] ?? "";
  const shipParts = parts.slice(1, cgIdx);
  const variantParts = parts.slice(cgIdx + 1);

  return {
    manufacturer,
    shipName: shipParts.join(" ") || "Unknown",
    variant: variantParts.length > 0 ? variantParts.join(" ") : "Main",
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CargoPage() {
  const [grids, setGrids] = useState<ParsedGrid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedShipKey, setSelectedShipKey] = useState<string>("");
  const [selectedGridId, setSelectedGridId] = useState<string>("");

  // Fetch on mount
  useEffect(() => {
    fetch("/api/cargo-grids")
      .then((r) => r.json())
      .then((json) => {
        const parsed: ParsedGrid[] = (json.data ?? []).map((g: CargoGridData) => {
          const { manufacturer, shipName, variant } = parseClassName(g.className);
          return { ...g, manufacturer, shipName, variant };
        });
        setGrids(parsed);

        // Auto-select first ship and grid
        if (parsed.length > 0) {
          const firstKey = `${parsed[0].manufacturer}_${parsed[0].shipName}`;
          setSelectedShipKey(firstKey);
          setSelectedGridId(parsed[0].id);
        }
      })
      .catch(() => setError("Failed to load cargo grids"))
      .finally(() => setLoading(false));
  }, []);

  // Group by ship (manufacturer + shipName)
  const shipGroups = useMemo<ShipGroup[]>(() => {
    const map = new Map<string, ShipGroup>();
    for (const g of grids) {
      const key = `${g.manufacturer}_${g.shipName}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: `${g.shipName} (${g.manufacturer})`,
          grids: [],
        });
      }
      map.get(key)!.grids.push(g);
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [grids]);

  const selectedGroup = shipGroups.find((g) => g.key === selectedShipKey) ?? null;
  const selectedGrid = grids.find((g) => g.id === selectedGridId) ?? null;

  const handleShipChange = (key: string) => {
    setSelectedShipKey(key);
    const group = shipGroups.find((g) => g.key === key);
    if (group && group.grids.length > 0) {
      setSelectedGridId(group.grids[0].id);
    }
  };

  return (
    <main
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: "#0a0e17", color: "#e0e8f0" }}
    >
      {/* ── Top bar ── */}
      <header
        className="flex items-center gap-4 px-5 h-14 flex-shrink-0 border-b"
        style={{ borderColor: "rgba(0,229,255,0.1)", background: "rgba(8,12,22,0.95)" }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 flex-shrink-0">
          <div className="w-7 h-7 relative">
            <Image
              src="/media/images/sclabs-logo.png"
              alt="SC LABS"
              fill
              className="object-contain"
            />
          </div>
          <span
            className="text-[10px] tracking-[0.25em] uppercase"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            SC Labs
          </span>
        </Link>

        <div
          className="w-px h-5 flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.1)" }}
        />

        <span
          className="text-[11px] tracking-[0.15em] uppercase font-medium"
          style={{ color: "#00e5ff" }}
        >
          Cargo Grid Visualizer
        </span>

        <div className="flex-1" />

        {/* Ship selector */}
        <div className="flex items-center gap-3">
          <span
            className="text-[9px] tracking-[0.2em] uppercase flex-shrink-0"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            Ship
          </span>
          <select
            value={selectedShipKey}
            onChange={(e) => handleShipChange(e.target.value)}
            disabled={loading || !!error}
            className="text-xs px-3 py-1.5 rounded-sm outline-none focus:ring-1 focus:ring-cyan-500/50 disabled:opacity-40"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(0,229,255,0.2)",
              color: "#c0d8e8",
              minWidth: "200px",
            }}
          >
            {loading && <option>Loading...</option>}
            {error && <option>Error loading data</option>}
            {shipGroups.map((sg) => (
              <option key={sg.key} value={sg.key}>
                {sg.label}
              </option>
            ))}
          </select>
        </div>

        {/* Grid tabs */}
        {selectedGroup && selectedGroup.grids.length > 1 && (
          <div className="flex items-center gap-1">
            {selectedGroup.grids.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGridId(g.id)}
                className="px-3 py-1 text-[10px] tracking-wider uppercase rounded-sm transition-colors"
                style={
                  selectedGridId === g.id
                    ? {
                        background: "rgba(0,229,255,0.15)",
                        border: "1px solid rgba(0,229,255,0.4)",
                        color: "#00e5ff",
                      }
                    : {
                        background: "transparent",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.4)",
                      }
                }
              >
                {g.variant}
                <span
                  className="ml-1.5"
                  style={{ color: "rgba(255,255,255,0.25)", fontSize: "9px" }}
                >
                  {g.scuCapacity}SCU
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Single grid badge */}
        {selectedGroup && selectedGroup.grids.length === 1 && (
          <div
            className="text-[10px] px-3 py-1 rounded-sm"
            style={{
              background: "rgba(0,229,255,0.08)",
              border: "1px solid rgba(0,229,255,0.2)",
              color: "rgba(0,229,255,0.7)",
            }}
          >
            {selectedGroup.grids[0].variant} · {selectedGroup.grids[0].scuCapacity} SCU
          </div>
        )}

        <span
          className="text-[10px] tracking-[0.2em] ml-2"
          style={{ color: "rgba(255,255,255,0.15)" }}
        >
          v4.0.2
        </span>
      </header>

      {/* ── 3D Viewer ── */}
      <div className="flex-1 relative overflow-hidden">
        {error ? (
          <div className="flex items-center justify-center h-full">
            <div
              className="text-xs tracking-widest uppercase"
              style={{ color: "rgba(255,80,80,0.6)" }}
            >
              {error}
            </div>
          </div>
        ) : (
          <CargoGrid3D key={selectedGridId} grid={selectedGrid} />
        )}
      </div>
    </main>
  );
}
