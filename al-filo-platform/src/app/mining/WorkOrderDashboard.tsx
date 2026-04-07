"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getSessions,
  getOrders,
  getOrdersBySession,
  getActiveSessionId,
  setActiveSessionId,
  createSession,
  deleteSession,
  deleteOrder,
  getCrewSharesSummary,
  getStats,
  type WOSession,
  type WorkOrder,
  type CrewShareSummary,
  type WOStats,
} from "@/lib/workOrderStore";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAuec(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function typeIcon(type: string): string {
  switch (type) {
    case "ship": return "⛏";
    case "roc": return "💎";
    case "salvage": return "♻";
    case "share": return "🏛";
    default: return "📋";
  }
}

function typeLabel(type: string): string {
  switch (type) {
    case "ship": return "Ship Mining";
    case "roc": return "ROC / FPS";
    case "salvage": return "Salvage";
    case "share": return "Share aUEC";
    default: return type;
  }
}

// ─── Dashboard Tabs ──────────────────────────────────────────────────────────

type DashTab = "sessions" | "orders" | "crew" | "stats";

const DASH_TABS: { key: DashTab; label: string; icon: string }[] = [
  { key: "sessions", label: "SESSIONS", icon: "📋" },
  { key: "orders", label: "WORK ORDERS", icon: "⛏" },
  { key: "crew", label: "CREW SHARES", icon: "👥" },
  { key: "stats", label: "STATS", icon: "📊" },
];

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function WorkOrderDashboard() {
  const [tab, setTab] = useState<DashTab>("orders");
  const [sessions, setSessions] = useState<WOSession[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [activeSessionId, setActiveId] = useState<string | null>(null);
  const [newSessionName, setNewSessionName] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Load data on mount and refresh
  useEffect(() => {
    setSessions(getSessions());
    setOrders(getOrders());
    setActiveId(getActiveSessionId());
  }, [refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  // Filtered orders by active session or all
  const filteredOrders = useMemo(() => {
    if (!activeSessionId) return orders;
    return orders.filter((o) => o.sessionId === activeSessionId);
  }, [orders, activeSessionId]);

  // Group orders by month
  const ordersByMonth = useMemo(() => {
    const groups = new Map<string, WorkOrder[]>();
    for (const order of filteredOrders) {
      const d = new Date(order.createdAt);
      const key = `${d.getFullYear()} - ${d.toLocaleString("en-US", { month: "long" })}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(order);
    }
    return Array.from(groups.entries());
  }, [filteredOrders]);

  const crewShares = useMemo(
    () => getCrewSharesSummary(activeSessionId || undefined),
    [activeSessionId, refreshKey, orders]
  );

  const stats = useMemo(
    () => getStats(activeSessionId || undefined),
    [activeSessionId, refreshKey, orders]
  );

  // ── Session helpers ──
  const handleCreateSession = () => {
    createSession(newSessionName || undefined);
    setNewSessionName("");
    refresh();
  };

  const handleDeleteSession = (id: string) => {
    deleteSession(id);
    refresh();
  };

  const handleSetActive = (id: string) => {
    setActiveSessionId(id);
    setActiveId(id);
  };

  const handleDeleteOrder = (id: string) => {
    deleteOrder(id);
    refresh();
  };

  // ═════════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═════════════════════════════════════════════════════════════════════════════

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Tab Bar ── */}
      <div className="grid grid-cols-4 gap-0 border border-zinc-700/60 rounded-lg overflow-hidden">
        {DASH_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`py-3 text-center text-xs tracking-[0.1em] uppercase font-bold transition-all
              ${tab === t.key
                ? "bg-amber-500 text-zinc-900"
                : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
              }`}
          >
            <span className="mr-1">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Active session indicator ── */}
      {activeSessionId && (
        <div className="flex items-center justify-between bg-zinc-900/60 border border-amber-500/20 rounded-lg px-4 py-2">
          <div className="text-xs text-zinc-400">
            Active Session: <span className="text-amber-400 font-bold">{sessions.find((s) => s.id === activeSessionId)?.name || "Unknown"}</span>
          </div>
          <button
            onClick={() => { setActiveSessionId(null); setActiveId(null); }}
            className="text-[10px] text-zinc-600 hover:text-zinc-400"
          >
            Show All
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  SESSIONS TAB                                                  */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {tab === "sessions" && (
        <div className="space-y-4">
          {/* Create session */}
          <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg p-4">
            <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold mb-3">
              Create New Session
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateSession()}
                placeholder="Session name (optional)"
                className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
              />
              <button
                onClick={handleCreateSession}
                className="px-4 py-2 bg-amber-500 text-zinc-900 rounded text-sm font-bold hover:bg-amber-400 transition-colors"
              >
                + Create
              </button>
            </div>
          </div>

          {/* Session list */}
          {sessions.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 text-sm">
              No sessions yet. Create one to start tracking work orders.
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => {
                const orderCount = orders.filter((o) => o.sessionId === session.id).length;
                const totalGross = orders
                  .filter((o) => o.sessionId === session.id)
                  .reduce((s, o) => s + o.grossValue, 0);
                const isActive = session.id === activeSessionId;

                return (
                  <div
                    key={session.id}
                    className={`bg-zinc-900/70 border rounded-lg p-4 flex items-center justify-between transition-all cursor-pointer
                      ${isActive ? "border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.1)]" : "border-zinc-700/60 hover:border-zinc-600"}`}
                    onClick={() => handleSetActive(session.id)}
                  >
                    <div>
                      <div className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                        📋 {session.name}
                        {isActive && <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded uppercase tracking-wider">Active</span>}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1">
                        {formatDate(session.createdAt)} · {orderCount} orders · {formatAuec(totalGross)} aUEC
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                      className="text-red-500/50 hover:text-red-400 text-sm px-2"
                      title="Delete session"
                    >
                      🗑
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  WORK ORDERS TAB                                               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {tab === "orders" && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
            <div className="text-sm text-zinc-300">
              <span className="font-bold text-amber-400">{filteredOrders.length}</span> active work orders
              {activeSessionId ? " in this session" : " across all sessions"}
            </div>
          </div>

          {/* Work Order Timeline */}
          <div className="text-lg font-bold text-zinc-300 tracking-wide font-mono">
            Work Order timeline
          </div>
          <p className="text-[11px] text-zinc-500 -mt-2">
            All work orders {activeSessionId ? "in this session" : "from all your sessions"} that you either <em>own</em> or have been marked as the seller.
          </p>

          {filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 text-sm">
              No work orders yet. Submit one from the Work Order calculator.
            </div>
          ) : (
            ordersByMonth.map(([month, monthOrders]) => (
              <div key={month}>
                {/* Month header */}
                <div className="bg-amber-500 text-zinc-900 px-4 py-2 rounded-t-lg font-mono font-bold text-sm">
                  {month}
                </div>

                {/* Table */}
                <div className="border border-amber-500/30 border-t-0 rounded-b-lg overflow-hidden">
                  <div className="grid grid-cols-[1.5fr_auto_1fr_1fr_auto_auto_1fr] gap-2 px-4 py-2 bg-zinc-800/40 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40">
                    <span>Session</span>
                    <span>Type</span>
                    <span>Order Id</span>
                    <span>Ores</span>
                    <span className="text-right">Yield</span>
                    <span className="text-right">Gross</span>
                    <span className="text-right">🕐</span>
                  </div>

                  {monthOrders.map((order) => {
                    const session = sessions.find((s) => s.id === order.sessionId);
                    const oreNames = order.ores.map((o) => o.id).join(", ");
                    return (
                      <div
                        key={order.id}
                        className="grid grid-cols-[1.5fr_auto_1fr_1fr_auto_auto_1fr] gap-2 px-4 py-2.5 border-b border-zinc-800/30 items-center hover:bg-zinc-800/20 transition-colors group"
                      >
                        <span className="text-xs text-zinc-300 truncate flex items-center gap-1">
                          📋 {session?.name?.slice(0, 20) || "—"}...
                        </span>
                        <span className="text-lg" title={typeLabel(order.type)}>{typeIcon(order.type)}</span>
                        <span className="text-[11px] text-zinc-400 font-mono truncate flex items-center gap-1">
                          📝 {order.id.slice(3, 14)}
                        </span>
                        <span className="text-[11px] text-zinc-400 uppercase truncate" title={oreNames}>
                          {oreNames || "—"}
                        </span>
                        <span className="text-xs font-mono text-zinc-300 text-right">
                          {order.totalYield > 0 ? `${Math.round(order.totalYield)} su` : "—"}
                        </span>
                        <span className="text-xs font-mono text-amber-400 font-bold text-right">
                          {formatAuec(order.grossValue)} aUEC
                        </span>
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-[11px] text-zinc-500">
                            {formatDate(order.createdAt)}
                          </span>
                          <button
                            onClick={() => handleDeleteOrder(order.id)}
                            className="opacity-0 group-hover:opacity-100 text-red-500/50 hover:text-red-400 text-xs transition-opacity"
                            title="Delete order"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Month totals */}
                  <div className="grid grid-cols-[1.5fr_auto_1fr_1fr_auto_auto_1fr] gap-2 px-4 py-2 bg-zinc-800/20 text-xs font-bold">
                    <span className="text-amber-500">Totals</span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span className="text-right text-zinc-300">
                      {Math.round(monthOrders.reduce((s, o) => s + o.totalYield, 0))} su
                    </span>
                    <span className="text-right text-amber-400">
                      {formatAuec(monthOrders.reduce((s, o) => s + o.grossValue, 0))} aUEC
                    </span>
                    <span></span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  CREW SHARES TAB                                               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {tab === "crew" && (
        <div className="space-y-4">
          <div className="text-lg font-bold text-zinc-300 tracking-wide font-mono">
            Crew Share Summary
          </div>
          <p className="text-[11px] text-zinc-500">
            Aggregated payouts per crew member {activeSessionId ? "in the active session" : "across all sessions"}.
          </p>

          {crewShares.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 text-sm">
              No crew data yet. Submit work orders with crew members to see shares.
            </div>
          ) : (
            <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-4 py-2 bg-zinc-800/40 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40">
                <span>Crew Member</span>
                <span className="text-right">Orders</span>
                <span className="text-right">Total Payout</span>
                <span className="text-right">Avg / Order</span>
              </div>

              {crewShares.map((member, i) => (
                <div
                  key={member.name}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-4 py-3 border-b border-zinc-800/30 items-center"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold
                      ${i === 0 ? "bg-amber-500/20 text-amber-400" : "bg-zinc-800 text-zinc-500"}`}>
                      {i + 1}
                    </span>
                    <span className="text-sm font-bold text-zinc-200">👤 {member.name}</span>
                  </div>
                  <span className="text-xs font-mono text-zinc-400 text-right">{member.orderCount}</span>
                  <span className="text-sm font-mono font-bold text-amber-400 text-right">
                    {formatAuec(member.totalPayout)} aUEC
                  </span>
                  <span className="text-xs font-mono text-zinc-500 text-right">
                    {formatAuec(member.orderCount > 0 ? Math.round(member.totalPayout / member.orderCount) : 0)} aUEC
                  </span>
                </div>
              ))}

              {/* Total row */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-4 py-3 bg-zinc-800/20">
                <span className="text-xs font-bold text-amber-500">TOTAL</span>
                <span className="text-xs font-mono text-zinc-400 text-right">
                  {crewShares.reduce((s, m) => s + m.orderCount, 0)}
                </span>
                <span className="text-sm font-mono font-bold text-amber-400 text-right">
                  {formatAuec(crewShares.reduce((s, m) => s + m.totalPayout, 0))} aUEC
                </span>
                <span></span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  STATS TAB                                                     */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {tab === "stats" && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Total Orders", value: stats.totalOrders.toString(), color: "text-zinc-100" },
              { label: "Total Gross", value: `${formatAuec(stats.totalGross)}`, color: "text-amber-400" },
              { label: "Total Net", value: `${formatAuec(stats.totalNet)}`, color: "text-emerald-400" },
              { label: "Total Expenses", value: `${formatAuec(stats.totalExpenses)}`, color: "text-red-400" },
              { label: "Total Yield", value: `${Math.round(stats.totalYield)} su`, color: "text-blue-400" },
              { label: "Avg / Order", value: `${formatAuec(stats.avgOrderValue)}`, color: "text-zinc-300" },
            ].map((card) => (
              <div key={card.label} className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg p-3">
                <div className="text-[9px] tracking-[0.15em] uppercase text-zinc-500 font-bold mb-1">
                  {card.label}
                </div>
                <div className={`text-lg font-mono font-bold ${card.color}`}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>

          {/* By type breakdown */}
          <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg p-4">
            <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold mb-3">
              By Activity Type
            </div>
            {Object.keys(stats.byType).length === 0 ? (
              <p className="text-xs text-zinc-600 italic">No data yet</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(stats.byType).map(([type, data]) => (
                  <div key={type} className="bg-zinc-800/40 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{typeIcon(type)}</span>
                      <span className="text-xs font-bold text-zinc-300 uppercase">{typeLabel(type)}</span>
                    </div>
                    <div className="text-lg font-mono font-bold text-amber-400">{data.count}</div>
                    <div className="text-[11px] text-zinc-500">{formatAuec(data.gross)} aUEC</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Ores */}
          {stats.topOres.length > 0 && (
            <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg p-4">
              <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold mb-3">
                Top Ores Mined
              </div>
              <div className="space-y-2">
                {stats.topOres.map((ore, i) => {
                  const maxValue = stats.topOres[0]?.totalValue || 1;
                  const pct = (ore.totalValue / maxValue) * 100;
                  return (
                    <div key={ore.id} className="flex items-center gap-3">
                      <span className="text-xs text-zinc-500 w-5 text-right">{i + 1}</span>
                      <span className="text-xs font-bold text-zinc-300 w-28 uppercase">{ore.name}</span>
                      <div className="flex-1 h-3 bg-zinc-800/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500/60 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-zinc-400 w-16 text-right">
                        {Math.round(ore.totalQty)} su
                      </span>
                      <span className="text-xs font-mono text-amber-400 w-20 text-right font-bold">
                        {formatAuec(ore.totalValue)} aUEC
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Monthly breakdown */}
          {stats.byMonth.length > 0 && (
            <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg p-4">
              <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold mb-3">
                Monthly Breakdown
              </div>
              <div className="space-y-1">
                {stats.byMonth.map((m) => (
                  <div key={m.month} className="flex items-center justify-between py-2 border-b border-zinc-800/30">
                    <span className="text-xs text-zinc-300">{m.month}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-zinc-500">{m.count} orders</span>
                      <span className="text-xs font-mono font-bold text-amber-400">{formatAuec(m.gross)} aUEC</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.totalOrders === 0 && (
            <div className="text-center py-12 text-zinc-600 text-sm">
              No stats yet. Submit work orders to see your mining analytics.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
