"use client";

// =============================================================================
// SC LABS — TradeWorkOrderCalculator
//
// Create / edit form for a Trade Work Order:
//   - Route & commodity info (pre-fillable from TradeRoutes)
//   - SCU bought / sold / lost + buy/sell prices
//   - Expenses list (fuel, repairs, ammo, fees, etc.)
//   - Participants list with role + % of profit + individual contribution
//   - Live preview of totals and per-participant payout
//   - Save as draft, start run, or complete run (snapshots payouts)
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useTradeWorkOrderStore,
  TradeWorkOrder,
  TradeWOParticipant,
  TradeWOExpense,
} from "@/store/useTradeWorkOrderStore";

const ROLES = [
  { id: "pilot", label: "Pilot" },
  { id: "escort", label: "Escort" },
  { id: "scout", label: "Scout" },
  { id: "financier", label: "Financier" },
  { id: "mule", label: "Mule" },
  { id: "crew", label: "Crew" },
  { id: "other", label: "Other" },
];

const EXPENSE_TYPES = [
  { id: "fuel", label: "Fuel" },
  { id: "repair", label: "Repair" },
  { id: "ammo", label: "Ammo" },
  { id: "fee", label: "Fee" },
  { id: "insurance", label: "Insurance" },
  { id: "general", label: "General" },
];

function fmt(n: number) {
  return Math.round(n || 0).toLocaleString();
}

function uid() {
  return `tmp-${Math.random().toString(36).slice(2, 10)}`;
}

/** Draft-side participant shape (works for both existing + unsaved rows) */
interface LocalParticipant {
  id: string;           // real uuid when persisted, "tmp-..." when local
  localKey: string;     // stable react key
  user_id: string | null;
  display_name: string;
  role: string;
  role_pct: number;
  contribution_uec: number;
  contribution_note: string | null;
  payout_uec: number;
  paid: boolean;
  isNew: boolean;
  dirty: boolean;
}

interface LocalExpense {
  id: string;
  localKey: string;
  payer_name: string;
  description: string;
  amount: number;
  expense_type: string;
  isNew: boolean;
}

export default function TradeWorkOrderCalculator() {
  const editingId = useTradeWorkOrderStore((s) => s.editingId);
  const consumePrefill = useTradeWorkOrderStore((s) => s.consumePrefill);
  const backToList = useTradeWorkOrderStore((s) => s.backToList);
  const openEdit = useTradeWorkOrderStore((s) => s.openEdit);

  // Header / main fields
  const [title, setTitle] = useState("Trade Run");
  const [status, setStatus] = useState<TradeWorkOrder["status"]>("draft");
  const [partyId, setPartyId] = useState<string>("");
  const [commodityCode, setCommodityCode] = useState("");
  const [commodityName, setCommodityName] = useState("");
  const [buyStation, setBuyStation] = useState("");
  const [buySystem, setBuySystem] = useState("");
  const [sellStation, setSellStation] = useState("");
  const [sellSystem, setSellSystem] = useState("");

  // Numbers
  const [scuBought, setScuBought] = useState(0);
  const [scuSold, setScuSold] = useState(0);
  const [scuLost, setScuLost] = useState(0);
  const [buyPrice, setBuyPrice] = useState(0);
  const [sellPrice, setSellPrice] = useState(0);

  const [notes, setNotes] = useState("");

  // Participants + expenses (locally editable)
  const [participants, setParticipants] = useState<LocalParticipant[]>([]);
  const [expenses, setExpenses] = useState<LocalExpense[]>([]);

  // Flow state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverId, setServerId] = useState<string | null>(null);

  // ── Load existing (edit) or prefill (new from route) ──
  useEffect(() => {
    if (!editingId) {
      const p = consumePrefill();
      if (p) {
        if (p.commodity_code) setCommodityCode(p.commodity_code);
        if (p.commodity_name) setCommodityName(p.commodity_name);
        if (p.buy_station) setBuyStation(p.buy_station);
        if (p.buy_system) setBuySystem(p.buy_system);
        if (p.sell_station) setSellStation(p.sell_station);
        if (p.sell_system) setSellSystem(p.sell_system);
        if (p.buy_price_per_scu) setBuyPrice(p.buy_price_per_scu);
        if (p.sell_price_per_scu) setSellPrice(p.sell_price_per_scu);
        if (p.scu_bought) {
          setScuBought(p.scu_bought);
          setScuSold(p.scu_bought); // assume planning to sell full load
        }
        if (p.commodity_name) setTitle(`Run — ${p.commodity_name}`);
      }
      return;
    }
    // Edit mode
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/trade/work-orders/${editingId}`);
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const { data } = await res.json();
        hydrateFromServer(data);
        setServerId(data.id);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  function hydrateFromServer(data: TradeWorkOrder) {
    setTitle(data.title || "Trade Run");
    setStatus(data.status);
    setPartyId(data.party_id || "");
    setCommodityCode(data.commodity_code || "");
    setCommodityName(data.commodity_name || "");
    setBuyStation(data.buy_station || "");
    setBuySystem(data.buy_system || "");
    setSellStation(data.sell_station || "");
    setSellSystem(data.sell_system || "");
    setScuBought(data.scu_bought || 0);
    setScuSold(data.scu_sold || 0);
    setScuLost(data.scu_lost || 0);
    setBuyPrice(data.buy_price_per_scu || 0);
    setSellPrice(data.sell_price_per_scu || 0);
    setNotes(data.notes || "");
    setParticipants(
      (data.trade_wo_participants || []).map((p: TradeWOParticipant) => ({
        id: p.id,
        localKey: p.id,
        user_id: p.user_id,
        display_name: p.display_name,
        role: p.role,
        role_pct: Number(p.role_pct) || 0,
        contribution_uec: Number(p.contribution_uec) || 0,
        contribution_note: p.contribution_note,
        payout_uec: Number(p.payout_uec) || 0,
        paid: p.paid,
        isNew: false,
        dirty: false,
      })),
    );
    setExpenses(
      (data.trade_wo_expenses || []).map((e: TradeWOExpense) => ({
        id: e.id,
        localKey: e.id,
        payer_name: e.payer_name,
        description: e.description,
        amount: Number(e.amount) || 0,
        expense_type: e.expense_type,
        isNew: false,
      })),
    );
  }

  // ── Live totals ──
  const totals = useMemo(() => {
    const total_buy = scuBought * buyPrice;
    const total_sell = scuSold * sellPrice;
    const total_expenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const net_profit = total_sell - total_buy - total_expenses;
    const total_contrib = participants.reduce(
      (s, p) => s + (p.contribution_uec || 0),
      0,
    );
    const pct_sum = participants.reduce((s, p) => s + (p.role_pct || 0), 0);
    return { total_buy, total_sell, total_expenses, net_profit, total_contrib, pct_sum };
  }, [scuBought, scuSold, buyPrice, sellPrice, expenses, participants]);

  // Preview per-participant payout
  const payouts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of participants) {
      const share = (totals.net_profit * (p.role_pct || 0)) / 100;
      out[p.localKey] = (p.contribution_uec || 0) + share;
    }
    return out;
  }, [participants, totals.net_profit]);

  // ── Mutations on locals ──
  function addParticipant() {
    setParticipants((ps) => [
      ...ps,
      {
        id: uid(),
        localKey: uid(),
        user_id: null,
        display_name: "",
        role: "crew",
        role_pct: 0,
        contribution_uec: 0,
        contribution_note: null,
        payout_uec: 0,
        paid: false,
        isNew: true,
        dirty: true,
      },
    ]);
  }

  function updateParticipant(localKey: string, patch: Partial<LocalParticipant>) {
    setParticipants((ps) =>
      ps.map((p) => (p.localKey === localKey ? { ...p, ...patch, dirty: true } : p)),
    );
  }

  function removeParticipant(localKey: string) {
    setParticipants((ps) => ps.filter((p) => p.localKey !== localKey));
  }

  function equalizePct() {
    if (participants.length === 0) return;
    const each = Math.floor((100 / participants.length) * 100) / 100;
    const last = Math.round((100 - each * (participants.length - 1)) * 100) / 100;
    setParticipants((ps) =>
      ps.map((p, i) => ({
        ...p,
        role_pct: i === ps.length - 1 ? last : each,
        dirty: true,
      })),
    );
  }

  function addExpense() {
    setExpenses((es) => [
      ...es,
      {
        id: uid(),
        localKey: uid(),
        payer_name: "",
        description: "",
        amount: 0,
        expense_type: "general",
        isNew: true,
      },
    ]);
  }

  function updateExpense(localKey: string, patch: Partial<LocalExpense>) {
    setExpenses((es) =>
      es.map((e) => (e.localKey === localKey ? { ...e, ...patch } : e)),
    );
  }

  function removeExpense(localKey: string) {
    setExpenses((es) => es.filter((e) => e.localKey !== localKey));
  }

  // ── Save flow ──
  const saveAll = useCallback(
    async (targetStatus?: TradeWorkOrder["status"]) => {
      setSaving(true);
      setError(null);
      try {
        const body = {
          title,
          status: targetStatus || status,
          party_id: partyId || null,
          commodity_code: commodityCode || null,
          commodity_name: commodityName || null,
          buy_station: buyStation || null,
          buy_system: buySystem || null,
          sell_station: sellStation || null,
          sell_system: sellSystem || null,
          scu_bought: scuBought,
          scu_sold: scuSold,
          scu_lost: scuLost,
          buy_price_per_scu: buyPrice,
          sell_price_per_scu: sellPrice,
          notes: notes || null,
        };

        let woId = serverId;

        // 1) Create or update the core row
        if (!woId) {
          // First save — include initial participants + expenses in one POST
          const res = await fetch("/api/trade/work-orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...body,
              participants: participants.map((p) => ({
                user_id: p.user_id,
                display_name: p.display_name,
                role: p.role,
                role_pct: p.role_pct,
                contribution_uec: p.contribution_uec,
                contribution_note: p.contribution_note,
              })),
              expenses: expenses.map((e) => ({
                payer_name: e.payer_name,
                description: e.description,
                amount: e.amount,
                expense_type: e.expense_type,
              })),
            }),
          });
          if (!res.ok) throw new Error(`POST failed (${res.status})`);
          const { data } = await res.json();
          woId = data.id;
          setServerId(data.id);
          hydrateFromServer(data);

          // If user asked to complete on first save, do a follow-up PATCH
          if (targetStatus === "completed") {
            const r2 = await fetch(`/api/trade/work-orders/${data.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "completed" }),
            });
            if (r2.ok) {
              const { data: d2 } = await r2.json();
              hydrateFromServer(d2);
            }
          }
          // Route to edit mode so the store knows we're editing this id
          if (woId) openEdit(woId);
          return;
        }

        // 2) Patch core
        const r1 = await fetch(`/api/trade/work-orders/${woId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r1.ok) throw new Error(`PATCH failed (${r1.status})`);

        // 3) Sync participants (create new, patch dirty)
        for (const p of participants) {
          if (p.isNew) {
            const r = await fetch(`/api/trade/work-orders/${woId}/participants`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                user_id: p.user_id,
                display_name: p.display_name,
                role: p.role,
                role_pct: p.role_pct,
                contribution_uec: p.contribution_uec,
                contribution_note: p.contribution_note,
              }),
            });
            if (!r.ok) throw new Error("Failed to add participant");
          } else if (p.dirty) {
            await fetch(`/api/trade/work-orders/${woId}/participants`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: p.id,
                display_name: p.display_name,
                role: p.role,
                role_pct: p.role_pct,
                contribution_uec: p.contribution_uec,
                contribution_note: p.contribution_note,
                paid: p.paid,
              }),
            });
          }
        }

        // 4) Sync expenses (new ones)
        for (const e of expenses) {
          if (e.isNew) {
            const r = await fetch(`/api/trade/work-orders/${woId}/expenses`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                payer_name: e.payer_name,
                description: e.description,
                amount: e.amount,
                expense_type: e.expense_type,
              }),
            });
            if (!r.ok) throw new Error("Failed to add expense");
          }
        }

        // 5) Status transition (if requested)
        if (targetStatus && targetStatus !== status) {
          const r = await fetch(`/api/trade/work-orders/${woId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: targetStatus }),
          });
          if (!r.ok) throw new Error("Failed to update status");
        }

        // 6) Refresh
        const rf = await fetch(`/api/trade/work-orders/${woId}`);
        if (rf.ok) {
          const { data } = await rf.json();
          hydrateFromServer(data);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      title, status, partyId, commodityCode, commodityName,
      buyStation, buySystem, sellStation, sellSystem,
      scuBought, scuSold, scuLost, buyPrice, sellPrice,
      notes, participants, expenses, serverId,
    ],
  );

  async function deleteOrder() {
    if (!serverId) {
      backToList();
      return;
    }
    if (!confirm("¿Eliminar este Work Order? No se puede deshacer.")) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/trade/work-orders/${serverId}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("Delete failed");
      backToList();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──
  const inputClass =
    "w-full bg-zinc-800/50 border border-zinc-700/60 rounded-sm px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500/50";
  const labelClass =
    "text-[9px] uppercase tracking-widest text-zinc-500 block mb-1";
  const sectionCard =
    "bg-zinc-900/60 border border-zinc-800/60 rounded-sm p-4";

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-14 bg-zinc-900/40 rounded-sm animate-pulse"
            style={{ animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>
    );
  }

  const pctOk = Math.abs(totals.pct_sum - 100) < 0.01;

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={backToList}
            className="text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
          >
            ← Volver al listado
          </button>
          <div className="text-zinc-700">|</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-transparent text-lg font-mono text-amber-400 border-b border-transparent focus:border-amber-500/40 focus:outline-none px-1"
            placeholder="Trade Run"
          />
          <span
            className={`text-[10px] uppercase tracking-widest px-2 py-0.5 border rounded-sm ${
              status === "completed"
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                : status === "in_progress"
                  ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                  : "bg-zinc-700/30 text-zinc-300 border-zinc-600/40"
            }`}
          >
            {status}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {serverId && (
            <button
              onClick={deleteOrder}
              disabled={saving}
              className="px-3 py-1.5 text-[10px] uppercase tracking-widest bg-red-950/30 hover:bg-red-900/40 border border-red-800/40 rounded-sm text-red-400 transition-colors"
            >
              Eliminar
            </button>
          )}
          <button
            onClick={() => saveAll()}
            disabled={saving}
            className="px-3 py-1.5 text-[10px] uppercase tracking-widest bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/60 rounded-sm text-zinc-300 transition-colors"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
          {status !== "in_progress" && status !== "completed" && (
            <button
              onClick={() => saveAll("in_progress")}
              disabled={saving}
              className="px-3 py-1.5 text-[10px] uppercase tracking-widest bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 rounded-sm text-cyan-300 transition-colors"
            >
              Start Run
            </button>
          )}
          {status !== "completed" && (
            <button
              onClick={() => saveAll("completed")}
              disabled={saving || !pctOk}
              title={!pctOk ? "Los % de roles deben sumar 100" : ""}
              className="px-3 py-1.5 text-[10px] uppercase tracking-widest bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-sm text-emerald-300 transition-colors disabled:opacity-40"
            >
              Complete + Split
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-950/20 border border-red-800/40 rounded-sm text-xs text-red-400">
          {error}
        </div>
      )}

      {/* ── Route / Commodity ── */}
      <div className={sectionCard}>
        <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-3">
          Ruta y mercancía
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className={labelClass}>Commodity</label>
            <input
              value={commodityName}
              onChange={(e) => setCommodityName(e.target.value)}
              className={inputClass}
              placeholder="ej. Agricium"
            />
          </div>
          <div>
            <label className={labelClass}>Código</label>
            <input
              value={commodityCode}
              onChange={(e) => setCommodityCode(e.target.value)}
              className={inputClass}
              placeholder="AGRI"
            />
          </div>
          <div>
            <label className={labelClass}>Party ID (opcional)</label>
            <input
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              className={inputClass}
              placeholder="uuid de party"
            />
          </div>
          <div>
            <label className={labelClass}>Estado</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className={inputClass}
            >
              <option value="draft">draft</option>
              <option value="in_progress">in_progress</option>
              <option value="completed">completed</option>
              <option value="archived">archived</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Origen — Terminal</label>
            <input value={buyStation} onChange={(e) => setBuyStation(e.target.value)} className={inputClass} placeholder="ej. CRU-L1" />
          </div>
          <div>
            <label className={labelClass}>Origen — Sistema</label>
            <input value={buySystem} onChange={(e) => setBuySystem(e.target.value)} className={inputClass} placeholder="Stanton" />
          </div>
          <div>
            <label className={labelClass}>Destino — Terminal</label>
            <input value={sellStation} onChange={(e) => setSellStation(e.target.value)} className={inputClass} placeholder="ej. Area18" />
          </div>
          <div>
            <label className={labelClass}>Destino — Sistema</label>
            <input value={sellSystem} onChange={(e) => setSellSystem(e.target.value)} className={inputClass} placeholder="Stanton" />
          </div>
        </div>
      </div>

      {/* ── Cargo + precios ── */}
      <div className={sectionCard}>
        <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-3">
          Cargo y precios
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className={labelClass}>SCU comprado</label>
            <input type="number" min={0} value={scuBought || ""} onChange={(e) => setScuBought(parseFloat(e.target.value) || 0)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>SCU vendido</label>
            <input type="number" min={0} value={scuSold || ""} onChange={(e) => setScuSold(parseFloat(e.target.value) || 0)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>SCU perdido</label>
            <input type="number" min={0} value={scuLost || ""} onChange={(e) => setScuLost(parseFloat(e.target.value) || 0)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Precio compra (UEC/SCU)</label>
            <input type="number" min={0} value={buyPrice || ""} onChange={(e) => setBuyPrice(parseFloat(e.target.value) || 0)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Precio venta (UEC/SCU)</label>
            <input type="number" min={0} value={sellPrice || ""} onChange={(e) => setSellPrice(parseFloat(e.target.value) || 0)} className={inputClass} />
          </div>
        </div>

        {/* Totals strip */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat label="Inversión" value={`${fmt(totals.total_buy)} aUEC`} color="text-zinc-200" />
          <MiniStat label="Venta" value={`${fmt(totals.total_sell)} aUEC`} color="text-cyan-300" />
          <MiniStat label="Gastos" value={`${fmt(totals.total_expenses)} aUEC`} color="text-amber-300" />
          <MiniStat
            label="Profit neto"
            value={`${fmt(totals.net_profit)} aUEC`}
            color={totals.net_profit >= 0 ? "text-emerald-400" : "text-red-400"}
          />
        </div>
      </div>

      {/* ── Expenses ── */}
      <div className={sectionCard}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">
            Gastos generales
          </div>
          <button
            onClick={addExpense}
            className="text-[10px] uppercase tracking-widest px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-sm text-amber-300"
          >
            + Gasto
          </button>
        </div>

        {expenses.length === 0 ? (
          <div className="text-[11px] text-zinc-600">Sin gastos todavía.</div>
        ) : (
          <div className="space-y-2">
            {expenses.map((e) => (
              <div
                key={e.localKey}
                className="grid grid-cols-12 gap-2 items-end"
              >
                <div className="col-span-3">
                  <input value={e.payer_name} onChange={(ev) => updateExpense(e.localKey, { payer_name: ev.target.value })} className={inputClass} placeholder="Pagado por" />
                </div>
                <div className="col-span-4">
                  <input value={e.description} onChange={(ev) => updateExpense(e.localKey, { description: ev.target.value })} className={inputClass} placeholder="Descripción" />
                </div>
                <div className="col-span-2">
                  <input type="number" min={0} value={e.amount || ""} onChange={(ev) => updateExpense(e.localKey, { amount: parseFloat(ev.target.value) || 0 })} className={inputClass} placeholder="aUEC" />
                </div>
                <div className="col-span-2">
                  <select value={e.expense_type} onChange={(ev) => updateExpense(e.localKey, { expense_type: ev.target.value })} className={inputClass}>
                    {EXPENSE_TYPES.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
                  </select>
                </div>
                <div className="col-span-1 text-right">
                  <button onClick={() => removeExpense(e.localKey)} className="text-red-400/70 hover:text-red-300 text-[10px] uppercase">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Participants ── */}
      <div className={sectionCard}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">
            Party & reparto
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-mono ${pctOk ? "text-emerald-400" : totals.pct_sum > 100 ? "text-red-400" : "text-amber-400"}`}
            >
              Σ {totals.pct_sum.toFixed(1)}%
            </span>
            <button
              onClick={equalizePct}
              className="text-[10px] uppercase tracking-widest px-2 py-1 bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/60 rounded-sm text-zinc-300"
            >
              Equalize
            </button>
            <button
              onClick={addParticipant}
              className="text-[10px] uppercase tracking-widest px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-sm text-amber-300"
            >
              + Miembro
            </button>
          </div>
        </div>

        {participants.length === 0 ? (
          <div className="text-[11px] text-zinc-600">
            Corrida solo (vos sos el único participante) — agregá miembros si es una operación de party.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-[9px] uppercase tracking-widest text-zinc-600 px-1">
              <div className="col-span-3">Nombre</div>
              <div className="col-span-2">Rol</div>
              <div className="col-span-1 text-right">%</div>
              <div className="col-span-2 text-right">Aporte (aUEC)</div>
              <div className="col-span-3">Nota aporte</div>
              <div className="col-span-1 text-right">Payout</div>
            </div>

            {participants.map((p) => (
              <div key={p.localKey} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-3">
                  <input value={p.display_name} onChange={(e) => updateParticipant(p.localKey, { display_name: e.target.value })} className={inputClass} placeholder="Nombre" />
                </div>
                <div className="col-span-2">
                  <select value={p.role} onChange={(e) => updateParticipant(p.localKey, { role: e.target.value })} className={inputClass}>
                    {ROLES.map((r) => (<option key={r.id} value={r.id}>{r.label}</option>))}
                  </select>
                </div>
                <div className="col-span-1">
                  <input type="number" min={0} max={100} value={p.role_pct || ""} onChange={(e) => updateParticipant(p.localKey, { role_pct: parseFloat(e.target.value) || 0 })} className={`${inputClass} text-right`} />
                </div>
                <div className="col-span-2">
                  <input type="number" min={0} value={p.contribution_uec || ""} onChange={(e) => updateParticipant(p.localKey, { contribution_uec: parseFloat(e.target.value) || 0 })} className={`${inputClass} text-right`} placeholder="0" />
                </div>
                <div className="col-span-3">
                  <input value={p.contribution_note || ""} onChange={(e) => updateParticipant(p.localKey, { contribution_note: e.target.value })} className={inputClass} placeholder="ej. puso 5M iniciales" />
                </div>
                <div className="col-span-1 text-right font-mono text-xs text-emerald-400">
                  {fmt(payouts[p.localKey] || 0)}
                </div>

                <div className="col-span-12 flex items-center justify-between text-[10px] text-zinc-600 px-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={p.paid}
                      onChange={(e) => updateParticipant(p.localKey, { paid: e.target.checked })}
                      className="accent-emerald-500"
                    />
                    Pagado
                  </label>
                  <button
                    onClick={() => removeParticipant(p.localKey)}
                    className="text-red-400/70 hover:text-red-300 uppercase"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Notas ── */}
      <div className={sectionCard}>
        <label className={labelClass}>Notas</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={`${inputClass} resize-y`}
          placeholder="Detalles de la corrida, rutas alternativas, complicaciones…"
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-zinc-950/60 border border-zinc-800/40 rounded-sm p-2.5">
      <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </div>
      <div className={`text-base font-mono font-bold ${color}`}>{value}</div>
    </div>
  );
}
