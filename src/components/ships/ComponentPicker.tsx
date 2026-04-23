// =============================================================================
// AL FILO — ComponentPicker v8 (Final Polish)
// Fix: when hardpoint.maxSize is 0, don't send size filter to API
// =============================================================================

"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { EquippedItem, ResolvedHardpoint } from "@/store/useLoadoutStore";
import { CAT_COLORS, fmtPrice, getKeyStat } from "./loadout-utils";
import powerNetworkLookup from "@/data/power-network-lookup.json";
import miningModulesJson from "@/data/mining/mining-modules.json";
import {
  ComponentContextMenu,
  type ComponentContextMenuTarget,
} from "@/components/components/ComponentContextMenu";

const pnLookup = powerNetworkLookup as Record<string, any>;

const CAT_TO_API_TYPE: Record<string, string> = {
  WEAPON: "WEAPON", TURRET: "WEAPON,TURRET", MISSILE_RACK: "MISSILE", MISSILE: "MISSILE",
  SHIELD: "SHIELD", POWER_PLANT: "POWER_PLANT", COOLER: "COOLER",
  QUANTUM_DRIVE: "QUANTUM_DRIVE", MINING: "MINING_LASER", UTILITY: "TRACTOR_BEAM,EMP,QED",
};

// Mining modules no viven en la BD: vienen del JSON curado en
// src/data/mining/mining-modules.json. Cuando el hardpoint es MINING_MODULE
// (sub-slot dentro del laser minero) bypass-eamos /api/catalog y mapeamos
// las entries del JSON al shape CatalogItem.
type MiningModuleJson = {
  id: string;
  name: string;
  category: "active" | "passive" | "gadget";
  effects: Record<string, number>;
};
const MINING_MODULES = miningModulesJson as MiningModuleJson[];

function miningModuleToCatalogItem(m: MiningModuleJson): CatalogItem {
  // Usamos la 1ra stat no-cero como preview para el stat column.
  const previewEntry =
    Object.entries(m.effects).find(([, v]) => v !== 0) ?? ["laserPower", 0];
  return {
    id: `mining_module:${m.id}`,
    reference: m.id,
    name: m.name,
    localizedName: m.name,
    className: m.id,
    type: "MINING_MODULE",
    size: null,
    grade: m.category.charAt(0).toUpperCase(), // A/P/G
    manufacturer: null,
    miningStats: { miningPower: previewEntry[1], ...m.effects },
  };
}

// Mapeo categoría del hardpoint → item_type usado en user_inventory / user_wishlist.
// Debe coincidir con TABLE_TO_ITEM_TYPE en src/app/components/page.tsx.
const CAT_TO_ITEM_TYPE: Record<string, string> = {
  WEAPON: "WEAPON",
  TURRET: "TURRET",
  MISSILE_RACK: "MISSILE",
  SHIELD: "SHIELD",
  POWER_PLANT: "POWER_PLANT",
  COOLER: "COOLER",
  QUANTUM_DRIVE: "QUANTUM_DRIVE",
  MINING: "MINING",
  UTILITY: "UTILITY",
};

interface CatalogItem {
  id: string; reference: string; name: string; localizedName: string | null;
  className: string | null; type: string; size: number | null;
  grade: string | null; manufacturer: string | null;
  weaponStats?: any; shieldStats?: any; powerStats?: any; coolingStats?: any;
  quantumStats?: any; miningStats?: any; missileStats?: any;
  turretStats?: any; thrusterStats?: any;
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

type SubFilter = "all" | "weapons" | "gimbals";

export function ComponentPicker({ hardpoint, currentItemId, onSelect, onClear, onClose }: ComponentPickerProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("stat");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [contextMenu, setContextMenu] = useState<ComponentContextMenuTarget | null>(null);
  const [subFilter, setSubFilter] = useState<SubFilter>("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const catColor = CAT_COLORS[hardpoint.resolvedCategory] || "#71717a";
  const isTurretSlot = hardpoint.resolvedCategory === "TURRET";

  // Auto-filtro de marca solo tiene sentido en slots TURRET (gimbal mounts).
  // Las naves estan bianeadas a ciertos mounts (ej Avenger trae VariPuck), pero
  // las armas que van ADENTRO del mount son libres — ahi el usuario quiere ver
  // todas las opciones, no solo la marca del default.
  //
  // Guard: si el brand viene como UUID (data legacy del endpoint ships/[id]
  // que no joinea manufacturers), ignoramos para no filtrar con un string que
  // no matchea con los names legibles que el catalog si devuelve.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const rawBrand = hardpoint.defaultItem?.manufacturer ?? null;
  const canAutoFilter =
    isTurretSlot && rawBrand !== null && !UUID_RE.test(rawBrand);
  const defaultBrand = canAutoFilter ? rawBrand : null;
  const [brandFilter, setBrandFilter] = useState<string | null>(defaultBrand);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // MINING_MODULE: fuente local (mining-modules.json), sin API call.
    if (hardpoint.resolvedCategory === "MINING_MODULE") {
      const q = search.trim().toLowerCase();
      const items = MINING_MODULES.filter(
        (m) => !q || m.name.toLowerCase().includes(q) || m.category.includes(q),
      ).map(miningModuleToCatalogItem);
      setResults(items);
      setTotal(items.length);
      setLoading(false);
      return;
    }

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
    return item.weaponStats || item.shieldStats || item.powerStats || item.coolingStats || item.quantumStats || item.miningStats || item.missileStats || item.turretStats || item.thrusterStats || null;
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

  // Filter for turret slots: separate weapons from gimbal mounts.
  //
  // Fase J: el endpoint /api/catalog ahora consulta la tabla `turrets` real
  // (gimbal mounts con sub_type GunTurret/MannedTurret/etc) y devuelve
  // type="TURRET", separado de type="WEAPON" (armas de weapon_guns). Asi
  // que el filtro es una simple comparacion por type — sin regex, sin falsos
  // positivos con armas cuyo class_name incluye "_Turret_".
  //
  // Fase J.1: ademas del filtro por tipo, si el slot tiene un defaultItem
  // con marca (ej VariPuck) auto-filtramos por esa marca. El usuario puede
  // desactivarlo con el chip "Only [Brand]" debajo del buscador.
  const filtered = useMemo(() => {
    let out = sorted;
    if (isTurretSlot && subFilter === "gimbals") out = out.filter(i => i.type === "TURRET");
    else if (isTurretSlot && subFilter === "weapons") out = out.filter(i => i.type === "WEAPON");
    if (brandFilter) out = out.filter(i => i.manufacturer === brandFilter);
    return out;
  }, [sorted, subFilter, isTurretSlot, brandFilter]);

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
          <div className="flex items-center justify-between mt-1 gap-2 flex-wrap">
            <span className="text-[10px] text-zinc-700 font-mono">{filtered.length} compatible</span>
            <div className="flex items-center gap-2">
              {/* Brand chip — active when auto-filtered to a specific manufacturer.
                  Clickear: desactiva y muestra todos los brands. Clickear de
                  nuevo (si hay default): re-activa al brand del default. */}
              {brandFilter && (
                <button
                  onClick={() => setBrandFilter(null)}
                  title="Click para ver todas las marcas"
                  className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors"
                >
                  <span className="opacity-60">ONLY</span>
                  <span className="tracking-wide">{brandFilter}</span>
                  <svg className="w-2.5 h-2.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
              {!brandFilter && defaultBrand && (
                <button
                  onClick={() => setBrandFilter(defaultBrand)}
                  title={`Filtrar solo ${defaultBrand} (marca del default de esta nave)`}
                  className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono rounded bg-zinc-800/60 border border-zinc-700/50 text-zinc-400 hover:text-amber-300 hover:border-amber-500/30 transition-colors"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                  <span>Only {defaultBrand}</span>
                </button>
              )}
              {isTurretSlot && (
                <div className="flex gap-0.5 bg-zinc-800/60 rounded p-0.5">
                  {(["all", "weapons", "gimbals"] as SubFilter[]).map(f => (
                    <button key={f} onClick={() => setSubFilter(f)}
                      className={`px-2 py-0.5 text-[8px] font-mono rounded transition-colors uppercase ${subFilter === f ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"}`}>
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
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
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 text-sm">No compatible components found.</div>
          ) : filtered.map(item => {
            const isCurrent = item.id === currentItemId;
            const sv = getKeyStat(hardpoint.resolvedCategory, getItemStats(item));
            const price = getBestPrice(item);
            const shop = getBestShop(item);
            const rowCls = isCurrent ? "w-full flex items-center gap-1 px-4 py-2 text-left bg-cyan-500/5 cursor-default border-b border-zinc-800/20" : "w-full flex items-center gap-1 px-4 py-2 text-left hover:bg-zinc-800/30 cursor-pointer border-b border-zinc-800/20 transition-colors";
            return (
              <button
                key={item.id}
                onClick={() => handleItemSelect(item)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const itemType = CAT_TO_ITEM_TYPE[hardpoint.resolvedCategory] || hardpoint.resolvedCategory;
                  const ref = item.reference || item.className || item.id;
                  if (!ref || !item.name) return;
                  setContextMenu({
                    reference: String(ref),
                    name: String(item.localizedName || item.name),
                    itemType,
                    size: item.size ?? null,
                    grade: item.grade ?? null,
                    x: e.clientX,
                    y: e.clientY,
                  });
                }}
                disabled={isCurrent}
                className={rowCls}
              >
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

      {/* Context menu para agregar a inventario / wishlist con click derecho */}
      <ComponentContextMenu target={contextMenu} onClose={() => setContextMenu(null)} />
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
  switch (cat) {
    case "WEAPON": case "TURRET":
      // Armas (type=WEAPON) ordenan por DPS. Gimbal mounts (type=TURRET) no
      // tienen DPS — ordenamos por cantidad de puertos de arma (mas puertos
      // = mount mas "grande"/capable). Si no hay nada, 0 queda al final.
      return stats.dps ?? stats.weaponPorts ?? 0;
    case "SHIELD": return stats.maxHp ?? stats.shieldHp ?? 0;
    case "POWER_PLANT": return stats.powerOutput ?? 0;
    case "COOLER": return stats.coolingRate ?? 0;
    case "QUANTUM_DRIVE": return stats.spoolUpTime ?? stats.quantumSpoolUp ?? 999;
    case "MISSILE_RACK": return stats.damage ?? stats.alphaDamage ?? 0;
    default: return stats.powerDraw ?? 0;
  }
}

function gradeClass(g: string | number): string {
  const s = String(g).toUpperCase();
  switch (s) { case "A": case "1": return "text-[10px] font-mono font-bold text-amber-400"; case "B": case "2": return "text-[10px] font-mono font-bold text-cyan-400"; case "C": case "3": return "text-[10px] font-mono font-bold text-zinc-400"; default: return "text-[10px] font-mono font-bold text-zinc-600"; }
}
