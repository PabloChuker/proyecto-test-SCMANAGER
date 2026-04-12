"use client";

// =============================================================================
// SC LABS — Party Mining Dashboard
//
// Unified view combining Session Manager, Crew Panel, and integrated
// work order / inventory views powered by Supabase.
// =============================================================================

import { useState } from "react";
import { useMiningStore } from "@/store/useMiningStore";
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

export default function PartyMiningDashboard() {
  const [subTab, setSubTab] = useState<SubTab>("sessions");
  const {
    activeSessionId,
    workOrders,
    inventory,
    movements,
    members,
    updateOrderStatus,
    deleteWorkOrder,
    recordInventoryAction,
  } = useMiningStore();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Sub-tabs */}
      <div className="grid grid-cols-4 gap-0 border border-zinc-700/60 rounded-lg overflow-hidden">
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
                            onClick={() => updateOrderStatus(order.id, "completed")}
                            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-bold text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30"
                          >
                            Mark Ready
                          </button>
                        )}
                        {order.status === "completed" && (
                          <button
                            onClick={() => updateOrderStatus(order.id, "collected")}
                            className="px-4 py-2 bg-emerald-500 text-zinc-900 rounded font-bold text-xs hover:bg-emerald-400 transition-colors"
                          >
                            Collect
                          </button>
                        )}
                        <button
                          onClick={() => deleteWorkOrder(order.id)}
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
          <h2 className="text-lg font-bold text-zinc-200 tracking-wide font-mono">
            Inventory
          </h2>

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
                <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 px-4 py-2 bg-zinc-800/40 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40">
                  <span>Material</span>
                  <span className="text-right">Available</span>
                  <span className="text-right">Total Received</span>
                  <span>Distribute</span>
                </div>
                {inventory
                  .filter((i) => i.quantity > 0 || i.total_received > 0)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 px-4 py-3 border-b border-zinc-800/30 items-center"
                    >
                      <span className="text-sm font-bold text-zinc-200 uppercase">
                        {item.mineral_name}
                      </span>
                      <span
                        className={`text-sm font-mono text-right font-bold ${
                          item.quantity > 0 ? "text-emerald-400" : "text-zinc-600"
                        }`}
                      >
                        {item.quantity.toFixed(1)}
                      </span>
                      <span className="text-xs font-mono text-zinc-500 text-right">
                        {item.total_received.toFixed(1)}
                      </span>
                      <div className="flex gap-1">
                        {members.map((m) => (
                          <button
                            key={m.id}
                            onClick={() =>
                              recordInventoryAction({
                                session_id: activeSessionId!,
                                mineral_id: item.mineral_id,
                                mineral_name: item.mineral_name,
                                quantity: item.quantity * (m.share_pct / 100),
                                reason: "distribute",
                                member_id: m.id,
                                member_name: m.display_name,
                              })
                            }
                            className="px-2 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded text-[8px] font-bold text-cyan-400 hover:bg-cyan-500/20 truncate max-w-[60px]"
                            title={`Give ${(item.quantity * (m.share_pct / 100)).toFixed(1)} to ${m.display_name} (${m.share_pct}%)`}
                          >
                            {m.display_name.split(" ")[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
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
    </div>
  );
}
