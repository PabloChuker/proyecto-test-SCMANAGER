"use client";

// =============================================================================
// SC LABS — CobrarStopModal (Fase D.2)
//
// Modal que se abre cuando el usuario toca "Cobrar" en un stop de la ruta.
// Resuelve quien cobra cuanto y persiste la distribucion via
// POST /api/mining/distributions.
//
// Pasos visibles:
//   1. Resumen del stop (commodities + gross/buy/expenses/net).
//   2. Selector de split_mode (equitable / manual_pct / role_weight).
//   3. Lista combinada de miembros (mining + trade) con preview en aUEC.
//   4. Editor de % cuando split_mode='manual_pct'.
//   5. Confirmacion → POST. Si ya habia una pending para este stop,
//      avisa "se va a recalcular" antes del submit.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  calculateSplit,
  type CalculateSplitInput,
  type MiningMemberInput,
  type SplitMode,
  type TradeParticipantInput,
} from "@/lib/distribution-calc";
import { parseMiningMarker } from "@/lib/miningTradeBridge";
import type { TradeWorkOrder } from "@/store/useTradeWorkOrderStore";

// ── Inputs ─────────────────────────────────────────────────────────────────

export interface CobrarStopContext {
  routeGroupId: string;
  stopIndex: number;       // 1-based — orden visible al usuario
  routeTotalStops: number;
  station: string | null;
  system: string | null;
  workOrders: TradeWorkOrder[];
}

interface Props {
  ctx: CobrarStopContext;
  onClose: () => void;
  onSuccess?: (distributionId: string) => void;
}

// Shape devuelta por el endpoint para el preview y deteccion de "ya existe"
interface ExistingDistribution {
  id: string;
  status: string;
}

// ── Helpers UI ─────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString();
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function detectMiningSessionId(wos: TradeWorkOrder[]): string | null {
  for (const w of wos) {
    const m = parseMiningMarker(w.notes ?? null);
    if (m?.sessionId) return m.sessionId;
  }
  return null;
}

function computeStopTotals(wos: TradeWorkOrder[]) {
  let gross = 0;
  let buy = 0;
  let expenses = 0;
  for (const w of wos) {
    const sell =
      Number((w as any).total_sell) ||
      Number(w.scu_bought || 0) * Number(w.sell_price_per_scu || 0);
    const buyTotal =
      Number((w as any).total_buy) ||
      Number(w.scu_bought || 0) * Number(w.buy_price_per_scu || 0);
    const exp = Number((w as any).total_expenses || 0);
    gross += sell;
    buy += buyTotal;
    expenses += exp;
  }
  gross = round2(gross);
  buy = round2(buy);
  expenses = round2(expenses);
  return { gross, buy, expenses, net: round2(gross - buy - expenses) };
}

// ── Componente ────────────────────────────────────────────────────────────

export default function CobrarStopModal({ ctx, onClose, onSuccess }: Props) {
  const t = useTranslations("Trade.activeRoute.cobrar");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [splitMode, setSplitMode] = useState<SplitMode>("equitable");
  const [miningMembers, setMiningMembers] = useState<MiningMemberInput[]>([]);
  const [tradeParticipants, setTradeParticipants] = useState<
    TradeParticipantInput[]
  >([]);
  const [manualShares, setManualShares] = useState<Record<string, number>>({});
  const [existing, setExisting] = useState<ExistingDistribution | null>(null);

  const miningSessionId = useMemo(
    () => detectMiningSessionId(ctx.workOrders),
    [ctx.workOrders],
  );

  const totals = useMemo(() => computeStopTotals(ctx.workOrders), [ctx.workOrders]);

  // ── Carga inicial: members + participants + check de pending existente ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // 1. Trade participants — agregados de TODAS las WOs del stop
        const allParts: TradeParticipantInput[] = [];
        await Promise.all(
          ctx.workOrders.map(async (w) => {
            try {
              const r = await fetch(
                `/api/trade/work-orders/${encodeURIComponent(w.id)}/participants`,
              );
              if (!r.ok) return;
              const json = await r.json();
              const rows = Array.isArray(json?.data) ? json.data : [];
              for (const p of rows) {
                allParts.push({
                  id: p.id,
                  userId: p.user_id || null,
                  displayName: p.display_name || "Unnamed",
                  avatarUrl: p.avatar_url ?? null,
                  role: (p.role as TradeParticipantInput["role"]) || "crew",
                  rolePct: p.role_pct,
                  contributionUec: p.contribution_uec,
                });
              }
            } catch {
              /* swallow per-WO errors */
            }
          }),
        );

        // 2. Mining members (si tenemos session id)
        let mm: MiningMemberInput[] = [];
        if (miningSessionId) {
          try {
            const r = await fetch(
              `/api/mining/members?session_id=${encodeURIComponent(miningSessionId)}`,
            );
            if (r.ok) {
              const json = await r.json();
              const rows = Array.isArray(json?.data) ? json.data : [];
              mm = rows.map((m: any) => ({
                id: m.id,
                userId: m.user_id || null,
                displayName: m.display_name || "Unnamed",
                avatarUrl: m.avatar_url ?? null,
                role: (m.role as MiningMemberInput["role"]) || "miner",
              }));
            }
          } catch {
            /* swallow — mining members opcional */
          }
        }

        // 3. Existing pending distribution para este stop?
        let existingDist: ExistingDistribution | null = null;
        try {
          const url = `/api/mining/distributions?route_group_id=${encodeURIComponent(
            ctx.routeGroupId,
          )}&status=pending`;
          const r = await fetch(url);
          if (r.ok) {
            const json = await r.json();
            const list = Array.isArray(json?.data) ? json.data : [];
            const match = list.find(
              (d: any) => Number(d.stop_index) === ctx.stopIndex,
            );
            if (match) {
              existingDist = { id: match.id, status: match.status };
              if (match.split_mode) {
                setSplitMode(match.split_mode as SplitMode);
              }
            }
          }
        } catch {
          /* swallow */
        }

        if (cancelled) return;
        setTradeParticipants(allParts);
        setMiningMembers(mm);
        setExisting(existingDist);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "load_failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [ctx.workOrders, ctx.routeGroupId, ctx.stopIndex, miningSessionId]);

  // ── Preview client-side (mismo motor que el server) ────────────────────
  const preview = useMemo(() => {
    const input: CalculateSplitInput = {
      netAuec: totals.net,
      splitMode,
      miningMembers,
      tradeParticipants,
      manualShares: splitMode === "manual_pct" ? manualShares : undefined,
    };
    return calculateSplit(input);
  }, [totals.net, splitMode, miningMembers, tradeParticipants, manualShares]);

  // Cuando se cambia a manual_pct y todavia no hay shares, sembrar con un
  // reparto equitativo para que el usuario tenga de donde ajustar.
  useEffect(() => {
    if (splitMode !== "manual_pct") return;
    if (Object.keys(manualShares).length > 0) return;
    if (preview.rows.length === 0) return;
    const seed: Record<string, number> = {};
    for (const r of preview.rows) seed[r.identityKey] = r.sharePct;
    setManualShares(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitMode]);

  // ── Submit ─────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        route_group_id: ctx.routeGroupId,
        stop_index: ctx.stopIndex,
        route_total_stops: ctx.routeTotalStops,
        mining_session_id: miningSessionId,
        work_order_ids: ctx.workOrders.map((w) => w.id),
        split_mode: splitMode,
        manual_shares: splitMode === "manual_pct" ? manualShares : undefined,
      };
      const res = await fetch("/api/mining/distributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || `HTTP ${res.status}`);
        setSubmitting(false);
        return;
      }
      const id = json?.data?.id as string | undefined;
      if (id && onSuccess) onSuccess(id);
      onClose();
    } catch (e: any) {
      setError(e?.message || "submit_failed");
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  const sumPct = Object.values(manualShares).reduce((a, b) => a + b, 0);
  const pctOk = Math.abs(sumPct - 100) <= 0.5;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-md shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              {t("eyebrow")}
            </div>
            <div className="text-base font-medium text-zinc-100">
              {t("title", { stop: ctx.stopIndex })}
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">
              {ctx.station || t("noStation")}
              {ctx.system ? ` · ${ctx.system}` : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-xl leading-none"
            aria-label="close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {existing && (
            <div className="px-3 py-2 rounded-sm bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
              {t("existingWarning")}
            </div>
          )}

          {/* Stop totals */}
          <div className="grid grid-cols-4 gap-2">
            <Cell label={t("gross")} value={`${fmt(totals.gross)} aUEC`} />
            <Cell label={t("buyCost")} value={`${fmt(totals.buy)} aUEC`} />
            <Cell label={t("expenses")} value={`${fmt(totals.expenses)} aUEC`} />
            <Cell
              label={t("net")}
              value={`${fmt(totals.net)} aUEC`}
              accent="emerald"
            />
          </div>

          {/* Split mode */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
              {t("splitModeLabel")}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(["equitable", "manual_pct", "role_weight"] as SplitMode[]).map(
                (m) => (
                  <button
                    key={m}
                    onClick={() => setSplitMode(m)}
                    className={`px-2.5 py-1.5 border rounded-sm text-xs font-mono ${
                      splitMode === m
                        ? "border-amber-500/60 bg-amber-500/10 text-amber-200"
                        : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    {t(`mode.${m}`)}
                  </button>
                ),
              )}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1.5">
              {t(`modeHint.${splitMode}`)}
            </div>
          </div>

          {/* Members table */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 flex items-center justify-between">
              <span>
                {t("members")} ·{" "}
                <span className="text-zinc-400">{preview.rows.length}</span>
              </span>
              {miningSessionId ? (
                <span className="text-emerald-400/70 normal-case">
                  {t("miningLinked")}
                </span>
              ) : (
                <span className="text-zinc-600 normal-case">{t("noMiningLink")}</span>
              )}
            </div>

            {loading ? (
              <div className="text-xs text-zinc-500">{t("loading")}</div>
            ) : preview.rows.length === 0 ? (
              <div className="text-xs text-zinc-500">{t("noMembers")}</div>
            ) : (
              <div className="border border-zinc-800 rounded-sm divide-y divide-zinc-800/60">
                {preview.rows.map((r) => {
                  const inputVal = manualShares[r.identityKey] ?? r.sharePct;
                  return (
                    <div
                      key={r.identityKey}
                      className="px-3 py-2 flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-200 truncate">
                          {r.displayName}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {r.rolesLabel} · {r.source}
                        </div>
                      </div>
                      {splitMode === "manual_pct" ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={inputVal}
                            onChange={(e) =>
                              setManualShares((prev) => ({
                                ...prev,
                                [r.identityKey]: Math.max(
                                  0,
                                  Math.min(100, Number(e.target.value) || 0),
                                ),
                              }))
                            }
                            className="w-16 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded-sm text-xs font-mono text-right text-zinc-100"
                          />
                          <span className="text-xs text-zinc-500">%</span>
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-400 font-mono w-14 text-right">
                          {r.sharePct.toFixed(1)}%
                        </div>
                      )}
                      <div className="text-sm font-mono text-emerald-300 w-24 text-right">
                        {fmt(r.pendingAuec)} aUEC
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {splitMode === "manual_pct" && preview.rows.length > 0 && (
              <div
                className={`text-[10px] font-mono mt-1.5 ${
                  pctOk ? "text-zinc-500" : "text-amber-400"
                }`}
              >
                {t("sumPct", { value: sumPct.toFixed(1) })}
                {!pctOk && ` · ${t("rescaleWarn")}`}
              </div>
            )}

            {preview.warnings.length > 0 && (
              <ul className="mt-2 space-y-1">
                {preview.warnings.map((w, i) => (
                  <li
                    key={i}
                    className="text-[10px] text-amber-400/80 font-mono"
                  >
                    ⚠ {w}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <div className="px-3 py-2 rounded-sm bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-mono uppercase tracking-widest text-zinc-400 hover:text-zinc-200"
            disabled={submitting}
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || loading || preview.rows.length === 0}
            className="px-4 py-1.5 text-xs font-mono uppercase tracking-widest border rounded-sm bg-amber-500/15 border-amber-500/40 text-amber-200 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting
              ? t("submitting")
              : existing
                ? t("submitRecalc")
                : t("submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helper sub-component ───────────────────────────────────────────────────

function Cell({
  label,
  value,
  accent = "zinc",
}: {
  label: string;
  value: string;
  accent?: "zinc" | "emerald" | "amber";
}) {
  const cls =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "amber"
        ? "text-amber-300"
        : "text-zinc-200";
  return (
    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-sm p-2">
      <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </div>
      <div className={`text-sm font-mono mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}
