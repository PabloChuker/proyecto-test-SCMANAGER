// =============================================================================
// AL FILO — ComponentPicker v8 (Final Polish)
// Fix: when hardpoint.maxSize is 0, don't send size filter to API
// =============================================================================

"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { EquippedItem, ResolvedHardpoint } from "@/store/useLoadoutStore";
import { CAT_COLORS, fmtPrice, getKeyStat } from "./loadout-utils";
import powerNetworkLookup from "@/data/power-network-lookup.json";

const pnLookup = powerNetworkLookup as Record<string, any>;

const CAT_TO_API_TYPE: Record<string, string> = {
  WEAPON: "WEAPON", TURRET: "WEAPON,TURRET", MISSILE_RACK: "MISSILE",
  SHIELD: "SHIELD", POWER_PLANT: "POWER_PLANT", COOLER: "COOLER",
  QUANTUM_DRIVE: "QUANTUM_DRIVE", MINING: "MINING_LASER", UTILITY: "TRACTOR_BEAM,EMP,QED",
};

interface CatalogItem {
  id: string; reference: string; name: string; localizedName: string | null;
  className: string | null; type: string; size: number | null;
  grade: string | null; manufacturer: string | null;
  weaponStats?: any; shieldStats?: any; powerStats?: any; coolingStats?: any;
  quantumStats?: any; miningStats?: any; missileStats?: any; thrusterStats?: any;
  shopInventory?: Array<{ priceBuy: number | null; priceSell: number | null; shop: { name: string; location: { name: string; parentName: string | null } } }>;
}

interface ComponentPickerProps {
  hardpoint: ResolvedHardpoint;
  currentItemId: string | null;
  onSelect: (item: EquippedItem) => void;
  onClear: () => void;
  onClose: () => void;
}

type SortKey = "name" | "size" | "grade" | "stat" | "price" | "manufacturer";
type SortDir = "asc" | "desc";

export function ComponentPicker({ hardpoint, currentItemId, onSelect, onClear, onClose }: ComponentPickerProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("stat");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const catColor = CAT_COLORS[hardpoint.resolvedCategory] || "#71717a";

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const apiTypes = CAT_TO_API_TYPE[hardpoint.resolvedCategory] || "OTHER";
        const body: Record<string, any> = { types: apiTypes, limit: 80, include: "stats,shops" };
        // Only filter by size if maxSize > 0
        if (hardpoint.maxSize > 0) body.maxSize = hardpoint.maxSize;
        if (hardpoint.minSize > 0) body.minSize = hardpoint.minSize;
        if (search.trim()) body.search = search.trim();
        const res = await fetch("/api/catalog", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        setResults(json.data || []);
        setTotal(json.meta?.total || 0);
      } catch (err) { if (err instanceof DOMException && err.name === "AbortError") return; } finally { setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, hardpoint.resolvedCategory, hardpoint.maxSize, hardpoint.minSize]);

  const getItemStats = useCallback((item: CatalogItem): Record<string, any> | null => {
    return item.weaponStats || item.shieldStats || item.powerStats || item.coolingStats || item.quantumStats || item.miningStats || item.missileStats || item.thrusterStats || null;
  }, []);

  const getBestPrice = useCallback((item: CatalogItem): number | null => {
    if (!item.shopInventory || item.shopInventory.length === 0) return null;
    const prices = item.shopInventory.map(si => si.priceBuy).filter((p): p is number => p !== null && p > 0);
    return prices.length > 0 ? Math.min(...prices) : null;
  }, []);

  const getBestShop = useCallback((item: CatalogItem): string | null => {
    if (!item.shopInventory || item.shopInventory.length === 0) return null;
    const sorted = item.shopInventory.filter(si => si.priceBuy !== null && si.priceBuy > 0).sort((a, b) => (a.priceBuy ?? 0) - (b.priceBuy ?? 0));
    if (sorted.length === 0) return null;
    return sorted[0].shop.name + " · " + sorted[0].shop.location.name;
  }, []);

  const sorted = useMemo(() => {
    const copy = [...results];
    copy.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      switch (sortKey) {
        case "name": av = (a.localizedName || a.name).toLowerCase(); bv = (b.localizedName || b.name).toLowerCase(); break;
        case "size": av = a.size ?? 0; bv = b.size ?? 0; break;
        case "grade": av = a.grade || "Z"; bv = b.grade || "Z"; break;
        case "stat": av = getSortStatVal(getItemStats(a), hardpoint.resolvedCategory); bv = getSortStatVal(getItemStats(b), hardpoint.resolvedCategory); break;
        case "price": av = getBestPrice(a) ?? 999999; bv = getBestPrice(b) ?? 999999; break;
        case "manufacturer": av = (a.manufacturer || "zzz").toLowerCase(); bv = (b.manufacturer || "zzz").toLowerCase(); break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [results, sortKey, sortDir, hardpoint.resolvedCategory, getItemStats, getBestPrice]);

  const toggleSort = useCallback((key: SortKey) => { if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir(key === "price" ? "asc" : "desc"); } }, [sortKey]);

  const handleItemSelect = useCallback((item: CatalogItem) => {
    const stats = getItemStats(item);
    // Attach powerNetwork from the JSON lookup so the power grid picks it up
    const pn = item.className ? pnLookup[item.className] ?? null : null;
    onSelect({ id: item.id, reference: item.reference, name: item.name, localizedName: item.localizedName, className: item.className, type: item.type, size: item.size, grade: item.grade, manufacturer: item.manufacturer, componentStats: stats, powerNetwork: pn });
  }, [getItemStats, onSelect]);

  const statLabel = getStatColumnLabel(hardpoint.resolvedCategory);
  const displaySize = hardpoint.maxSize > 0 ? "S" + hardpoint.maxSize : "Any";

  return (
    <>
      <div className="fixed inset-0 bg-black/80 z-50" onClick={onClose} />
      <div className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[720px] sm:max-h-[75vh] bg-zinc-950 border border-zinc-800/70 rounded-sm flex flex-col z-50 shadow-2xl shadow-black/60">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50 flex-shrink-0">
          <div className="w-1 h-5 rounded-full opacity-60" style={{ backgroundColor: catColor }} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-widest uppercase text-zinc-500">Select Component</div>
            <div className="text-sm text-zinc-300 truncate">{hardpoint.resolvedCategory} · {displaySize} {hardpoint.isFixed ? "Fixed" : "Gimbal"}</div>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>

        <div className="px-4 py-2 border-b border-zinc-800/30 flex-shrink-0">
          <div className="flex items-center gap-2">
            <input ref={inputRef} type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or manufacturer..." className="flex-1 px-3 py-2 bg-zinc-900/60 border border-zinc-800/50 rounded-sm text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/30 transition-colors" />
            <button onClick={onClear} className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors tracking-wide uppercase px-2 py-2 border border-zinc-800/40 rounded-sm hover:border-red-400/30">Clear slot</button>
          </div>
          <div className="text-[10px] text-zinc-700 font-mono mt-1">{total} compatible</div>
        </div>

        <div className="flex items-center gap-1 px-4 py-1.5 border-b border-zinc-800/40 bg-zinc-900/30 text-[9px] tracking-widest uppercase text-zinc-600 flex-shrink-0">
          <ColHead label="Name" k="name" cur={sortKey} dir={sortDir} toggle={toggleSort} cls="flex-1" />
          <ColHead label="S" k="size" cur={sortKey} dir={sortDir} toggle={toggleSort} cls="w-7 text-center" />
          <ColHead label="Gr" k="grade" cur={sortKey} dir={sortDir} toggle={toggleSort} cls="w-7 text-center" />
          <ColHead label={statLabel} k="stat" cur={sortKey} dir={sortDir} toggle={toggleSort} cls="w-14 text-right" />
          <ColHead label="Price" k="price" cur={sortKey} dir={sortDir} toggle={toggleSort} cls="w-16 text-right" />
          <ColHead label="Mfr" k="manufacturer" cur={sortKey} dir={sortDir} toggle={toggleSort} cls="w-20 text-right hidden sm:block" />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-zinc-600 text-sm"><div className="w-4 h-4 border-2 border-zinc-700 border-t-cyan-500 rounded-full animate-spin mr-2" />Loading...</div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 text-sm">No compatible components found.</div>
          ) : sorted.map(item => {
            const isCurrent = item.id === currentItemId;
            const sv = getKeyStat(hardpoint.resolvedCategory, getItemStats(item));
            const price = getBestPrice(item);
            const shop = getBestShop(item);
            const rowCls = isCurrent ? "w-full flex items-center gap-1 px-4 py-2 text-left bg-cyan-500/5 cursor-default border-b border-zinc-800/20" : "w-full flex items-center gap-1 px-4 py-2 text-left hover:bg-zinc-800/30 cursor-pointer border-b border-zinc-800/20 transition-colors";
            return (
              <button key={item.id} onClick={() => handleItemSelect(item)} disabled={isCurrent} className={rowCls}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5"><span className="text-[13px] text-zinc-200 truncate">{item.localizedName || item.name}</span>{isCurrent && <span className="text-[8px] text-cyan-500 tracking-wider">EQUIPPED</span>}</div>
                  {shop && <div className="text-[9px] text-zinc-600 truncate">{shop}</div>}
                </div>
                <div className="w-7 text-center text-[12px] font-mono text-zinc-500">S{item.size ?? "?"}</div>
                <div className="w-7 text-center">{item.grade ? <span className={gradeClass(item.grade)}>{item.grade}</span> : <span className="text-zinc-800">-</span>}</div>
                <div className="w-14 text-right font-mono text-[12px]" style={{ color: catColor }}>{sv ? sv.v : <span className="text-zinc-800">-</span>}</div>
                <div className="w-16 text-right">{price !== null ? <span className="text-[11px] font-mono text-amber-400/80">{fmtPrice(price)}</span> : <span className="text-[10px] text-zinc-800">-</span>}</div>
                <div className="w-20 text-right text-[11px] text-zinc-600 truncate hidden sm:block">{item.manufacturer || "-"}</div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function ColHead({ label, k, cur, dir, toggle, cls }: { label: string; k: SortKey; cur: SortKey; dir: SortDir; toggle: (k: SortKey) => void; cls: string }) {
  const active = cur === k;
  return <button onClick={() => toggle(k)} className={cls + " cursor-pointer hover:text-zinc-400 transition-colors select-none " + (active ? "text-zinc-400" : "")}>{label}{active ? (dir === "asc" ? " ↑" : " ↓") : ""}</button>;
}

function getStatColumnLabel(cat: string): string {
  switch (cat) { case "WEAPON": case "TURRET": return "DPS"; case "SHIELD": return "HP"; case "POWER_PLANT": return "Output"; case "COOLER": return "Rate"; case "QUANTUM_DRIVE": return "Spool"; case "MISSILE_RACK": return "DMG"; default: return "Pwr"; }
}

function getSortStatVal(stats: Record<string, any> | null, cat: string): number {
  if (!stats) return 0;
  switch (cat) { case "WEAPON": case "TURRET": return stats.dps ?? 0; case "SHIELD": return stats.maxHp ?? stats.shieldHp ?? 0; case "POWER_PLANT": return stats.powerOutput ?? 0; case "COOLER": return stats.coolingRate ?? 0; case "QUANTUM_DRIVE": return stats.spoolUpTime ?? stats.quantumSpoolUp ?? 999; case "MISSILE_RACK": return stats.damage ?? stats.alphaDamage ?? 0; default: return stats.powerDraw ?? 0; }
}

function gradeClass(g: string | number): string {
  const s = String(g).toUpperCase();
  switch (s) { case "A": case "1": return "text-[10px] font-mono font-bold text-amber-400"; case "B": case "2": return "text-[10px] font-mono font-bold text-cyan-400"; case "C": case "3": return "text-[10px] font-mono font-bold text-zinc-400"; default: return "text-[10px] font-mono font-bold text-zinc-600"; }
}
