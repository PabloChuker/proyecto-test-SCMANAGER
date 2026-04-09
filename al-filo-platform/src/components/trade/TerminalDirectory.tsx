"use client";

import { useState, useEffect } from "react";

interface Terminal {
  id: number;
  name: string;
  nickname: string;
  code: string;
  type: string;
  starSystemName: string;
  planetName: string;
  orbitName: string;
  moonName: string | null;
  spaceStationName: string | null;
  outpostName: string | null;
  cityName: string | null;
  factionName: string;
  companyName: string;
  maxContainerSize: number;
  isHabitation: boolean;
  isRefinery: boolean;
  isCargoCenter: boolean;
  isMedical: boolean;
  isFood: boolean;
  isRefuel: boolean;
  isRepair: boolean;
  isNqa: boolean;
  isAutoLoad: boolean;
  hasLoadingDock: boolean;
  hasFreightElevator: boolean;
}

interface TerminalsResponse {
  terminals: Terminal[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface CommodityAtTerminal {
  id: number;
  commodity_name: string;
  price_buy: number;
  price_sell: number;
  price_buy_avg: number;
  price_sell_avg: number;
  scu_buy: number;
  scu_sell_stock: number;
  status_buy: number;
  status_sell: number;
}

const SYSTEM_MAP: Record<string, number | null> = { All: null, Stanton: 68, Pyro: 64, Nyx: 55 };

const AMENITY_BADGES = [
  { key: "isRefuel", label: "Refuel", color: "text-yellow-400 border-yellow-500/20 bg-yellow-500/10" },
  { key: "isRepair", label: "Repair", color: "text-orange-400 border-orange-500/20 bg-orange-500/10" },
  { key: "isMedical", label: "Medical", color: "text-pink-400 border-pink-500/20 bg-pink-500/10" },
  { key: "isFood", label: "Food", color: "text-green-400 border-green-500/20 bg-green-500/10" },
  { key: "isHabitation", label: "Hab", color: "text-blue-400 border-blue-500/20 bg-blue-500/10" },
  { key: "isAutoLoad", label: "AutoLoad", color: "text-cyan-400 border-cyan-500/20 bg-cyan-500/10" },
  { key: "isCargoCenter", label: "Cargo", color: "text-amber-400 border-amber-500/20 bg-amber-500/10" },
  { key: "isRefinery", label: "Refinery", color: "text-purple-400 border-purple-500/20 bg-purple-500/10" },
] as const;

export default function TerminalDirectory() {
  const [search, setSearch] = useState("");
  const [systemKey, setSystemKey] = useState("All");
  const [amenityFilter, setAmenityFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TerminalsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [commodities, setCommodities] = useState<CommodityAtTerminal[]>([]);
  const [loadingCommodities, setLoadingCommodities] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    const run = async () => {
      setLoading(true);
      try {
        const p = new URLSearchParams({ page: String(page), limit: "30" });
        if (search) p.set("search", search);
        const sysId = SYSTEM_MAP[systemKey];
        if (sysId) p.set("id_star_system", String(sysId));
        if (amenityFilter) p.set("has_amenity", amenityFilter);

        const res = await fetch(`/api/trade/terminals?${p}`, { signal: ac.signal });
        if (!res.ok) throw new Error("Error");
        setData(await res.json());
      } catch (e: any) {
        if (e.name !== "AbortError") console.error(e);
      } finally {
        setLoading(false);
      }
    };
    const t = setTimeout(run, 250);
    return () => { clearTimeout(t); ac.abort(); };
  }, [search, systemKey, amenityFilter, page]);

  const toggleExpand = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setLoadingCommodities(true);
    try {
      const res = await fetch(`https://api.uexcorp.space/2.0/commodities_prices?id_terminal=${id}`);
      const json = await res.json();
      setCommodities(json.data || []);
    } catch { setCommodities([]); }
    finally { setLoadingCommodities(false); }
  };

  const getLocation = (t: Terminal) => {
    const parts = [t.starSystemName];
    if (t.planetName) parts.push(t.planetName);
    if (t.spaceStationName) parts.push(t.spaceStationName);
    else if (t.cityName) parts.push(t.cityName);
    else if (t.outpostName) parts.push(t.outpostName);
    return parts.join(" · ");
  };

  return (
    <div className="space-y-4">
      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5">Buscar Terminal</label>
          <input type="text" placeholder="Nombre, código..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-zinc-800/50 border border-zinc-700/60 rounded-sm px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5">Sistema</label>
          <select value={systemKey} onChange={e => { setSystemKey(e.target.value); setPage(1); }}
            className="bg-zinc-800/50 border border-zinc-700/60 rounded-sm px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500/50">
            {Object.keys(SYSTEM_MAP).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      </div>

      {/* ── Amenity Badges ── */}
      <div className="flex flex-wrap gap-1.5">
        {AMENITY_BADGES.map(a => (
          <button key={a.key}
            onClick={() => { setAmenityFilter(amenityFilter === a.key ? null : a.key); setPage(1); }}
            className={`text-[9px] px-2 py-1 rounded-sm border font-mono transition-colors ${
              amenityFilter === a.key ? a.color : "text-zinc-600 border-zinc-700/40 hover:border-zinc-600"
            }`}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ── Results ── */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 bg-zinc-900/40 rounded-sm animate-pulse border border-zinc-800/40" />
          ))}
        </div>
      ) : data && data.terminals.length > 0 ? (
        <>
          <div className="space-y-2">
            {data.terminals.map(t => {
              const isExpanded = expandedId === t.id;
              return (
                <div key={t.id}>
                  <button onClick={() => toggleExpand(t.id)}
                    className={`w-full text-left p-3 rounded-sm border transition-all duration-200 ${
                      isExpanded
                        ? "bg-zinc-800/60 border-cyan-500/30"
                        : "bg-zinc-900/50 border-zinc-800/40 hover:border-zinc-700/60 hover:bg-zinc-900/70"
                    }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-100">{t.nickname || t.name}</span>
                          {t.isNqa && <span className="text-[8px] px-1 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-sm font-mono">NQA</span>}
                          <span className="text-[9px] font-mono text-zinc-600">{t.code}</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">{getLocation(t)}</div>
                        {t.companyName && <div className="text-[10px] text-zinc-600 mt-0.5">{t.companyName}</div>}
                      </div>
                      <div className="flex flex-wrap gap-1 ml-3 max-w-[200px] justify-end">
                        {AMENITY_BADGES.filter(a => (t as any)[a.key]).map(a => (
                          <span key={a.key} className={`text-[8px] px-1 py-0.5 rounded-sm border font-mono ${a.color}`}>
                            {a.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-4 mt-2 text-[10px]">
                      <span className="text-zinc-600">Max Container: <span className="text-zinc-400 font-mono">{t.maxContainerSize} SCU</span></span>
                      {t.hasFreightElevator && <span className="text-zinc-600">Freight Elevator</span>}
                      {t.hasLoadingDock && <span className="text-zinc-600">Loading Dock</span>}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-1 p-2 bg-zinc-950/80 border border-zinc-800/40 rounded-sm max-h-72 overflow-y-auto">
                      {loadingCommodities ? (
                        <div className="text-[10px] text-zinc-600 animate-pulse py-4 text-center">Cargando commodities...</div>
                      ) : commodities.length > 0 ? (
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="text-zinc-600 border-b border-zinc-800/40">
                              <th className="text-left py-1 font-mono">Commodity</th>
                              <th className="text-right py-1 font-mono">Compra</th>
                              <th className="text-right py-1 font-mono">Venta</th>
                              <th className="text-right py-1 font-mono">Stock</th>
                              <th className="text-center py-1 font-mono">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {commodities.map(c => (
                              <tr key={c.id} className="border-b border-zinc-800/20 hover:bg-zinc-800/20">
                                <td className="py-1 text-zinc-300">{c.commodity_name}</td>
                                <td className="py-1 text-right font-mono text-cyan-400/80">
                                  {c.price_buy > 0 ? Math.round(c.price_buy).toLocaleString() : "—"}
                                </td>
                                <td className="py-1 text-right font-mono text-amber-400/80">
                                  {c.price_sell > 0 ? Math.round(c.price_sell).toLocaleString() : "—"}
                                </td>
                                <td className="py-1 text-right font-mono text-zinc-500">
                                  {c.scu_sell_stock > 0 ? c.scu_sell_stock : "—"}
                                </td>
                                <td className="py-1 text-center">
                                  <div className="flex justify-center gap-1">
                                    {c.status_buy > 0 && <span className="text-[8px] text-cyan-400/60">BUY</span>}
                                    {c.status_sell > 0 && <span className="text-[8px] text-amber-400/60">SELL</span>}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="text-[10px] text-zinc-600 py-4 text-center">Sin datos de commodities</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-mono text-zinc-600">{data.total} terminales</div>
              <div className="flex gap-1.5">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                  className="px-2.5 py-1 text-[10px] bg-zinc-800/40 hover:bg-zinc-700/40 disabled:opacity-30 border border-zinc-700/60 rounded-sm transition-colors">←</button>
                <span className="px-2 py-1 text-[10px] font-mono text-zinc-500">{page} / {data.totalPages}</span>
                <button onClick={() => setPage(Math.min(data.totalPages, page + 1))} disabled={page === data.totalPages}
                  className="px-2.5 py-1 text-[10px] bg-zinc-800/40 hover:bg-zinc-700/40 disabled:opacity-30 border border-zinc-700/60 rounded-sm transition-colors">→</button>
              </div>
            </div>
          )}
        </>
      ) : !loading && (
        <div className="py-16 text-center text-zinc-600 text-sm">No se encontraron terminales.</div>
      )}
    </div>
  );
}
