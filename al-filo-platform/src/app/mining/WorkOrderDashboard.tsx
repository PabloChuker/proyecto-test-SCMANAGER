"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getSessions, getOrders, getActiveSessionId, setActiveSessionId,
  createSession, deleteSession, deleteOrder, collectOrder,
  completeOrder, tickOrders, getCrewSharesSummary, getStats,
  getInventory, getMovements, sellFromInventory, useForCrafting,
  distributeToMember, manualAdd, calculateDistribution,
  type WOSession, type WorkOrder, type OrderStatus,
  type InventoryItem, type InventoryMovement,
} from "@/lib/workOrderStore";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtAuec(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function typeIcon(t: string) { return ({ ship: "⛏", roc: "💎", salvage: "♻", share: "🏛" } as any)[t] || "📋"; }
function typeLabel(t: string) { return ({ ship: "Ship Mining", roc: "ROC / FPS", salvage: "Salvage", share: "Share aUEC" } as any)[t] || t; }
function statusBadge(s: OrderStatus) {
  switch (s) {
    case "in_progress": return { label: "In Progress", color: "bg-amber-500/20 text-amber-400 border-amber-500/40" };
    case "completed": return { label: "Ready", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" };
    case "collected": return { label: "Collected", color: "bg-blue-500/20 text-blue-400 border-blue-500/40" };
  }
}
function padZ(n: number) { return n.toString().padStart(2, "0"); }
function fmtCountdown(seconds: number) {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return `${padZ(h)}:${padZ(m)}:${padZ(s)}`;
}
function mvReasonLabel(r: string) {
  return ({ refine_complete: "Refined", sell: "Sold", craft: "Crafting", distribute: "Distributed", manual_add: "Added", manual_remove: "Removed" } as any)[r] || r;
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

type DashTab = "sessions" | "orders" | "inventory" | "crew" | "stats";

const TABS: { key: DashTab; label: string; icon: string }[] = [
  { key: "sessions", label: "SESSIONS", icon: "📋" },
  { key: "orders", label: "WORK ORDERS", icon: "⛏" },
  { key: "inventory", label: "INVENTORY", icon: "📦" },
  { key: "crew", label: "CREW SHARES", icon: "👥" },
  { key: "stats", label: "STATS", icon: "📊" },
];

// ═════════════════════════════════════════════════════════════════════════════

export default function WorkOrderDashboard() {
  const [tab, setTab] = useState<DashTab>("orders");
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

  useEffect(() => {
    setSessions(getSessions());
    setOrders(getOrders());
    setActiveId(getActiveSessionId());
    setInventory(getInventory());
    setMovements(getMovements());
  }, [rk]);

  // Tick every second for countdown timers
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
      const completed = tickOrders();
      if (completed.length > 0) refresh();
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const refresh = () => setRk((k) => k + 1);

  const filteredOrders = useMemo(() => {
    if (!activeId) return orders;
    return orders.filter((o) => o.sessionId === activeId);
  }, [orders, activeId]);

  // Orders by status
  const inProgress = filteredOrders.filter((o) => o.status === "in_progress");
  const completed = filteredOrders.filter((o) => o.status === "completed");
  const collected = filteredOrders.filter((o) => o.status === "collected");

  const crewShares = useMemo(() => getCrewSharesSummary(activeId || undefined), [activeId, rk]);
  const stats = useMemo(() => getStats(activeId || undefined), [activeId, rk]);

  // Remaining countdown for an order
  const getRemainingSeconds = (order: WorkOrder): number => {
    if (!order.countdownEndsAt) return 0;
    return Math.max(0, Math.floor((new Date(order.countdownEndsAt).getTime() - now) / 1000));
  };

  // ── Handlers ──
  const handleCreateSession = () => { createSession(newSessionName || undefined); setNewSessionName(""); refresh(); };
  const handleDeleteSession = (id: string) => { deleteSession(id); refresh(); };
  const handleSetActive = (id: string) => { setActiveSessionId(id); setActiveId(id); };
  const handleDeleteOrder = (id: string) => { deleteOrder(id); refresh(); };
  const handleCollect = (id: string) => { collectOrder(id); refresh(); };
  const handleForceComplete = (id: string) => { completeOrder(id); refresh(); };

  const handleInvAction = () => {
    if (!invAction || invAction.qty <= 0) return;
    const { mineralId, mineralName, qty, type, member } = invAction;
    if (type === "sell") sellFromInventory(mineralId, mineralName, qty);
    else if (type === "craft") useForCrafting(mineralId, mineralName, qty);
    else if (type === "distribute") distributeToMember(mineralId, mineralName, qty, member);
    setInvAction(null);
    refresh();
  };

  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Tabs ── */}
      <div className="grid grid-cols-5 gap-0 border border-zinc-700/60 rounded-lg overflow-hidden">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`py-3 text-center text-[10px] tracking-[0.1em] uppercase font-bold transition-all
              ${tab === t.key ? "bg-amber-500 text-zinc-900" : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"}`}
          >
            <span className="mr-1">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Active session bar */}
      {activeId && (
        <div className="flex items-center justify-between bg-zinc-900/60 border border-amber-500/20 rounded-lg px-4 py-2">
          <div className="text-xs text-zinc-400">
            Session: <span className="text-amber-400 font-bold">{sessions.find((s) => s.id === activeId)?.name || "—"}</span>
          </div>
          <button onClick={() => { setActiveSessionId(null); setActiveId(null); }} className="text-[10px] text-zinc-600 hover:text-zinc-400">Show All</button>
        </div>
      )}

      {/* ═══════ SESSIONS ═══════ */}
      {tab === "sessions" && (
        <div className="space-y-4">
          <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg p-4">
            <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold mb-3">Create New Session</div>
            <div className="flex gap-2">
              <input type="text" value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateSession()}
                placeholder="Session name (optional)"
                className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50" />
              <button onClick={handleCreateSession} className="px-4 py-2 bg-amber-500 text-zinc-900 rounded text-sm font-bold hover:bg-amber-400">+ Create</button>
            </div>
          </div>
          {sessions.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 text-sm">No sessions yet.</div>
          ) : sessions.map((session) => {
            const oc = orders.filter((o) => o.sessionId === session.id).length;
            const tg = orders.filter((o) => o.sessionId === session.id).reduce((s, o) => s + o.grossValue, 0);
            const isA = session.id === activeId;
            return (
              <div key={session.id} onClick={() => handleSetActive(session.id)}
                className={`bg-zinc-900/70 border rounded-lg p-4 flex items-center justify-between cursor-pointer transition-all
                  ${isA ? "border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.1)]" : "border-zinc-700/60 hover:border-zinc-600"}`}>
                <div>
                  <div className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                    📋 {session.name}
                    {isA && <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded uppercase tracking-wider">Active</span>}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">{fmtDate(session.createdAt)} · {oc} orders · {fmtAuec(tg)} aUEC</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }} className="text-red-500/50 hover:text-red-400 text-sm px-2">🗑</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════ WORK ORDERS ═══════ */}
      {tab === "orders" && (
        <div className="space-y-6">
          {/* Status summary */}
          <div className="grid grid-cols-3 gap-3">
            {([
              { label: "In Progress", count: inProgress.length, color: "text-amber-400", bg: "border-amber-500/30" },
              { label: "Ready to Collect", count: completed.length, color: "text-emerald-400", bg: "border-emerald-500/30" },
              { label: "Collected", count: collected.length, color: "text-blue-400", bg: "border-blue-500/30" },
            ]).map((s) => (
              <div key={s.label} className={`bg-zinc-900/70 border ${s.bg} rounded-lg p-3 text-center`}>
                <div className={`text-2xl font-mono font-bold ${s.color}`}>{s.count}</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>

          {/* In Progress orders with live countdown */}
          {inProgress.length > 0 && (
            <div>
              <div className="text-xs tracking-[0.1em] uppercase text-amber-500 font-bold mb-2">⏳ In Progress</div>
              <div className="space-y-2">
                {inProgress.map((order) => {
                  const rem = getRemainingSeconds(order);
                  return (
                    <div key={order.id} className="bg-zinc-900/70 border border-amber-500/30 rounded-lg p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{typeIcon(order.type)}</span>
                        <div>
                          <div className="text-sm text-zinc-200 font-bold">{order.refinery || typeLabel(order.type)}</div>
                          <div className="text-[11px] text-zinc-500">{order.ores.map((o) => o.id).join(", ") || "—"} · {fmtAuec(order.grossValue)} aUEC</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-mono text-lg font-bold text-amber-400">{fmtCountdown(rem)}</div>
                          <div className="text-[9px] text-zinc-600">remaining</div>
                        </div>
                        <button onClick={() => handleForceComplete(order.id)}
                          className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-bold text-zinc-400 hover:text-zinc-200 hover:border-zinc-500">
                          Skip →
                        </button>
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
              <div className="text-xs tracking-[0.1em] uppercase text-emerald-500 font-bold mb-2">✓ Ready to Collect</div>
              <div className="space-y-2">
                {completed.map((order) => (
                  <div key={order.id} className="bg-zinc-900/70 border border-emerald-500/30 rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{typeIcon(order.type)}</span>
                      <div>
                        <div className="text-sm text-zinc-200 font-bold">{order.refinery || typeLabel(order.type)}</div>
                        <div className="text-[11px] text-zinc-500">
                          {order.ores.map((o) => `${o.name}: ${Math.round(o.yieldQty)}`).join(", ") || "—"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold text-amber-400">{fmtAuec(order.grossValue)} aUEC</span>
                      <button onClick={() => handleCollect(order.id)}
                        className="px-4 py-2 bg-emerald-500 text-zinc-900 rounded font-bold text-xs hover:bg-emerald-400 transition-colors shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                        📥 Collect
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Collected orders */}
          {collected.length > 0 && (
            <div>
              <div className="text-xs tracking-[0.1em] uppercase text-blue-500 font-bold mb-2">📦 Collected</div>
              <div className="space-y-1">
                {collected.map((order) => (
                  <div key={order.id} className="bg-zinc-900/50 border border-zinc-800/40 rounded-lg px-4 py-3 flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <span className="text-lg opacity-60">{typeIcon(order.type)}</span>
                      <div>
                        <div className="text-xs text-zinc-400">{order.refinery || typeLabel(order.type)} · {fmtDate(order.createdAt)}</div>
                        <div className="text-[11px] text-zinc-600">{order.ores.map((o) => o.id).join(", ")}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-500">{fmtAuec(order.grossValue)} aUEC</span>
                      <button onClick={() => setDistOrderId(order.id)}
                        className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-bold text-zinc-500 hover:text-amber-400 hover:border-amber-500/30 transition-colors">
                        👥 Distribute
                      </button>
                      <button onClick={() => handleDeleteOrder(order.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-500/50 hover:text-red-400 text-xs transition-opacity">🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredOrders.length === 0 && (
            <div className="text-center py-12 text-zinc-600 text-sm">No work orders yet. Submit one from the Work Order calculator.</div>
          )}
        </div>
      )}

      {/* ═══════ INVENTORY ═══════ */}
      {tab === "inventory" && (
        <div className="space-y-6">
          <div className="text-lg font-bold text-zinc-300 tracking-wide font-mono">Material Inventory</div>
          <p className="text-[11px] text-zinc-500 -mt-4">Global consolidated stock from all collected orders.</p>

          {inventory.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 text-sm">No materials in inventory. Collect completed orders to add materials.</div>
          ) : (
            <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 px-4 py-2 bg-zinc-800/40 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40">
                <span>Material</span>
                <span className="text-right">Available</span>
                <span className="text-right">Total Received</span>
                <span>Actions</span>
              </div>
              {inventory.filter((i) => i.quantity > 0 || i.totalReceived > 0).map((item) => (
                <div key={item.mineralId} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 px-4 py-3 border-b border-zinc-800/30 items-center">
                  <span className="text-sm font-bold text-zinc-200 uppercase">{item.mineralName}</span>
                  <span className={`text-sm font-mono text-right font-bold ${item.quantity > 0 ? "text-emerald-400" : "text-zinc-600"}`}>
                    {item.quantity.toFixed(1)}
                  </span>
                  <span className="text-xs font-mono text-zinc-500 text-right">{item.totalReceived.toFixed(1)}</span>
                  <div className="flex gap-1">
                    <button onClick={() => setInvAction({ mineralId: item.mineralId, mineralName: item.mineralName, type: "sell", qty: 0, member: "" })}
                      className="px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-[9px] font-bold text-amber-400 hover:bg-amber-500/20">
                      Sell
                    </button>
                    <button onClick={() => setInvAction({ mineralId: item.mineralId, mineralName: item.mineralName, type: "craft", qty: 0, member: "" })}
                      className="px-2 py-1 bg-blue-500/10 border border-blue-500/30 rounded text-[9px] font-bold text-blue-400 hover:bg-blue-500/20">
                      Craft
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recent movements */}
          {movements.length > 0 && (
            <div>
              <div className="text-xs tracking-[0.1em] uppercase text-zinc-500 font-bold mb-2">Recent Movements</div>
              <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                {movements.slice(0, 30).map((mv) => (
                  <div key={mv.id} className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/30 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-bold ${mv.delta > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {mv.delta > 0 ? "+" : ""}{mv.delta.toFixed(1)}
                      </span>
                      <span className="text-zinc-300 uppercase">{mv.mineralName}</span>
                      <span className="text-zinc-600">— {mvReasonLabel(mv.reason)}</span>
                      {mv.crewMember && <span className="text-zinc-500">→ {mv.crewMember}</span>}
                    </div>
                    <span className="text-[10px] text-zinc-600">{fmtDate(mv.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ CREW SHARES ═══════ */}
      {tab === "crew" && (
        <div className="space-y-4">
          <div className="text-lg font-bold text-zinc-300 tracking-wide font-mono">Crew Share Summary</div>
          {crewShares.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 text-sm">No crew data yet.</div>
          ) : (
            <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 bg-zinc-800/40 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40">
                <span>Member</span><span className="text-right">Orders</span><span className="text-right">aUEC Payout</span><span className="text-right">Materials Value</span><span className="text-right">Avg/Order</span>
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
          )}
        </div>
      )}

      {/* ═══════ STATS ═══════ */}
      {tab === "stats" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { l: "Total Orders", v: stats.totalOrders.toString(), c: "text-zinc-100" },
              { l: "Total Gross", v: fmtAuec(stats.totalGross), c: "text-amber-400" },
              { l: "Total Net", v: fmtAuec(stats.totalNet), c: "text-emerald-400" },
              { l: "Expenses", v: fmtAuec(stats.totalExpenses), c: "text-red-400" },
              { l: "Total Yield", v: `${Math.round(stats.totalYield)} su`, c: "text-blue-400" },
              { l: "Avg/Order", v: fmtAuec(stats.avgOrderValue), c: "text-zinc-300" },
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
              <div className="text-[9px] text-zinc-500 uppercase">In Progress</div>
            </div>
            <div className="bg-zinc-900/70 border border-emerald-500/20 rounded-lg p-3 text-center">
              <div className="text-lg font-mono font-bold text-emerald-400">{stats.byStatus.completed}</div>
              <div className="text-[9px] text-zinc-500 uppercase">Ready</div>
            </div>
            <div className="bg-zinc-900/70 border border-blue-500/20 rounded-lg p-3 text-center">
              <div className="text-lg font-mono font-bold text-blue-400">{stats.byStatus.collected}</div>
              <div className="text-[9px] text-zinc-500 uppercase">Collected</div>
            </div>
          </div>

          {/* By type + top ores */}
          {Object.keys(stats.byType).length > 0 && (
            <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg p-4">
              <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold mb-3">By Activity Type</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(stats.byType).map(([t, d]) => (
                  <div key={t} className="bg-zinc-800/40 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{typeIcon(t)}</span>
                      <span className="text-xs font-bold text-zinc-300 uppercase">{typeLabel(t)}</span>
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
              <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold mb-3">Top Ores</div>
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

          {stats.totalOrders === 0 && <div className="text-center py-12 text-zinc-600 text-sm">No stats yet.</div>}
        </div>
      )}

      {/* ═══════ INVENTORY ACTION MODAL ═══════ */}
      {invAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border-2 border-amber-500 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-zinc-100 mb-1 capitalize">{invAction.type} {invAction.mineralName}</h3>
            <p className="text-[11px] text-zinc-500 mb-4">
              Available: {inventory.find((i) => i.mineralId === invAction.mineralId)?.quantity.toFixed(1) || 0}
            </p>
            <input type="number" min="0" value={invAction.qty || ""}
              onChange={(e) => setInvAction({ ...invAction, qty: parseFloat(e.target.value) || 0 })}
              placeholder="Quantity" className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-100 mb-3 focus:outline-none focus:border-amber-500" />
            {invAction.type === "distribute" && (
              <input type="text" value={invAction.member} onChange={(e) => setInvAction({ ...invAction, member: e.target.value })}
                placeholder="Crew member name" className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 mb-3 focus:outline-none focus:border-amber-500" />
            )}
            <div className="flex gap-2">
              <button onClick={() => setInvAction(null)} className="flex-1 py-2 bg-zinc-800 text-zinc-300 rounded font-bold text-sm">Cancel</button>
              <button onClick={handleInvAction} className="flex-1 py-2 bg-amber-500 text-zinc-900 rounded font-bold text-sm hover:bg-amber-400">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ DISTRIBUTION MODAL ═══════ */}
      {distOrderId && (() => {
        const dist = calculateDistribution(distOrderId);
        const order = orders.find((o) => o.id === distOrderId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-zinc-900 border-2 border-amber-500 rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-bold text-zinc-100 mb-1">Material Distribution</h3>
              <p className="text-[11px] text-zinc-500 mb-4">Based on crew share percentages for order {distOrderId.slice(3, 14)}</p>
              {dist.map((member) => (
                <div key={member.memberName} className="mb-4 bg-zinc-800/40 rounded-lg p-3">
                  <div className="text-sm font-bold text-amber-400 mb-2">👤 {member.memberName} <span className="text-zinc-500 font-normal">({member.share} shares)</span></div>
                  <div className="space-y-1">
                    {member.minerals.filter((m) => m.qty > 0).map((m) => (
                      <div key={m.mineralId} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300 uppercase">{m.mineralName}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-zinc-400">{m.qty.toFixed(1)} units</span>
                          <span className="font-mono text-amber-400">{fmtAuec(m.value)} aUEC</span>
                          <button onClick={() => {
                            distributeToMember(m.mineralId, m.mineralName, m.qty, member.memberName);
                            refresh();
                          }} className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-[9px] font-bold text-emerald-400 hover:bg-emerald-500/20">
                            Give
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={() => setDistOrderId(null)} className="w-full py-2 bg-zinc-800 text-zinc-300 rounded font-bold text-sm mt-2">Close</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
