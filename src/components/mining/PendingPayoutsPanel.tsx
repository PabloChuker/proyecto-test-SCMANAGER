"use client";

// =============================================================================
// SC LABS — Pending Payouts Panel (Fase D.3)
//
// Vista de distribuciones de stops generadas desde ActiveRoutePanel (D.2).
// Permite:
//   - Ver todas las distribuciones de la sesion activa de mining.
//   - Filtrar por status (pending | distributed | archived | all).
//   - Filtrar por nombre de miembro (busqueda libre).
//   - Expandir cada distribucion para ver los pending_payouts detallados.
//   - Eliminar distribuciones en status='pending' (D.1 DELETE endpoint).
//
// La marca "distribuido" con escritura al settlement ledger vive en D.4.
// Aca solo mostramos el boton "Marcar distribuido" como stub que hace PATCH
// simple — la parte contable viene en la proxima fase.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

// -- Types ------------------------------------------------------------------

export type DistributionStatus =
  | "pending"
  | "distributed"
  | "closed" // Fase E.2 — orden de pago cerrada (todos los ledger entries paid)
  | "archived";
export type StatusFilter = DistributionStatus | "all";

interface PendingPayout {
  id: string;
  distribution_id: string;
  user_id: string | null;
  display_name: string;
  avatar_url: string | null;
  source: "mining" | "trade" | "both" | string;
  mining_member_id: string | null;
  trade_participant_id: string | null;
  pending_auec: number;
  share_pct: number;
  role_label: string | null;
  weight_value: number | null;
  status: string;
  distributed_at: string | null;
}

interface StopDistribution {
  id: string;
  route_group_id: string;
  stop_index: number;
  route_total_stops: number;
  mining_session_id: string | null;
  mining_party_id: string | null;
  trade_party_id: string | null;
  gross_auec: number;
  buy_cost_auec: number;
  expenses_auec: number;
  net_auec: number;
  split_mode: "equitable" | "manual_pct" | "role_weight";
  status: DistributionStatus;
  triggered_by: string;
  triggered_at: string;
  distributed_at: string | null;
  /** Fase E.2 — timestamp de cierre de orden de pago (solo con status=closed) */
  closed_at: string | null;
  /** Fase E.2 — user_id de quien cerró la orden */
  closed_by: string | null;
  notes: string | null;
  created_at: string;
  mining_pending_payouts: PendingPayout[];
  mining_stop_distribution_wos: { work_order_id: string }[];
}

// -- Helpers ----------------------------------------------------------------

function fmtAuec(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusColors(s: DistributionStatus): string {
  switch (s) {
    case "pending":
      return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    case "distributed":
      return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    case "closed":
      return "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
    case "archived":
      return "bg-zinc-700/30 text-zinc-400 border-zinc-600/40";
  }
}

function splitModeColors(m: StopDistribution["split_mode"]): string {
  switch (m) {
    case "equitable":
      return "bg-cyan-500/10 text-cyan-300 border-cyan-500/30";
    case "manual_pct":
      return "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30";
    case "role_weight":
      return "bg-orange-500/10 text-orange-300 border-orange-500/30";
  }
}

// -- Component --------------------------------------------------------------

interface Props {
  /** Sesion minera activa. Si es null el panel muestra empty state. */
  miningSessionId: string | null;
  /** user_id del user actual (para el indicador "lo que te deben a vos"). */
  currentUserId?: string | null;
}

export default function PendingPayoutsPanel({ miningSessionId, currentUserId }: Props) {
  const t = useTranslations("Mining.payouts");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [memberQuery, setMemberQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [distributions, setDistributions] = useState<StopDistribution[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Auto-clear flash mensajes despues de 3.5s
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  // -- Load -----------------------------------------------------------------

  const load = useCallback(async () => {
    if (!miningSessionId) {
      setDistributions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("mining_session_id", miningSessionId);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const r = await fetch(`/api/mining/distributions?${params.toString()}`);
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || "Failed to load distributions");
      setDistributions(Array.isArray(json?.data) ? json.data : []);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
      setDistributions([]);
    } finally {
      setLoading(false);
    }
  }, [miningSessionId, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // -- Derived --------------------------------------------------------------

  const filtered = useMemo(() => {
    if (!memberQuery.trim()) return distributions;
    const q = memberQuery.trim().toLowerCase();
    return distributions.filter((d) =>
      d.mining_pending_payouts.some((p) => p.display_name.toLowerCase().includes(q)),
    );
  }, [distributions, memberQuery]);

  const stats = useMemo(() => {
    let totalNet = 0;
    let pendingCount = 0;
    let meOwed = 0;
    for (const d of distributions) {
      totalNet += Number(d.net_auec ?? 0);
      if (d.status === "pending") pendingCount += 1;
      if (currentUserId) {
        for (const p of d.mining_pending_payouts) {
          if (p.user_id === currentUserId && p.status === "pending") {
            meOwed += Number(p.pending_auec ?? 0);
          }
        }
      }
    }
    return { totalNet, pendingCount, meOwed };
  }, [distributions, currentUserId]);

  // -- Actions --------------------------------------------------------------

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const markDistributed = useCallback(
    async (id: string) => {
      if (!confirm(t("confirmMarkDistributed"))) return;
      setMutatingId(id);
      try {
        const r = await fetch("/api/mining/distributions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, status: "distributed" }),
        });
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error || "Failed to mark distributed");
        const entries = Array.isArray(json?.ledgerEntries) ? json.ledgerEntries.length : 0;
        setFlash(
          entries > 0
            ? t("flashLedgerOpened", { count: entries })
            : t("flashMarkedDistributed"),
        );
        await load();
      } catch (e: any) {
        alert(e?.message || "Unknown error");
      } finally {
        setMutatingId(null);
      }
    },
    [load, t],
  );

  // Fase E.2 — cerrar orden de pago. El backend valida que todos los ledger
  // entries esten paid=true; si alguno no lo esta devuelve 409 con el conteo.
  const closeOrderOfPayment = useCallback(
    async (id: string) => {
      if (!confirm(t("confirmCloseOrder"))) return;
      setMutatingId(id);
      try {
        const r = await fetch("/api/mining/distributions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, close: true }),
        });
        const json = await r.json();
        if (r.status === 409) {
          const count =
            typeof json?.unpaidCount === "number" ? json.unpaidCount : 0;
          alert(t("cannotCloseUnpaid", { count }));
          return;
        }
        if (!r.ok) throw new Error(json?.error || "Failed to close order");
        setFlash(t("flashClosedOrder"));
        await load();
      } catch (e: any) {
        alert(e?.message || "Unknown error");
      } finally {
        setMutatingId(null);
      }
    },
    [load, t],
  );

  const deleteDistribution = useCallback(
    async (id: string) => {
      if (!confirm(t("confirmDelete"))) return;
      setMutatingId(id);
      try {
        const r = await fetch(`/api/mining/distributions?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error || "Failed to delete");
        await load();
      } catch (e: any) {
        alert(e?.message || "Unknown error");
      } finally {
        setMutatingId(null);
      }
    },
    [load, t],
  );

  // -- Render ---------------------------------------------------------------

  if (!miningSessionId) {
    return (
      <div className="text-center py-12 text-zinc-600 text-sm">
        {t("noSession")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + stats */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-zinc-200 tracking-wide font-mono">
          {t("title")}
        </h2>
        <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.1em] text-zinc-500 font-bold">
          <div>
            {t("statPending")}:{" "}
            <span className="text-amber-300">{stats.pendingCount}</span>
          </div>
          <div>
            {t("statTotalNet")}:{" "}
            <span className="text-cyan-300">{fmtAuec(stats.totalNet)} aUEC</span>
          </div>
          {currentUserId && stats.meOwed > 0 && (
            <div>
              {t("statMeOwed")}:{" "}
              <span className="text-emerald-300">{fmtAuec(stats.meOwed)} aUEC</span>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="inline-flex rounded-md overflow-hidden border border-zinc-700/60">
          {(["pending", "distributed", "closed", "archived", "all"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-[10px] tracking-[0.1em] uppercase font-bold transition-colors ${
                statusFilter === s
                  ? "bg-amber-500 text-zinc-900"
                  : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
              }`}
            >
              {t(`filter.${s}`)}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={memberQuery}
          onChange={(e) => setMemberQuery(e.target.value)}
          placeholder={t("searchMember")}
          className="bg-zinc-900/70 border border-zinc-700/60 rounded px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500/60 w-60"
        />
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-bold text-zinc-400 hover:text-amber-400 hover:border-amber-500/30 disabled:opacity-50"
        >
          {loading ? t("refreshing") : t("refresh")}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Flash (e.g. ledger opened) */}
      {flash && (
        <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-lg px-4 py-3 text-sm text-emerald-300 flex items-center justify-between">
          <span>{flash}</span>
          <button
            onClick={() => setFlash(null)}
            className="text-emerald-300/60 hover:text-emerald-200 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* List */}
      {!loading && filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-600 text-sm italic">
          {statusFilter === "pending" ? t("emptyPending") : t("empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => {
            const isExpanded = expanded.has(d.id);
            const payouts = d.mining_pending_payouts || [];
            return (
              <div
                key={d.id}
                className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg overflow-hidden"
              >
                {/* Row header */}
                <button
                  onClick={() => toggleExpand(d.id)}
                  className="w-full grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-zinc-800/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-xs">{isExpanded ? "▼" : "▶"}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 border rounded uppercase tracking-wider font-bold ${statusColors(d.status)}`}>
                      {t(`status.${d.status}`)}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 border rounded uppercase tracking-wider font-bold ${splitModeColors(d.split_mode)}`}>
                      {t(`mode.${d.split_mode}`)}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-zinc-200 font-mono">
                      {t("stopLabel", { index: d.stop_index, total: d.route_total_stops })}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {fmtDate(d.triggered_at)} · {payouts.length} {t("members")}
                      {d.notes && <span className="ml-2 text-zinc-600 italic">— {d.notes}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-mono font-bold text-amber-400">
                      {fmtAuec(d.net_auec)}
                    </div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider">aUEC {t("net")}</div>
                  </div>
                </button>

                {/* Expanded body */}
                {isExpanded && (
                  <div className="border-t border-zinc-800 p-4 space-y-3 bg-zinc-950/40">
                    {/* Totals row */}
                    <div className="grid grid-cols-4 gap-3 text-[11px] font-mono">
                      <div>
                        <div className="text-zinc-500 uppercase tracking-wider text-[9px]">{t("gross")}</div>
                        <div className="text-zinc-200 font-bold">{fmtAuec(d.gross_auec)}</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 uppercase tracking-wider text-[9px]">{t("buyCost")}</div>
                        <div className="text-zinc-300">−{fmtAuec(d.buy_cost_auec)}</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 uppercase tracking-wider text-[9px]">{t("expenses")}</div>
                        <div className="text-zinc-300">−{fmtAuec(d.expenses_auec)}</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 uppercase tracking-wider text-[9px]">{t("net")}</div>
                        <div className="text-amber-400 font-bold">{fmtAuec(d.net_auec)}</div>
                      </div>
                    </div>

                    {/* Payouts list */}
                    {payouts.length === 0 ? (
                      <div className="text-[11px] text-zinc-600 italic">{t("noPayouts")}</div>
                    ) : (
                      <div className="border border-zinc-800 rounded">
                        <div className="grid grid-cols-[2fr_1fr_0.6fr_0.7fr_0.8fr] gap-2 px-3 py-1.5 bg-zinc-800/40 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40">
                          <span>{t("colMember")}</span>
                          <span>{t("colRole")}</span>
                          <span className="text-right">{t("colShare")}</span>
                          <span className="text-right">{t("colWeight")}</span>
                          <span className="text-right">{t("colAuec")}</span>
                        </div>
                        {payouts.map((p) => {
                          const isMe = currentUserId && p.user_id === currentUserId;
                          return (
                            <div
                              key={p.id}
                              className={`grid grid-cols-[2fr_1fr_0.6fr_0.7fr_0.8fr] gap-2 px-3 py-2 border-b border-zinc-800/30 items-center text-xs ${isMe ? "bg-emerald-500/5" : ""}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`font-bold ${isMe ? "text-emerald-300" : "text-zinc-200"}`}>
                                  {p.display_name}
                                </span>
                                <span className={`text-[8px] px-1 py-0.5 border rounded uppercase tracking-wider ${
                                  p.source === "both"
                                    ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                                    : p.source === "mining"
                                    ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                                    : "bg-violet-500/10 text-violet-300 border-violet-500/30"
                                }`}>
                                  {t(`source.${p.source}`)}
                                </span>
                                {isMe && (
                                  <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider font-bold">
                                    {t("you")}
                                  </span>
                                )}
                              </div>
                              <span className="text-zinc-500 text-[10px] italic truncate">
                                {p.role_label || "—"}
                              </span>
                              <span className="text-right font-mono text-zinc-300">
                                {Number(p.share_pct || 0).toFixed(1)}%
                              </span>
                              <span className="text-right font-mono text-zinc-500 text-[10px]">
                                {p.weight_value != null ? Number(p.weight_value).toFixed(2) : "—"}
                              </span>
                              <span className="text-right font-mono font-bold text-amber-400">
                                {fmtAuec(p.pending_auec)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      {d.status === "pending" && (
                        <>
                          <button
                            onClick={() => deleteDistribution(d.id)}
                            disabled={mutatingId === d.id}
                            className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded text-[10px] font-bold text-red-300 hover:bg-red-500/20 hover:border-red-500/50 disabled:opacity-50"
                          >
                            {t("actionDelete")}
                          </button>
                          <button
                            onClick={() => markDistributed(d.id)}
                            disabled={mutatingId === d.id}
                            className="px-3 py-1.5 bg-emerald-500 text-zinc-900 rounded text-[10px] font-bold hover:bg-emerald-400 disabled:opacity-50"
                          >
                            {t("actionMarkDistributed")}
                          </button>
                        </>
                      )}
                      {d.status === "distributed" && (
                        <>
                          <span className="text-[10px] text-emerald-400 italic">
                            {t("distributedAt", { date: fmtDate(d.distributed_at) })}
                          </span>
                          <button
                            onClick={() => closeOrderOfPayment(d.id)}
                            disabled={mutatingId === d.id}
                            title={t("actionCloseOrderHint")}
                            className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/40 rounded text-[10px] font-bold text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-500/60 disabled:opacity-50"
                          >
                            {t("actionCloseOrder")}
                          </button>
                        </>
                      )}
                      {d.status === "closed" && (
                        <span className="text-[10px] text-cyan-300 italic">
                          {t("closedAt", { date: fmtDate(d.closed_at) })}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
