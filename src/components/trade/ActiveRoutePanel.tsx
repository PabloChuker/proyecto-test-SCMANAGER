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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import CobrarStopModal, { type CobrarStopContext } from "./CobrarStopModal";

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

/** Human-friendly label for the route picker.
 *
 *   primary:  first known sell station (+ "(+N)" if there are more stops).
 *   commodities: unique commodity codes/names across the route, used as the
 *             fallback label when no station is assigned yet (user hates
 *             timestamp labels — they want to see WHAT the route is about).
 *   secondary: "N items · SCU · ~aUEC"
 *   stale:    true when no stop has a recommended station (likely the
 *             route was created before the commodity_abbr mapping fix, so
 *             none of the WOs got a sell station attached).
 */
function computeRouteLabel(
  r: ActiveRoute,
): {
  primary: string | null;
  station: string | null;
  extraCount: number;
  itemCount: number;
  totalScu: number;
  totalValue: number;
  commodities: string[];
  stale: boolean;
} {
  let totalScu = 0;
  let totalValue = 0;
  let itemCount = 0;
  // Preserve insertion order and dedupe. We prefer short commodity codes
  // (e.g. "LARA") over full names ("Laranite") so the picker pills stay
  // compact, but fall back to the name if no code is available.
  const seen = new Set<string>();
  const commodities: string[] = [];
  for (const s of r.stops) {
    totalScu += s.subtotalScu;
    totalValue += s.subtotalValue;
    itemCount += s.items.length;
    for (const it of s.items) {
      const raw =
        (it.wo.commodity_code && it.wo.commodity_code.trim()) ||
        (it.wo.commodity_name && it.wo.commodity_name.trim()) ||
        "";
      if (!raw) continue;
      const key = raw.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      commodities.push(raw.toUpperCase());
    }
  }
  const stopsWithStation = r.stops.filter((s) => s.station);
  const firstStation = stopsWithStation[0]?.station ?? null;
  const extraCount = stopsWithStation.length > 1 ? stopsWithStation.length - 1 : 0;
  return {
    primary: firstStation,
    station: firstStation,
    extraCount,
    itemCount,
    totalScu,
    totalValue,
    commodities,
    stale: !firstStation,
  };
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
  const router = useRouter();
  const searchParams = useSearchParams();
  // Fase E.E2 — cuando se llega desde una notificación payout_pending /
  // payout_transferred el link trae `?settle=<route_group_id>`: pre-seleccionamos
  // esa ruta y auto-abrimos el CobrarStopModal para que Pablo pueda tildar los
  // pagos y cerrar la orden sin buscar la ruta a mano.
  const settleParamGroupId = searchParams?.get("settle") ?? null;
  const [settleAutoOpened, setSettleAutoOpened] = useState(false);
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
  const [repairingId, setRepairingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  // Bulk auto-repair progress. When non-null the top banner shows
  // "Actualizando precios {done}/{total}…".
  const [bulkRepair, setBulkRepair] = useState<{ done: number; total: number } | null>(null);
  // Tracks routes we've already tried to auto-repair this session so we
  // don't re-fire PATCH storms on every re-render / refresh.
  const autoRepairedRef = useRef<Set<string>>(new Set());
  // Diagnostic: commodity codes that came back empty from the price
  // endpoint. If non-empty, the banner surfaces it so Pablo knows *why*
  // a route is still stale after auto-repair.
  const [unpricedCommodities, setUnpricedCommodities] = useState<string[]>([]);
  // Fase D.2 — modal de "Cobrar". null = cerrado.
  const [cobrarStop, setCobrarStop] = useState<CobrarStopContext | null>(null);
  // Set de "groupId|stop_index" que el usuario ya cobró (status=pending o
  // distributed). Se hidrata en background y se actualiza al cerrar el modal.
  const [cobradoStops, setCobradoStops] = useState<Set<string>>(new Set());

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
      // The endpoint wraps the list as { data: TradeWorkOrder[] } — same
      // shape TradeDashboard reads. Without this unwrap allOrders stays [],
      // which makes the panel render "no active routes" even when WOs exist.
      const json = await res.json();
      const list = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
          ? json.data
          : [];
      setAllOrders(list as TradeWorkOrder[]);
    } catch {
      setError("__load_failed__");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Repair a stale route ────────────────────────────────────────────────
  // Iterates WOs in a route, fetches the best sell station per unique
  // commodity_code from the commodity-prices endpoint, and PATCHes each WO
  // with station/system/price. Survives partial failures — we want
  // something > nothing.
  //
  // `opts.skipRefresh` is the bulk-loop escape hatch: when we're chaining
  // many repairs sequentially we don't want each one to re-fetch the WO list
  // (that re-renders the panel AND mutates `activeRoutes`, which re-fires
  // the bulk effect, which cancels and restarts itself, which makes the
  // banner flicker between "0/N" states forever). The bulk effect calls
  // refresh() exactly once at the end of the loop instead.
  const repairRoute = useCallback(
    async (route: ActiveRoute, opts?: { skipRefresh?: boolean }) => {
      const groupWOs: TradeWorkOrder[] = [];
      for (const s of route.stops) {
        for (const it of s.items) groupWOs.push(it.wo);
      }
      const uniqueCommodities = Array.from(
        new Set(
          groupWOs
            .map((w) => (w.commodity_code || "").toUpperCase())
            .filter((c) => c.length > 0),
        ),
      );
      if (uniqueCommodities.length === 0) return;

      setRepairingId(route.groupId);
      try {
        const best: Record<
          string,
          { station: string; system: string; price: number } | null
        > = {};
        const missing: string[] = [];
        await Promise.all(
          uniqueCommodities.map(async (code) => {
            try {
              const r = await fetch(
                `/api/mining/commodity-prices?commodity=${encodeURIComponent(code)}&side=sell`,
              );
              const json = await r.json();
              const top = (json?.data || [])[0];
              if (top && top.station) {
                best[code] = {
                  station: String(top.station || ""),
                  system: String(top.system || ""),
                  price: Number(top.price) || 0,
                };
              } else {
                // No sell location returned — either the price table is
                // empty for this abbr or the ingest never wrote it. We
                // surface these to the user instead of silently giving up.
                best[code] = null;
                missing.push(code);
              }
            } catch {
              best[code] = null;
              missing.push(code);
            }
          }),
        );
        if (missing.length > 0) {
          setUnpricedCommodities((prev) =>
            Array.from(new Set([...prev, ...missing])).sort(),
          );
        }

        // PATCH each WO of that route with its commodity's best station.
        await Promise.all(
          groupWOs.map(async (wo) => {
            const code = (wo.commodity_code || "").toUpperCase();
            const b = best[code];
            if (!b || !b.station) return;
            try {
              await fetch(`/api/trade/work-orders/${wo.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sell_station: b.station,
                  sell_system: b.system,
                  sell_price_per_scu: b.price,
                }),
              });
            } catch {
              // swallow — the user sees the updated list once refresh runs
            }
          }),
        );

        if (!opts?.skipRefresh) {
          await refresh();
        }
      } finally {
        setRepairingId(null);
      }
    },
    [refresh],
  );

  // ── Delete a whole route (all WOs in the group) ─────────────────────────
  const deleteRoute = useCallback(
    async (route: ActiveRoute) => {
      const groupWOs: TradeWorkOrder[] = [];
      for (const s of route.stops) {
        for (const it of s.items) groupWOs.push(it.wo);
      }
      if (groupWOs.length === 0) return;
      setDeletingId(route.groupId);
      try {
        await Promise.all(
          groupWOs.map((wo) =>
            fetch(`/api/trade/work-orders/${wo.id}`, { method: "DELETE" }).catch(
              () => undefined,
            ),
          ),
        );
        await refresh();
      } finally {
        setDeletingId(null);
      }
    },
    [refresh],
  );

  // ── Bulk-delete every stale route in the current scope ──────────────────
  // Pablo ran into 16 zombie routes after a failed ingest — this is the
  // "nuke them all" escape hatch.
  const deleteAllStale = useCallback(
    async (routes: ActiveRoute[]) => {
      const staleRoutes = routes.filter((r) => !r.stops.some((s) => s.station));
      if (staleRoutes.length === 0) return;
      const woIds: string[] = [];
      for (const r of staleRoutes) {
        for (const s of r.stops) for (const it of s.items) woIds.push(it.wo.id);
      }
      if (woIds.length === 0) return;
      setBulkBusy(true);
      try {
        await Promise.all(
          woIds.map((id) =>
            fetch(`/api/trade/work-orders/${id}`, { method: "DELETE" }).catch(
              () => undefined,
            ),
          ),
        );
        await refresh();
      } finally {
        setBulkBusy(false);
      }
    },
    [refresh],
  );

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
    // Fase E.E2 — si llegamos con ?settle=<groupId> y existe esa ruta, la
    // seleccionamos antes del fallback de "primera ruta". Prioridad sobre
    // el default.
    if (
      settleParamGroupId &&
      activeRoutes.some((r) => r.groupId === settleParamGroupId) &&
      selectedGroupId !== settleParamGroupId
    ) {
      setSelectedGroupId(settleParamGroupId);
      return;
    }
    if (!selectedGroupId || !activeRoutes.some((r) => r.groupId === selectedGroupId)) {
      setSelectedGroupId(activeRoutes[0].groupId);
    }
  }, [activeRoutes, selectedGroupId, settleParamGroupId]);

  const selected = useMemo(
    () => activeRoutes.find((r) => r.groupId === selectedGroupId) || null,
    [activeRoutes, selectedGroupId],
  );

  // ── Bulk auto-repair on mount ───────────────────────────────────────────
  // Pablo: "seguimos sin precio". Earlier we only auto-repaired the *selected*
  // route, which meant that with 16 zombie routes only the first one got a
  // station and the picker still showed NO PRICES for everything else.
  // Now: whenever the list of routes settles, we iterate every stale route
  // sequentially and repair it. Sequential (not Promise.all) so we don't
  // hammer Supabase / the /api/mining/commodity-prices endpoint when the user
  // has many routes. autoRepairedRef makes us idempotent across re-renders.
  useEffect(() => {
    if (activeRoutes.length === 0) return;
    const stale = activeRoutes.filter((r) =>
      r.stops.every((s) => !s.station),
    );
    const pending = stale.filter(
      (r) => !autoRepairedRef.current.has(r.groupId),
    );
    if (pending.length === 0) return;

    let cancelled = false;
    (async () => {
      setBulkRepair({ done: 0, total: pending.length });
      for (let i = 0; i < pending.length; i++) {
        if (cancelled) return;
        const r = pending[i];
        // mark BEFORE awaiting so the next effect firing (triggered by
        // refresh → activeRoutes change) doesn't re-queue this groupId.
        autoRepairedRef.current.add(r.groupId);
        try {
          // skipRefresh: critical. Refreshing between repairs re-runs this
          // whole effect (activeRoutes dep), which cancels us and restarts
          // a fresh "0/N" banner → visible flicker. One refresh at the end
          // settles everything in a single render.
          await repairRoute(r, { skipRefresh: true });
        } catch {
          // repairRoute already swallows per-WO errors; this only fires on
          // a catastrophic failure. Skip and keep the bulk pass moving.
        }
        if (!cancelled) setBulkRepair({ done: i + 1, total: pending.length });
      }
      if (!cancelled) {
        // Single refresh at the end pulls in all the PATCHed stations/prices
        // for every route we just repaired.
        try {
          await refresh();
        } catch {
          // Not fatal — next manual refresh will pick up the changes.
        }
        setBulkRepair(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeRoutes, repairRoute, refresh]);

  // ── Hidratar set de stops ya cobrados por la ruta seleccionada ───────────
  // Hacemos un GET liviano al endpoint de distribuciones filtrando por
  // route_group_id; incluye pending + distributed (no archived) para que el
  // boton muestre "Recalcular" en vez de "Cobrar" cuando ya se toco. Corre
  // cuando cambia el groupId seleccionado o cuando el modal se cierra.
  const refreshCobradoStops = useCallback(
    async (groupId: string) => {
      try {
        const r = await fetch(
          `/api/mining/distributions?route_group_id=${encodeURIComponent(groupId)}`,
        );
        if (!r.ok) return;
        const json = await r.json();
        const list = Array.isArray(json?.data) ? json.data : [];
        setCobradoStops((prev) => {
          const next = new Set(prev);
          for (const d of list) {
            if (!d || d.status === "archived") continue;
            next.add(`${groupId}|${d.stop_index}`);
          }
          return next;
        });
      } catch {
        /* swallow — no molestamos al usuario por esto */
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectedGroupId) return;
    refreshCobradoStops(selectedGroupId);
  }, [selectedGroupId, refreshCobradoStops]);

  // Fase E.E2 — cuando llegamos desde una notificación (?settle=<groupId>),
  // una vez que la ruta está seleccionada y sus stops cargados, auto-abrimos
  // el CobrarStopModal usando TODOS los WOs de la ruta. Sólo se dispara una vez.
  useEffect(() => {
    if (!settleParamGroupId || settleAutoOpened) return;
    if (!selected || selected.groupId !== settleParamGroupId) return;
    if (cobrarStop) return; // ya abierto
    if (!selected.stops || selected.stops.length === 0) return;
    const lastStop = selected.stops[selected.stops.length - 1];
    if (!lastStop) return;
    const allWOs = selected.stops.flatMap((s) => s.items.map((it) => it.wo));
    if (allWOs.length === 0) return;
    setCobrarStop({
      routeGroupId: selected.groupId,
      stopIndex: lastStop.minStop,
      routeTotalStops: selected.total,
      station: lastStop.station,
      system: lastStop.system,
      workOrders: allWOs,
    });
    setSettleAutoOpened(true);
  }, [settleParamGroupId, settleAutoOpened, selected, cobrarStop]);

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
  // Only show skeleton placeholders on the VERY FIRST load (when we have no
  // data yet). Subsequent refreshes (triggered by bulk auto-repair, manual
  // REFRESH button, or the pending-groupId handoff) must not unmount the
  // panel — otherwise the user sees the whole UI blink every time, which
  // feels like "parpadeo continuo" while the bulk loop is iterating.
  if (loading && allOrders.length === 0) {
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
    // Scope-aware hint: if the user is looking at the "Party" tab but there
    // ARE active routes in the unscoped list, tell them explicitly that the
    // existing routes just aren't tagged with a party (instead of the
    // generic "create a route" hint, which is misleading in that case).
    const hasAnyRouteMarker =
      scope === "party" && allOrders.some((o) => parseRouteMarker(o.notes));
    return (
      <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-sm p-6 text-center">
        <div className="text-zinc-500 text-sm">{t("noActiveRoutes")}</div>
        <div className="text-xs text-zinc-600 mt-2">
          {hasAnyRouteMarker
            ? t("noPartyRoutesHint")
            : t("noActiveRoutesHint")}
        </div>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => router.push("/mining?next-route=1")}
            className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-mono bg-amber-500/15 border border-amber-500/40 rounded-sm text-amber-200 hover:bg-amber-500/25"
          >
            + {t("nextRoute")}
          </button>
          {scope === "party" && (
            <button
              onClick={() => setScope("me")}
              className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-amber-300 hover:text-amber-200 font-mono"
            >
              {t("scope.me")} →
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Bulk auto-repair progress ───────────────────────────────────────
           Shows while we're sequentially repairing zombie routes that came
           in without sell stations. Pablo's mental model: "the app is doing
           something about it", not "I need to click 17 Repair buttons". */}
      {bulkRepair && bulkRepair.total > 0 && (
        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-sm px-3 py-2 text-[11px] text-cyan-200 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-mono">
            {t("bulkAutoRepair", {
              done: bulkRepair.done,
              total: bulkRepair.total,
            })}
          </span>
        </div>
      )}

      {/* ── Diagnostic: commodities with no sell price in the DB ────────────
           When a repair attempt finishes but some commodity codes came back
           empty, we tell the user which ones so they know *why* a specific
           route is still stale (usually: the price ingest hasn't run for
           that abbr yet, or the commodity isn't tradeable). */}
      {unpricedCommodities.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-sm px-3 py-2 text-[11px] text-amber-200 flex items-start gap-2">
          <span className="text-base leading-none">ℹ</span>
          <div className="flex-1">
            <div className="font-mono">
              {t("unpricedCommodities", {
                list: unpricedCommodities.join(", "),
              })}
            </div>
            <button
              onClick={() => setUnpricedCommodities([])}
              className="text-[10px] uppercase tracking-widest text-amber-300/70 hover:text-amber-200 mt-1"
            >
              {t("dismiss")}
            </button>
          </div>
        </div>
      )}

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
          {(() => {
            const staleCount = activeRoutes.filter(
              (r) => !r.stops.some((s) => s.station),
            ).length;
            if (staleCount < 2) return null;
            return (
              <button
                onClick={() => deleteAllStale(activeRoutes)}
                disabled={bulkBusy}
                className="px-3 py-1 text-[10px] uppercase tracking-widest font-mono bg-red-500/15 border border-red-500/40 rounded-sm text-red-200 hover:bg-red-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                title={t("deleteAllStaleHint", { count: staleCount })}
              >
                {bulkBusy
                  ? t("deleting")
                  : t("deleteAllStale", { count: staleCount })}
              </button>
            );
          })()}
          <button
            onClick={refresh}
            className="px-3 py-1 text-[10px] uppercase tracking-widest font-mono bg-zinc-900/50 border border-zinc-800/60 rounded-sm text-zinc-300 hover:bg-zinc-800"
          >
            {t("refresh")}
          </button>
          <button
            onClick={() => router.push("/mining?next-route=1")}
            className="px-3 py-1 text-[10px] uppercase tracking-widest font-mono bg-amber-500/15 border border-amber-500/40 rounded-sm text-amber-200 hover:bg-amber-500/25"
            title={t("nextRouteHint")}
          >
            + {t("nextRoute")}
          </button>
        </div>
      </div>

      {/* Route picker (only if multiple active) */}
      {activeRoutes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {activeRoutes.map((r) => {
            const isActive = r.groupId === selectedGroupId;
            const meta = computeRouteLabel(r);
            // Fallback label: a short list of commodity codes (e.g.
            // "QUAN, LARA, GOLD +1") instead of a meaningless timestamp.
            let commoditiesFallback: string | null = null;
            if (meta.commodities.length > 0) {
              const head = meta.commodities.slice(0, 3).join(", ");
              const extra = meta.commodities.length - 3;
              commoditiesFallback =
                extra > 0 ? t("routeCommoditiesMore", { list: head, more: extra }) : head;
            }
            const title = meta.station
              ? `${meta.station}${meta.extraCount > 0 ? ` (+${meta.extraCount})` : ""}`
              : commoditiesFallback ?? t("routeNoTime");
            return (
              <button
                key={r.groupId}
                onClick={() => setSelectedGroupId(r.groupId)}
                title={`#${r.groupId.slice(0, 6).toUpperCase()}`}
                className={`flex flex-col items-start text-left px-3 py-2 rounded-sm text-xs border transition min-w-[180px] ${
                  isActive
                    ? "bg-amber-500/20 text-amber-200 border-amber-500/50"
                    : meta.stale
                      ? "bg-zinc-900/40 text-zinc-400 border-amber-500/25 hover:border-amber-500/40 hover:text-zinc-200"
                      : "bg-zinc-900/40 text-zinc-300 border-zinc-800/50 hover:border-zinc-700 hover:text-zinc-100"
                }`}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="font-mono font-bold truncate max-w-[160px]">
                    {title}
                  </span>
                  {meta.stale && (
                    <span className="text-[9px] uppercase tracking-wider text-amber-400/80 shrink-0">
                      {t("noPrices")}
                    </span>
                  )}
                  <span className="ml-auto text-[10px] font-mono opacity-70 shrink-0">
                    {r.completedCount}/{r.totalCount}
                  </span>
                </div>
                <div className="text-[10px] font-mono opacity-70 mt-0.5 truncate">
                  {t("routeItems", { items: meta.itemCount })} ·{" "}
                  {fmt(meta.totalScu)} SCU
                  {meta.totalValue > 0 && (
                    <> · ~{fmt(meta.totalValue)} aUEC</>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <>
          {/* ── Stale route warning: no sell stations were attached to any
               of the WOs in this route. Usually means the mining inventory
               didn't have a loaded price table when the route was built. ── */}
          {(() => {
            const sel = computeRouteLabel(selected);
            if (!sel.stale) return null;
            const busy =
              repairingId === selected.groupId ||
              deletingId === selected.groupId;
            return (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-sm p-3 text-[12px] text-amber-200 flex items-start gap-3">
                <span className="text-lg leading-none">⚠</span>
                <div className="flex-1">
                  <div className="font-bold">{t("staleTitle")}</div>
                  <div className="text-[11px] text-amber-300/80 mt-1">
                    {t("staleHint")}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      onClick={() => repairRoute(selected)}
                      disabled={busy}
                      className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest rounded-sm border bg-emerald-500/15 border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {repairingId === selected.groupId
                        ? t("repairing")
                        : t("repairRoute")}
                    </button>
                    <button
                      onClick={() => deleteRoute(selected)}
                      disabled={busy}
                      className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest rounded-sm border bg-red-500/15 border-red-500/40 text-red-200 hover:bg-red-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deletingId === selected.groupId
                        ? t("deleting")
                        : t("deleteRoute")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
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

          {/* ── Route-level settle button (Fase E.A) ── */}
          {(() => {
            const anyCompleted = orderedStops.some((s) =>
              s.items.some((it) => it.wo.status === "completed"),
            );
            const allCompleted =
              orderedStops.length > 0 && orderedStops.every((s) => s.allCompleted);
            const alreadySettled = orderedStops.some((s) =>
              cobradoStops.has(`${selected.groupId}|${s.minStop}`),
            );
            const lastStop = orderedStops[orderedStops.length - 1];
            const disabled = !anyCompleted || !lastStop;
            return (
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 border border-zinc-800/60 rounded-sm bg-zinc-900/30">
                <div className="flex-1 min-w-[180px]">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    {t("cobrar.closeRouteLabel")}
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {allCompleted
                      ? t("cobrar.closeRouteReady")
                      : anyCompleted
                        ? t("cobrar.closeRoutePartial")
                        : t("cobrar.closeRouteNone")}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  title={disabled ? t("cobrar.disabledHint") : undefined}
                  onClick={() => {
                    if (!lastStop) return;
                    const allWOs = orderedStops.flatMap((s) =>
                      s.items.map((it) => it.wo),
                    );
                    setCobrarStop({
                      routeGroupId: selected.groupId,
                      stopIndex: lastStop.minStop,
                      routeTotalStops: selected.total,
                      station: lastStop.station,
                      system: lastStop.system,
                      workOrders: allWOs,
                    });
                  }}
                  className={`px-3 py-1.5 rounded-sm border text-xs font-mono uppercase tracking-widest transition ${
                    disabled
                      ? "bg-zinc-800/40 border-zinc-800/60 text-zinc-600 cursor-not-allowed"
                      : alreadySettled
                        ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/25"
                        : "bg-amber-500/15 border-amber-500/40 text-amber-200 hover:bg-amber-500/25"
                  }`}
                >
                  {alreadySettled
                    ? t("cobrar.closeRouteRecalc")
                    : t("cobrar.closeRouteAction")}
                </button>
              </div>
            );
          })()}

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
                    cobrado={cobradoStops.has(`${selected.groupId}|${s.minStop}`)}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Fase D.2 — Modal de cobrar un stop */}
      {cobrarStop && (
        <CobrarStopModal
          ctx={cobrarStop}
          onClose={() => setCobrarStop(null)}
          onSuccess={() => {
            if (selectedGroupId) refreshCobradoStops(selectedGroupId);
          }}
        />
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
  cobrado,
}: {
  stop: LogicalStop;
  index: number;
  isDragging: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onOpenWO: (id: string) => void;
  cobrado: boolean;
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
        <div className="flex items-center gap-2">
          {cobrado && (
            <span className="px-1.5 py-0.5 rounded-sm border text-[10px] uppercase tracking-widest bg-emerald-500/15 border-emerald-500/40 text-emerald-300">
              ✓ {t("cobrar.cobradoBadge")}
            </span>
          )}
          <span className="opacity-60">{t("dragToReorder")}</span>
        </div>
      </div>
    </div>
  );
}
