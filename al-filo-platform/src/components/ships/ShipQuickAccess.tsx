"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "sc-labs-ship-quick-access";
const MAX_TABS = 12;

export interface QuickAccessShip {
  reference: string;
  name: string;
  manufacturer: string | null;
  thumbUrl: string;
}

const MFR_PREFIXES = [
  "Aegis", "RSI", "Drake", "MISC", "Anvil", "Origin", "Crusader", "Argo",
  "Aopoa", "Consolidated Outland", "Esperia", "Gatac", "Greycat", "Kruger",
  "Musashi Industrial", "Tumbril", "Banu", "Vanduul", "Roberts Space Industries",
  "Crusader Industries", "Musashi", "CO",
];

function getThumbUrl(name: string, manufacturer?: string | null): string {
  let n = name || "";
  if (manufacturer) {
    const m = manufacturer.trim();
    if (n.startsWith(m + " ")) n = n.slice(m.length + 1);
  }
  for (const m of MFR_PREFIXES) {
    if (n.startsWith(m + " ")) { n = n.slice(m.length + 1); break; }
  }
  const slug = n.toLowerCase().replace(/[''()]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/-$/, "");
  return `/ships/${slug}.jpg`;
}

function loadTabs(): QuickAccessShip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTabs(tabs: QuickAccessShip[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs.slice(0, MAX_TABS)));
  } catch { /* quota */ }
}

interface ShipQuickAccessProps {
  currentShipRef?: string;
}

export default function ShipQuickAccess({ currentShipRef }: ShipQuickAccessProps) {
  const [tabs, setTabs] = useState<QuickAccessShip[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setTabs(loadTabs());
  }, []);

  const addShip = useCallback((ship: QuickAccessShip) => {
    setTabs(prev => {
      const filtered = prev.filter(t => t.reference !== ship.reference);
      const updated = [ship, ...filtered].slice(0, MAX_TABS);
      saveTabs(updated);
      return updated;
    });
  }, []);

  const removeShip = useCallback((reference: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTabs(prev => {
      const updated = prev.filter(t => t.reference !== reference);
      saveTabs(updated);
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    setTabs([]);
    saveTabs([]);
  }, []);

  // Expose addShip via a global ref that the parent can call
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__shipQuickAccessAdd = addShip;
    return () => { delete (window as unknown as Record<string, unknown>).__shipQuickAccessAdd; };
  }, [addShip]);

  if (tabs.length === 0) return null;

  return (
    <div className={`fixed left-0 top-1/2 -translate-y-1/2 z-40 transition-all duration-300 ${collapsed ? "w-8" : "w-[72px]"}`}>
      {/* Toggle button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-0 w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors z-10"
        title={collapsed ? "Expandir" : "Colapsar"}
      >
        {collapsed ? "»" : "«"}
      </button>

      {collapsed ? (
        /* Collapsed: just a thin bar with count */
        <div className="bg-zinc-900/90 backdrop-blur-sm border-r border-zinc-800/60 rounded-r-lg py-3 px-1.5">
          <div className="text-[10px] text-zinc-500 text-center writing-mode-vertical" style={{ writingMode: "vertical-rl" }}>
            {tabs.length} naves
          </div>
        </div>
      ) : (
        /* Expanded sidebar */
        <div className="bg-zinc-900/95 backdrop-blur-sm border-r border-zinc-800/60 rounded-r-lg py-2 px-1.5 space-y-1.5 max-h-[70vh] overflow-y-auto scrollbar-thin">
          {/* Back to ships list */}
          <Link
            href="/ships"
            className="flex items-center justify-center w-full h-10 rounded bg-zinc-800/50 border border-zinc-700/40 text-zinc-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-colors mb-2"
            title="Volver a la lista de naves"
          >
            <span className="text-sm">←</span>
          </Link>

          {/* Ship tabs */}
          {tabs.map(ship => {
            const isActive = currentShipRef === ship.reference;
            return (
              <Link
                key={ship.reference}
                href={`/ships/${ship.reference}`}
                className={`group relative block rounded overflow-hidden border transition-all ${
                  isActive
                    ? "border-cyan-500/50 shadow-[0_0_10px_-3px_rgba(6,182,212,0.3)]"
                    : "border-zinc-800/40 hover:border-zinc-600/60"
                }`}
                title={ship.name}
              >
                <div className="w-[60px] h-[40px] relative">
                  <img
                    src={ship.thumbUrl}
                    alt={ship.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/80 to-transparent" />
                  {isActive && <div className="absolute inset-0 bg-cyan-500/10" />}
                </div>
                <div className="px-1 py-0.5 bg-zinc-900/90">
                  <p className="text-[8px] text-zinc-400 truncate leading-tight">
                    {ship.name.replace(ship.manufacturer ?? "", "").trim() || ship.name}
                  </p>
                </div>
                {/* Close button */}
                <button
                  onClick={(e) => removeShip(ship.reference, e)}
                  className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-zinc-900/80 text-zinc-600 hover:text-red-400 text-[8px] opacity-0 group-hover:opacity-100 transition-opacity rounded-bl"
                >
                  ✕
                </button>
              </Link>
            );
          })}

          {/* Clear all */}
          {tabs.length > 1 && (
            <button
              onClick={clearAll}
              className="w-full text-[9px] text-zinc-600 hover:text-red-400 transition-colors py-1 text-center"
              title="Cerrar todas"
            >
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
