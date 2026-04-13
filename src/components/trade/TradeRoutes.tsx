"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  useTradeWorkOrderStore,
  type TradeRoutePrefill,
} from "@/store/useTradeWorkOrderStore";

/* ── Types ── */
interface RouteItem {
  commodity: { abbr: string; name: string; kind: string };
  buyStation: { name: string; system: string };
  sellStation: { name: string; system: string };
  priceBuy: number;
  priceSell: number;
  profitPerScu: number;
  totalProfit: number;
  roi: number;
  investment: number;
}
interface RoutesResp {
  routes: RouteItem[];
  total: number;
  page: number;
  totalPages: number;
  cargoScu: number;
}
interface FilterData {
  vehicles: { name: string; cargo: number }[];
  systems: string[];
  stations: { name: string; system: string }[];
  commodities: { abbr: string; name: string; kind: string }[];
}

type SortField = "profit" | "roi" | "profit_per_scu";

export default function TradeRoutes() {
  // Filter state
  const [vehicle, setVehicle] = useState("");
  const [cargoScu, setCargoScu] = useState(100);
  const [maxInvestment, setMaxInvestment] = useState("");
  const [systemStart, setSystemStart] = useState("");
  const [systemEnd, setSystemEnd] = useState("");
  const [stationStart, setStationStart] = useState("");
  const [stationEnd, setStationEnd] = useState("");
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

  // Vehicle search combobox
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const vehicleRef = useRef<HTMLDivElement>(null);

  // Send-to-WO modal state
  const [woModalRoute, setWoModalRoute] = useState<RouteItem | null>(null);
  const requestOpenFromRoute = useTradeWorkOrderStore(
    (s) => s.requestOpenFromRoute,
  );

  const routeToPrefill = useCallback(
    (r: RouteItem): TradeRoutePrefill => ({
      commodity_code: r.commodity.abbr,
      commodity_name: r.commodity.name,
      buy_station: r.buyStation.name,
      buy_system: r.buyStation.system,
      sell_station: r.sellStation.name,
      sell_system: r.sellStation.system,
      buy_price_per_scu: r.priceBuy,
      sell_price_per_scu: r.priceSell,
      scu_bought: cargoScu,
    }),
    [cargoScu],
  );

  const openInFullEditor = useCallback(
    (r: RouteItem) => {
      requestOpenFromRoute(routeToPrefill(r));
      setWoModalRoute(null);
    },
    [requestOpenFromRoute, routeToPrefill],
  );

  // Close vehicle dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (vehicleRef.current && !vehicleRef.current.contains(e.target as Node)) {
        setVehicleOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredVehicles =
    filters?.vehicles?.filter((v) =>
      v.name.toLowerCase().includes(vehicleSearch.toLowerCase()),
    ) || [];

  // Load filter options
  useEffect(() => {
    fetch("/api/trade/filters")
      .then((r) => r.json())
      .then((data) => {
        // Only set filters if the response has the expected shape
        if (data && Array.isArray(data.systems)) {
          setFilters(data);
        } else {
          console.warn("[TradeRoutes] filters response invalid:", data);
        }
      })
      .catch((err) => console.error("[TradeRoutes] filters fetch error:", err));
  }, []);

  // When vehicle changes, update cargo
  useEffect(() => {
    if (!vehicle || !filters?.vehicles) return;
    const v = filters.vehicles.find((v) => v.name === vehicle);
    if (v) setCargoScu(v.cargo);
  }, [vehicle, filters]);

  // Filtered stations based on selected system
  const stationsStart =
    filters?.stations?.filter(
      (s) => !systemStart || s.system === systemStart,
    ) || [];
  const stationsEnd =
    filters?.stations?.filter(
      (s) => !systemEnd || s.system === systemEnd,
    ) || [];

  // Fetch routes
  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({
        cargo_scu: String(cargoScu),
        sortBy,
        sortOrder: sortDesc ? "desc" : "asc",
        page: String(page),
        limit: "30",
      });
      if (maxInvestment) p.set("max_investment", maxInvestment);
      if (commodity) p.set("commodity", commodity);
      if (systemStart) p.set("system_start", systemStart);
      if (systemEnd) p.set("system_end", systemEnd);
      if (stationStart) p.set("station_start", stationStart);
      if (stationEnd) p.set("station_end", stationEnd);
      if (minProfit) p.set("min_profit", minProfit);

      const res = await fetch(`/api/trade/routes?${p}`);
      if (!res.ok) throw new Error("Error al cargar rutas");
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [
    cargoScu,
    maxInvestment,
    commodity,
    systemStart,
    systemEnd,
    stationStart,
    stationEnd,
    minProfit,
    sortBy,
    sortDesc,
    page,
  ]);

  useEffect(() => {
    const t = setTimeout(fetchRoutes, 350);
    return () => clearTimeout(t);
  }, [fetchRoutes]);

  const handleSort = (f: SortField) => {
    if (sortBy === f) setSortDesc(!sortDesc);
    else {
      setSortBy(f);
      setSortDesc(true);
    }
    setPage(1);
  };

  const resetAll = () => {
    setVehicle("");
    setCargoScu(100);
    setMaxInvestment("");
    setSystemStart("");
    setSystemEnd("");
    setStationStart("");
    setStationEnd("");
    setCommodity("");
    setMinProfit("");
    setSortBy("profit");
    setSortDesc(true);
    setPage(1);
  };

  const fmtN = (n: number) => Math.round(n).toLocaleString();
  const arrow = (f: SortField) =>
    sortBy === f ? (sortDesc ? " ↓" : " ↑") : "";
  const pColor = (p: number) =>
    p >= 10000
      ? "text-emerald-400"
      : p >= 3000
        ? "text-amber-400"
        : p > 0
          ? "text-zinc-300"
          : "text-red-400";
  const rBg = (p: number) =>
    p >= 10000
      ? "bg-emerald-950/10"
      : p >= 3000
        ? "bg-amber-950/10"
        : "";

  const selectClass =
    "w-full bg-zinc-800/50 border border-zinc-700/60 rounded-sm px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-cyan-500/50 appearance-none";
  const inputClass =
    "w-full bg-zinc-800/50 border border-zinc-700/60 rounded-sm px-2.5 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-cyan-500/50";
  const labelClass =
    "text-[9px] uppercase tracking-widest text-zinc-500 block mb-1";

  return (
    <div className="space-y-4">
      {/* ── Toggle filters ── */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="text-[10px] uppercase tracking-widest text-zinc-400 hover:text-cyan-400 transition-colors flex items-center gap-1.5"
        >
          <span>{showFilters ? "▼" : "▶"}</span> Filtros Avanzados
        </button>
        <div className="text-[10px] font-mono text-zinc-600">
          {data ? `${data.total} rutas · ${data.cargoScu} SCU` : ""}
        </div>
      </div>

      {/* ── Filter Panel ── */}
      {showFilters && (
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-sm p-4 space-y-3">
          {/* Row 1: Vehicle + SCU + Investment + Commodity + MinProfit */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Vehicle combobox */}
            <div
              className="col-span-2 sm:col-span-1 lg:col-span-2 relative"
              ref={vehicleRef}
            >
              <label className={labelClass}>Vehicle</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder={vehicle || "— Buscar nave —"}
                  value={
                    vehicleOpen
                      ? vehicleSearch
                      : vehicle
                        ? `${vehicle} (${filters?.vehicles.find((v) => v.name === vehicle)?.cargo ?? ""} SCU)`
                        : ""
                  }
                  onChange={(e) => {
                    setVehicleSearch(e.target.value);
                    setVehicleOpen(true);
                  }}
                  onFocus={() => {
                    setVehicleOpen(true);
                    setVehicleSearch("");
                  }}
                  className={`${inputClass} pr-7`}
                  autoComplete="off"
                />
                {vehicle && (
                  <button
                    onClick={() => {
                      setVehicle("");
                      setVehicleSearch("");
                      setCargoScu(100);
                      setPage(1);
                    }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs leading-none"
                    title="Limpiar"
                  >
                    ✕
                  </button>
                )}
                {!vehicle && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 text-[8px] pointer-events-none">
                    ▼
                  </span>
                )}
              </div>
              {vehicleOpen && (
                <div className="absolute z-50 left-0 right-0 mt-0.5 max-h-56 overflow-y-auto bg-zinc-900 border border-zinc-700/60 rounded-sm shadow-xl">
                  <button
                    onClick={() => {
                      setVehicle("");
                      setVehicleSearch("");
                      setCargoScu(100);
                      setVehicleOpen(false);
                      setPage(1);
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200 transition-colors"
                  >
                    — Cualquiera —
                  </button>
                  {filteredVehicles.length > 0 ? (
                    filteredVehicles.map((v) => (
                      <button
                        key={v.name}
                        onClick={() => {
                          setVehicle(v.name);
                          setVehicleSearch("");
                          setVehicleOpen(false);
                          setPage(1);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 text-xs transition-colors ${vehicle === v.name ? "bg-amber-500/15 text-amber-400" : "text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100"}`}
                      >
                        <span className="font-medium">{v.name}</span>
                        <span className="ml-1.5 text-zinc-500 font-mono text-[10px]">
                          {v.cargo} SCU
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-2.5 py-3 text-xs text-zinc-600 text-center">
                      Sin resultados
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className={labelClass}>SCU</label>
              <input
                type="number"
                min={1}
                value={cargoScu}
                onChange={(e) => {
                  setCargoScu(Math.max(1, parseInt(e.target.value) || 1));
                  setPage(1);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Inversión Max (UEC)</label>
              <input
                type="number"
                min={0}
                placeholder="Sin límite"
                value={maxInvestment}
                onChange={(e) => {
                  setMaxInvestment(e.target.value);
                  setPage(1);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Commodity</label>
              <select
                value={commodity}
                onChange={(e) => {
                  setCommodity(e.target.value);
                  setPage(1);
                }}
                className={selectClass}
              >
                <option value="">— Todas —</option>
                {filters?.commodities.map((c) => (
                  <option key={c.abbr} value={c.abbr}>
                    {c.name}
                    {c.kind ? ` (${c.kind})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Profit Mínimo</label>
              <input
                type="number"
                min={0}
                placeholder="0"
                value={minProfit}
                onChange={(e) => {
                  setMinProfit(e.target.value);
                  setPage(1);
                }}
                className={inputClass}
              />
            </div>
          </div>

          {/* Row 2: Origin / Destination */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Origin */}
            <div className="space-y-2">
              <div className="text-[9px] uppercase tracking-widest text-cyan-500/70 font-medium">
                Origen
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Sistema</label>
                  <select
                    value={systemStart}
                    onChange={(e) => {
                      setSystemStart(e.target.value);
                      setStationStart("");
                      setPage(1);
                    }}
                    className={selectClass}
                  >
                    <option value="">— All —</option>
                    {filters?.systems.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Terminal</label>
                  <select
                    value={stationStart}
                    onChange={(e) => {
                      setStationStart(e.target.value);
                      setPage(1);
                    }}
                    className={selectClass}
                  >
                    <option value="">— All —</option>
                    {stationsStart.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Destination */}
            <div className="space-y-2">
              <div className="text-[9px] uppercase tracking-widest text-amber-500/70 font-medium">
                Destino
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Sistema</label>
                  <select
                    value={systemEnd}
                    onChange={(e) => {
                      setSystemEnd(e.target.value);
                      setStationEnd("");
                      setPage(1);
                    }}
                    className={selectClass}
                  >
                    <option value="">— All —</option>
                    {filters?.systems.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Terminal</label>
                  <select
                    value={stationEnd}
                    onChange={(e) => {
                      setStationEnd(e.target.value);
                      setPage(1);
                    }}
                    className={selectClass}
                  >
                    <option value="">— All —</option>
                    {stationsEnd.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Reset */}
          <div className="flex justify-end">
            <button
              onClick={resetAll}
              className="px-3 py-1.5 bg-zinc-800/40 hover:bg-zinc-700/40 border border-zinc-700/60 rounded-sm text-[9px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Reset Filtros
            </button>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="p-3 bg-red-950/20 border border-red-800/40 rounded-sm text-xs text-red-400">
          {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="h-10 bg-zinc-900/40 rounded-sm animate-pulse"
              style={{ animationDelay: `${i * 40}ms` }}
            />
          ))}
        </div>
      ) : data && data.routes.length > 0 ? (
        <>
          {/* ── Table ── */}
          <div className="overflow-x-auto rounded-sm border border-zinc-800/60">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800/60 bg-zinc-950/80 text-zinc-500">
                  <th className="px-3 py-2.5 text-left font-mono font-medium">
                    Commodity
                  </th>
                  <th className="px-3 py-2.5 text-left font-mono font-medium">
                    Comprar en
                  </th>
                  <th className="px-3 py-2.5 text-left font-mono font-medium">
                    Vender en
                  </th>
                  <th
                    className="px-3 py-2.5 text-right font-mono font-medium cursor-pointer hover:text-zinc-200 transition-colors select-none"
                    onClick={() => handleSort("profit_per_scu")}
                  >
                    UEC/SCU{arrow("profit_per_scu")}
                  </th>
                  <th
                    className="px-3 py-2.5 text-right font-mono font-medium cursor-pointer hover:text-zinc-200 transition-colors select-none"
                    onClick={() => handleSort("profit")}
                  >
                    Profit{arrow("profit")}
                  </th>
                  <th
                    className="px-3 py-2.5 text-right font-mono font-medium cursor-pointer hover:text-zinc-200 transition-colors select-none"
                    onClick={() => handleSort("roi")}
                  >
                    ROI%{arrow("roi")}
                  </th>
                  <th className="px-3 py-2.5 text-right font-mono font-medium">
                    Inversión
                  </th>
                  <th className="px-3 py-2.5 text-center font-mono font-medium">
                    WO
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.routes.map((r, i) => (
                  <tr
                    key={`${r.commodity.abbr}-${r.buyStation.name}-${r.sellStation.name}-${i}`}
                    className={`border-b border-zinc-800/20 transition-colors hover:bg-zinc-800/20 ${rBg(r.totalProfit)}`}
                  >
                    <td className="px-3 py-2">
                      <span className="text-amber-400 font-mono font-medium">
                        {r.commodity.name}
                      </span>
                      {r.commodity.kind && (
                        <span className="ml-1.5 text-[9px] text-zinc-600">
                          {r.commodity.kind}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-zinc-300 font-medium">
                        {r.buyStation.name}
                      </div>
                      <div className="text-[10px] text-zinc-600">
                        {r.buyStation.system}
                      </div>
                      <div className="text-cyan-400/80 font-mono text-[10px]">
                        {fmtN(r.priceBuy)} UEC
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-zinc-300 font-medium">
                        {r.sellStation.name}
                      </div>
                      <div className="text-[10px] text-zinc-600">
                        {r.sellStation.system}
                      </div>
                      <div className="text-cyan-400/80 font-mono text-[10px]">
                        {fmtN(r.priceSell)} UEC
                      </div>
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono ${pColor(r.profitPerScu)}`}
                    >
                      {fmtN(r.profitPerScu)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono font-semibold ${pColor(r.totalProfit)}`}
                    >
                      {fmtN(r.totalProfit)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-400">
                      {r.roi.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">
                      {fmtN(r.investment)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => setWoModalRoute(r)}
                        className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-sm transition-colors"
                        title="Enviar a Work Order"
                      >
                        → WO
                      </button>
                    </td>
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
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-2.5 py-1 text-[10px] bg-zinc-800/40 hover:bg-zinc-700/40 disabled:opacity-30 border border-zinc-700/60 rounded-sm transition-colors"
                >
                  ← Prev
                </button>
                {Array.from({ length: Math.min(7, data.totalPages) }).map(
                  (_, i) => {
                    const pn =
                      page <= 4 ? i + 1 : Math.max(1, page - 3) + i;
                    if (pn > data.totalPages) return null;
                    return (
                      <button
                        key={pn}
                        onClick={() => setPage(pn)}
                        className={`px-2 py-1 text-[10px] rounded-sm transition-colors ${page === pn ? "bg-amber-500/20 border border-amber-500/40 text-amber-400" : "bg-zinc-800/40 hover:bg-zinc-700/40 border border-zinc-700/60 text-zinc-400"}`}
                      >
                        {pn}
                      </button>
                    );
                  },
                )}
                <button
                  onClick={() =>
                    setPage(Math.min(data.totalPages, page + 1))
                  }
                  disabled={page === data.totalPages}
                  className="px-2.5 py-1 text-[10px] bg-zinc-800/40 hover:bg-zinc-700/40 disabled:opacity-30 border border-zinc-700/60 rounded-sm transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        !loading && (
          <div className="py-16 text-center">
            <div className="text-zinc-600 text-sm">
              No se encontraron rutas comerciales con estos filtros.
            </div>
            <div className="text-zinc-700 text-xs mt-1">
              Intentá cambiar los filtros o ampliar el rango.
            </div>
          </div>
        )
      )}

      {/* ── Send-to-WO Modal ── */}
      {woModalRoute && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setWoModalRoute(null)}
        >
          <div
            className="w-full max-w-lg bg-zinc-950/95 border border-amber-500/40 rounded-sm p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
                  Enviar a Work Order
                </div>
                <div className="mt-1 text-lg font-mono text-zinc-100">
                  {woModalRoute.commodity.name}
                </div>
                <div className="text-xs text-zinc-500 font-mono">
                  {woModalRoute.buyStation.name} → {woModalRoute.sellStation.name}
                </div>
              </div>
              <button
                onClick={() => setWoModalRoute(null)}
                className="text-zinc-500 hover:text-zinc-200 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-6">
              <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-sm p-3">
                <div className="text-[9px] font-mono uppercase text-zinc-500">
                  SCU
                </div>
                <div className="text-sm font-mono text-zinc-200">
                  {fmtN(cargoScu)}
                </div>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-sm p-3">
                <div className="text-[9px] font-mono uppercase text-zinc-500">
                  Inversión
                </div>
                <div className="text-sm font-mono text-cyan-400">
                  {fmtN(woModalRoute.investment)}
                </div>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-sm p-3">
                <div className="text-[9px] font-mono uppercase text-zinc-500">
                  Profit est.
                </div>
                <div
                  className={`text-sm font-mono font-semibold ${pColor(woModalRoute.totalProfit)}`}
                >
                  {fmtN(woModalRoute.totalProfit)}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => openInFullEditor(woModalRoute)}
                className="w-full px-4 py-2.5 text-xs font-mono uppercase tracking-widest bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 rounded-sm transition-colors"
              >
                Abrir en editor completo
              </button>
              <button
                onClick={() => setWoModalRoute(null)}
                className="w-full px-4 py-2 text-xs font-mono uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
