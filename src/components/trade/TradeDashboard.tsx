"use client";

// =============================================================================
// SC LABS — TradeDashboard
//
// Analytics tab for the Trade System. Surfaces lifetime metrics, pending
// payouts, top routes/commodities, a profit-over-time chart and a filterable
// historial of recent work orders.
//
// Scope toggle:
//   • Yo      — WOs where the current user participated (as owner or member)
//   • Party   — WOs that have a party_id (team operations)
//   • Todos   — every WO the user can see (governed by RLS)
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import {
  useTradeWorkOrderStore,
  TradeWorkOrder,
  TradeWOParticipant,
} from "@/store/useTradeWorkOrderStore";
import { parseRouteMarker } from "@/lib/miningTradeBridge";

// ── helpers ─────────────────────────────────────────────────────────────────
type Scope = "me" | "party" | "all";
type Bucket = "day" | "week" | "month";
type StatusFilter = "" | "draft" | "in_progress" | "completed" | "archived";

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

// Build a label key for time-bucketing
function bucketKey(iso: string, bucket: Bucket): string {
  const d = new Date(iso);
  if (bucket === "day") {
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  }
  if (bucket === "week") {
    // ISO week — Monday as first day
    const copy = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = copy.getUTCDay() || 7;
    copy.setUTCDate(copy.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
      ((copy.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return `${copy.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }
  // month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── component ───────────────────────────────────────────────────────────────
export default function TradeDashboard() {
  const td = useTranslations("Trade.dashboard");
  const { user } = useAuth();
  const openEdit = useTradeWorkOrderStore((s) => s.openEdit);

  const [orders, setOrders] = useState<TradeWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters / scope
  const [scope, setScope] = useState<Scope>("me");
  const [bucket, setBucket] = useState<Bucket>("week");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [partyFilter, setPartyFilter] = useState<string>(""); // party_id or "solo" or ""
  const [dateFrom, setDateFrom] = useState<string>(""); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>("");

  // ── load ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trade/work-orders");
      if (!res.ok) {
        if (res.status === 401) {
          setError("__need_login__");
          setOrders([]);
          return;
        }
        throw new Error(`Error ${res.status}`);
      }
      const json = await res.json();
      setOrders(json.data || []);
    } catch (e: any) {
      setError(e.message || "__load_failed__");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── scope-aware working set ────────────────────────────────────────────
  const scoped = useMemo(() => {
    const uid = user?.id || null;
    return orders.filter((o) => {
      if (scope === "all") return true;
      if (scope === "party") return !!o.party_id;
      // scope === "me"
      if (!uid) return true;
      if (o.owner_id === uid) return true;
      return (o.trade_wo_participants || []).some((p) => p.user_id === uid);
    });
  }, [orders, scope, user?.id]);

  // Apply secondary filters (status, party_id, date range) on top of scope
  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom).getTime() : null;
    const to = dateTo ? new Date(dateTo).getTime() + 86400000 : null; // inclusive end
    return scoped.filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (partyFilter === "solo" && o.party_id) return false;
      if (partyFilter && partyFilter !== "solo" && o.party_id !== partyFilter) return false;
      const t = o.created_at ? new Date(o.created_at).getTime() : 0;
      if (from && t < from) return false;
      if (to && t >= to) return false;
      return true;
    });
  }, [scoped, statusFilter, partyFilter, dateFrom, dateTo]);

  // ── KPIs (computed over scoped, not filtered — the top cards don't flex
  //    with the secondary filters so you always see "everything in scope") ──
  const kpis = useMemo(() => {
    const completed = scoped.filter((o) => o.status === "completed");
    const active = scoped.filter(
      (o) => o.status === "draft" || o.status === "in_progress",
    );
    const lifetimeProfit = completed.reduce((s, o) => s + (o.net_profit || 0), 0);
    const totalRuns = completed.length;
    const totalScu = completed.reduce((s, o) => s + (o.scu_sold || 0), 0);
    const totalExpenses = completed.reduce(
      (s, o) => s + (o.total_expenses || 0),
      0,
    );
    const totalBuy = completed.reduce((s, o) => s + (o.total_buy || 0), 0);
    const totalSell = completed.reduce((s, o) => s + (o.total_sell || 0), 0);
    const marginPct = totalSell > 0 ? ((lifetimeProfit / totalSell) * 100) : 0;
    const partyRuns = completed.filter((o) => !!o.party_id).length;
    const soloRuns = completed.length - partyRuns;
    const partyProfit = completed
      .filter((o) => !!o.party_id)
      .reduce((s, o) => s + (o.net_profit || 0), 0);
    const soloProfit = lifetimeProfit - partyProfit;
    return {
      lifetimeProfit,
      totalRuns,
      totalScu,
      totalExpenses,
      totalBuy,
      totalSell,
      marginPct,
      activeCount: active.length,
      partyRuns,
      soloRuns,
      partyProfit,
      soloProfit,
    };
  }, [scoped]);

  // ── Pending payouts: participants where paid=false on completed WOs ────
  const pendingPayouts = useMemo(() => {
    const rows: {
      wo: TradeWorkOrder;
      participant: TradeWOParticipant;
    }[] = [];
    for (const o of scoped) {
      if (o.status !== "completed") continue;
      for (const p of o.trade_wo_participants || []) {
        if (!p.paid && (p.payout_uec || 0) > 0) {
          rows.push({ wo: o, participant: p });
        }
      }
    }
    // sort biggest owed first
    rows.sort((a, b) => (b.participant.payout_uec || 0) - (a.participant.payout_uec || 0));
    return rows;
  }, [scoped]);

  const pendingTotal = useMemo(
    () => pendingPayouts.reduce((s, r) => s + (r.participant.payout_uec || 0), 0),
    [pendingPayouts],
  );

  // ── Top routes (buy→sell pair) ─────────────────────────────────────────
  const topRoutes = useMemo(() => {
    const map = new Map<
      string,
      { buy: string; sell: string; runs: number; profit: number; scu: number }
    >();
    for (const o of scoped) {
      if (o.status !== "completed") continue;
      const buy = [o.buy_system, o.buy_station].filter(Boolean).join(" · ") || "—";
      const sell = [o.sell_system, o.sell_station].filter(Boolean).join(" · ") || "—";
      const key = `${buy}→${sell}`;
      const row = map.get(key) || { buy, sell, runs: 0, profit: 0, scu: 0 };
      row.runs += 1;
      row.profit += o.net_profit || 0;
      row.scu += o.scu_sold || 0;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.profit - a.profit).slice(0, 5);
  }, [scoped]);

  // ── Top commodities ────────────────────────────────────────────────────
  const topCommodities = useMemo(() => {
    const map = new Map<
      string,
      { name: string; code: string; runs: number; profit: number; scu: number }
    >();
    for (const o of scoped) {
      if (o.status !== "completed") continue;
      const code = o.commodity_code || "";
      const name = o.commodity_name || o.commodity_code || "—";
      const key = code || name;
      const row = map.get(key) || { name, code, runs: 0, profit: 0, scu: 0 };
      row.runs += 1;
      row.profit += o.net_profit || 0;
      row.scu += o.scu_sold || 0;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.profit - a.profit).slice(0, 5);
  }, [scoped]);

  // ── Active multi-sell routes (Fase B) ──────────────────────────────────
  // Groups WOs by their [route:GROUP_ID:STOP:TOTAL] marker. A route is
  // "active" when at least one of its stops is not completed yet.
  const activeRoutes = useMemo(() => {
    type Stop = {
      order: TradeWorkOrder;
      stop: number;
    };
    const map = new Map<
      string,
      {
        groupId: string;
        total: number;
        stops: Stop[];
        completed: number;
        profit: number;
      }
    >();
    for (const o of scoped) {
      const marker = parseRouteMarker(o.notes);
      if (!marker) continue;
      const entry =
        map.get(marker.groupId) || {
          groupId: marker.groupId,
          total: marker.total,
          stops: [] as Stop[],
          completed: 0,
          profit: 0,
        };
      entry.stops.push({ order: o, stop: marker.stop });
      if (o.status === "completed") {
        entry.completed += 1;
        entry.profit += o.net_profit || 0;
      }
      // If different stops declared different totals, take the max.
      if (marker.total > entry.total) entry.total = marker.total;
      map.set(marker.groupId, entry);
    }
    const rows = [...map.values()]
      .map((g) => ({
        ...g,
        stops: g.stops.sort((a, b) => a.stop - b.stop),
      }))
      .filter((g) => g.completed < g.total) // only active
      .sort((a, b) => b.stops.length - a.stops.length);
    return rows;
  }, [scoped]);

  // ── Profit over time ───────────────────────────────────────────────────
  const timeline = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of scoped) {
      if (o.status !== "completed") continue;
      const anchor = o.completed_at || o.updated_at || o.created_at;
      if (!anchor) continue;
      const k = bucketKey(anchor, bucket);
      map.set(k, (map.get(k) || 0) + (o.net_profit || 0));
    }
    const points = [...map.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([label, profit]) => ({ label, profit }));
    return points;
  }, [scoped, bucket]);

  // distinct party ids seen (for the party filter dropdown)
  const partyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of scoped) if (o.party_id) set.add(o.party_id);
    return [...set];
  }, [scoped]);

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-20 bg-zinc-900/40 rounded-sm animate-pulse"
            style={{ animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-sm p-4 text-red-300 text-sm">
        {error === "__need_login__"
          ? td("errorNeedLogin")
          : error === "__load_failed__"
            ? td("errorLoadFailed")
            : error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Scope toggle + refresh ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            {td("tradeSystem")}
          </div>
          <div className="text-xl font-mono text-amber-400">{td("dashboard")}</div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-sm overflow-hidden border border-zinc-800/60">
            {(
              [
                { id: "me", label: td("scopeMe") },
                { id: "party", label: td("scopeParty") },
                { id: "all", label: td("scopeAll") },
              ] as { id: Scope; label: string }[]
            ).map((s) => (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className={`px-3 py-1.5 text-[10px] uppercase tracking-widest transition-colors ${
                  scope === s.id
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            className="text-[10px] uppercase tracking-widest px-3 py-1.5 bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/60 rounded-sm text-zinc-300"
            title={td("refreshTitle")}
          >
            ↻ {td("refresh")}
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label={td("kpiLifetime")} value={`${fmt(kpis.lifetimeProfit)} aUEC`} color="text-emerald-400" />
        <Kpi label={td("kpiRuns")} value={fmt(kpis.totalRuns)} color="text-zinc-200" sub={td("kpiActive", { count: kpis.activeCount })} />
        <Kpi label={td("kpiScu")} value={fmt(kpis.totalScu)} color="text-cyan-400" />
        <Kpi label={td("kpiMargin")} value={`${kpis.marginPct.toFixed(1)}%`} color="text-amber-300" sub={td("kpiExpenses", { value: fmt(kpis.totalExpenses) })} />
      </div>

      {/* Solo vs Party breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-sm p-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-1">{td("solo")}</div>
          <div className="flex items-baseline gap-3">
            <div className="text-lg font-mono text-emerald-300">{fmt(kpis.soloProfit)} aUEC</div>
            <div className="text-[11px] text-zinc-500">{td("runsCount", { count: kpis.soloRuns })}</div>
          </div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-sm p-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-1">{td("party")}</div>
          <div className="flex items-baseline gap-3">
            <div className="text-lg font-mono text-emerald-300">{fmt(kpis.partyProfit)} aUEC</div>
            <div className="text-[11px] text-zinc-500">{td("runsCount", { count: kpis.partyRuns })}</div>
          </div>
        </div>
      </div>

      {/* ── Pending payouts ── */}
      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">{td("pendingPayouts")}</div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              {td("pendingHintBefore")} <span className="text-emerald-400">{td("pendingHintPaid")}</span> {td("pendingHintAfter")}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-widest text-zinc-500">{td("totalToTransfer")}</div>
            <div className="text-lg font-mono text-amber-300">{fmt(pendingTotal)} aUEC</div>
          </div>
        </div>
        {pendingPayouts.length === 0 ? (
          <div className="text-[11px] text-zinc-600">{td("allCaughtUp")}</div>
        ) : (
          <div className="space-y-1.5">
            {pendingPayouts.slice(0, 10).map(({ wo, participant }) => (
              <button
                key={participant.id}
                onClick={() => openEdit(wo.id)}
                className="w-full grid grid-cols-12 gap-2 items-center px-2 py-2 bg-zinc-950/50 hover:bg-zinc-900/70 border border-zinc-800/50 rounded-sm text-xs text-left"
              >
                <div className="col-span-4 flex items-center gap-2 min-w-0">
                  {participant.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={participant.avatar_url}
                      alt=""
                      className="w-7 h-7 rounded-full shrink-0 border border-zinc-700/60 object-cover bg-zinc-900"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full shrink-0 border border-zinc-700/60 bg-zinc-800/80 flex items-center justify-center text-[10px] font-mono text-zinc-500">
                      {(participant.display_name || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-zinc-100">{participant.display_name || "—"}</div>
                    <div className="text-[9px] uppercase tracking-widest text-zinc-500">{participant.role}</div>
                  </div>
                </div>
                <div className="col-span-5 min-w-0">
                  <div className="truncate text-zinc-300">{wo.title}</div>
                  <div className="text-[9px] text-zinc-600">{fmtDate(wo.completed_at || wo.updated_at)}</div>
                </div>
                <div className="col-span-3 text-right font-mono font-bold text-amber-300">
                  {fmt(participant.payout_uec)} aUEC
                </div>
              </button>
            ))}
            {pendingPayouts.length > 10 && (
              <div className="text-[10px] text-zinc-600 pt-1">
                +{td("more", { count: pendingPayouts.length - 10 })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Active multi-sell routes (Fase B) ── */}
      {activeRoutes.length > 0 && (
        <div className="bg-zinc-900/60 border border-cyan-500/20 rounded-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[9px] uppercase tracking-[0.2em] text-cyan-400">
              🛣 {td("activeRoutes")}
            </div>
            <div className="text-[10px] text-zinc-500">
              {td("activeRoutesCount", { count: activeRoutes.length })}
            </div>
          </div>
          <div className="space-y-2">
            {activeRoutes.slice(0, 5).map((r) => {
              const pct = Math.min(100, Math.round((r.completed / r.total) * 100));
              return (
                <div
                  key={r.groupId}
                  className="bg-zinc-950/40 border border-zinc-800/40 rounded-sm p-3"
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <div className="text-zinc-200 font-mono">
                      {td("routeProgress", { done: r.completed, total: r.total })}
                    </div>
                    <div className="font-mono text-emerald-300">
                      {fmt(r.profit)} aUEC
                    </div>
                  </div>
                  <div className="h-1.5 bg-zinc-800/60 rounded-sm overflow-hidden mb-2">
                    <div
                      className="h-full bg-cyan-500/60"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {r.stops.map((s) => (
                      <button
                        key={s.order.id}
                        onClick={() => openEdit(s.order.id)}
                        className={`px-1.5 py-0.5 text-[10px] font-mono rounded-sm border transition-colors hover:brightness-125 ${
                          STATUS_STYLES[s.order.status] || STATUS_STYLES.draft
                        }`}
                        title={s.order.title}
                      >
                        {s.stop}/{r.total} ·{" "}
                        {s.order.commodity_code ||
                          s.order.commodity_name ||
                          "—"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Top routes + commodities ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-sm p-4">
          <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-3">
            {td("topRoutes")}
          </div>
          {topRoutes.length === 0 ? (
            <div className="text-[11px] text-zinc-600">{td("noCompletedRuns")}</div>
          ) : (
            <div className="space-y-1.5">
              {topRoutes.map((r, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center text-xs px-2 py-1.5 bg-zinc-950/40 border border-zinc-800/40 rounded-sm">
                  <div className="col-span-7 min-w-0">
                    <div className="truncate text-zinc-200">{r.buy}</div>
                    <div className="truncate text-zinc-500 text-[10px]">→ {r.sell}</div>
                  </div>
                  <div className="col-span-2 text-right font-mono text-zinc-400 text-[10px]">{td("runsCount", { count: r.runs })}</div>
                  <div className="col-span-3 text-right font-mono text-emerald-300">{fmt(r.profit)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-sm p-4">
          <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-3">
            {td("topCommodities")}
          </div>
          {topCommodities.length === 0 ? (
            <div className="text-[11px] text-zinc-600">{td("noCompletedRuns")}</div>
          ) : (
            <div className="space-y-1.5">
              {topCommodities.map((c, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center text-xs px-2 py-1.5 bg-zinc-950/40 border border-zinc-800/40 rounded-sm">
                  <div className="col-span-7 min-w-0">
                    <div className="truncate text-zinc-200">{c.name}</div>
                    <div className="truncate text-zinc-500 text-[10px]">
                      {c.code || "—"} · {fmt(c.scu)} SCU
                    </div>
                  </div>
                  <div className="col-span-2 text-right font-mono text-zinc-400 text-[10px]">{c.runs} runs</div>
                  <div className="col-span-3 text-right font-mono text-emerald-300">{fmt(c.profit)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Profit over time chart ── */}
      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">{td("profitOverTime")}</div>
          <div className="flex rounded-sm overflow-hidden border border-zinc-800/60">
            {(
              [
                { id: "day", label: td("bucketDay") },
                { id: "week", label: td("bucketWeek") },
                { id: "month", label: td("bucketMonth") },
              ] as { id: Bucket; label: string }[]
            ).map((b) => (
              <button
                key={b.id}
                onClick={() => setBucket(b.id)}
                className={`px-2.5 py-1 text-[10px] uppercase tracking-widest transition-colors ${
                  bucket === b.id
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
        <TimelineChart points={timeline} />
      </div>

      {/* ── Recent WOs with filters ── */}
      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-sm p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">{td("history")}</div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="bg-zinc-950/60 border border-zinc-800/60 text-[11px] text-zinc-200 rounded-sm px-2 py-1 focus:outline-none focus:border-amber-500/40"
            >
              <option value="">{td("allStatuses")}</option>
              <option value="draft">{td("statusDraft")}</option>
              <option value="in_progress">{td("statusInProgress")}</option>
              <option value="completed">{td("statusCompleted")}</option>
              <option value="archived">{td("statusArchived")}</option>
            </select>
            <select
              value={partyFilter}
              onChange={(e) => setPartyFilter(e.target.value)}
              className="bg-zinc-950/60 border border-zinc-800/60 text-[11px] text-zinc-200 rounded-sm px-2 py-1 focus:outline-none focus:border-amber-500/40"
            >
              <option value="">{td("allParties")}</option>
              <option value="solo">{td("soloNoParty")}</option>
              {partyOptions.map((pid) => (
                <option key={pid} value={pid}>
                  {td("partyLabel", { slice: pid.slice(0, 8) })}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-zinc-950/60 border border-zinc-800/60 text-[11px] text-zinc-200 rounded-sm px-2 py-1 focus:outline-none focus:border-amber-500/40"
              title={td("from")}
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-zinc-950/60 border border-zinc-800/60 text-[11px] text-zinc-200 rounded-sm px-2 py-1 focus:outline-none focus:border-amber-500/40"
              title={td("to")}
            />
            {(statusFilter || partyFilter || dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setStatusFilter("");
                  setPartyFilter("");
                  setDateFrom("");
                  setDateTo("");
                }}
                className="text-[10px] uppercase tracking-widest text-zinc-400 hover:text-zinc-200 px-2 py-1"
              >
                {td("clear")}
              </button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-[11px] text-zinc-600">
            {scoped.length === 0
              ? td("noWorkOrdersScope")
              : td("noResultsFilters")}
          </div>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-12 gap-2 text-[9px] uppercase tracking-widest text-zinc-600 px-2">
              <div className="col-span-4">{td("colTitle")}</div>
              <div className="col-span-2">{td("colCommodity")}</div>
              <div className="col-span-2">{td("colDate")}</div>
              <div className="col-span-1">{td("colStatus")}</div>
              <div className="col-span-1 text-right">SCU</div>
              <div className="col-span-2 text-right">{td("colNet")}</div>
            </div>
            {filtered.slice(0, 20).map((o) => (
              <button
                key={o.id}
                onClick={() => openEdit(o.id)}
                className="w-full grid grid-cols-12 gap-2 items-center px-2 py-2 bg-zinc-950/40 hover:bg-zinc-900/70 border border-zinc-800/40 rounded-sm text-xs text-left"
              >
                <div className="col-span-4 min-w-0">
                  <div className="truncate text-zinc-100">{o.title}</div>
                  <div className="text-[10px] text-zinc-500 truncate">
                    {(o.buy_system || "—")} → {(o.sell_system || "—")}
                    {o.party_id ? ` · ${td("partyShort")}` : ` · ${td("soloShort")}`}
                  </div>
                </div>
                <div className="col-span-2 truncate text-zinc-300">{o.commodity_name || "—"}</div>
                <div className="col-span-2 text-zinc-400 text-[10px]">
                  {fmtDate(o.completed_at || o.updated_at || o.created_at)}
                </div>
                <div className="col-span-1">
                  <span
                    className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 border rounded-sm ${STATUS_STYLES[o.status] || ""}`}
                  >
                    {o.status}
                  </span>
                </div>
                <div className="col-span-1 text-right font-mono text-zinc-400">{fmt(o.scu_sold)}</div>
                <div
                  className={`col-span-2 text-right font-mono font-bold ${
                    (o.net_profit || 0) >= 0 ? "text-emerald-300" : "text-red-400"
                  }`}
                >
                  {fmt(o.net_profit)}
                </div>
              </button>
            ))}
            {filtered.length > 20 && (
              <div className="text-[10px] text-zinc-600 pt-2">
                {td("showingSomeOf", { total: filtered.length })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Small KPI tile ──
function Kpi({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-sm p-3">
      <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className={`text-lg font-mono font-bold ${color} mt-1`}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Simple SVG bar chart (no external chart lib needed) ──
function TimelineChart({ points }: { points: { label: string; profit: number }[] }) {
  const td = useTranslations("Trade.dashboard");
  if (points.length === 0) {
    return (
      <div className="text-[11px] text-zinc-600 py-8 text-center">
        {td("noChartData")}
      </div>
    );
  }
  const max = Math.max(...points.map((p) => Math.abs(p.profit)), 1);
  const W = 800;
  const H = 160;
  const pad = 16;
  const barW = Math.max((W - pad * 2) / points.length - 2, 3);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[400px] h-40">
        {/* baseline */}
        <line
          x1={pad}
          x2={W - pad}
          y1={H / 2}
          y2={H / 2}
          stroke="rgb(63 63 70 / 0.6)"
          strokeDasharray="2 3"
        />
        {points.map((p, i) => {
          const x = pad + i * ((W - pad * 2) / points.length);
          const h = ((Math.abs(p.profit) / max) * (H / 2 - 8));
          const isNeg = p.profit < 0;
          const y = isNeg ? H / 2 : H / 2 - h;
          return (
            <g key={p.label}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                fill={isNeg ? "rgb(248 113 113 / 0.8)" : "rgb(52 211 153 / 0.8)"}
              >
                <title>{`${p.label} — ${Math.round(p.profit).toLocaleString()} aUEC`}</title>
              </rect>
              {i % Math.ceil(points.length / 8 || 1) === 0 && (
                <text
                  x={x + barW / 2}
                  y={H - 2}
                  textAnchor="middle"
                  fontSize="9"
                  fill="rgb(113 113 122)"
                  fontFamily="monospace"
                >
                  {p.label.slice(-5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
