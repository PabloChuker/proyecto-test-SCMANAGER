"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useHangarStore, type ItemLocation } from "@/store/useHangarStore";

interface ShipResult {
  reference: string;
  name: string;
  manufacturer?: string;
  msrpUsd?: number | null;
  size?: string | null;
  role?: string | null;
}

interface QuickAddShipProps {
  defaultLocation: ItemLocation;
}

export function QuickAddShip({ defaultLocation }: QuickAddShipProps) {
  const [search, setSearch] = useState("");
  const [ships, setShips] = useState<ShipResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [addedMsg, setAddedMsg] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const addShip = useHangarStore((s) => s.addShip);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Search ships from API with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (search.length < 2) {
      // If empty search, load popular/all ships
      if (expanded && ships.length === 0) {
        loadShips("");
      }
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      loadShips(search);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  async function loadShips(query: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50", sortBy: "name", sortOrder: "asc" });
      if (query) params.set("search", query);
      const res = await fetch(`/api/ships?${params}`);
      if (res.ok) {
        const data = await res.json();
        setShips(data.data || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  const handleExpand = () => {
    setExpanded(true);
    if (ships.length === 0) loadShips("");
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const handleAdd = (ship: ShipResult) => {
    addShip({
      shipReference: ship.reference,
      shipName: ship.name,
      pledgeName: `Standalone Ship - ${ship.name}`,
      pledgePrice: ship.msrpUsd || 0,
      insuranceType: "unknown",
      location: defaultLocation,
      itemCategory: "standalone_ship",
      isGiftable: false,
      isMeltable: true,
      purchasedDate: null,
      imageUrl: "",
      notes: "",
    });
    setAddedMsg(ship.name);
    setTimeout(() => setAddedMsg(null), 2000);
  };

  // Filter display
  const filtered = useMemo(() => {
    if (!search || search.length < 2) return ships;
    const q = search.toLowerCase();
    return ships.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.manufacturer?.toLowerCase().includes(q) ||
        s.reference.toLowerCase().includes(q)
    );
  }, [ships, search]);

  return (
    <div ref={containerRef} className="relative">
      {/* Collapsed: single bar */}
      {!expanded ? (
        <button
          onClick={handleExpand}
          className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-900/60 border border-dashed border-zinc-700/50 rounded-sm hover:border-amber-500/40 hover:bg-zinc-900/80 transition-all duration-200 group"
        >
          <svg className="w-5 h-5 text-zinc-600 group-hover:text-amber-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-sm text-zinc-500 group-hover:text-zinc-300 transition-colors">
            Add ship manually...
          </span>
        </button>
      ) : (
        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-sm overflow-hidden">
          {/* Search bar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/40">
            <svg className="w-4 h-4 text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ships by name, manufacturer..."
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
            />
            {loading && (
              <div className="w-3 h-3 border border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
            )}
            {addedMsg && (
              <span className="text-[10px] text-emerald-400 font-medium animate-pulse">
                {addedMsg} added!
              </span>
            )}
            <button
              onClick={() => { setExpanded(false); setSearch(""); }}
              className="text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Ships list */}
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 && !loading ? (
              <div className="text-center py-6 text-xs text-zinc-600">
                {search.length >= 2 ? "No ships found" : "Type to search ships..."}
              </div>
            ) : (
              filtered.map((ship) => (
                <div
                  key={ship.reference}
                  className="flex items-center justify-between px-3 py-2 hover:bg-zinc-800/40 transition-colors border-b border-zinc-800/20 last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-zinc-200 truncate">{ship.name}</p>
                    <p className="text-[10px] text-zinc-500">
                      {ship.manufacturer || "Unknown"} · {ship.size || "?"} · {ship.role || "Multi"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-2 flex-shrink-0">
                    {ship.msrpUsd != null && ship.msrpUsd > 0 && (
                      <span className="text-xs text-amber-400 font-mono">${ship.msrpUsd.toLocaleString()}</span>
                    )}
                    <button
                      onClick={() => handleAdd(ship)}
                      className="px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[11px] font-medium rounded-sm hover:bg-amber-500/30 transition-all"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-1.5 border-t border-zinc-800/40 bg-zinc-950/40">
            <p className="text-[10px] text-zinc-600">
              Ships are added to {defaultLocation === "hangar" ? "your fleet" : "buyback"} with default values. Edit them after adding for details.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
