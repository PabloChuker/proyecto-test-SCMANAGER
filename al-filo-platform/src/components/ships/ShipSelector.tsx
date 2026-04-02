// =============================================================================
// AL FILO — ShipSelector (Erkul-style ship picker)
// =============================================================================

"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface ShipEntry { id: string; reference: string; name: string; localizedName: string | null; manufacturer: string | null; }

export function ShipSelector({ currentRef }: { currentRef?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ships, setShips] = useState<ShipEntry[]>([]);
  const [search, setSearch] = useState("");
  const [selectedMfr, setSelectedMfr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/ships?limit=500").then(r => r.json()).then(d => {
      const list = (d.data ?? d.items ?? []).map((s: any) => ({
        id: s.id, reference: s.reference, name: s.name,
        localizedName: s.localizedName, manufacturer: s.manufacturer || "Unknown",
      }));
      list.sort((a: ShipEntry, b: ShipEntry) => a.name.localeCompare(b.name));
      setShips(list);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = ships.filter(s => {
    if (search) { const q = search.toLowerCase(); return (s.name.toLowerCase().includes(q) || (s.localizedName?.toLowerCase().includes(q)) || s.manufacturer?.toLowerCase().includes(q)); }
    if (selectedMfr) return s.manufacturer === selectedMfr;
    return true;
  });

  const manufacturers = [...new Set(ships.map(s => s.manufacturer || "Unknown"))].sort();

  const handleSelect = (s: ShipEntry) => {
    setOpen(false);
    setSearch("");
    setSelectedMfr(null);
    router.push("/ships/" + encodeURIComponent(s.reference));
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900/80 border border-zinc-800/60 hover:border-zinc-600/60 transition-colors text-left">
        <span className="text-[10px] font-mono text-zinc-500 tracking-wider uppercase">Select ship or vehicle</span>
        <svg className={"w-3 h-3 text-zinc-600 transition-transform " + (open ? "rotate-180" : "")} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-zinc-900 border border-zinc-700/60 shadow-2xl shadow-black/50 max-h-[420px] flex flex-col">
          {/* Search */}
          <div className="p-1.5 border-b border-zinc-800/60">
            <input value={search} onChange={e => { setSearch(e.target.value); setSelectedMfr(null); }} placeholder="Search..." className="w-full bg-zinc-800/60 border border-zinc-700/40 px-2 py-1 text-[11px] font-mono text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-yellow-600/40" />
          </div>

          <div className="flex-1 overflow-hidden flex min-h-0">
            {/* Manufacturers column */}
            {!search && (
              <div className="w-28 border-r border-zinc-800/50 overflow-y-auto">
                <button onClick={() => setSelectedMfr(null)} className={"w-full text-left px-2 py-1 text-[9px] font-mono tracking-wider " + (!selectedMfr ? "text-yellow-400 bg-zinc-800/40" : "text-zinc-500 hover:text-zinc-300")}>ALL</button>
                {manufacturers.map(m => (
                  <button key={m} onClick={() => setSelectedMfr(m)} className={"w-full text-left px-2 py-1 text-[9px] font-mono truncate " + (selectedMfr === m ? "text-yellow-400 bg-zinc-800/40" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/20")}>{m}</button>
                ))}
              </div>
            )}

            {/* Ships list */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 && <div className="p-3 text-center text-[10px] text-zinc-700 font-mono">No ships found</div>}
              {filtered.map(s => (
                <button key={s.id} onClick={() => handleSelect(s)} className={"w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-yellow-500/5 transition-colors border-b border-zinc-800/30 " + (s.reference === currentRef ? "bg-yellow-500/10" : "")}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-zinc-300 truncate">{s.localizedName || s.name}</div>
                    <div className="text-[8px] font-mono text-zinc-600">{s.manufacturer}</div>
                  </div>
                  {s.reference === currentRef && <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/60 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
