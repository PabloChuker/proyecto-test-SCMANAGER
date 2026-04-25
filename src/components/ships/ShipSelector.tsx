// =============================================================================
// AL FILO — ShipSelector v3 (Debounced API Search)
//
// Two-panel dropdown: Manufacturers (left) → Ships (right)
// Ships are fetched on-demand — no longer preloads 500 ships into memory.
//   · First open  → fetch first 100 ships + full manufacturer list
//   · Search input → debounced 300 ms → API call with search param
//   · Manufacturer click → immediate API call with manufacturer param
// =============================================================================

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { useShallow } from "zustand/react/shallow";
import {
  ShipContextMenu,
  type ShipContextMenuTarget,
} from "@/components/ships/ShipContextMenu";

interface ShipEntry {
  id: string;
  reference: string;
  name: string;
  localizedName: string | null;
  manufacturer: string | null;
  role: string | null;
  scmSpeed: number | null;
  crew: number | null;
}

const SEARCH_DEBOUNCE_MS = 300;

export function ShipSelector() {
  const router = useRouter();
  const { shipInfo, loadShip } = useLoadoutStore(
    useShallow(s => ({ shipInfo: s.shipInfo, loadShip: s.loadShip }))
  );

  const [open, setOpen] = useState(false);
  const [ships, setShips] = useState<ShipEntry[]>([]);
  const [allManufacturers, setAllManufacturers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedMfr, setSelectedMfr] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFetchedOnceRef = useRef(false);

  // ── Context menu state ──
  const [contextMenu, setContextMenu] = useState<ShipContextMenuTarget | null>(null);

  const fetchShips = useCallback((params: { search?: string; manufacturer?: string } = {}) => {
    setLoading(true);
    // Fase R.3 (2026-04-25): el LoadoutBuilder usa este selector y NO debe
    // listar naves en concepto / in_development — esas no tienen hardpoints
    // reales en BD y revientan al cargar. Forzamos flightReadyOnly=1 acá.
    const qs = new URLSearchParams({
      limit: "100",
      sortBy: "name",
      flightReadyOnly: "1",
    });
    if (params.search) qs.set("search", params.search);
    if (params.manufacturer) qs.set("manufacturer", params.manufacturer);

    fetch("/api/ships?" + qs)
      .then(r => r.json())
      .then(d => {
        const list: ShipEntry[] = (d.data ?? []).map((s: any) => ({
          id: s.id,
          reference: s.reference,
          name: s.name,
          localizedName: s.localizedName,
          manufacturer: s.manufacturer || "Unknown",
          role: s.ship?.role ?? null,
          scmSpeed: s.ship?.scmSpeed ?? null,
          crew: s.ship?.maxCrew ?? null,
        }));
        setShips(list);
        // Capture the full manufacturer list once (comes from every response via meta)
        if (!hasFetchedOnceRef.current && d.meta?.manufacturers?.length) {
          setAllManufacturers([...d.meta.manufacturers].sort());
          hasFetchedOnceRef.current = true;
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load on first open
  useEffect(() => {
    if (!open || hasFetchedOnceRef.current) return;
    fetchShips();
  }, [open, fetchShips]);

  // Debounce search input — fires API call 300 ms after user stops typing
  useEffect(() => {
    if (!open) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!search) {
      // Search cleared: restore manufacturer filter or show all
      fetchShips(selectedMfr ? { manufacturer: selectedMfr } : {});
      return;
    }

    searchTimerRef.current = setTimeout(() => {
      fetchShips({ search });
    }, SEARCH_DEBOUNCE_MS);

    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manufacturer filter — immediate, no debounce
  const handleMfrSelect = useCallback((mfr: string | null) => {
    setSelectedMfr(mfr);
    setSearch("");
    fetchShips(mfr ? { manufacturer: mfr } : {});
  }, [fetchShips]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  const handleSelect = (ship: ShipEntry) => {
    setOpen(false);
    setSearch("");
    setSelectedMfr(null);
    const path = window.location.pathname;
    if (path.startsWith("/loadout")) {
      const url = new URL(window.location.href);
      url.searchParams.set("ship", ship.reference);
      url.searchParams.delete("build");
      window.history.replaceState({}, "", url.toString());
    } else {
      router.push("/ships/" + encodeURIComponent(ship.reference));
    }
    loadShip(ship.reference);
  };

  const currentRef = shipInfo?.reference;
  const currentName = shipInfo?.localizedName || shipInfo?.name;

  return (
    <div ref={panelRef} className={`relative ${open ? "z-50" : ""}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 bg-zinc-900/80 border border-zinc-800/60 hover:border-yellow-700/40 transition-colors text-left group">
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-3.5 h-3.5 text-yellow-500/50 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          {currentName ? (
            <span className="text-[11px] font-mono text-zinc-300 truncate">{currentName}</span>
          ) : (
            <span className="text-[10px] font-mono text-zinc-600 tracking-wider uppercase">Select ship or vehicle</span>
          )}
        </div>
        <svg className={"w-3 h-3 text-zinc-600 transition-transform flex-shrink-0 " + (open ? "rotate-180" : "")} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-zinc-900 border border-zinc-700/60 shadow-2xl shadow-black/60" style={{ width: "min(100vw - 32px, 520px)", right: 0, left: "auto" }}>
          <div className="p-2 border-b border-zinc-800/60">
            <div className="flex items-center gap-2 bg-zinc-800/50 border border-zinc-700/40 px-2 py-1.5">
              <svg className="w-3 h-3 text-zinc-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, manufacturer, or role..."
                className="flex-1 bg-transparent text-[11px] font-mono text-zinc-300 placeholder:text-zinc-700 outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-zinc-600 hover:text-zinc-400">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          </div>

          <div className="flex max-h-[360px]">
            {!search && (
              <div className="w-36 border-r border-zinc-800/50 overflow-y-auto flex-shrink-0">
                <button
                  onClick={() => handleMfrSelect(null)}
                  className={"w-full text-left px-2.5 py-1.5 flex items-center justify-between transition-colors " + (!selectedMfr ? "bg-yellow-500/10 text-yellow-400" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30")}
                >
                  <span className="text-[9px] font-mono tracking-wider uppercase">All Ships</span>
                </button>
                {allManufacturers.map(m => (
                  <button
                    key={m}
                    onClick={() => handleMfrSelect(m)}
                    className={"w-full text-left px-2.5 py-1.5 transition-colors " + (selectedMfr === m ? "bg-yellow-500/10 text-yellow-400" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30")}
                  >
                    <span className="text-[9px] font-mono truncate block">{m}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-3 h-3 border-2 border-zinc-800 border-t-yellow-500 rounded-full animate-spin mr-2" />
                  <span className="text-[10px] font-mono text-zinc-600">Loading...</span>
                </div>
              )}
              {!loading && ships.length === 0 && (
                <div className="py-8 text-center text-[10px] font-mono text-zinc-700">No ships found</div>
              )}
              {!loading && ships.map(ship => {
                const isCurrent = ship.reference === currentRef;
                return (
                  <button
                    key={ship.id}
                    onClick={() => handleSelect(ship)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({
                        reference: ship.reference,
                        name: ship.localizedName || ship.name,
                        manufacturer: ship.manufacturer,
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                    className={"w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors border-b border-zinc-800/30 " + (isCurrent ? "bg-yellow-500/8" : "hover:bg-zinc-800/30")}
                  >
                    <div className={"w-1.5 h-1.5 rounded-full flex-shrink-0 " + (isCurrent ? "bg-yellow-500" : "bg-zinc-700")} />
                    <div className="flex-1 min-w-0">
                      <span className={"text-[11px] truncate block " + (isCurrent ? "text-yellow-200 font-medium" : "text-zinc-300")}>{ship.localizedName || ship.name}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[8px] font-mono text-zinc-600">{ship.manufacturer}</span>
                        {ship.role && <span className="text-[8px] font-mono text-yellow-600/50">{ship.role}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {ship.crew != null && <div className="text-center"><div className="text-[7px] font-mono text-zinc-700">CREW</div><div className="text-[9px] font-mono text-zinc-500">{ship.crew}</div></div>}
                      {ship.scmSpeed != null && <div className="text-center"><div className="text-[7px] font-mono text-zinc-700">SCM</div><div className="text-[9px] font-mono text-zinc-500">{Math.round(ship.scmSpeed)}</div></div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-3 py-1.5 border-t border-zinc-800/50 bg-zinc-900/50 flex items-center justify-between">
            <span className="text-[8px] font-mono text-zinc-700">
              {ships.length} ship{ships.length !== 1 ? "s" : ""}{search || selectedMfr ? " matching" : ""}
            </span>
            <button onClick={() => setOpen(false)} className="text-[8px] font-mono text-zinc-600 hover:text-zinc-400 tracking-wider uppercase">ESC</button>
          </div>
        </div>
      )}

      {/* Context menu — inside panelRef so outside-click handler doesn't fire */}
      <ShipContextMenu target={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  );
}
