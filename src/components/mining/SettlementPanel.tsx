"use client";

// =============================================================================
// SC LABS — Settlement Panel (Fase D.5)
//
// Consume mining_settlement_ledger (via /api/mining/settlements) y ofrece:
//
//   1. Vista "Simplified" — corre el algoritmo Splitwise greedy en server y
//      muestra la lista minima de transferencias necesarias para saldar
//      balances netos entre miembros.
//
//   2. Vista "Raw ledger" — lista cruda de entries del ledger, con toggle
//      por entry para marcar paid / unpaid.
//
// El algoritmo vive en src/lib/debt-simplifier.ts (pure) y lo corre el
// endpoint cuando ?simplify=true. Aca solo renderizamos lo que devuelve.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

// -- Types -----------------------------------------------------------------

interface LedgerEntry {
  id: string;
  from_user_id: string | null;
  from_display_name: string;
  to_user_id: string | null;
  to_display_name: string;
  amount_auec: number;
  direction: "from_mining" | "settlement" | string;
  distribution_id: string | null;
  pending_payout_id: string | null;
  session_id: string | null;
  paid: boolean;
  paid_at: string | null;
  paid_by: string | null;
  notes: string | null;
  created_at: string;
}

interface PersonBalance {
  key: string;
  userId: string | null;
  displayName: string;
  balance: number;
  gross: number;
  owed: number;
}

interface SimplifiedTransfer {
  fromKey: string;
  fromUserId: string | null;
  fromDisplayName: string;
  toKey: string;
  toUserId: string | null;
  toDisplayName: string;
  amount: number;
}

interface SimplifiedPayload {
  balances: PersonBalance[];
  transfers: SimplifiedTransfer[];
  consideredCount: number;
  skippedPaidCount: number;
  totalFlow: number;
}

// -- Helpers ---------------------------------------------------------------

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

// -- Component -------------------------------------------------------------

type View = "simplified" | "ledger";
type PaidFilter = "all" | "unpaid" | "paid";

interface Props {
  miningSessionId: string | null;
  currentUserId?: string | null;
  /**
   * Fase E.E — Cuando se llega al panel desde una notificación
   * (payout_pending / payout_transferred) se pasa el id del ledger entry
   * para forzar la vista "ledger", ampliar el filtro a "all" y hacer
   * scroll + highlight a la fila correspondiente.
   */
  focusLedgerId?: string | null;
}

export default function SettlementPanel({
  miningSessionId,
  currentUserId,
  focusLedgerId,
}: Props) {
  const t = useTranslations("Mining.settlement");

  // Si venimos linkeados desde una notif, arrancamos en la vista de ledger con
  // el filtro amplio para asegurar que el entry target aparezca (ya esté
  // paid/unpaid). Si no, default habitual simplified + unpaid.
  const [view, setView] = useState<View>(focusLedgerId ? "ledger" : "simplified");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>(
    focusLedgerId ? "all" : "unpaid",
  );
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [simplified, setSimplified] = useState<SimplifiedPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  // -- Load ---------------------------------------------------------------

  const load = useCallback(async () => {
    if (!miningSessionId) {
      setEntries([]);
      setSimplified(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("session_id", miningSessionId);
      params.set("simplify", "true");
      if (paidFilter !== "all") params.set("paid", paidFilter === "paid" ? "true" : "false");

      const r = await fetch(`/api/mining/settlements?${params.toString()}`);
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || "Failed to load ledger");
      setEntries(Array.isArray(json?.data) ? json.data : []);
      setSimplified(json?.simplified || null);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
      setEntries([]);
      setSimplified(null);
    } finally {
      setLoading(false);
    }
  }, [miningSessionId, paidFilter]);

  useEffect(() => { load(); }, [load]);

  // Fase E.E — scroll + highlight de la fila linkeada desde una notificación.
  // Se dispara una única vez, cuando las entries ya están cargadas y el target
  // existe en la lista.
  const [focusApplied, setFocusApplied] = useState(false);
  useEffect(() => {
    if (!focusLedgerId || focusApplied) return;
    const exists = entries.some((e) => e.id === focusLedgerId);
    if (!exists) return; // esperamos al próximo load
    // Si por alguna razón estamos en simplified, pasamos a ledger
    if (view !== "ledger") setView("ledger");
    setTimeout(() => {
      const el = document.getElementById(`ledger-${focusLedgerId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
    setFocusApplied(true);
  }, [focusLedgerId, focusApplied, entries, view]);

  // -- Actions ------------------------------------------------------------

  const setPaid = useCallback(
    async (id: string, paid: boolean) => {
      setMutatingId(id);
      try {
        const r = await fetch("/api/mining/settlements", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, paid }),
        });
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error || "Failed to update");
        await load();
      } catch (e: any) {
        alert(e?.message || "Unknown error");
      } finally {
        setMutatingId(null);
      }
    },
    [load],
  );

  // Para el "Marcar pagado" del transfer simplificado: saldar el credito hacia
  // el destinatario marcando sus entries unpaid como pagadas hasta cubrir el
  // monto. Cubre el caso simple (una sola entry por destinatario), que es el
  // mas comun. Casos complejos con mezcla parcial los dejamos para despues.
  const markTransferPaid = useCallback(
    async (transfer: SimplifiedTransfer) => {
      if (!confirm(t("confirmMarkTransferPaid", {
        from: transfer.fromDisplayName,
        to: transfer.toDisplayName,
        amount: fmtAuec(transfer.amount),
      }))) return;

      // Buscamos entries unpaid donde to_*== recipient y amount acumulado
      // cubre el monto del transfer. Es un "best effort" — si el split no
      // matchea 1:1 mostramos advertencia pero igual marcamos.
      const candidates = entries.filter((e) => {
        if (e.paid) return false;
        if (transfer.toUserId) return e.to_user_id === transfer.toUserId;
        return e.to_display_name.toLowerCase() === transfer.toDisplayName.toLowerCase();
      });
      if (candidates.length === 0) {
        alert(t("noCandidateEntries"));
        return;
      }
      // Tomamos entries ordenadas desc hasta cubrir el monto
      candidates.sort((a, b) => Number(b.amount_auec) - Number(a.amount_auec));
      const toClose: string[] = [];
      let remaining = transfer.amount;
      for (const c of candidates) {
        if (remaining <= 0.01) break;
        toClose.push(c.id);
        remaining -= Number(c.amount_auec);
      }
      if (toClose.length === 0) {
        alert(t("noCandidateEntries"));
        return;
      }

      setMutatingId(transfer.toKey + "::" + transfer.fromKey);
      try {
        const r = await fetch("/api/mining/settlements", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: toClose, paid: true }),
        });
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error || "Failed to update");
        await load();
      } catch (e: any) {
        alert(e?.message || "Unknown error");
      } finally {
        setMutatingId(null);
      }
    },
    [entries, load, t],
  );

  // -- Derived ------------------------------------------------------------

  const stats = useMemo(() => {
    const unpaid = entries.filter((e) => !e.paid);
    const paid = entries.filter((e) => e.paid);
    const totalUnpaid = unpaid.reduce((s, e) => s + Number(e.amount_auec || 0), 0);
    const meBalance = simplified
      ? simplified.balances.find((b) => b.userId === currentUserId)?.balance ?? 0
      : 0;
    return {
      entriesCount: entries.length,
      unpaidCount: unpaid.length,
      paidCount: paid.length,
      totalUnpaid,
      meBalance,
    };
  }, [entries, simplified, currentUserId]);

  // -- Render -------------------------------------------------------------

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
            {t("statUnpaid")}:{" "}
            <span className="text-amber-300">{stats.unpaidCount}</span>
          </div>
          <div>
            {t("statTotalUnpaid")}:{" "}
            <span className="text-cyan-300">{fmtAuec(stats.totalUnpaid)} aUEC</span>
          </div>
          {currentUserId && stats.meBalance !== 0 && (
            <div>
              {t("statMeBalance")}:{" "}
              <span className={stats.meBalance > 0 ? "text-emerald-300" : "text-red-300"}>
                {stats.meBalance > 0 ? "+" : ""}
                {fmtAuec(stats.meBalance)} aUEC
              </span>
            </div>
          )}
        </div>
      </div>

      {/* View toggle + filters */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="inline-flex rounded-md overflow-hidden border border-zinc-700/60">
          {(["simplified", "ledger"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-[10px] tracking-[0.1em] uppercase font-bold transition-colors ${
                view === v
                  ? "bg-amber-500 text-zinc-900"
                  : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
              }`}
            >
              {t(`view.${v}`)}
            </button>
          ))}
        </div>

        <div className="inline-flex rounded-md overflow-hidden border border-zinc-700/60">
          {(["unpaid", "paid", "all"] as PaidFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setPaidFilter(f)}
              className={`px-3 py-1.5 text-[10px] tracking-[0.1em] uppercase font-bold transition-colors ${
                paidFilter === f
                  ? "bg-amber-500 text-zinc-900"
                  : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
              }`}
            >
              {t(`filter.${f}`)}
            </button>
          ))}
        </div>

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

      {/* ───── SIMPLIFIED VIEW ───── */}
      {view === "simplified" && simplified && (
        <div className="space-y-4">
          {/* Balances */}
          {simplified.balances.length === 0 ? (
            <div className="text-center py-8 text-zinc-600 text-sm italic">
              {t("emptyBalances")}
            </div>
          ) : (
            <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-4 py-2 bg-zinc-800/40 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40">
                <span>{t("colMember")}</span>
                <span className="text-right">{t("colReceived")}</span>
                <span className="text-right">{t("colOwed")}</span>
                <span className="text-right">{t("colBalance")}</span>
              </div>
              {simplified.balances.map((p) => {
                const isMe = currentUserId && p.userId === currentUserId;
                return (
                  <div
                    key={p.key}
                    className={`grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-4 py-2 border-b border-zinc-800/30 items-center text-sm ${isMe ? "bg-emerald-500/5" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${isMe ? "text-emerald-300" : "text-zinc-200"}`}>
                        {p.displayName}
                      </span>
                      {isMe && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider font-bold">
                          {t("you")}
                        </span>
                      )}
                      {!p.userId && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-zinc-700/30 text-zinc-400 border border-zinc-600/40 uppercase tracking-wider font-bold">
                          {t("guest")}
                        </span>
                      )}
                    </div>
                    <span className="text-right font-mono text-emerald-400/80">
                      {fmtAuec(p.gross)}
                    </span>
                    <span className="text-right font-mono text-red-400/80">
                      −{fmtAuec(p.owed)}
                    </span>
                    <span className={`text-right font-mono font-bold ${
                      p.balance > 0
                        ? "text-emerald-400"
                        : p.balance < 0
                        ? "text-red-400"
                        : "text-zinc-500"
                    }`}>
                      {p.balance > 0 ? "+" : ""}
                      {fmtAuec(p.balance)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Transfers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs tracking-[0.1em] uppercase text-zinc-500 font-bold">
                {t("transfersTitle")}
              </div>
              {simplified.transfers.length > 0 && (
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                  {t("transfersCount", { count: simplified.transfers.length })}
                </div>
              )}
            </div>
            {simplified.transfers.length === 0 ? (
              <div className="text-center py-8 text-zinc-600 text-sm italic">
                {t("emptyTransfers")}
              </div>
            ) : (
              <div className="space-y-1.5">
                {simplified.transfers.map((tr, i) => {
                  const touchesMe =
                    currentUserId &&
                    (tr.fromUserId === currentUserId || tr.toUserId === currentUserId);
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border ${
                        touchesMe
                          ? "bg-emerald-500/5 border-emerald-500/30"
                          : "bg-zinc-900/70 border-zinc-700/60"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`font-bold ${touchesMe && tr.fromUserId === currentUserId ? "text-red-300" : "text-zinc-200"}`}>
                          {tr.fromDisplayName}
                        </span>
                        <span className="text-zinc-500">→</span>
                        <span className={`font-bold ${touchesMe && tr.toUserId === currentUserId ? "text-emerald-300" : "text-zinc-200"}`}>
                          {tr.toDisplayName}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-mono font-bold text-amber-400 text-base">
                            {fmtAuec(tr.amount)}
                          </div>
                          <div className="text-[9px] text-zinc-500 uppercase tracking-wider">aUEC</div>
                        </div>
                        <button
                          onClick={() => markTransferPaid(tr)}
                          disabled={mutatingId?.startsWith(tr.toKey + "::") || false}
                          className="px-3 py-1.5 bg-emerald-500 text-zinc-900 rounded text-[10px] font-bold hover:bg-emerald-400 disabled:opacity-50"
                        >
                          {t("actionMarkPaid")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───── RAW LEDGER VIEW ───── */}
      {view === "ledger" && (
        <div className="space-y-1.5">
          {entries.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 text-sm italic">
              {t("emptyLedger")}
            </div>
          ) : (
            entries.map((e) => {
              const touchesMe =
                currentUserId &&
                (e.from_user_id === currentUserId || e.to_user_id === currentUserId);
              const isFocused = focusLedgerId === e.id;
              return (
                <div
                  key={e.id}
                  id={`ledger-${e.id}`}
                  className={`grid grid-cols-[1fr_auto_1fr_auto_auto] gap-3 px-4 py-2.5 rounded-lg border items-center transition-colors ${
                    isFocused
                      ? "bg-amber-500/10 border-2 border-amber-500/60 ring-2 ring-amber-400/30"
                      : e.paid
                      ? "bg-zinc-900/40 border-zinc-800/60 opacity-60"
                      : touchesMe
                      ? "bg-emerald-500/5 border-emerald-500/30"
                      : "bg-zinc-900/70 border-zinc-700/60"
                  }`}
                >
                  <span className={`text-xs font-bold ${e.paid ? "text-zinc-500 line-through" : "text-zinc-200"}`}>
                    {e.from_display_name}
                  </span>
                  <span className="text-zinc-500 text-xs">→</span>
                  <span className={`text-xs font-bold ${e.paid ? "text-zinc-500 line-through" : "text-zinc-200"}`}>
                    {e.to_display_name}
                  </span>
                  <div className="text-right">
                    <div className={`font-mono font-bold text-sm ${e.paid ? "text-zinc-500" : "text-amber-400"}`}>
                      {fmtAuec(e.amount_auec)}
                    </div>
                    <div className="text-[9px] text-zinc-600">
                      {fmtDate(e.created_at)}
                    </div>
                  </div>
                  {e.paid ? (
                    <button
                      onClick={() => setPaid(e.id, false)}
                      disabled={mutatingId === e.id}
                      className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-bold text-zinc-400 hover:text-red-400 hover:border-red-500/30 disabled:opacity-50"
                      title={t("actionUnmarkPaid")}
                    >
                      {t("paidLabel")}
                    </button>
                  ) : (
                    <button
                      onClick={() => setPaid(e.id, true)}
                      disabled={mutatingId === e.id}
                      className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/50 disabled:opacity-50"
                    >
                      {t("actionMarkPaid")}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
