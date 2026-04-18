"use client";

// =============================================================================
// SC LABS — SellRoutePreviewModal
//
// Fase B — multi-sell route. User selects N items from the mining inventory,
// this modal:
//   1. Resolves best sell station per mineral (already loaded in parent)
//   2. Orders the stops via routeOptimizer (system → body → station)
//   3. Lets the user drop specific stops and reorder manually (via up/down)
//   4. On confirm, POSTs N draft trade work orders tagged with a shared
//      route_group_id, then routes the user to /trade.
//
// Creation happens client-side (sequential POSTs) because the work-orders
// API accepts a single WO per call. N is small (handful of minerals) so
// parallelism is not worth the added complexity.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  unifyAndAggregate,
  inferBody,
  type RouteStop,
  type AggregatedStop,
  type PriceOption,
} from "@/lib/routeOptimizer";
import {
  buildMiningMarker,
  buildRouteMarker,
  newRouteGroupId,
} from "@/lib/miningTradeBridge";
import { useTradeWorkOrderStore } from "@/store/useTradeWorkOrderStore";

// ─── Public types ────────────────────────────────────────────────────────────

/** Single inventory item the user chose to include in the route. */
export interface SellRouteInput {
  mineralId: string;
  mineralName: string;
  commodityCode: string;
  commodityName: string;
  scuAvailable: number;
  bestStation: string | null;
  bestSystem: string | null;
  bestPrice: number | null;
  /** Full price table for this commodity (top→bottom). Used by the
   *  unifier to pick stations shared with other selected commodities. */
  priceOptions?: PriceOption[];
}

export interface SellRoutePreviewModalProps {
  open: boolean;
  sessionId: string | null;
  items: SellRouteInput[];
  onClose: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtAuec(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

function inputToStop(i: SellRouteInput): RouteStop {
  const totalValue = (i.bestPrice || 0) * (i.scuAvailable || 0);
  return {
    mineralId: i.mineralId,
    mineralName: i.mineralName,
    commodityCode: i.commodityCode,
    commodityName: i.commodityName,
    scu: i.scuAvailable,
    station: i.bestStation,
    system: i.bestSystem,
    pricePerScu: i.bestPrice,
    totalValue,
    priceOptions: i.priceOptions,
  };
}

// ═════════════════════════════════════════════════════════════════════════════

export default function SellRoutePreviewModal({
  open,
  sessionId,
  items,
  onClose,
}: SellRoutePreviewModalProps) {
  const t = useTranslations("Mining.routePreview");
  const router = useRouter();
  const requestActiveRouteTabSwitch = useTradeWorkOrderStore(
    (s) => s.requestActiveRouteTabSwitch,
  );

  // Stops are aggregated at the station level: each group = one physical
  // visit, with potentially several commodity rows to sell at that stop.
  const [groups, setGroups] = useState<AggregatedStop[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Compute the initial unified + aggregated route when the modal opens.
  useEffect(() => {
    if (!open) return;
    const rawStops = items.map(inputToStop);
    setGroups(unifyAndAggregate(rawStops, 0.9));
    setError(null);
    setProgress(null);
  }, [open, items]);

  const totals = useMemo(() => {
    let totalScu = 0;
    let totalValue = 0;
    let withoutPrice = 0;
    let itemCount = 0;
    for (const g of groups) {
      totalScu += g.subtotalScu;
      totalValue += g.subtotalValue;
      for (const it of g.items) {
        itemCount++;
        if (!it.pricePerScu || !it.station) withoutPrice++;
      }
    }
    return { totalScu, totalValue, withoutPrice, itemCount };
  }, [groups]);

  // ── Mutations on the preview list ──
  function removeItem(groupKey: string, mineralId: string) {
    setGroups((gs) =>
      gs
        .map((g) => {
          if (g.key !== groupKey) return g;
          const items = g.items.filter((x) => x.mineralId !== mineralId);
          const subtotalScu = items.reduce((s, x) => s + (x.scu || 0), 0);
          const subtotalValue = items.reduce((s, x) => s + (x.totalValue || 0), 0);
          return { ...g, items, subtotalScu, subtotalValue };
        })
        .filter((g) => g.items.length > 0),
    );
  }
  function moveUp(idx: number) {
    if (idx <= 0) return;
    setGroups((g) => {
      const next = [...g];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }
  function moveDown(idx: number) {
    setGroups((g) => {
      if (idx >= g.length - 1) return g;
      const next = [...g];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  // ── Batch-create WOs: one per commodity, stop number = group index ──
  async function handleConfirm() {
    if (groups.length === 0 || totals.itemCount === 0) return;
    setCreating(true);
    setError(null);
    const groupId = newRouteGroupId();
    const totalStops = groups.length;
    setProgress({ done: 0, total: totals.itemCount });
    let postedItems = 0;
    try {
      for (let g = 0; g < groups.length; g++) {
        const group = groups[g];
        const stopNumber = g + 1;
        for (const stop of group.items) {
          const miningMarker = sessionId
            ? buildMiningMarker({
                sessionId,
                mineralId: stop.mineralId,
                mineralName: stop.mineralName,
              })
            : "";
          const routeMarker = buildRouteMarker({
            groupId,
            stop: stopNumber,
            total: totalStops,
          });
          const notesHeader = [miningMarker, routeMarker].filter(Boolean).join("\n");

          const body = {
            title: `${t("woTitlePrefix")} ${stopNumber}/${totalStops} — ${stop.commodityName || stop.commodityCode}`,
            status: "draft",
            commodity_code: stop.commodityCode || null,
            commodity_name: stop.commodityName || null,
            buy_station: null,
            buy_system: null,
            sell_station: group.station || null,
            sell_system: group.system || null,
            scu_bought: stop.scu,
            scu_sold: stop.scu, // assume planning to sell full load
            scu_lost: 0,
            buy_price_per_scu: 0,
            sell_price_per_scu: stop.pricePerScu || 0,
            notes: notesHeader,
          };
          const res = await fetch("/api/trade/work-orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || `Error ${res.status}`);
          }
          postedItems++;
          setProgress({ done: postedItems, total: totals.itemCount });
        }
      }
      // Signal the Trade page to land on the Active Route tab and pre-select
      // the route we just created.
      requestActiveRouteTabSwitch(groupId);
      onClose();
      router.push("/trade");
    } catch (e: any) {
      setError(e.message || "Unexpected error");
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border-2 border-cyan-500/50 rounded-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-[0_0_30px_rgba(34,211,238,0.2)]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              🛣 {t("title")}
            </h3>
            <p className="text-[11px] text-zinc-500 mt-1">{t("subtitle")}</p>
          </div>
          <button
            onClick={onClose}
            disabled={creating}
            className="text-zinc-500 hover:text-zinc-300 text-xl disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {/* Summary strip */}
        <div className="px-6 py-3 bg-zinc-950/60 border-b border-zinc-800 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">
              {t("stopsCount")}
            </div>
            <div className="text-xl font-mono font-bold text-cyan-300">
              {groups.length}
              <span className="text-[10px] text-zinc-500 font-mono ml-1">
                ({totals.itemCount})
              </span>
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">
              {t("totalScu")}
            </div>
            <div className="text-xl font-mono font-bold text-amber-300">
              {totals.totalScu.toFixed(0)}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">
              {t("estimatedRevenue")}
            </div>
            <div className="text-xl font-mono font-bold text-emerald-300">
              {fmtAuec(totals.totalValue)} aUEC
            </div>
          </div>
        </div>

        {/* Stops list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {groups.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm italic">
              {t("noStops")}
            </div>
          ) : (
            groups.map((group, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === groups.length - 1;
              const body = inferBody(group.station, group.system);
              const warn = !group.station;
              const unified = group.items.length > 1;
              return (
                <div
                  key={group.key}
                  className={`bg-zinc-800/40 border rounded-lg p-3 ${
                    warn ? "border-amber-500/40" : unified ? "border-cyan-500/50" : "border-zinc-700/60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Stop number */}
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold font-mono ${
                        warn
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                      }`}
                    >
                      {idx + 1}
                    </div>

                    {/* Station header */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-zinc-100">
                          {group.station ? (
                            group.station
                          ) : (
                            <span className="italic text-amber-400">
                              {t("noStation")}
                            </span>
                          )}
                        </span>
                        {unified && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 rounded font-bold uppercase tracking-wider">
                            {t("unified", { count: group.items.length })}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        <span className="text-zinc-500">{body}</span>
                        <span className="text-zinc-700 mx-1.5">·</span>
                        <span className="text-zinc-500">{group.system || "—"}</span>
                      </div>
                    </div>

                    {/* Group subtotal */}
                    <div className="flex-shrink-0 text-right">
                      <div className="text-sm font-mono font-bold text-emerald-300">
                        {fmtAuec(group.subtotalValue)}
                      </div>
                      <div className="text-[10px] text-zinc-600 font-mono">
                        {group.subtotalScu.toFixed(0)} SCU
                      </div>
                    </div>

                    {/* Reorder buttons (whole stop) */}
                    <div className="flex-shrink-0 flex items-center gap-1">
                      <button
                        onClick={() => moveUp(idx)}
                        disabled={isFirst || creating}
                        title={t("moveUp")}
                        className="w-6 h-6 rounded bg-zinc-700/60 text-zinc-400 hover:bg-zinc-600 hover:text-zinc-200 text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveDown(idx)}
                        disabled={isLast || creating}
                        title={t("moveDown")}
                        className="w-6 h-6 rounded bg-zinc-700/60 text-zinc-400 hover:bg-zinc-600 hover:text-zinc-200 text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ↓
                      </button>
                    </div>
                  </div>

                  {/* Commodity rows */}
                  <div className="mt-2 pl-11 space-y-1">
                    {group.items.map((it) => (
                      <div
                        key={it.mineralId}
                        className="flex items-center gap-3 text-xs bg-zinc-950/40 border border-zinc-800/40 rounded px-2.5 py-1.5"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-zinc-200 uppercase">
                            {it.commodityName}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono ml-1.5">
                            ({it.mineralName})
                          </span>
                        </div>
                        <span className="font-mono text-amber-400">
                          {it.scu.toFixed(0)} SCU
                        </span>
                        <span className="font-mono text-zinc-500 text-[10px]">
                          @ {it.pricePerScu?.toLocaleString() || "—"}
                        </span>
                        <span className="font-mono text-emerald-300 font-bold">
                          {fmtAuec(it.totalValue)}
                        </span>
                        <button
                          onClick={() => removeItem(group.key, it.mineralId)}
                          disabled={creating}
                          title={t("removeStop")}
                          className="w-5 h-5 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-[10px] disabled:opacity-40"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {totals.withoutPrice > 0 && (
            <div className="mt-2 p-2.5 rounded border border-amber-500/30 bg-amber-500/5 text-[11px] text-amber-300">
              ⚠ {t("warningMissingPrice", { count: totals.withoutPrice })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950/40 flex items-center gap-3">
          {error && (
            <div className="flex-1 text-xs text-red-400">{error}</div>
          )}
          {progress && !error && (
            <div className="flex-1 text-xs text-cyan-300">
              {t("progress", { done: progress.done, total: progress.total })}
            </div>
          )}
          {!error && !progress && <div className="flex-1" />}
          <button
            onClick={onClose}
            disabled={creating}
            className="px-4 py-2 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded font-bold text-sm hover:bg-zinc-700 disabled:opacity-40"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={creating || totals.itemCount === 0}
            className="px-4 py-2 bg-cyan-500 text-zinc-900 rounded font-bold text-sm hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating
              ? t("creating")
              : t("confirm", { count: totals.itemCount })}
          </button>
        </div>
      </div>
    </div>
  );
}
