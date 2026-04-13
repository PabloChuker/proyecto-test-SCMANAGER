"use client";

// =============================================================================
// SC LABS — TradeWorkOrderDashboard
//
// Lists all trade work orders for the logged-in user with quick metrics
// (lifetime profit, active runs, completed runs). Entries are clickable to
// open the calculator in edit mode. A "+ New Work Order" button spawns a
// blank draft.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useTradeWorkOrderStore,
  TradeWorkOrder,
} from "@/store/useTradeWorkOrderStore";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-700/30 text-zinc-300 border-zinc-600/40",
  in_progress: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  archived: "bg-zinc-800/40 text-zinc-500 border-zinc-700/40",
};

function fmt(n: number) {
  return Math.round(n || 0).toLocaleString();
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function TradeWorkOrderDashboard() {
  const openNew = useTradeWorkOrderStore((s) => s.openNew);
  const openEdit = useTradeWorkOrderStore((s) => s.openEdit);

  const [orders, setOrders] = useState<TradeWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = statusFilter
        ? `/api/trade/work-orders?status=${statusFilter}`
        : "/api/trade/work-orders";
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 401) {
          setError("Necesitás estar logueado para ver tus Work Orders.");
          setOrders([]);
          return;
        }
        throw new Error(`Error ${res.status}`);
      }
      const json = await res.json();
      setOrders(json.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const active = orders.filter(
      (o) => o.status === "draft" || o.status === "in_progress",
    ).length;
    const completed = orders.filter((o) => o.status === "completed").length;
    const lifetimeProfit = orders
      .filter((o) => o.status === "completed")
      .reduce((s, o) => s + (o.net_profit || 0), 0);
    const totalScu = orders
      .filter((o) => o.status === "completed")
      .reduce((s, o) => s + (o.scu_sold || 0), 0);
    return { active, completed, lifetimeProfit, totalScu };
  }, [orders]);

  return (
    <div className="space-y-6">
      {/* ── Header + Actions ── */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Trade System
          </div>
          <div className="text-xl font-mono text-amber-400">Work Orders</div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-zinc-900/60 border border-zinc-800/60 text-xs text-zinc-200 rounded-sm px-3 py-2 focus:outline-none focus:border-amber-500/40"
          >
            <option value="">Todos los estados</option>
            <option value="draft">Draft</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
          <button
            onClick={() => openNew()}
            className="text-sm tracking-[0.1em] uppercase px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded transition-colors text-amber-400"
          >
            + New Work Order
          </button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Active Runs" value={stats.active.toString()} accent="text-cyan-400" />
        <StatCard label="Completed" value={stats.completed.toString()} accent="text-emerald-400" />
        <StatCard
          label="Lifetime Profit"
          value={`${fmt(stats.lifetimeProfit)} aUEC`}
          accent={stats.lifetimeProfit >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <StatCard label="Total SCU sold" value={fmt(stats.totalScu)} accent="text-amber-400" />
      </div>

      {/* ── Errors ── */}
      {error && (
        <div className="p-3 bg-red-950/20 border border-red-800/40 rounded-sm text-xs text-red-400">
          {error}
        </div>
      )}

      {/* ── List ── */}
      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 bg-zinc-900/40 rounded-sm animate-pulse"
              style={{ animationDelay: `${i * 50}ms` }}
            />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-zinc-800/60 rounded-sm">
          <div className="text-zinc-500 text-sm">Todavía no hay Work Orders.</div>
          <div className="text-zinc-600 text-xs mt-1">
            Creá uno desde <span className="text-amber-400">+ New Work Order</span> o
            envialo desde una ruta en la pestaña Trade Routes.
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-zinc-800/60">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800/60 bg-zinc-950/80 text-zinc-500">
                <th className="px-3 py-2.5 text-left font-mono font-medium">Título</th>
                <th className="px-3 py-2.5 text-left font-mono font-medium">Commodity</th>
                <th className="px-3 py-2.5 text-left font-mono font-medium">Ruta</th>
                <th className="px-3 py-2.5 text-right font-mono font-medium">SCU</th>
                <th className="px-3 py-2.5 text-right font-mono font-medium">Net Profit</th>
                <th className="px-3 py-2.5 text-center font-mono font-medium">Estado</th>
                <th className="px-3 py-2.5 text-right font-mono font-medium">Creado</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const profitColor =
                  o.net_profit > 0
                    ? "text-emerald-400"
                    : o.net_profit < 0
                      ? "text-red-400"
                      : "text-zinc-400";
                return (
                  <tr
                    key={o.id}
                    onClick={() => openEdit(o.id)}
                    className="border-b border-zinc-800/20 hover:bg-zinc-800/20 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2">
                      <div className="text-zinc-100 font-medium">{o.title}</div>
                      {o.party_id && (
                        <div className="text-[10px] text-cyan-500/80">Party run</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-amber-400 font-mono">
                        {o.commodity_name || "—"}
                      </div>
                      {o.commodity_code && (
                        <div className="text-[10px] text-zinc-600">{o.commodity_code}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-zinc-300">
                        {o.buy_station || "—"}
                        <span className="text-zinc-600 mx-1">→</span>
                        {o.sell_station || "—"}
                      </div>
                      <div className="text-[10px] text-zinc-600">
                        {o.buy_system || ""}
                        {o.buy_system && o.sell_system && " · "}
                        {o.sell_system || ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-300">
                      {fmt(o.scu_sold)}{" "}
                      <span className="text-zinc-600">/ {fmt(o.scu_bought)}</span>
                    </td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${profitColor}`}>
                      {fmt(o.net_profit)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 border rounded-sm text-[10px] uppercase tracking-wider ${STATUS_STYLES[o.status] || STATUS_STYLES.draft}`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-500 text-[10px]">
                      {fmtDate(o.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-sm p-3">
      <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-1">
        {label}
      </div>
      <div className={`text-xl font-mono font-bold ${accent}`}>{value}</div>
    </div>
  );
}
