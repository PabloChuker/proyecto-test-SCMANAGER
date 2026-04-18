"use client";

// =============================================================================
// SC LABS — ActiveRoutePanel (Fase B.10)
//
// Full-day route overview. Groups active trade work orders by their
// [route:GROUP:STOP:TOTAL] marker and renders every stop of every active
// route at once, so the player can:
//
//   • See where each commodity needs to be sold BEFORE leaving
//   • Reorder stops by drag-and-drop OR by preset (revenue / distance / system)
//   • Spot cross-system jumps (Stanton ↔ Pyro) and plan accordingly
//   • Read exposure hints (armistice city vs lagrange vs lawless rest stop)
//
// This panel is independent of the Dashboard tab — it fetches its own
// copy of the WO list so the user can jump straight to it.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import {
  useTradeWorkOrderStore,
  TradeWorkOrder,
} from "@/store/useTradeWorkOrderStore";
import { parseRouteMarker } from "@/lib/miningTradeBridge";
import {
  classifyStation,
  estimateTravelMinutes,
  inferBody,
  sortByDistance,
  sortByRevenue,
  sortBySystem,
  StationType,
} from "@/lib/routeOptimizer";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return Math.round(n || 0).toLocaleString();
}

type Scope = "me" | "party" | "all";

/** A WO that belongs to a route group. */
interface RouteStopWO {
  wo: TradeWorkOrder;
  stop: number; // 1-based
}

/** A logical stop (one station) with N commodities being sold there. */
interface LogicalStop {
  key: string; // station|system
  station: string | null;
  system: string | null;
  body: string;
  stationType: StationType;
  items: RouteStopWO[];
  subtotalScu: number;
  subtotalValue: number;
  minStop: number; // smallest stop# among items (for original ordering)
  allCompleted: boolean;
  anyInProgress: boolean;
}

interface ActiveRoute {
  groupId: string;
  total: number;
  completedCount: number;
  totalCount: number;
  stops: LogicalStop[]; // one entry per station (commodities grouped)
}

function groupIntoLogicalStops(wos: RouteStopWO[]): LogicalStop[] {
  const map = new Map<string, LogicalStop>();
  for (const entry of wos) {
    const station = entry.wo.sell_station;
    const system = entry.wo.sell_system;
    const key = `${(station || "?").toLowerCase()}|${(system || "?").toLowerCase()}`;
    const existing = map.get(key);
    const scu = entry.wo.scu_bought || 0;
    const price = entry.wo.sell_price_per_scu || 0;
    const value = scu * price;
    if (existing) {
      existing.items.push(entry);
      existing.subtotalScu += scu;
      existing.subtotalValue += value;
      existing.minStop = Math.min(existing.minStop, entry.stop);
      if (entry.wo.status !== "completed") existing.allCompleted = false;
      if (entry.wo.status === "in_progress") existing.anyInProgress = true;
    } else {
      map.set(key, {
        key,
        station,
        system,
        body: inferBody(station, system),
        stationType: classifyStation(station),
        items: [entry],
        subtotalScu: scu,
        subtotalValue: value,
        minStop: entry.stop,
        allCompleted: entry.wo.status === "completed",
        anyInProgress: entry.wo.status === "in_progress",
      });
    }
  }
  // Default = original stop# order
  return [...map.values()].sort((a, b) => a.minStop - b.minStop);
}

// ── main component ───────────────────────────────────────────────────────────

export default function ActiveRoutePanel() {
  const t = useTranslations("Trade.activeRoute");
  const { user } = useAuth();
  const openEdit = useTradeWorkOrderStore((s) => s.openEdit);
  // Handoff from the Mining sell-route flow: when the modal confirms, it
  // stashes the fresh groupId in the store and bumps requestActiveRouteTab.
  // We consume the id once on mount and every time the handoff bumps so
  // the just-created route lands as the active one in the picker.
  const pendingActiveRouteGroupId = useTradeWorkOrderStore(
    (s) => s.pendingActiveRouteGroupId,
  );
  const consumePendingActiveRouteGroupId = useTradeWorkOrderStore(
    (s) => s.consumePendingActiveRouteGroupId,
  );

  const [allOrders, setAllOrders] = useState<TradeWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("me");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [customOrder, setCustomOrder] = useState<Record<string, string[]>>({});
  // key → array of logical-stop keys (per groupId) in user-chosen order
  const [dragKey, setDragKey] = useState<string | null>(null);

  // ── fetch ──
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trade/work-orders");
      if (!res.ok) {
        if (res.status === 401) setError("__need_login__");
        else setError("__load_failed__");
        return;
      }
      const data = (await res.json()) as TradeWorkOrder[];
      setAllOrders(Array.isArray(data) ? data : []);
    } catch {
      setError("__load_failed__");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Scope-filter (mirrors TradeDashboard logic)
  const scoped = useMemo(() => {
    if (scope === "all") return allOrders;
    if (scope === "party") return allOrders.filter((o) => !!o.party_id);
    if (!user?.id) return allOrders;
    return allOrders.filter((o) => {
      if (o.owner_id === user.id) return true;
      if (
        o.trade_wo_participants?.some((p) => p.user_id === user.id)
      ) {
        return true;
      }
      return false;
    });
  }, [allOrders, scope, user]);

  // ── Parse active routes ──
  const activeRoutes = useMemo<ActiveRoute[]>(() => {
    const map = new Map<
      string,
      { total: number; stops: RouteStopWO[]; completed: number }
    >();
    for (const o of scoped) {
      const m = parseRouteMarker(o.notes);
      if (!m) continue;
      const entry = map.get(m.groupId) || {
        total: m.total,
        stops: [] as RouteStopWO[],
        completed: 0,
      };
      entry.stops.push({ wo: o, stop: m.stop });
      if (o.status === "completed") entry.completed += 1;
      if (m.total > entry.total) entry.total = m.total;
      map.set(m.groupId, entry);
    }
    const rows: ActiveRoute[] = [];
    for (const [groupId, entry] of map) {
      if (entry.completed >= entry.total) continue; // done, skip
      const stops = groupIntoLogicalStops(entry.stops);
      rows.push({
        groupId,
        total: entry.total,
        completedCount: entry.completed,
        totalCount: entry.stops.length,
        stops,
      });
    }
    // Newest-first (biggest route at top)
    rows.sort((a, b) => b.totalCount - a.totalCount);
    return rows;
  }, [scoped]);

  // Prefer a pending group id pushed by the Mining sell-route flow. We wait
  // until that route actually appears in the fetched list (the POSTs may
  // finish slightly after this panel's first fetch) and then auto-select it.
  useEffect(() => {
    if (!pendingActiveRouteGroupId) return;
    if (activeRoutes.some((r) => r.groupId === pendingActiveRouteGroupId)) {
      setSelectedGroupId(pendingActiveRouteGroupId);
      consumePendingActiveRouteGroupId();
    }
  }, [pendingActiveRouteGroupId, activeRoutes, consumePendingActiveRouteGroupId]);

  // If a pending id was queued but the fetch happened before the WOs
  // materialised on the server, re-pull once after a short delay.
  useEffect(() => {
    if (!pendingActiveRouteGroupId) return;
    const has = activeRoutes.some((r) => r.groupId === pendingActiveRouteGroupId);
    if (has) return;
    const timer = setTimeout(() => {
      refresh();
    }, 500);
    return () => clearTimeout(timer);
  }, [pendingActiveRouteGroupId, activeRoutes, refresh]);

  // Auto-select the first route when none picked / current selection disappears
  useEffect(() => {
    if (activeRoutes.length === 0) {
      if (selectedGroupId !== null) setSelectedGroupId(null);
      return;
    }
    if (!selectedGroupId || !activeRoutes.some((r) => r.groupId === selectedGroupId)) {
      setSelectedGroupId(activeRoutes[0].groupId);
    }
  }, [activeRoutes, selectedGroupId]);

  const selected = useMemo(
    () => activeRoutes.find((r) => r.groupId === selectedGroupId) || null,
    [activeRoutes, selectedGroupId],
  );

  // Apply the user's custom ordering, if any, to the selected route.
  const orderedStops = useMemo<LogicalStop[]>(() => {
    if (!selected) return [];
    const order = customOrder[selected.groupId];
    if (!order || order.length === 0) return selected.stops;
    const byKey = new Map(selected.stops.map((s) => [s.key, s] as const));
    const result: LogicalStop[] = [];
    for (const k of order) {
      const s = byKey.get(k);
      if (s) {
        result.push(s);
        byKey.delete(k);
      }
    }
    // Anything new since the last reorder → append at end
    for (const s of byKey.values()) result.push(s);
    return result;
  }, [selected, customOrder]);

  // Totals + travel estimation
  const totals = useMemo(() => {
    let totalScu = 0;
    let totalValue = 0;
    let totalItems = 0;
    let travelMin = 0;
    let jumps = 0;
    let prev: LogicalStop | null = null;
    for (const s of orderedStops) {
      totalScu += s.subtotalScu;
      totalValue += s.subtotalValue;
      totalItems += s.items.length;
      const mins = estimateTravelMinutes(
        prev ? { station: prev.station, system: prev.system } : null,
        { station: s.station, system: s.system },
      );
      travelMin += mins;
      if (
        prev &&
        prev.system &&
        s.system &&
        prev.system.toLowerCase() !== s.system.toLowerCase()
      ) {
        jumps += 1;
      }
      prev = s;
    }
    return { totalScu, totalValue, totalItems, travelMin, jumps };
  }, [orderedStops]);

  // ── Sort actions ──
  const applySort = useCallback(
    (preset: "revenue" | "distance" | "system" | "original") => {
      if (!selected) return;
      if (preset === "original") {
        setCustomOrder((prev) => {
          const next = { ...prev };
          delete next[selected.groupId];
          return next;
        });
        return;
      }
      // We sort the underlying stops (in base order) then save that ordering.
      const base = selected.stops.map((s) => ({
        key: s.key,
        station: s.station,
        system: s.system,
        body: s.body,
        items: [],
        subtotalScu: s.subtotalScu,
        subtotalValue: s.subtotalValue,
      }));
      let ordered: typeof base;
      if (preset === "revenue") ordered = sortByRevenue(base as never);
      else if (preset === "distance") ordered = sortByDistance(base as never);
      else ordered = sortBySystem(base as never);

      setCustomOrder((prev) => ({
        ...prev,
        [selected.groupId]: ordered.map((o) => o.key),
      }));
    },
    [selected],
  );

  // ── Drag & drop ──
  const onDragStart = (key: string) => setDragKey(key);
  const onDragOver = (e: React.DragEvent, overKey: string) => {
    e.preventDefault();
    if (!dragKey || !selected || dragKey === overKey) return;
    const current = orderedStops.map((s) => s.key);
    const from = current.indexOf(dragKey);
    const to = current.indexOf(overKey);
    if (from < 0 || to < 0) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setCustomOrder((prev) => ({ ...prev, [selected.groupId]: next }));
  };
  const onDragEnd = () => setDragKey(null);

  // ── render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 bg-zinc-900/40 rounded-sm animate-pulse"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-sm p-4 text-red-300 text-sm">
        {error === "__need_login__" ? t("errorNeedLogin") : t("errorLoadFailed")}
      </div>
    );
  }

  if (activeRoutes.length === 0) {
    return (
      <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-sm p-6 text-center">
        <div className="text-zinc-500 text-sm">{t("noActiveRoutes")}</div>
        <div className="text-xs text-zinc-600 mt-2">{t("noActiveRoutesHint")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header: scope + route picker ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            {t("eyebrow")}
          </div>
          <div className="text-xl font-mono text-amber-400">{t("title")}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-zinc-900/50 border border-zinc-800/60 rounded-sm overflow-hidden">
            {(["me", "party", "all"] as Scope[]).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-3 py-1 text-[10px] uppercase tracking-widest font-mono ${
                  scope === s
                    ? "bg-amber-500/20 text-amber-300"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {t(`scope.${s}`)}
              </button>
            ))}
          </div>
          <button
            onClick={refresh}
            className="px-3 py-1 text-[10px] uppercase tracking-widest font-mono bg-zinc-900/50 border border-zinc-800/60 rounded-sm text-zinc-300 hover:bg-zinc-800"
          >
            {t("refresh")}
          </button>
        </div>
      </div>

      {/* Route picker (only if multiple active) */}
      {activeRoutes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {activeRoutes.map((r) => {
            const isActive = r.groupId === selectedGroupId;
            return (
              <button
                key={r.groupId}
                onClick={() => setSelectedGroupId(r.groupId)}
                className={`px-3 py-2 rounded-sm text-xs font-mono border transition ${
                  isActive
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                    : "bg-zinc-900/40 text-zinc-400 border-zinc-800/50 hover:text-zinc-200"
                }`}
              >
                <span className="opacity-60 mr-1.5">#</span>
                {r.groupId.slice(0, 6).toUpperCase()}
                <span className="ml-2 text-[10px] opacity-70">
                  {r.completedCount}/{r.total}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <>
          {/* ── Totals strip ── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Stat
              label={t("totalStops")}
              value={orderedStops.length.toString()}
              hint={t("stopsHint", { items: totals.totalItems })}
            />
            <Stat
              label={t("totalScu")}
              value={fmt(totals.totalScu)}
              hint="SCU"
            />
            <Stat
              label={t("estimatedRevenue")}
              value={fmt(totals.totalValue)}
              hint="aUEC"
              accent="emerald"
            />
            <Stat
              label={t("jumps")}
              value={totals.jumps.toString()}
              hint={t("jumpsHint")}
              accent={totals.jumps > 0 ? "red" : "zinc"}
            />
            <Stat
              label={t("travelTime")}
              value={`~${totals.travelMin}m`}
              hint={t("travelHint")}
              accent="cyan"
            />
          </div>

          {/* ── Sort toolbar ── */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              {t("sortBy")}
            </span>
            <SortButton onClick={() => applySort("revenue")} label={t("sortRevenue")} accent="emerald" />
            <SortButton onClick={() => applySort("distance")} label={t("sortDistance")} accent="cyan" />
            <SortButton onClick={() => applySort("system")} label={t("sortSystem")} accent="amber" />
            <SortButton onClick={() => applySort("original")} label={t("sortOriginal")} accent="zinc" />
            <span className="text-[10px] text-zinc-500 ml-auto">
              {t("dragHint")}
            </span>
          </div>

          {/* ── Stops ── */}
          <div className="space-y-2">
            {orderedStops.map((s, idx) => {
              const prev = idx > 0 ? orderedStops[idx - 1] : null;
              const systemChange =
                prev &&
                prev.system &&
                s.system &&
                prev.system.toLowerCase() !== s.system.toLowerCase();
              const travelMin = estimateTravelMinutes(
                prev ? { station: prev.station, system: prev.system } : null,
                { station: s.station, system: s.system },
              );

              return (
                <div key={s.key}>
                  {/* Jump separator */}
                  {systemChange && (
                    <div className="flex items-center gap-2 my-2 text-red-400 text-xs font-mono uppercase tracking-widest">
                      <div className="h-px flex-1 bg-red-500/30" />
                      <span>⚡ {t("jumpTo", { system: s.system || "?" })}</span>
                      <div className="h-px flex-1 bg-red-500/30" />
                    </div>
                  )}
                  {!systemChange && idx > 0 && travelMin > 0 && (
                    <div className="flex items-center gap-2 my-1.5 text-zinc-600 text-[10px] font-mono">
                      <div className="h-px flex-1 bg-zinc-800/40" />
                      <span>~{travelMin}m QT</span>
                      <div className="h-px flex-1 bg-zinc-800/40" />
                    </div>
                  )}

                  <StopCard
                    stop={s}
                    index={idx}
                    isDragging={dragKey === s.key}
                    onDragStart={() => onDragStart(s.key)}
                    onDragOver={(e) => onDragOver(e, s.key)}
                    onDragEnd={onDragEnd}
                    onOpenWO={openEdit}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Small sub-components ─────────────────────────────────────────────────────

function Stat({
  label,
  value,
  hint,
  accent = "zinc",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "zinc" | "emerald" | "cyan" | "amber" | "red";
}) {
  const ACCENTS: Record<string, string> = {
    zinc: "text-zinc-200",
    emerald: "text-emerald-300",
    cyan: "text-cyan-300",
    amber: "text-amber-300",
    red: "text-red-300",
  };
  return (
    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-sm p-3">
      <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className={`text-lg font-mono mt-0.5 ${ACCENTS[accent]}`}>{value}</div>
      {hint && <div className="text-[10px] text-zinc-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function SortButton({
  onClick,
  label,
  accent,
}: {
  onClick: () => void;
  label: string;
  accent: "emerald" | "cyan" | "amber" | "zinc";
}) {
  const ACCENTS: Record<string, string> = {
    emerald:
      "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20",
    cyan: "bg-cyan-500/10 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20",
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20",
    zinc: "bg-zinc-800/50 border-zinc-700/40 text-zinc-300 hover:bg-zinc-700/50",
  };
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 border rounded-sm text-[10px] font-mono uppercase tracking-widest ${ACCENTS[accent]}`}
    >
      {label}
    </button>
  );
}

function StationTypeBadge({ type }: { type: StationType }) {
  const map: Record<StationType, { label: string; cls: string; icon: string }> = {
    city: {
      label: "CITY",
      cls: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
      icon: "🏙",
    },
    lagrange: {
      label: "LAGRANGE",
      cls: "bg-cyan-500/15 border-cyan-500/40 text-cyan-300",
      icon: "🛰",
    },
    outpost: {
      label: "OUTPOST",
      cls: "bg-amber-500/15 border-amber-500/40 text-amber-300",
      icon: "⛺",
    },
    "rest-stop": {
      label: "REST STOP",
      cls: "bg-red-500/15 border-red-500/40 text-red-300",
      icon: "☠",
    },
    unknown: {
      label: "UNKNOWN",
      cls: "bg-zinc-800/50 border-zinc-700/40 text-zinc-400",
      icon: "?",
    },
  };
  const m = map[type];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border ${m.cls}`}
    >
      <span>{m.icon}</span>
      {m.label}
    </span>
  );
}

function SystemBadge({ system }: { system: string | null }) {
  if (!system) return null;
  const lower = system.toLowerCase();
  const isPyro = lower.includes("pyro");
  const cls = isPyro
    ? "bg-red-500/15 border-red-500/40 text-red-300"
    : "bg-emerald-500/15 border-emerald-500/40 text-emerald-300";
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border ${cls}`}
    >
      {system.toUpperCase()}
    </span>
  );
}

function StopCard({
  stop,
  index,
  isDragging,
  onDragStart,
  onDragOver,
  onDragEnd,
  onOpenWO,
}: {
  stop: LogicalStop;
  index: number;
  isDragging: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onOpenWO: (id: string) => void;
}) {
  const t = useTranslations("Trade.activeRoute");
  const doneItems = stop.items.filter((i) => i.wo.status === "completed").length;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`bg-zinc-900/50 border rounded-sm transition cursor-move ${
        isDragging
          ? "border-amber-500/60 ring-1 ring-amber-500/40 opacity-60"
          : stop.allCompleted
            ? "border-emerald-500/30"
            : stop.anyInProgress
              ? "border-cyan-500/30"
              : "border-zinc-800/60 hover:border-zinc-700/80"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 p-3 border-b border-zinc-800/40">
        <div className="flex flex-col items-center justify-center w-10 h-10 rounded-sm bg-zinc-800/70 border border-zinc-700/40 shrink-0">
          <span className="text-[9px] text-zinc-500 uppercase leading-none">
            {t("stopShort")}
          </span>
          <span className="text-lg font-mono text-amber-300 leading-none mt-0.5">
            {index + 1}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-1.5 mb-1">
            <SystemBadge system={stop.system} />
            <span className="text-[10px] text-zinc-500">/</span>
            <span className="text-xs text-zinc-300 font-mono">{stop.body}</span>
            <StationTypeBadge type={stop.stationType} />
            {stop.allCompleted && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border bg-emerald-500/15 border-emerald-500/40 text-emerald-300">
                ✓ {t("statusDone")}
              </span>
            )}
            {!stop.allCompleted && stop.anyInProgress && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border bg-cyan-500/15 border-cyan-500/40 text-cyan-300">
                {t("statusInProgress")}
              </span>
            )}
          </div>
          <div className="text-sm text-zinc-100 font-medium truncate">
            {stop.station || t("noStation")}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-mono text-emerald-300">
            ~{fmt(stop.subtotalValue)} aUEC
          </div>
          <div className="text-[10px] text-zinc-500">
            {fmt(stop.subtotalScu)} SCU · {t("itemsCount", { count: stop.items.length })}
          </div>
        </div>
      </div>

      {/* Commodities list */}
      <div className="divide-y divide-zinc-800/40">
        {stop.items.map((item) => {
          const done = item.wo.status === "completed";
          const inProg = item.wo.status === "in_progress";
          return (
            <button
              key={item.wo.id}
              onClick={(e) => {
                e.stopPropagation();
                onOpenWO(item.wo.id);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-zinc-800/30 transition"
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  done ? "bg-emerald-400" : inProg ? "bg-cyan-400" : "bg-zinc-600"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-200 truncate">
                  {item.wo.commodity_name || item.wo.commodity_code || "—"}
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">
                  {fmt(item.wo.scu_bought || 0)} SCU ·{" "}
                  {fmt(item.wo.sell_price_per_scu || 0)} aUEC/SCU
                </div>
              </div>
              <div className="text-xs font-mono text-zinc-400 shrink-0">
                ~{fmt((item.wo.scu_bought || 0) * (item.wo.sell_price_per_scu || 0))}
              </div>
              <span className="text-zinc-600 text-xs shrink-0">›</span>
            </button>
          );
        })}
      </div>

      {/* Footer: progress */}
      <div className="px-3 py-1.5 flex items-center justify-between text-[10px] text-zinc-500 font-mono bg-zinc-950/40">
        <span>
          {doneItems}/{stop.items.length} {t("commoditiesDone")}
        </span>
        <span className="opacity-60">{t("dragToReorder")}</span>
      </div>
    </div>
  );
}
