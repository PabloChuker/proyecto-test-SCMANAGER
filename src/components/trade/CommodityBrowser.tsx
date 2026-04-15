"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

interface Commodity {
  id: string | number;
  name: string;
  code: string;
  kind: string;
  priceBuy: number | null;
  priceSell: number | null;
  isRaw: boolean;
  isRefined: boolean;
  isMineral: boolean;
  isBuyable: boolean;
  isSellable: boolean;
  isIllegal: boolean;
}

interface CommoditiesResponse {
  commodities: Commodity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  kinds: string[];
}

interface StationPrice {
  station: string;
  system: string;
  priceBuy: number;
  priceSell: number;
}

const KIND_COLORS: Record<string, string> = {
  Metal: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  Gas: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  Mineral: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  Agricultural: "text-green-400 bg-green-500/10 border-green-500/20",
  Drug: "text-red-400 bg-red-500/10 border-red-500/20",
  Medical: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  Food: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  Scrap: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
  Vice: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  Natural: "text-teal-400 bg-teal-500/10 border-teal-500/20",
  Halogen: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  "Non-Metal": "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  Chemical: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  "Raw Materials": "text-lime-400 bg-lime-500/10 border-lime-500/20",
  Temporary: "text-gray-400 bg-gray-500/10 border-gray-500/20",
  "Man-made": "text-blue-400 bg-blue-500/10 border-blue-500/20",
};

export default function CommodityBrowser() {
  const t = useTranslations("Trade.commodities");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [rawFilter, setRawFilter] = useState<"all" | "raw" | "refined">("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CommoditiesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [stationPrices, setStationPrices] = useState<StationPrice[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Fetch commodity list
  useEffect(() => {
    const ac = new AbortController();
    const run = async () => {
      setLoading(true);
      try {
        const p = new URLSearchParams({ page: String(page), limit: "60" });
        if (search) p.set("search", search);
        if (kind) p.set("kind", kind);
        if (rawFilter === "raw") p.set("is_raw", "1");
        if (rawFilter === "refined") p.set("is_raw", "0");

        const res = await fetch(`/api/trade/commodities?${p}`, { signal: ac.signal });
        if (!res.ok) throw new Error("Error");
        const json = await res.json();
        if (json.commodities) setData(json);
      } catch (e: any) {
        if (e.name !== "AbortError") console.error(e);
      } finally {
        setLoading(false);
      }
    };
    const t = setTimeout(run, 250);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [search, kind, rawFilter, page]);

  // Toggle expanded commodity → fetch per-station prices from our DB
  const toggleExpand = async (code: string) => {
    if (expandedCode === code) {
      setExpandedCode(null);
      return;
    }
    setExpandedCode(code);
    setLoadingPrices(true);
    try {
      const res = await fetch(`/api/trade/commodities?detail=${encodeURIComponent(code)}`);
      const json = await res.json();
      setStationPrices(json.stations || []);
    } catch {
      setStationPrices([]);
    } finally {
      setLoadingPrices(false);
    }
  };

  const fmtN = (n: number | null) =>
    n != null && n > 0 ? Math.round(n).toLocaleString() : "—";
  const kindClass = (k: string) =>
    KIND_COLORS[k] || "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";

  const margin = (buy: number | null, sell: number | null) => {
    if (!buy || !sell || buy <= 0 || sell <= 0) return null;
    return ((sell - buy) / buy) * 100;
  };

  return (
    <div className="space-y-4">
      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5">
            {t("search")}
          </label>
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full bg-zinc-800/50 border border-zinc-700/60 rounded-sm px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5">
            {t("type")}
          </label>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
            className="bg-zinc-800/50 border border-zinc-700/60 rounded-sm px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="">{t("all")}</option>
            {data?.kinds?.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-1">
          {(["all", "raw", "refined"] as const).map((v) => (
            <button
              key={v}
              onClick={() => {
                setRawFilter(v);
                setPage(1);
              }}
              className={`px-2.5 py-1.5 text-[10px] uppercase tracking-widest rounded-sm border transition-colors ${
                rawFilter === v
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                  : "text-zinc-500 border-zinc-700/60 hover:text-zinc-300 hover:border-zinc-600"
              }`}
            >
              {v === "all" ? t("all") : v === "raw" ? t("raw") : t("refined")}
            </button>
          ))}
        </div>
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="h-28 bg-zinc-900/40 rounded-sm animate-pulse border border-zinc-800/40"
            />
          ))}
        </div>
      ) : data && data.commodities.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {data.commodities.map((c) => {
              const m = margin(c.priceBuy, c.priceSell);
              const isExpanded = expandedCode === c.code;
              return (
                <div key={c.code}>
                  <button
                    onClick={() => toggleExpand(c.code)}
                    className={`w-full text-left p-3 rounded-sm border transition-all duration-200 ${
                      isExpanded
                        ? "bg-zinc-800/60 border-cyan-500/30"
                        : "bg-zinc-900/50 border-zinc-800/40 hover:border-zinc-700/60 hover:bg-zinc-900/70"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-sm font-medium text-zinc-100">
                          {c.name}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-600">
                          {c.code}
                        </div>
                      </div>
                      {c.kind && (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-sm border font-mono ${kindClass(c.kind)}`}
                        >
                          {c.kind}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <div className="text-zinc-600 uppercase">{t("buy")}</div>
                        <div className="font-mono text-cyan-400">
                          {fmtN(c.priceBuy)}
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-600 uppercase">{t("sell")}</div>
                        <div className="font-mono text-amber-400">
                          {fmtN(c.priceSell)}
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-600 uppercase">{t("margin")}</div>
                        <div
                          className={`font-mono ${m != null && m > 0 ? "text-emerald-400" : "text-zinc-600"}`}
                        >
                          {m != null ? `${m.toFixed(1)}%` : "—"}
                        </div>
                      </div>
                    </div>
                    {(c.isIllegal || c.isRaw) && (
                      <div className="flex gap-1.5 mt-2">
                        {c.isIllegal && (
                          <span className="text-[8px] px-1 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-sm font-mono">
                            {t("illegal")}
                          </span>
                        )}
                        {c.isRaw && (
                          <span className="text-[8px] px-1 py-0.5 bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 rounded-sm font-mono">
                            RAW
                          </span>
                        )}
                      </div>
                    )}
                  </button>

                  {/* ── Expanded: per-station prices ── */}
                  {isExpanded && (
                    <div className="mt-1 p-2 bg-zinc-950/80 border border-zinc-800/40 rounded-sm max-h-72 overflow-y-auto">
                      {loadingPrices ? (
                        <div className="text-[10px] text-zinc-600 animate-pulse py-4 text-center">
                          {t("loadingStationPrices")}
                        </div>
                      ) : stationPrices.length > 0 ? (
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="text-zinc-600 border-b border-zinc-800/40">
                              <th className="text-left py-1 font-mono">
                                {t("terminal")}
                              </th>
                              <th className="text-left py-1 font-mono">
                                {t("system")}
                              </th>
                              <th className="text-right py-1 font-mono">
                                {t("buy")}
                              </th>
                              <th className="text-right py-1 font-mono">
                                {t("sell")}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {stationPrices.map((sp) => (
                              <tr
                                key={sp.station}
                                className="border-b border-zinc-800/20 hover:bg-zinc-800/20"
                              >
                                <td className="py-1 text-zinc-300">
                                  {sp.station}
                                </td>
                                <td className="py-1 text-zinc-500">
                                  {sp.system}
                                </td>
                                <td className="py-1 text-right font-mono text-cyan-400/80">
                                  {sp.priceSell > 0
                                    ? sp.priceSell.toLocaleString()
                                    : "—"}
                                </td>
                                <td className="py-1 text-right font-mono text-amber-400/80">
                                  {sp.priceBuy > 0
                                    ? sp.priceBuy.toLocaleString()
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="text-[10px] text-zinc-600 py-4 text-center">
                          {t("noStationPrices")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Pagination ── */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-mono text-zinc-600">
                {t("totalCount", { count: data.total })}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-2.5 py-1 text-[10px] bg-zinc-800/40 hover:bg-zinc-700/40 disabled:opacity-30 border border-zinc-700/60 rounded-sm transition-colors"
                >
                  ←
                </button>
                <span className="px-2 py-1 text-[10px] font-mono text-zinc-500">
                  {page} / {data.totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(data.totalPages, page + 1))}
                  disabled={page === data.totalPages}
                  className="px-2.5 py-1 text-[10px] bg-zinc-800/40 hover:bg-zinc-700/40 disabled:opacity-30 border border-zinc-700/60 rounded-sm transition-colors"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        !loading && (
          <div className="py-16 text-center text-zinc-600 text-sm">
            {t("noResults")}
          </div>
        )
      )}
    </div>
  );
}
