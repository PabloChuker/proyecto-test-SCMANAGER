"use client";

// =============================================================================
// SC LABS — Party Mining Dashboard
//
// Unified view combining Session Manager, Crew Panel, and integrated
// work order / inventory views powered by Supabase.
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { useMiningStore } from "@/store/useMiningStore";
import { useMiningRealtime, useMiningBroadcast } from "@/store/useMiningRealtime";
import SessionManager from "./SessionManager";
import CrewPanel from "./CrewPanel";

type SubTab = "sessions" | "crew" | "orders" | "inventory";

const SUB_TABS: { key: SubTab; label: string; icon: string }[] = [
  { key: "sessions", label: "Sessions", icon: "📋" },
  { key: "crew", label: "Crew", icon: "👥" },
  { key: "orders", label: "Orders", icon: "⛏" },
  { key: "inventory", label: "Inventory", icon: "📦" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtAuec(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(s: string) {
  switch (s) {
    case "in_progress":
      return { label: "In Progress", color: "bg-amber-500/20 text-amber-400 border-amber-500/40" };
    case "completed":
      return { label: "Ready", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" };
    case "collected":
      return { label: "Collected", color: "bg-blue-500/20 text-blue-400 border-blue-500/40" };
    default:
      return { label: s, color: "bg-zinc-700/30 text-zinc-400 border-zinc-600/40" };
  }
}

// ═════════════════════════════════════════════════════════════════════════════

// ─── Sell location modal types ─────────────────────────────────────────────

interface SellLocation {
  station: string;
  system: string;
  price: number;
}

export default function PartyMiningDashboard() {
  const [subTab, setSubTab] = useState<SubTab>("sessions");
  const {
    activeSessionId,
    workOrders,
    inventory,
    movements,
    members,
    sessions,
    updateOrderStatus,
    deleteWorkOrder,
    recordInventoryAction,
    clearInventory,
    fetchSessions,
    setActiveSession,
  } = useMiningStore();

  // ── Clear inventory confirmation ──
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // ── Realtime: party members see changes in real time ──
  useMiningRealtime();
  const broadcast = useMiningBroadcast();

  // ── Auto-detect & load Supabase session for logged-in users ──
  useEffect(() => {
    if (activeSessionId) return;
    fetchSessions().then(() => {
      const allSessions = useMiningStore.getState().sessions;
      const active = allSessions.find((s) => s.status === "active") || allSessions[0];
      if (active) setActiveSession(active.id);
    });
  }, [activeSessionId, fetchSessions, setActiveSession]);

  // ── Sell price modal state ──
  const [sellModalItem, setSellModalItem] = useState<string | null>(null); // mineral_id (abbr)
  const [sellModalName, setSellModalName] = useState("");
  const [sellLocations, setSellLocations] = useState<SellLocation[]>([]);
  const [loadingSellData, setLoadingSellData] = useState(false);

  // ── Best prices cache (fetched once per inventory view) ──
  const [bestPrices, setBestPrices] = useState<Record<string, SellLocation>>({});
  const [bestPricesLoaded, setBestPricesLoaded] = useState(false);

  // Fetch best sell price for each inventory item
  useEffect(() => {
    if (subTab !== "inventory" || !activeSessionId || inventory.length === 0 || bestPricesLoaded) return;
    const mineralIds: string[] = Array.from(new Set(inventory.map((i) => i.mineral_id)));

    Promise.all(
      mineralIds.map((abbr: string) =>
        fetch(`/api/mining/commodity-prices?commodity=${abbr}&side=sell`)
          .then((r) => r.json())
          .then((json) => ({ abbr, top: json.data?.[0] || null } as { abbr: string; top: SellLocation | null }))
          .catch(() => ({ abbr, top: null } as { abbr: string; top: SellLocation | null }))
      )
    ).then((results) => {
      const map: Record<string, SellLocation> = {};
      for (const r of results) {
        if (r.top) map[r.abbr] = r.top;
      }
      setBestPrices(map);
      setBestPricesLoaded(true);
    });
  }, [subTab, activeSessionId, inventory, bestPricesLoaded]);

  // Reset cache when session changes
  useEffect(() => {
    setBestPricesLoaded(false);
    setBestPrices({});
  }, [activeSessionId]);

  // Fetch full sell locations when modal opens
  const openSellModal = useCallback((mineralAbbr: string, mineralName: string) => {
    setSellModalItem(mineralAbbr);
    setSellModalName(mineralName);
    setLoadingSellData(true);
    fetch(`/api/mining/commodity-prices?commodity=${mineralAbbr}&side=sell`)
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

  // ── Inventory location editing ──
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editLocationValue, setEditLocationValue] = useState("");

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Sub-tabs + live indicator */}
      <div className="flex items-center gap-3">
        <div className="flex-1 grid grid-cols-4 gap-0 border border-zinc-700/60 rounded-lg overflow-hidden">
          {SUB_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`py-3 text-center text-[10px] tracking-[0.1em] uppercase font-bold transition-all ${
                subTab === t.key
                  ? "bg-amber-500 text-zinc-900"
                  : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
              }`}
            >
              <span className="mr-1">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
        {activeSessionId && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30" title="Realtime sync active — all party members see changes live">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] tracking-[0.15em] uppercase text-emerald-400 font-bold">LIVE</span>
          </div>
        )}
      </div>

      {/* ═══════ SESSIONS ═══════ */}
      {subTab === "sessions" && <SessionManager />}

      {/* ═══════ CREW ═══════ */}
      {subTab === "crew" && <CrewPanel />}

      {/* ═══════ ORDERS ═══════ */}
      {subTab === "orders" && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-zinc-200 tracking-wide font-mono">
            Work Orders
          </h2>

          {!activeSessionId ? (
            <div className="text-center py-12 text-zinc-600 text-sm">
              Select a session first to view its work orders.
            </div>
          ) : workOrders.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 text-sm">
              No work orders in this session yet.
            </div>
          ) : (
            <div className="space-y-2">
              {workOrders.map((order) => {
                const badge = statusBadge(order.status);
                return (
                  <div
                    key={order.id}
                    className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                          {order.refinery_name || order.order_type.toUpperCase()}
                          <span
                            className={`text-[9px] px-1.5 py-0.5 border rounded uppercase tracking-wider ${badge.color}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-1">
                          {fmtDate(order.created_at)} ·{" "}
                          {order.ores.map((o) => o.name).join(", ") || "—"} ·{" "}
                          <span className="text-amber-400">{fmtAuec(order.gross_value)} aUEC</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {order.status === "in_progress" && (
                          <button
                            onClick={() => { updateOrderStatus(order.id, "completed"); broadcast("order_updated"); }}
                            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-bold text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30"
                          >
                            Mark Ready
                          </button>
                        )}
                        {order.status === "completed" && (
                          <button
                            onClick={() => { updateOrderStatus(order.id, "collected"); broadcast("order_updated"); }}
                            className="px-4 py-2 bg-emerald-500 text-zinc-900 rounded font-bold text-xs hover:bg-emerald-400 transition-colors"
                          >
                            Collect
                          </button>
                        )}
                        <button
                          onClick={() => { deleteWorkOrder(order.id); broadcast("order_deleted"); }}
                          className="text-red-500/40 hover:text-red-400 text-xs"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════ INVENTORY ═══════ */}
      {subTab === "inventory" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-zinc-200 tracking-wide font-mono">
              Inventory
            </h2>
            {activeSessionId && inventory.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded text-[10px] font-bold text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-colors"
              >
                🗑 Clear Inventory
              </button>
            )}
          </div>

          {!activeSessionId ? (
            <div className="text-center py-12 text-zinc-600 text-sm">
              Select a session first to view its inventory.
            </div>
          ) : inventory.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 text-sm">
              No materials in inventory. Collect completed work orders.
            </div>
          ) : (
            <>
              <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg overflow-hidden">
                <div className="grid grid-cols-[2fr_0.7fr_0.7fr_1fr_1fr_auto] gap-2 px-4 py-2 bg-zinc-800/40 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40">
                  <span>Material</span>
                  <span className="text-right">Quality</span>
                  <span className="text-right">Available</span>
                  <span>Location</span>
                  <span className="text-right">Best Sell Price</span>
                  <span>Actions</span>
                </div>
                {inventory
                  .filter((i) => i.quantity > 0 || i.total_received > 0)
                  .map((item) => {
                    const bestPrice = bestPrices[item.mineral_id] || null;
                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-[2fr_0.7fr_0.7fr_1fr_1fr_auto] gap-2 px-4 py-3 border-b border-zinc-800/30 items-center"
                      >
                        {/* Material name */}
                        <div>
                          <span className="text-sm font-bold text-zinc-200 uppercase">
                            {item.mineral_name}
                          </span>
                          <span className="text-[10px] text-zinc-600 ml-2">
                            (recv: {item.total_received.toFixed(1)})
                          </span>
                        </div>

                        {/* Quality */}
                        <span className="text-xs font-mono text-right">
                          {item.quality != null && item.quality > 0 ? (
                            <span className={`font-bold ${
                              item.quality >= 800 ? "text-amber-400" :
                              item.quality >= 500 ? "text-emerald-400" :
                              item.quality >= 200 ? "text-cyan-400" : "text-zinc-400"
                            }`}>
                              {item.quality}
                            </span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </span>

                        {/* Available qty */}
                        <span
                          className={`text-sm font-mono text-right font-bold ${
                            item.quantity > 0 ? "text-emerald-400" : "text-zinc-600"
                          }`}
                        >
                          {item.quantity.toFixed(1)}
                        </span>

                        {/* Location */}
                        <div>
                          {editingLocationId === item.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editLocationValue}
                                onChange={(e) => setEditLocationValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    // TODO: save location to Supabase
                                    setEditingLocationId(null);
                                  }
                                }}
                                className="w-full bg-zinc-800/70 border border-amber-500/40 rounded px-2 py-0.5 text-[11px] text-zinc-200 focus:outline-none"
                                placeholder="Station name..."
                                autoFocus
                              />
                              <button
                                onClick={() => setEditingLocationId(null)}
                                className="text-zinc-500 text-[10px]"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingLocationId(item.id);
                                setEditLocationValue(item.location || "");
                              }}
                              className="text-[11px] text-left w-full hover:text-amber-400 transition-colors"
                            >
                              {item.location ? (
                                <span className="text-cyan-400">
                                  {item.location}
                                  {item.location_system && (
                                    <span className="text-zinc-600 ml-1">({item.location_system})</span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-zinc-600 italic">Set location...</span>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Best sell price */}
                        <div className="text-right">
                          {bestPrice ? (
                            <button
                              onClick={() => openSellModal(item.mineral_id, item.mineral_name)}
                              className="text-right hover:brightness-110 transition-all group"
                            >
                              <span className="text-sm font-mono font-bold text-amber-400">
                                {fmtAuec(bestPrice.price)}
                              </span>
                              <span className="text-[10px] text-zinc-500 ml-1">aUEC/SCU</span>
                              <div className="text-[9px] text-zinc-500 group-hover:text-amber-400/70">
                                @ {bestPrice.station}
                              </div>
                            </button>
                          ) : (
                            <span className="text-[11px] text-zinc-600 italic">No data</span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1 flex-wrap">
                          <button
                            onClick={() => openSellModal(item.mineral_id, item.mineral_name)}
                            className="px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-[8px] font-bold text-amber-400 hover:bg-amber-500/20"
                            title="View sell locations"
                          >
                            Sell
                          </button>
                          {members.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => {
                                recordInventoryAction({
                                  session_id: activeSessionId!,
                                  mineral_id: item.mineral_id,
                                  mineral_name: item.mineral_name,
                                  quantity: item.quantity * (m.share_pct / 100),
                                  reason: "distribute",
                                  member_id: m.id,
                                  member_name: m.display_name,
                                });
                                broadcast("inventory_changed");
                              }}
                              className="px-2 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded text-[8px] font-bold text-cyan-400 hover:bg-cyan-500/20 truncate max-w-[60px]"
                              title={`Give ${(item.quantity * (m.share_pct / 100)).toFixed(1)} to ${m.display_name} (${m.share_pct}%)`}
                            >
                              {m.display_name.split(" ")[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Recent movements */}
              {movements.length > 0 && (
                <div>
                  <div className="text-xs tracking-[0.1em] uppercase text-zinc-500 font-bold mb-2">
                    Recent Movements
                  </div>
                  <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    {movements.slice(0, 20).map((mv) => (
                      <div
                        key={mv.id}
                        className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/30 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono font-bold ${
                              mv.delta > 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {mv.delta > 0 ? "+" : ""}
                            {mv.delta.toFixed(1)}
                          </span>
                          <span className="text-zinc-300 uppercase">{mv.mineral_name}</span>
                          <span className="text-zinc-600">— {mv.reason}</span>
                          {mv.member_name && (
                            <span className="text-cyan-500">→ {mv.member_name}</span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-600">
                          {fmtDate(mv.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════ CLEAR INVENTORY CONFIRM ═══════ */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border-2 border-red-500 rounded-xl p-6 w-full max-w-sm shadow-[0_0_30px_rgba(239,68,68,0.2)]">
            <h3 className="text-lg font-bold text-zinc-100 mb-2">Clear Inventory?</h3>
            <p className="text-sm text-zinc-400 mb-4">
              This will permanently delete all inventory items and movement history for the current session. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 bg-zinc-800 text-zinc-300 rounded-lg font-bold text-sm hover:bg-zinc-700 transition-colors">
                Cancel
              </button>
              <button onClick={() => {
                if (activeSessionId) { clearInventory(activeSessionId); broadcast("inventory_cleared"); }
                setShowClearConfirm(false);
              }}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-lg font-bold text-sm hover:bg-red-400 transition-colors">
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ SELL LOCATION MODAL ═══════ */}
      {sellModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border-2 border-amber-500 rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-hidden shadow-[0_0_30px_rgba(245,158,11,0.2)] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-zinc-100">
                Sell Locations — <span className="text-amber-400">{sellModalName}</span>
              </h3>
              <button
                onClick={() => setSellModalItem(null)}
                className="text-zinc-500 hover:text-zinc-300 text-xl"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-zinc-500 mb-3">
              Sorted by highest buy price (best for you to sell). Prices are per SCU.
            </p>

            <div className="flex-1 overflow-y-auto space-y-0">
              {/* Header */}
              <div className="grid grid-cols-[1fr_0.7fr_auto] gap-2 px-3 py-1.5 bg-zinc-800/40 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40 sticky top-0">
                <span>Station</span>
                <span>System</span>
                <span className="text-right">Price (aUEC/SCU)</span>
              </div>

              {loadingSellData ? (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  Loading prices...
                </div>
              ) : sellLocations.length === 0 ? (
                <div className="text-center py-8 text-zinc-600 text-sm italic">
                  No sell locations found for this commodity.
                </div>
              ) : (
                sellLocations.map((loc, i) => {
                  // Calculate total value for inventory quantity
                  const invItem = inventory.find((it) => it.mineral_id === sellModalItem);
                  const totalValue = invItem ? loc.price * invItem.quantity : 0;
                  return (
                    <div
                      key={`${loc.station}-${i}`}
                      className={`grid grid-cols-[1fr_0.7fr_auto] gap-2 px-3 py-2.5 border-b border-zinc-800/30 items-center ${
                        i === 0
                          ? "bg-amber-500/5 border-l-2 border-l-amber-500"
                          : i < 3
                          ? "bg-emerald-500/5"
                          : ""
                      }`}
                    >
                      <div>
                        <span className="text-xs font-bold text-zinc-200">{loc.station}</span>
                        {i === 0 && (
                          <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded font-bold uppercase">
                            Best
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-400">{loc.system}</span>
                      <div className="text-right">
                        <span className={`text-sm font-mono font-bold ${
                          i === 0 ? "text-amber-400" : i < 3 ? "text-emerald-400" : "text-zinc-300"
                        }`}>
                          {loc.price.toLocaleString()}
                        </span>
                        {totalValue > 0 && (
                          <div className="text-[9px] text-zinc-600">
                            Total: {fmtAuec(totalValue)} aUEC
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-700">
              <button
                onClick={() => setSellModalItem(null)}
                className="w-full py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm font-bold hover:bg-zinc-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
