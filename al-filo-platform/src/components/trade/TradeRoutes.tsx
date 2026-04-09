"use client";

import { useState, useEffect, useCallback } from "react";

/* ── Types ── */
interface RouteItem {
  commodity: { id: number; name: string; code: string; kind: string };
  buyTerminal: { id: number; name: string; system: string; planet: string };
  sellTerminal: { id: number; name: string; system: string; planet: string };
  priceBuy: number;
  priceSell: number;
  profitPerScu: number;
  totalProfit: number;
  roi: number;
  investment: number;
}
interface RoutesResp { routes: RouteItem[]; total: number; page: number; totalPages: number; cargoScu: number }
interface FilterData {
  vehicles: { name: string; cargo: number }[];
  terminals: { id: number; label: string; planet: string; system: string }[];
  orbits: { planet: string; system: string }[];
  systems: { id: number; name: string }[];
  commodities: { id: number; name: string; code: string; kind: string }[];
}

type SortField = "profit" | "roi" | "profit_per_scu";

export default function TradeRoutes() {
  // Filter state
  const [vehicle, setVehicle] = useState("");
  const [cargoScu, setCargoScu] = useState(100);
  const [maxInvestment, setMaxInvestment] = useState("");
  const [systemStart, setSystemStart] = useState("");
  const [systemEnd, setSystemEnd] = useState("");
  const [orbitStart, setOrbitStart] = useState("");
  const [orbitEnd, setOrbitEnd] = useState("");
  const [terminalStart, setTerminalStart] = useState("");
  const [terminalEnd, setTerminalEnd] = useState("");
  const [commodity, setCommodity] = useState("");
  const [minProfit, setMinProfit] = useState("");

  // Sort & pagination
  const [sortBy, setSortBy] = useState<SortField>("profit");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);

  // Data
  const [filters, setFilters] = useState<FilterData | null>(null);
  const [data, setData] = useState<RoutesResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);

  // Load filter options
  useEffect(() => {
    fetch("/api/trade/filters").then(r => r.json()).then(setFilters).catch(() => {});
  }, []);

  // When vehicle changes, update cargo
  useEffect(() => {
    if (!vehicle || !filters) return;
    const v = filters.vehicles.find(v => v.name === vehicle);
    if (v) setCargoScu(v.cargo);
  }, [vehicle, filters]);

  // Filtered orbits/terminals based on selected system
  const orbitsStart = filters?.orbits.filter(o => !systemStart || o.system === filters.systems.find(s => String(s.id) === systemStart)?.name) || [];
  const orbitsEnd = filters?.orbits.filter(o => !systemEnd || o.system === filters.systems.find(s => String(s.id) === systemEnd)?.name) || [];
  const terminalsStart = filters?.terminals.filter(t => {
    if (systemStart && t.system !== filters.systems.find(s => String(s.id) === systemStart)?.name) return false;
    if (orbitStart && t.planet !== orbitStart) return false;
    return true;
  }) || [];
  const terminalsEnd = filters?.terminals.filter(t => {
    if (systemEnd && t.system !== filters.systems.find(s => String(s.id) === systemEnd)?.name) return false;
    if (orbitEnd && t.planet !== orbitEnd) return false;
    return true;
  }) || [];

  // Fetch routes
  const fetchRoutes = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams({
        cargo_scu: String(cargoScu),
        sortBy, sortOrder: sortDesc ? "desc" : "asc",
        page: String(page), limit: "30",
      });
      if (maxInvestment) p.set("max_investment", maxInvestment);
      if (commodity) p.set("id_commodity", commodity);
      if (systemStart) p.set("system_start", systemStart);
      if (systemEnd) p.set("system_end", systemEnd);
      if (orbitStart) p.set("orbit_start", orbitStart);
      if (orbitEnd) p.set("orbit_end", orbitEnd);
      if (terminalStart) p.set("terminal_start", terminalStart);
      if (terminalEnd) p.set("terminal_end", terminalEnd);
      if (minProfit) p.set("min_profit", minProfit);

      const res = await fetch(`/api/trade/routes?${p}`);
      if (!res.ok) throw new Error("Error al cargar rutas");
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [cargoScu, maxInvestment, commodity, systemStart, systemEnd, orbitStart, orbitEnd, terminalStart, terminalEnd, minProfit, sortBy, sortDesc, page]);

  useEffect(() => {
    const t = setTimeout(fetchRoutes, 350);
    return () => clearTimeout(t);
  }, [fetchRoutes]);

  const handleSort = (f: SortField) => {
    if (sortBy === f) setSortDesc(!sortDesc);
    else { setSortBy(f); setSortDesc(true); }
    setPage(1);
  };

  const resetAll = () => {
    setVehicle(""); setCargoScu(100); setMaxInvestment("");
    setSystemStart(""); setSystemEnd(""); setOrbitStart(""); setOrbitEnd("");
    setTerminalStart(""); setTerminalEnd(""); setCommodity(""); setMinProfit("");
    setSortBy("profit"); setSortDesc(true); setPage(1);
  };

  const fmtN = (n: number) => Math.round(n).toLocaleString();
  const arrow = (f: SortField) => sortBy === f ? (sortDesc ? " ↓" : " ↑") : "";
  const pColor = (p: number) => p >= 10000 ? "text-emerald-400" : p >= 3000 ? "text-amber-400" : p > 0 ? "text-zinc-300" : "text-red-400";
  const rBg = (p: number) => p >= 10000 ? "bg-emerald-950/10" : p >= 3000 ? "bg-amber-950/10" : "";

  const selectClass = "w-full bg-zinc-800/50 border border-zinc-700/60 rounded-sm px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-cyan-500/50 appearance-none";
  const inputClass = "w-full bg-zinc-800/50 border border-zinc-700/60 rounded-sm px-2.5 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-cyan-500/50";
  const labelClass = "text-[9px] uppercase tracking-widest text-zinc-500 block mb-1";

  return (
    <div className="space-y-4">
      {/* ── Toggle filters ── */}
      <div className="flex items-center justify-between">
        <button onClick={() => setShowFilters(!showFilters)}
          className="text-[10px] uppercase tracking-widest text-zinc-400 hover:text-cyan-400 transition-colors flex items-center gap-1.5">
          <span>{showFilters ? "▼" : "▶"}</span> Filtros Avanzados
        </button>
        <div className="text-[10px] font-mono text-zinc-600">
          {data ? `${data.total} rutas · ${data.cargoScu} SCU` : ""}
        </div>
      </div>

      {/* ── Filter Panel ── */}
      {showFilters && (
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-sm p-4 space-y-3">
          {/* Row 1: Vehicle + SCU + Investment */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="col-span-2 sm:col-span-1 lg:col-span-2">
              <label className={labelClass}>Vehicle</label>
              <select value={vehicle} onChange={e => { setVehicle(e.target.value); setPage(1); }} className={selectClass}>
                <option value="">— Cualquiera —</option>
                {filters?.vehicles.map(v => (
                  <option key={v.name} value={v.name}>{v.name} ({v.cargo} SCU)</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>SCU</label>
              <input type="number" min={1} value={cargoScu}
                onChange={e => { setCargoScu(Math.max(1, parseInt(e.target.value) || 1)); setPage(1); }}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Inversión Max (UEC)</label>
              <input type="number" min={0} placeholder="Sin límite" value={maxInvestment}
                onChange={e => { setMaxInvestment(e.target.value); setPage(1); }}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Commodity</label>
              <select value={commodity} onChange={e => { setCommodity(e.target.value); setPage(1); }} className={selectClass}>
                <option value="">— Todas —</option>
                {filters?.commodities.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Profit Mínimo</label>
              <input type="number" min={0} placeholder="0" value={minProfit}
                onChange={e => { setMinProfit(e.target.value); setPage(1); }}
                className={inputClass} />
            </div>
          </div>

          {/* Row 2: Origin filters */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="text-[9px] uppercase tracking-widest text-cyan-500/70 font-medium">Origen</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelClass}>Sistema</label>
                  <select value={systemStart} onChange={e => { setSystemStart(e.target.value); setOrbitStart(""); setTerminalStart(""); setPage(1); }} className={selectClass}>
                    <option value="">— All —</option>
                    {filters?.systems.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Orbita / Planeta</label>
                  <select value={orbitStart} onChange={e => { setOrbitStart(e.target.value); setTerminalStart(""); setPage(1); }} className={selectClass}>
                    <option value="">— All —</option>
                    {orbitsStart.map(o => <option key={o.planet} value={o.planet}>{o.planet}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Terminal</label>
                  <select value={terminalStart} onChange={e => { setTerminalStart(e.target.value); setPage(1); }} className={selectClass}>
                    <option value="">— All —</option>
                    {terminalsStart.map(t => <option key={t.id} value={String(t.id)}>{t.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-[9px] uppercase tracking-widest text-amber-500/70 font-medium">Destino</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelClass}>Sistema</label>
                  <select value={systemEnd} onChange={e => { setSystemEnd(e.target.value); setOrbitEnd(""); setTerminalEnd(""); setPage(1); }} className={selectClass}>
                    <option value="">— All —</option>
                    {filters?.systems.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Orbita / Planeta</label>
                  <select value={orbitEnd} onChange={e => { setOrbitEnd(e.target.value); setTerminalEnd(""); setPage(1); }} className={selectClass}>
                    <option value="">— All —</option>
                    {orbitsEnd.map(o => <option key={o.planet} value={o.planet}>{o.planet}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Terminal</label>
                  <select value={terminalEnd} onChange={e => { setTerminalEnd(e.target.value); setPage(1); }} className={selectClass}>
                    <option value="">— All —</option>
                    {terminalsEnd.map(t => <option key={t.id} value={String(t.id)}>{t.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Reset */}
          <div className="flex justify-end">
            <button onClick={resetAll}
              className="px-3 py-1.5 bg-zinc-800/40 hover:bg-zinc-700/40 border border-zinc-700/60 rounded-sm text-[9px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors">
              Reset Filtros
            </button>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && <div className="p-3 bg-red-950/20 border border-red-800/40 rounded-sm text-xs text-red-400">{error}</div>}

      {/* ── Loading ── */}
      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-10 bg-zinc-900/40 rounded-sm animate-pulse" style={{ animationDelay: `${i * 40}ms` }} />
          ))}
        </div>
      ) : data && data.routes.length > 0 ? (
        <>
          {/* ── Table ── */}
          <div className="overflow-x-auto rounded-sm border border-zinc-800/60">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800/60 bg-zinc-950/80 text-zinc-500">
                  <th className="px-3 py-2.5 text-left font-mono font-medium">Commodity</th>
                  <th className="px-3 py-2.5 text-left font-mono font-medium">Comprar en</th>
                  <th className="px-3 py-2.5 text-left font-mono font-medium">Vender en</th>
                  <th className="px-3 py-2.5 text-right font-mono font-medium cursor-pointer hover:text-zinc-200 transition-colors select-none" onClick={() => handleSort("profit_per_scu")}>
                    UEC/SCU{arrow("profit_per_scu")}
                  </th>
                  <th className="px-3 py-2.5 text-right font-mono font-medium cursor-pointer hover:text-zinc-200 transition-colors select-none" onClick={() => handleSort("profit")}>
                    Profit{arrow("profit")}
                  </th>
                  <th className="px-3 py-2.5 text-right font-mono font-medium cursor-pointer hover:text-zinc-200 transition-colors select-none" onClick={() => handleSort("roi")}>
                    ROI%{arrow("roi")}
                  </th>
                  <th className="px-3 py-2.5 text-right font-mono font-medium">Inversión</th>
                </tr>
              </thead>
              <tbody>
                {data.routes.map((r, i) => (
                  <tr key={`${r.commodity.id}-${r.buyTerminal.id}-${r.sellTerminal.id}-${i}`}
                    className={`border-b border-zinc-800/20 transition-colors hover:bg-zinc-800/20 ${rBg(r.totalProfit)}`}>
                    <td className="px-3 py-2">
                      <span className="text-amber-400 font-mono font-medium">{r.commodity.name}</span>
                      {r.commodity.kind && <span className="ml-1.5 text-[9px] text-zinc-600">{r.commodity.kind}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-zinc-300 font-medium">{r.buyTerminal.name}</div>
                      <div className="text-[10px] text-zinc-600">{r.buyTerminal.system} · {r.buyTerminal.planet}</div>
                      <div className="text-cyan-400/80 font-mono text-[10px]">{fmtN(r.priceBuy)} UEC</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-zinc-300 font-medium">{r.sellTerminal.name}</div>
                      <div className="text-[10px] text-zinc-600">{r.sellTerminal.system} · {r.sellTerminal.planet}</div>
                      <div className="text-cyan-400/80 font-mono text-[10px]">{fmtN(r.priceSell)} UEC</div>
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${pColor(r.profitPerScu)}`}>{fmtN(r.profitPerScu)}</td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${pColor(r.totalProfit)}`}>{fmtN(r.totalProfit)}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-400">{r.roi.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">{fmtN(r.investment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-mono text-zinc-600">Página {data.page} de {data.totalPages}</div>
              <div className="flex gap-1.5">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                  className="px-2.5 py-1 text-[10px] bg-zinc-800/40 hover:bg-zinc-700/40 disabled:opacity-30 border border-zinc-700/60 rounded-sm transition-colors">← Prev</button>
                {Array.from({ length: Math.min(7, data.totalPages) }).map((_, i) => {
                  const pn = page <= 4 ? i + 1 : Math.max(1, page - 3) + i;
                  if (pn > data.totalPages) return null;
                  return (
                    <button key={pn} onClick={() => setPage(pn)}
                      className={`px-2 py-1 text-[10px] rounded-sm transition-colors ${page === pn ? "bg-amber-500/20 border border-amber-500/40 text-amber-400" : "bg-zinc-800/40 hover:bg-zinc-700/40 border border-zinc-700/60 text-zinc-400"}`}>
                      {pn}
                    </button>
                  );
                })}
                <button onClick={() => setPage(Math.min(data.totalPages, page + 1))} disabled={page === data.totalPages}
                  className="px-2.5 py-1 text-[10px] bg-zinc-800/40 hover:bg-zinc-700/40 disabled:opacity-30 border border-zinc-700/60 rounded-sm transition-colors">Next →</button>
              </div>
            </div>
          )}
        </>
      ) : !loading && (
        <div className="py-16 text-center">
          <div className="text-zinc-600 text-sm">No se encontraron rutas comerciales con estos filtros.</div>
          <div className="text-zinc-700 text-xs mt-1">Intentá cambiar los filtros o ampliar el rango.</div>
        </div>
      )}
    </div>
  );
}
