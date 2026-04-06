// =============================================================================
// AL FILO — ShipSelector v2 (Industrial Dual-Panel)
//
// Two-panel dropdown: Manufacturers (left) → Ships (right)
// Calls loadShip() from Zustand store + updates URL
// =============================================================================

"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLoadoutStore } from "@/store/useLoadoutStore";

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

export function ShipSelector() {
  const router = useRouter();
  const { shipInfo, loadShip } = useLoadoutStore();
  const [open, setOpen] = useState(false);
  const [ships, setShips] = useState<ShipEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedMfr, setSelectedMfr] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Fetch ship list once
  useEffect(() => {
    if (ships.length > 0) return;
    setLoading(true);
    fetch('/api/ships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 500 }) })
      .then(r => r.json())
      .then(d => {
        const list: ShipEntry[] = (d.data ?? d.items ?? []).map((s: any) => ({
          id: s.id,
          reference: s.reference,
          name: s.name,
          localizedName: s.localizedName,
          manufacturer: s.manufacturer || "Unknown",
          role: s.ship?.role ?? s.role ?? null,
          scmSpeed: s.ship?.scmSpeed ?? null,
          crew: s.ship?.maxCrew ?? null,
        }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setShips(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ships.length]);

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

  const manufacturers = useMemo(() => {
    const mfrs = [...new Set(ships.map(s => s.manufacturer || "Unknown"))];
    mfrs.sort();
    return mfrs;
  }, [ships]);

  const filtered = useMemo(() => {
    let list = ships;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.localizedName?.toLowerCase().includes(q)) ||
        (s.manufacturer?.toLowerCase().includes(q)) ||
        (s.role?.toLowerCase().includes(q))
      );
    } else if (selectedMfr) {
      list = list.filter(s => s.manufacturer === selectedMfr);
    }
    return list;
  }, [ships, search, selectedMfr]);

  const mfrCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of ships) c[s.manufacturer || "Unknown"] = (c[s.manufacturer || "Unknown"] || 0) + 1;
    return c;
  }, [ships]);

  const handleSelect = (ship: ShipEntry) => {
    setOpen(false);
    setSearch("");
    setSelectedMfr(null);
    // Stay on current page (e.g. /dps) — only navigate away if on /ships/
    const path = window.location.pathname;
    if (path.startsWith("/dps")) {
      // Stay on DPS calculator, just update query param
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
              <input ref={searchRef} value={search} onChange={e => { setSearch(e.target.value); if (e.target.value) setSelectedMfr(null); }} placeholder="Search by name, manufacturer, or role..." className="flex-1 bg-transparent text-[11px] font-mono text-zinc-300 placeholder:text-zinc-700 outline-none" />
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
                <button onClick={() => setSelectedMfr(null)} className={"w-full text-left px-2.5 py-1.5 flex items-center justify-between transition-colors " + (!selectedMfr ? "bg-yellow-500/10 text-yellow-400" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30")}>
                  <span className="text-[9px] font-mono tracking-wider uppercase">All Ships</span>
                  <span className="text-[8px] font-mono text-zinc-700">{ships.length}</span>
                </button>
                {manufacturers.map(m => (
                  <button key={m} onClick={() => setSelectedMfr(m)} className={"w-full text-left px-2.5 py-1.5 flex items-center justify-between transition-colors " + (selectedMfr === m ? "bg-yellow-500/10 text-yellow-400" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30")}>
                    <span className="text-[9px] font-mono truncate">{m}</span>
                    <span className="text-[8px] font-mono text-zinc-700 flex-shrink-0 ml-1">{mfrCounts[m] || 0}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {loading && <div className="flex items-center justify-center py-8"><div className="w-3 h-3 border-2 border-zinc-800 border-t-yellow-500 rounded-full animate-spin mr-2" /><span className="text-[10px] font-mono text-zinc-600">Loading...</span></div>}
              {!loading && filtered.length === 0 && <div className="py-8 text-center text-[10px] font-mono text-zinc-700">No ships found</div>}
              {!loading && filtered.map(ship => {
                const isCurrent = ship.reference === currentRef;
                return (
                  <button key={ship.id} onClick={() => handleSelect(ship)} className={"w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors border-b border-zinc-800/30 " + (isCurrent ? "bg-yellow-500/8" : "hover:bg-zinc-800/30")}>
                    <div className={"w-1.5 h-1.5 rounded-full flex-shrink-0 " + (isCurrent ? "bg-yellow-500" : "bg-zinc-700")} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={"text-[11px] truncate " + (isCurrent ? "text-yellow-200 font-medium" : "text-zinc-300")}>{ship.localizedName || ship.name}</span>
                      </div>
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
            <span className="text-[8px] font-mono text-zinc-700">{filtered.length} ship{filtered.length !== 1 ? "s" : ""}</span>
            <button onClick={() => setOpen(false)} className="text-[8px] font-mono text-zinc-600 hover:text-zinc-400 tracking-wider uppercase">ESC</button>
          </div>
        </div>
      )}
    </div>
  );
}
