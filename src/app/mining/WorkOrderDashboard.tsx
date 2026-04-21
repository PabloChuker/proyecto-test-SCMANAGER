"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getSessions, getOrders, getActiveSessionId, setActiveSessionId,
  createSession, deleteSession, deleteOrder, collectOrder,
  completeOrder, tickOrders, getCrewSharesSummary, getStats,
  getInventory, getMovements, sellFromInventory, useForCrafting, clearInventoryData,
  distributeToMember, manualAdd, calculateDistribution, clearAllData,
  type WOSession, type WorkOrder, type OrderStatus,
  type InventoryItem, type InventoryMovement,
} from "@/lib/workOrderStore";
import { useMiningStore } from "@/store/useMiningStore";
import { useMiningRealtime, useMiningBroadcast } from "@/store/useMiningRealtime";
import { useTradeWorkOrderStore } from "@/store/useTradeWorkOrderStore";
import { useAuth } from "@/contexts/AuthContext";
import { getCommodityForMineral } from "@/data/mining/mineral-commodity-map";
import SellRoutePreviewModal, {
  type SellRouteInput,
} from "@/components/mining/SellRoutePreviewModal";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SellLocation {
  station: string;
  system: string;
  price: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtAuec(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function typeIcon(t: string) {
  return ({ ship: "⛏", roc: "💎", salvage: "♻", share: "🏛" } as any)[t] || "📋";
}

function typeLabel(tr: (k: string) => string, t: string) {
  const known = ["ship", "roc", "salvage", "share"];
  return known.includes(t) ? tr(`orderType.${t}`) : t;
}

function statusBadge(tr: (k: string) => string, s: OrderStatus) {
  switch (s) {
    case "in_progress": return { label: tr("statusBadge.in_progress"), color: "bg-amber-500/20 text-amber-400 border-amber-500/40" };
    case "completed": return { label: tr("statusBadge.completed"), color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" };
    case "collected": return { label: tr("statusBadge.collected"), color: "bg-blue-500/20 text-blue-400 border-blue-500/40" };
  }
}

function padZ(n: number) {
  return n.toString().padStart(2, "0");
}

function fmtCountdown(seconds: number) {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return `${padZ(h)}:${padZ(m)}:${padZ(s)}`;
}

function mvReasonLabel(tr: (k: string) => string, r: string) {
  const known = ["refine_complete", "sell", "craft", "distribute", "manual_add", "manual_remove"];
  return known.includes(r) ? tr(`mvReason.${r}`) : r;
}

function qualityBadge(q: number | undefined | null) {
  if (q == null || q <= 0) return null;
  const color = q >= 800 ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
    : q >= 500 ? "text-amber-400 bg-amber-500/15 border-amber-500/30"
    : "text-zinc-400 bg-zinc-700/30 border-zinc-600/30";
  const label = q >= 900 ? "A+" : q >= 800 ? "A" : q >= 600 ? "B" : q >= 400 ? "C" : "D";
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono font-bold ${color}`}>
      Q{q} ({label})
    </span>
  );
}

function oreLineWithQuality(ores: { id: string; name: string; yieldQty: number; quality?: number | null }[]) {
  if (!ores || ores.length === 0) return "—";
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
      {ores.map((o) => (
        <span key={o.id} className="inline-flex items-center gap-1">
          <span className="uppercase">{o.name}: {Math.round(o.yieldQty)}</span>
          {qualityBadge(o.quality)}
        </span>
      ))}
    </span>
  );
}

// ─── Scope chip ──────────────────────────────────────────────────────────────
// Fase H.1: etiqueta SOLO (amber) vs PARTY (emerald) para dejar claro el
// origen del dato en filas compartidas (inventario, órdenes, movimientos).
function ScopeChip({ scope, label }: { scope: "solo" | "party" | null; label: string }) {
  if (!scope) return null;
  const cls =
    scope === "party"
      ? "bg-emerald-500/20 text-emerald-400"
      : "bg-amber-500/20 text-amber-400";
  return (
    <span
      className={`text-[8px] px-1 py-0.5 rounded uppercase tracking-wider ${cls}`}
    >
      {label}
    </span>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

type DashTab = "sessions" | "orders" | "inventory" | "crew" | "stats";

const TABS: { key: DashTab; icon: string }[] = [
  { key: "sessions", icon: "📋" },
  { key: "orders", icon: "⛏" },
  { key: "inventory", icon: "📦" },
  { key: "crew", icon: "👥" },
  { key: "stats", icon: "📊" },
];

// ═════════════════════════════════════════════════════════════════════════════

export default function WorkOrderDashboard() {
  const t = useTranslations("Mining.dashboard");
  const router = useRouter();
  // ?next-route=1 (from ActiveRoutePanel "+ Siguiente ruta") lands us on the
  // Inventory sub-tab so Pablo can immediately pick stock and build the next
  // sell route — no back-and-forth between Trade and Mining.
  const searchParams = useSearchParams();
  const wantNextRoute = searchParams?.get("next-route") === "1";
  const requestOpenFromRoute = useTradeWorkOrderStore((s) => s.requestOpenFromRoute);
  const [tab, setTab] = useState<DashTab>(wantNextRoute ? "inventory" : "orders");
  const [sessions, setSessions] = useState<WOSession[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newSessionName, setNewSessionName] = useState("");
  const [rk, setRk] = useState(0);
  const [now, setNow] = useState(Date.now());

  // ── Inventory state ──
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [invAction, setInvAction] = useState<{ mineralId: string; mineralName: string; type: "sell" | "craft" | "distribute"; qty: number; member: string } | null>(null);

  // ── Distribution modal ──
  const [distOrderId, setDistOrderId] = useState<string | null>(null);

  // ── Reset All confirmation ──
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // ── Auth ──
  const { user } = useAuth();

  // ── Supabase shared data (visible to all party members) ──
  const {
    activeSessionId: sbSessionId,
    workOrders: sbWorkOrders,
    inventory: sbInventory,
    movements: sbMovements,
    members: sbMembers,
    sessions: sbSessions,
    updateOrderStatus: sbUpdateStatus,
    deleteWorkOrder: sbDeleteOrder,
    clearInventory: sbClearInventory,
    recordInventoryAction: sbRecordInventoryAction,
    fetchSessions: sbFetchSessions,
    setActiveSession: sbSetActiveSession,
  } = useMiningStore();

  useMiningRealtime();
  const broadcast = useMiningBroadcast();

  // ── Scope (solo vs party) derivations ────────────────────────────────────
  // Fase H.1: la diferencia NO es localStorage vs Supabase — los usuarios
  // logueados también pueden tener sesiones "solo" (party_id = null). Scope se
  // determina por `MiningSession.party_id`:
  //   - party_id === null → solo   (amber)
  //   - party_id !== null → party  (emerald)
  // Offline (sin `user`) es siempre solo (localStorage).
  type Scope = "solo" | "party";
  const sessionScope = useMemo(() => {
    const map = new Map<string, Scope>();
    for (const s of sbSessions) map.set(s.id, s.party_id ? "party" : "solo");
    return map;
  }, [sbSessions]);
  const activeSbScope: Scope | null = sbSessionId
    ? sessionScope.get(sbSessionId) ?? null
    : null;

  // ── Auto-detect & load Supabase session for logged-in users ──
  useEffect(() => {
    if (!user || sbSessionId) return;
    sbFetchSessions().then(() => {
      const sessions = useMiningStore.getState().sessions;
      const active = sessions.find((s) => s.status === "active") || sessions[0];
      if (active) {
        sbSetActiveSession(active.id);
      }
    });
  }, [user, sbSessionId, sbFetchSessions, sbSetActiveSession]);

  // ── Clear inventory confirmation ──
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // ── Sell location modal state ──
  const [sellModalItem, setSellModalItem] = useState<string | null>(null);
  const [sellModalName, setSellModalName] = useState("");
  const [sellLocations, setSellLocations] = useState<SellLocation[]>([]);
  const [loadingSellData, setLoadingSellData] = useState(false);
  const [bestPrices, setBestPrices] = useState<Record<string, SellLocation>>({});
  // Full top-N (~10) sell locations per commodity; used by the route
  // optimiser to find shared stations across multiple commodities.
  const [priceOptionsByMineral, setPriceOptionsByMineral] = useState<
    Record<string, SellLocation[]>
  >({});
  const [bestPricesLoaded, setBestPricesLoaded] = useState(false);

  // ── Multi-sell route state (Fase B) ──
  const [selectedMineralIds, setSelectedMineralIds] = useState<Set<string>>(new Set());
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [routeModalItems, setRouteModalItems] = useState<SellRouteInput[]>([]);

  // Load localStorage data ONLY when NOT logged in (solo mode)
  useEffect(() => {
    if (user) return; // Skip localStorage entirely when logged in
    setSessions(getSessions());
    setOrders(getOrders());
    setActiveId(getActiveSessionId());
    setInventory(getInventory());
    setMovements(getMovements());
  }, [rk, user]);

  // Tick every second for countdown display + localStorage/Supabase timer completion
  const autoCompletedSbIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const interval = setInterval(() => {
      const nowMs = Date.now();
      setNow(nowMs);
      if (!user) {
        // Only tick localStorage orders in solo mode
        const completed = tickOrders();
        if (completed.length > 0) refresh();
        return;
      }
      // Logged in: auto-complete Supabase orders whose countdown has ended
      for (const o of sbWorkOrders) {
        if (o.status !== "in_progress") continue;
        if (!o.countdown_ends_at) continue;
        if (autoCompletedSbIds.current.has(o.id)) continue;
        if (new Date(o.countdown_ends_at).getTime() <= nowMs) {
          autoCompletedSbIds.current.add(o.id);
          sbUpdateStatus(o.id, "completed");
          broadcast("order_updated");
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [user, sbWorkOrders, sbUpdateStatus, broadcast]);

  const refresh = () => setRk((k) => k + 1);

  // When logged in with Supabase session: show ONLY Supabase data.
  // When offline / solo: show only localStorage data.
  const mergedOrders = useMemo(() => {
    // Convert Supabase orders to the local WorkOrder shape for display
    const sbConverted: WorkOrder[] = sbWorkOrders.map((o) => ({
      id: o.id,
      sessionId: o.session_id,
      type: o.order_type as any,
      status: o.status as OrderStatus,
      refinery: o.refinery_name || undefined,
      method: o.refining_method || undefined,
      ores: (o.ores || []).map((ore: any) => ({
        id: ore.id,
        name: ore.name,
        quantity: ore.quantity || 0,
        yieldQty: ore.yieldQty || 0,
        value: ore.value || 0,
        quality: ore.quality,
      })),
      totalYield: o.total_yield,
      grossValue: o.gross_value,
      expenses: [],
      totalExpenses: 0,
      motraderFee: o.motrader_fee,
      netProfit: o.net_profit,
      crew: [],
      sellPrice: o.sell_price,
      countdownSeconds: o.countdown_seconds,
      countdownEndsAt: o.countdown_ends_at || null,
      createdAt: o.created_at,
      _source: "supabase" as const,
    }));

    // If logged in: ONLY Supabase data. NEVER touch localStorage.
    if (user) return sbConverted;

    // Not logged in: show only localStorage data
    return orders.map((o) => ({ ...o, _source: "local" as const }));
  }, [user, orders, sbWorkOrders]);

  const filteredOrders = useMemo(() => {
    if (user) {
      // Logged in: filter by Supabase session only
      if (sbSessionId) return mergedOrders.filter((o) => o.sessionId === sbSessionId);
      return []; // Session not yet loaded — show nothing (not localStorage!)
    }
    // Solo: filter by local activeId
    if (activeId) return mergedOrders.filter((o) => o.sessionId === activeId);
    return mergedOrders;
  }, [user, mergedOrders, activeId, sbSessionId]);

  // Orders by status
  const inProgress = filteredOrders.filter((o) => o.status === "in_progress");
  const completed = filteredOrders.filter((o) => o.status === "completed");
  const collected = filteredOrders.filter((o) => o.status === "collected");

  const crewShares = useMemo(() => {
    if (user) {
      // Logged in: derive crew shares from Supabase members only
      return sbMembers.map((m) => ({
        name: m.display_name,
        totalPayout: 0,
        orderCount: 0,
        totalMaterialsValue: 0,
        role: m.role,
      }));
    }
    return getCrewSharesSummary(activeId || undefined);
  }, [user, activeId, rk, sbMembers]);

  const stats = useMemo(() => {
    if (user) {
      // Logged in: compute stats from Supabase orders only
      const totalOrders = filteredOrders.length;
      const totalYield = filteredOrders.reduce((s, o) => s + (o.totalYield || 0), 0);
      const totalGross = filteredOrders.reduce((s, o) => s + (o.grossValue || 0), 0);

      // Count by status
      const byStatus = {
        in_progress: filteredOrders.filter((o) => o.status === "in_progress").length,
        completed: filteredOrders.filter((o) => o.status === "completed").length,
        collected: filteredOrders.filter((o) => o.status === "collected").length,
      };

      // Count by type
      const byType: Record<string, { count: number; gross: number }> = {};
      filteredOrders.forEach((o) => {
        if (!byType[o.type]) byType[o.type] = { count: 0, gross: 0 };
        byType[o.type].count++;
        byType[o.type].gross += o.grossValue || 0;
      });

      // Top ores
      const oreMap: Record<string, { id: string; name: string; totalValue: number; totalQty: number }> = {};
      filteredOrders.forEach((o) => {
        (o.ores || []).forEach((ore) => {
          if (!oreMap[ore.id]) oreMap[ore.id] = { id: ore.id, name: ore.name, totalValue: 0, totalQty: 0 };
          oreMap[ore.id].totalValue += ore.value || 0;
          oreMap[ore.id].totalQty += ore.yieldQty || 0;
        });
      });
      const topOres = Object.values(oreMap).sort((a, b) => b.totalValue - a.totalValue).slice(0, 10);

      return {
        totalOrders,
        totalYield,
        totalGross,
        totalExpenses: 0,
        totalNet: totalGross,
        avgOrderValue: totalOrders > 0 ? totalGross / totalOrders : 0,
        byStatus,
        byType,
        topOres,
      };
    }
    return getStats(activeId || undefined);
  }, [user, activeId, rk, filteredOrders]);

  // Remaining countdown for an order
  const getRemainingSeconds = (order: WorkOrder): number => {
    if (!order.countdownEndsAt) return 0;
    return Math.max(0, Math.floor((new Date(order.countdownEndsAt).getTime() - now) / 1000));
  };

  // Inventory: Supabase-only when logged in, localStorage-only when solo
  const mergedInventory = useMemo(() => {
    if (user) {
      return sbInventory.map((i) => ({
        mineralId: i.mineral_id,
        mineralName: i.mineral_name,
        quantity: i.quantity,
        totalReceived: i.total_received,
        quality: i.quality,
        _source: "supabase" as const,
      }));
    }
    return inventory;
  }, [user, inventory, sbInventory]);

  // Movements: Supabase-only when logged in, localStorage-only when solo
  const mergedMovements = useMemo(() => {
    if (user) {
      return sbMovements.map((mv) => ({
        id: mv.id,
        mineralId: mv.mineral_id,
        mineralName: mv.mineral_name,
        delta: mv.delta,
        reason: mv.reason,
        crewMember: mv.member_name || undefined,
        createdAt: mv.created_at,
      })).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    return movements;
  }, [user, movements, sbMovements]);

  // ── Handlers ──
  // When logged in (user exists) → ALL actions go through Supabase. ZERO localStorage.
  // When not logged in → fallback to localStorage (solo mode).

  const handleCreateSession = () => {
    if (user) return; // Sessions are managed in Supabase via party system
    createSession(newSessionName || undefined);
    setNewSessionName("");
    refresh();
  };

  const handleDeleteSession = (id: string) => {
    if (user) return; // Sessions are managed in Supabase
    deleteSession(id);
    refresh();
  };

  const handleSetActive = (id: string) => {
    if (user) {
      sbSetActiveSession(id);
      return;
    }
    setActiveSessionId(id);
    setActiveId(id);
  };

  const handleDeleteOrder = (id: string) => {
    if (user) {
      sbDeleteOrder(id);
      broadcast("order_deleted");
    } else {
      deleteOrder(id);
      refresh();
    }
  };

  const handleCollect = (id: string) => {
    if (user) {
      sbUpdateStatus(id, "collected");
      broadcast("order_updated");
    } else {
      collectOrder(id);
      refresh();
    }
  };

  const handleForceComplete = (id: string) => {
    if (user) {
      sbUpdateStatus(id, "completed");
      broadcast("order_updated");
    } else {
      completeOrder(id);
      refresh();
    }
  };

  const handleClearInventory = () => {
    if (user && sbSessionId) {
      sbClearInventory(sbSessionId);
      broadcast("inventory_cleared");
    } else if (!user) {
      clearInventoryData();
      setInventory([]);
      setMovements([]);
    }
    setShowClearConfirm(false);
    refresh();
  };

  const handleResetAll = async () => {
    if (user && sbSessionId) {
      // Logged in: clear ONLY Supabase data — zero localStorage
      for (const order of sbWorkOrders) {
        await sbDeleteOrder(order.id);
      }
      await sbClearInventory(sbSessionId);
      broadcast("full_sync");
    } else if (!user) {
      // Not logged in: clear only localStorage
      clearAllData();
      setSessions([]);
      setOrders([]);
      setActiveId(null);
      setInventory([]);
      setMovements([]);
    }

    setShowResetConfirm(false);
    refresh();
  };

  const handleInvAction = () => {
    if (!invAction || invAction.qty <= 0) return;
    const { mineralId, mineralName, qty, type, member } = invAction;

    if (user && sbSessionId) {
      // Logged in: ONLY Supabase
      sbRecordInventoryAction({
        session_id: sbSessionId,
        mineral_id: mineralId,
        mineral_name: mineralName,
        quantity: -qty,
        reason: type,
        member_name: member || undefined,
      });
      broadcast("inventory_changed");
    } else if (!user) {
      // Not logged in: localStorage
      if (type === "sell") sellFromInventory(mineralId, mineralName, qty);
      else if (type === "craft") useForCrafting(mineralId, mineralName, qty);
      else if (type === "distribute") distributeToMember(mineralId, mineralName, qty, member);
    }

    setInvAction(null);
    refresh();
  };

  // Fetch best sell price for each inventory item.
  //
  // Important: the /api/mining/commodity-prices endpoint queries by
  // `commodity_abbr` (UEX 4-letter code) while the inventory is keyed by
  // `mineral_id` (scunpacked code). The two are 1:1 for most minerals but
  // diverge for a handful (e.g. BERL → BERY). We resolve the commodity code
  // via getCommodityForMineral BEFORE firing the request so prices actually
  // come back for those overrides — and we still key the result maps by
  // the original mineralId so the rest of the UI doesn't have to know.
  useEffect(() => {
    if (tab !== "inventory" || mergedInventory.length === 0 || bestPricesLoaded) return;
    const mineralIds = Array.from(new Set(mergedInventory.map((i) => i.mineralId)));
    Promise.all(
      mineralIds.map((id) => {
        const match = getCommodityForMineral(id);
        // Non-sellable (ICE, INER) or unknown → skip the roundtrip entirely.
        if (!match) return Promise.resolve({ id, list: [] as SellLocation[] });
        // Player-centric: side=sell → station buys from player → ORDER BY price DESC (best payout first)
        return fetch(`/api/mining/commodity-prices?commodity=${encodeURIComponent(match.code)}&side=sell`)
          .then((r) => r.json())
          .then((json) => ({
            id,
            list: (json.data || []) as SellLocation[],
          }))
          .catch(() => ({ id, list: [] as SellLocation[] }));
      })
    ).then((results) => {
      const topMap: Record<string, SellLocation> = {};
      const listMap: Record<string, SellLocation[]> = {};
      for (const r of results) {
        if (r.list && r.list.length > 0) {
          topMap[r.id] = r.list[0];
          listMap[r.id] = r.list;
        }
      }
      setBestPrices(topMap);
      setPriceOptionsByMineral(listMap);
      setBestPricesLoaded(true);
    });
  }, [tab, mergedInventory, bestPricesLoaded]);

  const openSellModal = useCallback((mineralId: string, mineralName: string) => {
    setSellModalItem(mineralId);
    setSellModalName(mineralName);
    setLoadingSellData(true);
    // Resolve mineralId → UEX commodity_abbr before hitting the API
    // (the endpoint queries by commodity_abbr, not scunpacked mineral_id).
    const match = getCommodityForMineral(mineralId);
    if (!match) {
      setSellLocations([]);
      setLoadingSellData(false);
      return;
    }
    // Player-centric: side=sell → station buys from player → ORDER BY price DESC (best payout first)
    fetch(`/api/mining/commodity-prices?commodity=${encodeURIComponent(match.code)}&side=sell`)
      .then((r) => r.json())
      .then((json) => {
        setSellLocations(json.data || []);
        setLoadingSellData(false);
      })
      .catch(() => {
        setSellLocations([]);
        setLoadingSellData(false);
      });
  }, []);

  /**
   * Bridge Mining Inventory → Trade Work Order.
   * Prefills the Trade Calculator with the refined stock + best sell price
   * and tags the WO with source_mining_* so completion auto-discounts inventory.
   */
  const openSellOnRoute = useCallback(
    (item: InventoryItem) => {
      const match = getCommodityForMineral(item.mineralId);
      if (!match) return; // caller already disables the button in this case
      const best = bestPrices[item.mineralId];
      const sessionId = sbSessionId || activeId || undefined;

      requestOpenFromRoute({
        commodity_code: match.code,
        commodity_name: match.name,
        scu_bought: item.quantity,
        sell_price_per_scu: best?.price,
        sell_station: best?.station,
        sell_system: best?.system,
        source_mining_session_id: sessionId,
        source_mineral_id: item.mineralId,
        source_mineral_name: item.mineralName,
        scu_available: item.quantity,
      });
      router.push("/trade");
    },
    [bestPrices, sbSessionId, activeId, requestOpenFromRoute, router]
  );

  // ── Fase B — multi-sell route handlers ─────────────────────────────────
  // Items eligible for the route: quantity > 0 AND has a known commodity map.
  const sellableInventory = useMemo(() => {
    return mergedInventory.filter((i) => {
      if (i.quantity <= 0) return false;
      return !!getCommodityForMineral(i.mineralId);
    });
  }, [mergedInventory]);

  const toggleMineralSelected = useCallback((mineralId: string) => {
    setSelectedMineralIds((prev) => {
      const next = new Set(prev);
      if (next.has(mineralId)) next.delete(mineralId);
      else next.add(mineralId);
      return next;
    });
  }, []);

  const selectAllSellable = useCallback(() => {
    setSelectedMineralIds(new Set(sellableInventory.map((i) => i.mineralId)));
  }, [sellableInventory]);

  const clearSelection = useCallback(() => {
    setSelectedMineralIds(new Set());
  }, []);

  const openRouteModal = useCallback(() => {
    const items: SellRouteInput[] = [];
    for (const mineralId of selectedMineralIds) {
      const inv = mergedInventory.find((i) => i.mineralId === mineralId);
      if (!inv) continue;
      const match = getCommodityForMineral(inv.mineralId);
      if (!match) continue;
      const best = bestPrices[inv.mineralId] || null;
      const options = priceOptionsByMineral[inv.mineralId] || [];
      items.push({
        mineralId: inv.mineralId,
        mineralName: inv.mineralName,
        commodityCode: match.code,
        commodityName: match.name,
        scuAvailable: inv.quantity,
        bestStation: best?.station || null,
        bestSystem: best?.system || null,
        bestPrice: best?.price ?? null,
        priceOptions: options
          .filter((o) => o.station && o.system && typeof o.price === "number")
          .map((o) => ({
            station: o.station as string,
            system: o.system as string,
            price: o.price as number,
          })),
      });
    }
    if (items.length === 0) return;
    setRouteModalItems(items);
    setRouteModalOpen(true);
  }, [selectedMineralIds, mergedInventory, bestPrices, priceOptionsByMineral]);

  const closeRouteModal = useCallback(() => {
    setRouteModalOpen(false);
    setRouteModalItems([]);
    setSelectedMineralIds(new Set());
  }, []);

  // Connection status indicator — 3 estados (Fase H.1)
  //   offline: sin `user`      → localStorage (solo)
  //   solo:    `user` + sesión cloud con party_id=null
  //   party:   `user` + sesión cloud con party_id≠null
  const connectionState: "offline" | "solo-cloud" | "party" =
    !user ? "offline"
    : activeSbScope === "party" ? "party"
    : "solo-cloud";
  const connLabel =
    connectionState === "party" ? t("partyConnected")
    : connectionState === "solo-cloud" ? t("soloCloudMode")
    : t("soloMode");
  const connTooltip =
    connectionState === "party" ? t("partyModeTooltip")
    : connectionState === "solo-cloud" ? t("soloCloudTooltip")
    : t("soloModeTooltip");
  const connCls =
    connectionState === "party"
      ? { wrap: "bg-emerald-500/10 border-emerald-500/30", dot: "bg-emerald-400 animate-pulse", text: "text-emerald-400" }
    : connectionState === "solo-cloud"
      ? { wrap: "bg-amber-500/10 border-amber-500/30", dot: "bg-amber-400 animate-pulse", text: "text-amber-400" }
      : { wrap: "bg-zinc-800/50 border-zinc-700/50", dot: "bg-zinc-600", text: "text-zinc-500" };

  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Tabs + Connection Status + Reset Button ── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 grid grid-cols-5 gap-0 border border-zinc-700/60 rounded-lg overflow-hidden">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`py-3 text-center text-[10px] tracking-[0.1em] uppercase font-bold transition-all
                ${tab === tb.key ? "bg-amber-500 text-zinc-900" : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"}`}
            >
              <span className="mr-1">{tb.icon}</span>{t(`tab.${tb.key}`)}
            </button>
          ))}
        </div>

        {/* Connection status indicator — offline / solo-cloud / party (Fase H.1) */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border flex-shrink-0 ${connCls.wrap}`}
          title={connTooltip}
        >
          <span className={`w-2 h-2 rounded-full ${connCls.dot}`} />
          <span className={`text-[9px] tracking-[0.15em] uppercase font-bold ${connCls.text}`}>
            {connLabel}
          </span>
        </div>

        {/* Reset All button */}
        <button
          onClick={() => setShowResetConfirm(true)}
          className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded text-[10px] font-bold text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-colors flex-shrink-0"
          title={t("resetAllTooltip")}
        >
          🗑 {t("resetAll")}
        </button>
      </div>

      {/* Active session bar — Supabase shows session name, solo shows with "Show All" */}
      {(sbSessionId || activeId) && (
        <div className="flex items-center justify-between bg-zinc-900/60 border border-amber-500/20 rounded-lg px-4 py-2">
          <div className="text-xs text-zinc-400">
            {t("session")}: <span className="text-amber-400 font-bold">
              {sbSessionId
                ? sbSessions.find((s) => s.id === sbSessionId)?.name || t("partySession")
                : sessions.find((s) => s.id === activeId)?.name || "—"}
            </span>
          </div>
          {!user && activeId && (
            <button onClick={() => { setActiveSessionId(null); setActiveId(null); }} className="text-[10px] text-zinc-600 hover:text-zinc-400">{t("showAll")}</button>
          )}
        </div>
      )}

      {/* ═══════ SESSIONS ═══════ */}
      {tab === "sessions" && (
        <div className="space-y-4">
          <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg p-4">
            <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold mb-3">{t("createNewSession")}</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateSession()}
                placeholder={t("sessionNamePlaceholder")}
                className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
              />
              <button
                onClick={handleCreateSession}
                className="px-4 py-2 bg-amber-500 text-zinc-900 rounded text-sm font-bold hover:bg-amber-400"
              >
                + {t("create")}
              </button>
            </div>
          </div>

          {/* Local Sessions — only show when NOT logged in with Supabase */}
          {!sbSessionId && (
          <div>
            <div className="text-xs tracking-[0.1em] uppercase text-zinc-500 font-bold mb-2">{t("localSessions")}</div>
            {sessions.length === 0 ? (
              <div className="text-center py-12 text-zinc-600 text-sm">{t("noLocalSessions")}</div>
            ) : (
              sessions.map((session) => {
                const oc = orders.filter((o) => o.sessionId === session.id).length;
                const tg = orders.filter((o) => o.sessionId === session.id).reduce((s, o) => s + o.grossValue, 0);
                const isA = session.id === activeId;
                return (
                  <div
                    key={session.id}
                    onClick={() => handleSetActive(session.id)}
                    className={`bg-zinc-900/70 border rounded-lg p-4 flex items-center justify-between cursor-pointer transition-all mb-2
                      ${isA ? "border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.1)]" : "border-zinc-700/60 hover:border-zinc-600"}`}
                  >
                    <div>
                      <div className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                        📋 {session.name}
                        {isA && <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded uppercase tracking-wider">{t("active")}</span>}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1">{fmtDate(session.createdAt)} · {t("ordersCount", { n: oc })} · {fmtAuec(tg)} aUEC</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                      className="text-red-500/50 hover:text-red-400 text-sm px-2"
                    >
                      🗑
                    </button>
                  </div>
                );
              })
            )}
          </div>
          )}

          {/* Cloud Sessions — Supabase. Cada una puede ser solo (party_id=null)
              o party (party_id≠null) — Fase H.1. */}
          {sbSessions.length > 0 && (
            <div>
              <div className="text-xs tracking-[0.1em] uppercase text-cyan-500 font-bold mb-2">{t("yourCloudSessions")}</div>
              {sbSessions.map((session) => {
                const oc = sbWorkOrders.filter((o) => o.session_id === session.id).length;
                const tg = sbWorkOrders.filter((o) => o.session_id === session.id).reduce((s, o) => s + o.gross_value, 0);
                const isA = session.id === sbSessionId;
                const scope: Scope = session.party_id ? "party" : "solo";
                const isParty = scope === "party";
                const borderActive = isParty ? "border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]" : "border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.1)]";
                const activeChipCls = isParty ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400";
                const icon = isParty ? "👥" : "🧍";
                return (
                  <div
                    key={session.id}
                    onClick={() => sbSetActiveSession(session.id)}
                    className={`bg-zinc-900/70 border rounded-lg p-4 flex items-center justify-between cursor-pointer transition-all mb-2
                      ${isA ? borderActive : "border-zinc-700/60 hover:border-zinc-600"}`}
                  >
                    <div>
                      <div className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                        {icon} {session.name}
                        {isA && <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider ${activeChipCls}`}>{t("active")}</span>}
                        <ScopeChip scope={scope} label={isParty ? t("party") : t("solo")} />
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1">
                        {fmtDate(session.created_at)} · {t("ordersCount", { n: oc })} · {fmtAuec(tg)} aUEC{isParty && (session as any).member_count ? ` · ${t("membersCount", { n: (session as any).member_count })}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════ WORK ORDERS ═══════ */}
      {tab === "orders" && (
        <div className="space-y-6">
          {/* Status summary — 2 columns (Collected merged into inventory hint) */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: t("status.in_progress"), count: inProgress.length, color: "text-amber-400", bg: "border-amber-500/30" },
              { label: t("status.readyToCollect"), count: completed.length, color: "text-emerald-400", bg: "border-emerald-500/30" },
            ].map((s) => (
              <div key={s.label} className={`bg-zinc-900/70 border ${s.bg} rounded-lg p-3 text-center`}>
                <div className={`text-2xl font-mono font-bold ${s.color}`}>{s.count}</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>

          {/* In Progress orders — big countdown + progress bar + color tiers */}
          {inProgress.length > 0 && (
            <div>
              <div className="text-xs tracking-[0.1em] uppercase text-amber-500 font-bold mb-2">⏳ {t("status.in_progress")}</div>
              <div className="space-y-2">
                {inProgress.map((order) => {
                  const rem = getRemainingSeconds(order);
                  const total = order.countdownSeconds > 0 ? order.countdownSeconds : Math.max(rem, 1);
                  const elapsed = Math.max(0, total - rem);
                  const pct = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
                  const isReady = rem <= 0;
                  const tier = isReady
                    ? { border: "border-emerald-500/50", barBg: "bg-emerald-500", text: "text-emerald-400", glow: "shadow-[0_0_20px_rgba(16,185,129,0.3)]" }
                    : pct >= 80
                      ? { border: "border-red-500/40", barBg: "bg-red-500", text: "text-red-400", glow: "" }
                      : pct >= 50
                        ? { border: "border-amber-500/40", barBg: "bg-amber-500", text: "text-amber-400", glow: "" }
                        : { border: "border-cyan-500/40", barBg: "bg-cyan-500", text: "text-cyan-400", glow: "" };
                  // Fase H.1: scope viene del party_id de la sesión, no del _source
                  const rowScope: Scope | null = (order as any)._source === "supabase"
                    ? sessionScope.get(order.sessionId) ?? activeSbScope
                    : null; // local/offline: no chip
                  return (
                    <div key={order.id} className={`bg-zinc-900/70 border ${tier.border} rounded-lg p-4 ${tier.glow}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{typeIcon(order.type)}</span>
                          <div>
                            <div className="text-sm text-zinc-200 font-bold flex items-center gap-2">
                              {order.refinery || typeLabel(t, order.type)}
                              <ScopeChip scope={rowScope} label={rowScope === "party" ? t("party") : t("solo")} />
                            </div>
                            <div className="text-[11px] text-zinc-500">{oreLineWithQuality(order.ores)} · {fmtAuec(order.grossValue)} aUEC</div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleForceComplete(order.id)}
                          className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-bold text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
                        >
                          {t("markReady")} →
                        </button>
                      </div>
                      <div className="flex items-baseline justify-between mb-2">
                        <div className={`font-mono text-4xl font-black tracking-wider ${tier.text}`}>{fmtCountdown(rem)}</div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                          {isReady ? t("status.readyToCollect") : t("remaining")} · {pct.toFixed(0)}%
                        </div>
                      </div>
                      <div className="h-2 bg-zinc-800/80 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${tier.barBg} transition-all duration-1000 ease-linear`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed orders — ready to collect */}
          {completed.length > 0 && (
            <div>
              <div className="text-xs tracking-[0.1em] uppercase text-emerald-500 font-bold mb-2">✓ {t("status.readyToCollect")}</div>
              <div className="space-y-2">
                {completed.map((order) => {
                  const rowScope: Scope | null = (order as any)._source === "supabase"
                    ? sessionScope.get(order.sessionId) ?? activeSbScope
                    : null;
                  return (
                    <div key={order.id} className="bg-zinc-900/70 border border-emerald-500/30 rounded-lg p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{typeIcon(order.type)}</span>
                        <div>
                          <div className="text-sm text-zinc-200 font-bold flex items-center gap-2">
                            {order.refinery || typeLabel(t, order.type)}
                            <ScopeChip scope={rowScope} label={rowScope === "party" ? t("party") : t("solo")} />
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {oreLineWithQuality(order.ores)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold text-amber-400">{fmtAuec(order.grossValue)} aUEC</span>
                        <button
                          onClick={() => handleCollect(order.id)}
                          className="px-4 py-2 bg-emerald-500 text-zinc-900 rounded font-bold text-xs hover:bg-emerald-400 transition-colors shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                        >
                          📥 {t("collect")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Collected orders — reduced to a single-line inventory hint (no redundancy) */}
          {collected.length > 0 && (
            <div className="text-[10px] text-zinc-600 text-center tracking-wider py-1">
              📦 {t("collectedHint", { n: collected.length })}
            </div>
          )}

          {filteredOrders.length === 0 && (
            <div className="text-center py-12 text-zinc-600 text-sm">{t("noWorkOrders")}</div>
          )}
        </div>
      )}

      {/* ═══════ INVENTORY ═══════ */}
      {tab === "inventory" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-zinc-300 tracking-wide font-mono">{t("materialInventory")}</div>
              <p className="text-[11px] text-zinc-500">{t("materialInventoryDesc")}</p>
            </div>
            {mergedInventory.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded text-[10px] font-bold text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-colors"
              >
                🗑 {t("clearInventory")}
              </button>
            )}
          </div>

          {mergedInventory.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 text-sm">{t("noMaterials")}</div>
          ) : (
            <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg overflow-hidden">
              {/* ── Sticky multi-select action bar (Fase B) ── */}
              {selectedMineralIds.size > 0 && (
                <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2.5 bg-cyan-500/10 border-b border-cyan-500/40 backdrop-blur-sm">
                  <span className="text-xs font-bold text-cyan-300">
                    🛣 {t("selectedCount", { n: selectedMineralIds.size })}
                  </span>
                  {!bestPricesLoaded && (
                    <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      {t("loadingPrices")}
                    </span>
                  )}
                  <div className="flex-1" />
                  <button
                    onClick={clearSelection}
                    className="px-2.5 py-1 text-[10px] font-bold text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded"
                  >
                    {t("clearSelection")}
                  </button>
                  <button
                    onClick={openRouteModal}
                    disabled={!bestPricesLoaded}
                    className={`px-3 py-1 text-[11px] font-bold rounded uppercase tracking-wider transition-colors ${
                      bestPricesLoaded
                        ? "text-zinc-900 bg-cyan-400 hover:bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                        : "text-zinc-600 bg-zinc-800 border border-zinc-700 cursor-not-allowed"
                    }`}
                  >
                    🛣 {t("buildRoute", { n: selectedMineralIds.size })}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-[auto_2fr_auto_1fr_1fr_auto_auto] gap-2 px-4 py-2 bg-zinc-800/40 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40">
                <span className="flex items-center">
                  <input
                    type="checkbox"
                    checked={
                      sellableInventory.length > 0 &&
                      sellableInventory.every((i) => selectedMineralIds.has(i.mineralId))
                    }
                    onChange={(e) => {
                      if (e.target.checked) selectAllSellable();
                      else clearSelection();
                    }}
                    disabled={sellableInventory.length === 0}
                    className="accent-cyan-400 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    title={t("selectAllSellable")}
                  />
                </span>
                <span>{t("col.material")}</span>
                <span className="text-center">{t("col.quality")}</span>
                <span className="text-right">{t("col.available")}</span>
                <span className="text-right">{t("col.totalReceived")}</span>
                <span className="text-right">{t("col.bestPrice")}</span>
                <span>{t("col.actions")}</span>
              </div>
              {mergedInventory.filter((i) => i.quantity > 0 || i.totalReceived > 0).map((item) => {
                const q = (item as any).quality as number | undefined;
                const bestPrice = bestPrices[item.mineralId];
                // Fase H.1: el scope del item = scope de la sesión activa (sbInventory
                // solo trae la activa). En offline no hay scope → no chip.
                const itemScope: Scope | null = (item as any)._source === "supabase"
                  ? activeSbScope
                  : null;
                const commodityMatch = getCommodityForMineral(item.mineralId);
                const canSelect = item.quantity > 0 && !!commodityMatch;
                const isSelected = selectedMineralIds.has(item.mineralId);
                return (
                  <div
                    key={item.mineralId}
                    className={`grid grid-cols-[auto_2fr_auto_1fr_1fr_auto_auto] gap-2 px-4 py-3 border-b border-zinc-800/30 items-center ${
                      isSelected ? "bg-cyan-500/5" : ""
                    }`}
                  >
                    <span className="flex items-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleMineralSelected(item.mineralId)}
                        disabled={!canSelect}
                        className="accent-cyan-400 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                        title={!canSelect ? t("noCommodityMatch") : undefined}
                      />
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-zinc-200 uppercase">{item.mineralName}</span>
                      <ScopeChip scope={itemScope} label={itemScope === "party" ? t("party") : t("solo")} />
                    </div>
                    <span className="text-center min-w-[60px]">{qualityBadge(q) || <span className="text-xs text-zinc-600">—</span>}</span>
                    <span className={`text-sm font-mono text-right font-bold ${item.quantity > 0 ? "text-emerald-400" : "text-zinc-600"}`}>
                      {item.quantity.toFixed(1)}
                    </span>
                    <span className="text-xs font-mono text-zinc-500 text-right">{item.totalReceived.toFixed(1)}</span>
                    <span className={`text-xs font-mono text-right ${bestPrice ? "text-amber-400 font-bold" : "text-zinc-600"}`}>
                      {bestPrice ? `${bestPrice.price.toLocaleString()} aUEC` : "—"}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openSellModal(item.mineralId, item.mineralName)}
                        className="px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-[9px] font-bold text-amber-400 hover:bg-amber-500/20"
                      >
                        {t("sell")}
                      </button>
                      {(() => {
                        const match = getCommodityForMineral(item.mineralId);
                        const disabled = !match || item.quantity <= 0;
                        return (
                          <button
                            onClick={() => openSellOnRoute(item)}
                            disabled={disabled}
                            title={!match ? t("noCommodityMatch") : undefined}
                            className={`px-2 py-1 rounded text-[9px] font-bold transition-colors border ${
                              disabled
                                ? "bg-zinc-800/60 border-zinc-700/40 text-zinc-600 cursor-not-allowed"
                                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                            }`}
                          >
                            🛣 {t("sellOnRoute")}
                          </button>
                        );
                      })()}
                      <button
                        onClick={() => setInvAction({ mineralId: item.mineralId, mineralName: item.mineralName, type: "craft", qty: 0, member: "" })}
                        className="px-2 py-1 bg-blue-500/10 border border-blue-500/30 rounded text-[9px] font-bold text-blue-400 hover:bg-blue-500/20"
                      >
                        {t("craft")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent movements */}
          {mergedMovements.length > 0 && (
            <div>
              <div className="text-xs tracking-[0.1em] uppercase text-zinc-500 font-bold mb-2">{t("recentMovements")}</div>
              <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                {mergedMovements.slice(0, 30).map((mv) => {
                  // Fase H.1: mergedMovements (logged-in) solo contiene la sesión
                  // activa → usar activeSbScope. Offline = sin chip.
                  const mvScope: Scope | null = user ? activeSbScope : null;
                  return (
                    <div key={mv.id} className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/30 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold ${mv.delta > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {mv.delta > 0 ? "+" : ""}{mv.delta.toFixed(1)}
                        </span>
                        <span className="text-zinc-300 uppercase">{mv.mineralName}</span>
                        <ScopeChip scope={mvScope} label={mvScope === "party" ? t("party") : t("solo")} />
                        <span className="text-zinc-600">— {mvReasonLabel(t, mv.reason)}</span>
                        {mv.crewMember && <span className="text-zinc-500">→ {mv.crewMember}</span>}
                      </div>
                      <span className="text-[10px] text-zinc-600">{fmtDate(mv.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ CREW SHARES ═══════ */}
      {tab === "crew" && (
        <div className="space-y-4">
          <div className="text-lg font-bold text-zinc-300 tracking-wide font-mono">{t("crewShareSummary")}</div>

          {/* Supabase members (party session) */}
          {sbMembers.length > 0 && (
            <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg overflow-hidden mb-4">
              <div className="px-4 py-2 bg-zinc-800/40 text-[10px] tracking-[0.15em] uppercase text-emerald-500 font-bold border-b border-zinc-700/40">
                {t("partyMembers")}
              </div>
              <div className="grid grid-cols-[2fr_1fr_1fr] gap-2 px-4 py-2 bg-zinc-800/20 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40">
                <span>{t("col.member")}</span><span className="text-right">{t("col.role")}</span><span className="text-right">{t("col.sharePct")}</span>
              </div>
              {sbMembers.map((m, i) => (
                <div key={m.id} className="grid grid-cols-[2fr_1fr_1fr] gap-2 px-4 py-3 border-b border-zinc-800/30 items-center">
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${i === 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-500"}`}>{i + 1}</span>
                    <span className="text-sm font-bold text-zinc-200">👤 {m.display_name}</span>
                  </div>
                  <span className="text-xs text-zinc-400 text-right capitalize">{m.role}</span>
                  <span className="text-sm font-mono font-bold text-emerald-400 text-right">{m.share_pct}%</span>
                </div>
              ))}
            </div>
          )}

          {/* Local crew shares summary */}
          {crewShares.length === 0 && sbMembers.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 text-sm">{t("noCrewData")}</div>
          ) : crewShares.length > 0 ? (
            <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-zinc-800/40 text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold border-b border-zinc-700/40">
                {t("payoutHistory")}
              </div>
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 bg-zinc-800/20 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40">
                <span>{t("col.member")}</span><span className="text-right">{t("col.orders")}</span><span className="text-right">{t("col.auecPayout")}</span><span className="text-right">{t("col.materialsValue")}</span><span className="text-right">{t("col.avgOrder")}</span>
              </div>
              {crewShares.map((m, i) => (
                <div key={m.name} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-3 border-b border-zinc-800/30 items-center">
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${i === 0 ? "bg-amber-500/20 text-amber-400" : "bg-zinc-800 text-zinc-500"}`}>{i + 1}</span>
                    <span className="text-sm font-bold text-zinc-200">👤 {m.name}</span>
                  </div>
                  <span className="text-xs font-mono text-zinc-400 text-right">{m.orderCount}</span>
                  <span className="text-sm font-mono font-bold text-amber-400 text-right">{fmtAuec(m.totalPayout)}</span>
                  <span className="text-xs font-mono text-emerald-400 text-right">{fmtAuec(m.totalMaterialsValue)}</span>
                  <span className="text-xs font-mono text-zinc-500 text-right">{fmtAuec(m.orderCount > 0 ? Math.round(m.totalPayout / m.orderCount) : 0)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* ═══════ STATS ═══════ */}
      {tab === "stats" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { l: t("stat.totalOrders"), v: stats.totalOrders.toString(), c: "text-zinc-100" },
              { l: t("stat.totalGross"), v: fmtAuec(stats.totalGross), c: "text-amber-400" },
              { l: t("stat.totalNet"), v: fmtAuec(stats.totalNet), c: "text-emerald-400" },
              { l: t("stat.expenses"), v: fmtAuec(stats.totalExpenses), c: "text-red-400" },
              { l: t("stat.totalYield"), v: `${Math.round(stats.totalYield)} su`, c: "text-blue-400" },
              { l: t("stat.avgOrder"), v: fmtAuec(stats.avgOrderValue), c: "text-zinc-300" },
            ].map((c) => (
              <div key={c.l} className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg p-3">
                <div className="text-[9px] tracking-[0.15em] uppercase text-zinc-500 font-bold mb-1">{c.l}</div>
                <div className={`text-lg font-mono font-bold ${c.c}`}>{c.v}</div>
              </div>
            ))}
          </div>

          {/* By status */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-900/70 border border-amber-500/20 rounded-lg p-3 text-center">
              <div className="text-lg font-mono font-bold text-amber-400">{stats.byStatus.in_progress}</div>
              <div className="text-[9px] text-zinc-500 uppercase">{t("status.in_progress")}</div>
            </div>
            <div className="bg-zinc-900/70 border border-emerald-500/20 rounded-lg p-3 text-center">
              <div className="text-lg font-mono font-bold text-emerald-400">{stats.byStatus.completed}</div>
              <div className="text-[9px] text-zinc-500 uppercase">{t("ready")}</div>
            </div>
            <div className="bg-zinc-900/70 border border-blue-500/20 rounded-lg p-3 text-center">
              <div className="text-lg font-mono font-bold text-blue-400">{stats.byStatus.collected}</div>
              <div className="text-[9px] text-zinc-500 uppercase">{t("status.collected")}</div>
            </div>
          </div>

          {/* By type + top ores */}
          {Object.keys(stats.byType).length > 0 && (
            <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg p-4">
              <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold mb-3">{t("byActivityType")}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(stats.byType).map(([typ, d]) => (
                  <div key={typ} className="bg-zinc-800/40 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{typeIcon(typ)}</span>
                      <span className="text-xs font-bold text-zinc-300 uppercase">{typeLabel(t, typ)}</span>
                    </div>
                    <div className="text-lg font-mono font-bold text-amber-400">{d.count}</div>
                    <div className="text-[11px] text-zinc-500">{fmtAuec(d.gross)} aUEC</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.topOres.length > 0 && (
            <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg p-4">
              <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold mb-3">{t("topOres")}</div>
              <div className="space-y-2">
                {stats.topOres.map((ore, i) => {
                  const mx = stats.topOres[0]?.totalValue || 1;
                  return (
                    <div key={ore.id} className="flex items-center gap-3">
                      <span className="text-xs text-zinc-500 w-5 text-right">{i + 1}</span>
                      <span className="text-xs font-bold text-zinc-300 w-28 uppercase">{ore.name}</span>
                      <div className="flex-1 h-3 bg-zinc-800/40 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500/60 rounded-full" style={{ width: `${(ore.totalValue / mx) * 100}%` }} />
                      </div>
                      <span className="text-xs font-mono text-amber-400 w-20 text-right font-bold">{fmtAuec(ore.totalValue)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {stats.totalOrders === 0 && <div className="text-center py-12 text-zinc-600 text-sm">{t("noStats")}</div>}
        </div>
      )}

      {/* ═══════ INVENTORY ACTION MODAL ═══════ */}
      {invAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border-2 border-amber-500 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-zinc-100 mb-1 capitalize">{invAction.type} {invAction.mineralName}</h3>
            <p className="text-[11px] text-zinc-500 mb-4">
              {t("available")}: {inventory.find((i) => i.mineralId === invAction.mineralId)?.quantity.toFixed(1) || 0}
            </p>
            <input
              type="number"
              min="0"
              value={invAction.qty || ""}
              onChange={(e) => setInvAction({ ...invAction, qty: parseFloat(e.target.value) || 0 })}
              placeholder={t("quantity")}
              className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-100 mb-3 focus:outline-none focus:border-amber-500"
            />
            {invAction.type === "distribute" && (
              <input
                type="text"
                value={invAction.member}
                onChange={(e) => setInvAction({ ...invAction, member: e.target.value })}
                placeholder={t("crewMemberName")}
                className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 mb-3 focus:outline-none focus:border-amber-500"
              />
            )}
            <div className="flex gap-2">
              <button onClick={() => setInvAction(null)} className="flex-1 py-2 bg-zinc-800 text-zinc-300 rounded font-bold text-sm">{t("cancel")}</button>
              <button onClick={handleInvAction} className="flex-1 py-2 bg-amber-500 text-zinc-900 rounded font-bold text-sm hover:bg-amber-400">{t("confirm")}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ CLEAR INVENTORY CONFIRM ═══════ */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border-2 border-red-500 rounded-xl p-6 w-full max-w-sm shadow-[0_0_30px_rgba(239,68,68,0.2)]">
            <h3 className="text-lg font-bold text-zinc-100 mb-2">{t("clearInventoryTitle")}</h3>
            <p className="text-sm text-zinc-400 mb-4">
              {t("clearInventoryBody")}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 bg-zinc-800 text-zinc-300 rounded-lg font-bold text-sm hover:bg-zinc-700 transition-colors"
              >
                {t("cancel")}
              </button>
              <button
                onClick={handleClearInventory}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-lg font-bold text-sm hover:bg-red-400 transition-colors"
              >
                {t("clearAllButton")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ RESET ALL CONFIRM ═══════ */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border-2 border-red-500 rounded-xl p-6 w-full max-w-sm shadow-[0_0_30px_rgba(239,68,68,0.3)]">
            <h3 className="text-lg font-bold text-zinc-100 mb-2">{t("resetAllTitle")}</h3>
            <p className="text-sm text-zinc-400 mb-4">
              {t("resetAllBody")}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 bg-zinc-800 text-zinc-300 rounded-lg font-bold text-sm hover:bg-zinc-700 transition-colors"
              >
                {t("cancel")}
              </button>
              <button
                onClick={handleResetAll}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-500 transition-colors"
              >
                {t("resetEverything")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ DISTRIBUTION MODAL ═══════ */}
      {distOrderId && (() => {
        // In Supabase mode: compute distribution from the Supabase order + members
        // In solo mode: use localStorage calculateDistribution
        let dist: { memberName: string; share: number; minerals: { mineralId: string; mineralName: string; qty: number; value: number }[] }[] = [];
        if (user) {
          // Logged in: compute from Supabase data only
          const order = filteredOrders.find((o) => o.id === distOrderId);
          if (order && sbMembers.length > 0) {
            const totalShares = sbMembers.reduce((s, m) => s + (parseFloat(m.role) || 1), 0);
            dist = sbMembers.map((m) => {
              const memberShare = parseFloat(m.role) || 1;
              const sharePct = memberShare / totalShares;
              return {
                memberName: m.display_name,
                share: memberShare,
                minerals: order.ores.map((ore) => ({
                  mineralId: ore.id,
                  mineralName: ore.name,
                  qty: ore.yieldQty * sharePct,
                  value: ore.value * sharePct,
                })),
              };
            });
          }
        } else {
          // Not logged in: use localStorage
          dist = calculateDistribution(distOrderId);
        }
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-zinc-900 border-2 border-amber-500 rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-bold text-zinc-100 mb-1">{t("materialDistribution")}</h3>
              <p className="text-[11px] text-zinc-500 mb-4">{t("distributionFor", { id: distOrderId.slice(3, 14) })}</p>
              {dist.map((member) => (
                <div key={member.memberName} className="mb-4 bg-zinc-800/40 rounded-lg p-3">
                  <div className="text-sm font-bold text-amber-400 mb-2">👤 {member.memberName} <span className="text-zinc-500 font-normal">({t("sharesCount", { n: member.share })})</span></div>
                  <div className="space-y-1">
                    {member.minerals.filter((m) => m.qty > 0).map((m) => (
                      <div key={m.mineralId} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300 uppercase">{m.mineralName}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-zinc-400">{t("unitsCount", { n: m.qty.toFixed(1) })}</span>
                          <span className="font-mono text-amber-400">{fmtAuec(m.value)} aUEC</span>
                          <button
                            onClick={() => {
                              if (user) {
                                if (sbSessionId) {
                                  sbRecordInventoryAction({
                                    session_id: sbSessionId,
                                    mineral_id: m.mineralId,
                                    mineral_name: m.mineralName,
                                    quantity: -m.qty,
                                    reason: "distribute",
                                    member_name: member.memberName,
                                  });
                                  broadcast("inventory_changed");
                                }
                              } else {
                                distributeToMember(m.mineralId, m.mineralName, m.qty, member.memberName);
                              }
                              refresh();
                            }}
                            className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-[9px] font-bold text-emerald-400 hover:bg-emerald-500/20"
                          >
                            {t("give")}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={() => setDistOrderId(null)} className="w-full py-2 bg-zinc-800 text-zinc-300 rounded font-bold text-sm mt-2">{t("close")}</button>
            </div>
          </div>
        );
      })()}

      {/* ═══════ SELL LOCATION MODAL ═══════ */}
      {sellModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border-2 border-amber-500 rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-hidden shadow-[0_0_30px_rgba(245,158,11,0.2)] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-zinc-100">
                {t("sellLocations")} — <span className="text-amber-400">{sellModalName}</span>
              </h3>
              <button onClick={() => setSellModalItem(null)} className="text-zinc-500 hover:text-zinc-300 text-xl">✕</button>
            </div>
            <p className="text-[11px] text-zinc-500 mb-3">{t("sellLocationsHint")}</p>
            <div className="flex-1 overflow-y-auto space-y-0">
              <div className="grid grid-cols-[1fr_0.7fr_auto] gap-2 px-3 py-1.5 bg-zinc-800/40 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40 sticky top-0">
                <span>{t("col.station")}</span><span>{t("col.system")}</span><span className="text-right">{t("col.priceUnit")}</span>
              </div>
              {loadingSellData ? (
                <div className="text-center py-8 text-zinc-500 text-sm">{t("loadingPrices")}</div>
              ) : sellLocations.length === 0 ? (
                <div className="text-center py-8 text-zinc-600 text-sm italic">{t("noSellLocations")}</div>
              ) : (
                sellLocations.map((loc, i) => {
                  const invItem = mergedInventory.find((it) => it.mineralId === sellModalItem);
                  const totalValue = invItem ? loc.price * invItem.quantity : 0;
                  return (
                    <div key={`${loc.station}-${i}`} className={`grid grid-cols-[1fr_0.7fr_auto] gap-2 px-3 py-2.5 border-b border-zinc-800/30 items-center ${i === 0 ? "bg-amber-500/5 border-l-2 border-l-amber-500" : i < 3 ? "bg-emerald-500/5" : ""}`}>
                      <div>
                        <span className="text-xs font-bold text-zinc-200">{loc.station}</span>
                        {i === 0 && <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded font-bold uppercase">{t("best")}</span>}
                      </div>
                      <span className="text-[11px] text-zinc-400">{loc.system}</span>
                      <div className="text-right">
                        <span className={`text-sm font-mono font-bold ${i === 0 ? "text-amber-400" : i < 3 ? "text-emerald-400" : "text-zinc-300"}`}>{loc.price.toLocaleString()}</span>
                        {totalValue > 0 && <div className="text-[9px] text-zinc-600">{t("total")}: {fmtAuec(totalValue)} aUEC</div>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-zinc-700">
              <button onClick={() => setSellModalItem(null)} className="w-full py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm font-bold hover:bg-zinc-700 transition-colors">{t("close")}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Sell Route Preview Modal (Fase B — multi-sell) ═══ */}
      {/* sourceSessionPartyId propagates the mining session's scope down to
          the batch-create logic so a SOLO mining session always produces a
          SOLO sell route — even if the user also belongs to a party. Local
          (localStorage) sessions are always solo. */}
      <SellRoutePreviewModal
        open={routeModalOpen}
        sessionId={sbSessionId || activeId || null}
        sourceSessionPartyId={
          sbSessionId
            ? (sbSessions.find((s) => s.id === sbSessionId)?.party_id ?? null)
            : null
        }
        items={routeModalItems}
        onClose={closeRouteModal}
      />
    </div>
  );
}
