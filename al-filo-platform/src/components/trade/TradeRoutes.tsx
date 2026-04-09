"use client";

import { useState, useEffect } from "react";

/* ── Types matching API response ── */
interface RouteItem {
  commodity: { id: number; name: string; kind: string };
  buyTerminal: { id: number; name: string; starSystemName: string; planetName: string };
  sellTerminal: { id: number; name: string; starSystemName: string; planetName: string };
  priceBuy: number;
  priceSell: number;
  profitPerScu: number;
  totalProfit: number;
  roi: number;
  investment: number;
}

interface RoutesResponse {
  routes: RouteItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  cargoScu: number;
}

const SYSTEM_MAP: Record<string, number | null> = {
  All: null,
  Stanton: 68,
  Pyro: 64,
  Nyx: 55,
};

type SortField = "profit" | "roi" | "profit_per_scu";

export default function TradeRoutes() {
  const [cargoScu, setCargoScu] = useState(100);
  const [systemKey, setSystemKey] = useState("All");
  const [minProfit, setMinProfit] = useState(0);
  const [sortBy, setSortBy] = useState<SortField>("profit");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<RoutesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const p = new URLSearchParams({
          cargo_scu: String(cargoScu),
          min_profit: String(minProfit),
          sortBy,
          sortOrder: sortDesc ? "desc" : "asc",
          page: String(page),
          limit: "30",
        });
        const sysId = SYSTEM_MAP[systemKey];
        if (sysId) p.set("id_star_system", String(sysId));

        const res = await fetch(`/api/trade/routes?${p}`, { signal: ac.signal });
        if (!res.ok) throw new Error("Error al cargar rutas");
        const json: RoutesResponse = await res.json();
        setData(json);
      } catch (e: any) {
        if (e.name !== "AbortError") setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    const t = setTimeout(run, 250);
    return () => { clearTimeout(t); ac.abort(); };
  }, [cargoScu, systemKey, minProfit, sortBy, sortDesc, page]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) setSortDesc(!sortDesc);
    else { setSortBy(field); setSortDesc(true); }
    setPage(1);
  };

  const arrow = (field: SortField) => sortBy === field ? (sortDesc ? " ↓" : " ↑") : "";

  const fmtN = (n: number) => Math.round(n).toLocaleString();
  const profitColor = (p: number) => p >= 10000 ? "text-emerald-400" : p >= 3000 ? "text-amber-400" : p > 0 ? "text-zinc-300" : "text-red-400";
  const rowBg = (p: number) => p >= 10000 ? "bg-emerald-950/10" : p >= 3000 ? "bg-amber-950/10" : "";

  return (
    <div className="space-y-4">
      {/* ── Filters ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5">Cargo (SCU)</label>
          <input type="number" min={1} value={cargoScu}
            onChange={e => { setCargoScu(Math.max(1, parseInt(e.target.value) || 1)); setPage(1); }}
            className="w-full bg-zinc-800/50 border border-zinc-700/60 rounded-sm px-3 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-cyan-500/50" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5">Sistema</label>
          <select value={systemKey} onChange={e => { setSystemKey(e.target.value); setPage(1); }}
            className="w-full bg-zinc-800/50 border border-zinc-700/60 rounded-sm px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500/50">
            {Object.keys(SYSTEM_MAP).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5">Profit Mínimo</label>
          <input type="number" min={0} value={minProfit}
            onChange={e => { setMinProfit(Math.max(0, parseInt(e.target.value) || 0)); setPage(1); }}
            className="w-full bg-zinc-800/50 border border-zinc-700/60 rounded-sm px-3 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-cyan-500/50" />
        </div>
        <div className="flex items-end">
          <button onClick={() => { setCargoScu(100); setSystemKey("All"); setMinProfit(0); setSortBy("profit"); setSortDesc(true); setPage(1); }}
            className="w-full px-3 py-1.5 bg-zinc-800/40 hover:bg-zinc-700/40 border border-zinc-700/60 rounded-sm text-[10px] uppercase tracking-widest text-zinc-400 transition-colors">
            Reset
          </button>
        </div>
        <div className="hidden lg:flex items-end">
          <div className="text-[10px] font-mono text-zinc-600">
            {data ? `${data.total} rutas encontradas` : ""}
          </div>
        </div>
      </div>

      {/* ── Error ── */}
      {error && <div className="p-3 bg-red-950/20 border border-red-800/40 rounded-sm text-xs text-red-400">{error}</div>}

      {/* ── Loading ── */}
      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-9 bg-zinc-900/40 rounded-sm animate-pulse" style={{ animationDelay: `${i * 40}ms` }} />
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
                  <th className="px-3 py-2.5 text-right font-mono font-medium cursor-pointer hover:text-zinc-200 transition-colors" onClick={() => handleSort("profit_per_scu")}>
                    UEC/SCU{arrow("profit_per_scu")}
                  </th>
                  <th className="px-3 py-2.5 text-right font-mono font-medium cursor-pointer hover:text-zinc-200 transition-colors" onClick={() => handleSort("profit")}>
                    Profit Total{arrow("profit")}
                  </th>
                  <th className="px-3 py-2.5 text-right font-mono font-medium cursor-pointer hover:text-zinc-200 transition-colors" onClick={() => handleSort("roi")}>
                    ROI%{arrow("roi")}
                  </th>
                  <th className="px-3 py-2.5 text-right font-mono font-medium">Inversión</th>
                </tr>
              </thead>
              <tbody>
                {data.routes.map((r, i) => (
                  <tr key={`${r.commodity.id}-${r.buyTerminal.id}-${r.sellTerminal.id}`}
                    className={`border-b border-zinc-800/20 transition-colors hover:bg-zinc-800/20 ${rowBg(r.totalProfit)}`}>
                    <td className="px-3 py-2">
                      <span className="text-amber-400 font-mono font-medium">{r.commodity.name}</span>
                      {r.commodity.kind && <span className="ml-1.5 text-[9px] text-zinc-600">{r.commodity.kind}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-zinc-300">{r.buyTerminal.name}</div>
                      <div className="text-[10px] text-zinc-600">{r.buyTerminal.starSystemName} · {r.buyTerminal.planetName}</div>
                      <div className="text-cyan-400/80 font-mono text-[10px]">{fmtN(r.priceBuy)} UEC</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-zinc-300">{r.sellTerminal.name}</div>
                      <div className="text-[10px] text-zinc-600">{r.sellTerminal.starSystemName} · {r.sellTerminal.planetName}</div>
                      <div className="text-cyan-400/80 font-mono text-[10px]">{fmtN(r.priceSell)} UEC</div>
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${profitColor(r.profitPerScu)}`}>{fmtN(r.profitPerScu)}</td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${profitColor(r.totalProfit)}`}>{fmtN(r.totalProfit)}</td>
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
              <div className="text-[10px] font-mono text-zinc-600">
                Página {data.page} de {data.totalPages}
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                  className="px-2.5 py-1 text-[10px] bg-zinc-800/40 hover:bg-zinc-700/40 disabled:opacity-30 border border-zinc-700/60 rounded-sm transition-colors">
                  ← Prev
                </button>
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
                  className="px-2.5 py-1 text-[10px] bg-zinc-800/40 hover:bg-zinc-700/40 disabled:opacity-30 border border-zinc-700/60 rounded-sm transition-colors">
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      ) : !loading && (
        <div className="py-16 text-center">
          <div className="text-zinc-600 text-sm">No se encontraron rutas comerciales con estos filtros.</div>
          <div className="text-zinc-700 text-xs mt-1">Intentá bajar el profit mínimo o cambiar de sistema.</div>
        </div>
      )}
    </div>
  );
}
