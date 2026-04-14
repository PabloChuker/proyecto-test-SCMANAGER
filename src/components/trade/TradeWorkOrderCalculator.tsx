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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useTradeWorkOrderStore,
  TradeWorkOrder,
  TradeWOParticipant,
  TradeWOExpense,
} from "@/store/useTradeWorkOrderStore";
import { createClient } from "@/lib/supabase/client";

// localStorage key for the unsaved new-WO draft. Only used when creating a
// brand-new WO (no `editingId`) — edits of existing server WOs are not cached
// locally since they are already persisted server-side.
const DRAFT_KEY = "sc-labs:trade-wo-draft-v1";

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
  avatar_url: string | null;
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
  /**
   * Reference to the participant that actually paid out-of-pocket for this
   * expense. Stored as the participant's `user_id` when they have one, else
   * we fall back to matching on `payer_name` for ad-hoc (no-account) rows.
   * The Complete + Split modal uses this to refund the payer before the
   * remaining profit gets distributed.
   */
  payer_id: string | null;
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

  // Party-loading UI state
  const [loadingParty, setLoadingParty] = useState(false);
  const [partyMsg, setPartyMsg] = useState<string | null>(null);

  // Complete + Split modal state
  const [showSplitModal, setShowSplitModal] = useState(false);
  type SplitStrategy = "role_pct" | "equal" | "by_aporte";
  const [splitStrategy, setSplitStrategy] = useState<SplitStrategy>("role_pct");
  // When true, the next render will call saveAll("completed"). We use this
  // because we need setParticipants(...) to fully flush before saveAll reads
  // participants from its closure. A useEffect below handles the trigger.
  const [pendingCompleteSave, setPendingCompleteSave] = useState(false);

  // Draft persistence — once the initial mount hydration runs, flip this on
  // so the auto-save effect starts writing to localStorage.
  const hydratedRef = useRef(false);

  // ── Load existing (edit) or prefill (new from route) or restore draft ──
  useEffect(() => {
    if (!editingId) {
      // 1) If a prefill is queued (from a TradeRoutes → WO action), it wins
      //    over whatever is in localStorage (user just explicitly asked for
      //    a fresh run from a specific route).
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
        // Fresh prefill — wipe any stale draft so we don't overlay old data
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
      } else {
        // 2) Otherwise, try to restore an unsaved draft from localStorage
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          if (raw) {
            const d = JSON.parse(raw);
            if (d && typeof d === "object") {
              if (typeof d.title === "string") setTitle(d.title);
              if (typeof d.partyId === "string") setPartyId(d.partyId);
              if (typeof d.commodityCode === "string") setCommodityCode(d.commodityCode);
              if (typeof d.commodityName === "string") setCommodityName(d.commodityName);
              if (typeof d.buyStation === "string") setBuyStation(d.buyStation);
              if (typeof d.buySystem === "string") setBuySystem(d.buySystem);
              if (typeof d.sellStation === "string") setSellStation(d.sellStation);
              if (typeof d.sellSystem === "string") setSellSystem(d.sellSystem);
              if (typeof d.scuBought === "number") setScuBought(d.scuBought);
              if (typeof d.scuSold === "number") setScuSold(d.scuSold);
              if (typeof d.scuLost === "number") setScuLost(d.scuLost);
              if (typeof d.buyPrice === "number") setBuyPrice(d.buyPrice);
              if (typeof d.sellPrice === "number") setSellPrice(d.sellPrice);
              if (typeof d.notes === "string") setNotes(d.notes);
              if (Array.isArray(d.participants)) setParticipants(d.participants);
              if (Array.isArray(d.expenses)) setExpenses(d.expenses);
            }
          }
        } catch {
          /* ignore corrupt draft */
        }
      }
      hydratedRef.current = true;
      return;
    }
    // Edit mode — ignore localStorage draft (edit targets a real server row)
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
        hydratedRef.current = true;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  // Keep a ref with the latest snapshot so we can also flush on unmount /
  // tab close even when the debounced write hasn't fired yet.
  const latestSnapshotRef = useRef<string | null>(null);

  // ── Auto-save unsaved drafts to localStorage (new WOs only) ──
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (editingId) return; // editing an existing server WO — don't touch the draft key
    if (serverId) return;  // already persisted server-side, no need to cache locally

    const snapshot = JSON.stringify({
      title, partyId,
      commodityCode, commodityName,
      buyStation, buySystem, sellStation, sellSystem,
      scuBought, scuSold, scuLost, buyPrice, sellPrice,
      notes, participants, expenses,
    });
    latestSnapshotRef.current = snapshot;

    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, snapshot);
      } catch {
        /* localStorage quota / disabled — ignore */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [
    editingId, serverId,
    title, partyId,
    commodityCode, commodityName,
    buyStation, buySystem, sellStation, sellSystem,
    scuBought, scuSold, scuLost, buyPrice, sellPrice,
    notes, participants, expenses,
  ]);

  // Flush the latest snapshot on unmount and on window beforeunload so we
  // never lose the last few keystrokes when the user switches tab/view or
  // closes the browser tab before the 250ms debounce fires.
  useEffect(() => {
    const flush = () => {
      if (!hydratedRef.current) return;
      if (editingId || serverId) return;
      if (!latestSnapshotRef.current) return;
      try {
        localStorage.setItem(DRAFT_KEY, latestSnapshotRef.current);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [editingId, serverId]);

  // Helper: clear the draft snapshot (call on Save success / Volver / Delete)
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }, []);

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
        avatar_url: p.avatar_url || null,
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
        payer_id: e.payer_id,
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

  // Per-participant refund for expenses they personally paid out-of-pocket.
  // We match on payer_id (preferred, when the payer is a logged-in participant)
  // and fall back to payer_name so ad-hoc rows still line up.
  const expenseRefunds = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of participants) out[p.localKey] = 0;
    for (const e of expenses) {
      const amt = e.amount || 0;
      if (amt <= 0) continue;
      let match: LocalParticipant | undefined;
      if (e.payer_id) {
        match = participants.find((p) => p.user_id && p.user_id === e.payer_id);
      }
      if (!match && e.payer_name) {
        match = participants.find(
          (p) => (p.display_name || "").trim().toLowerCase() === e.payer_name.trim().toLowerCase(),
        );
      }
      if (match) out[match.localKey] = (out[match.localKey] || 0) + amt;
    }
    return out;
  }, [participants, expenses]);

  // Preview per-participant payout:
  //   payout = inversión (contribution_uec)
  //          + reembolso de gastos personales (expenseRefunds)
  //          + profit share (role_pct % of net_profit)
  const payouts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of participants) {
      const share = (totals.net_profit * (p.role_pct || 0)) / 100;
      const refund = expenseRefunds[p.localKey] || 0;
      out[p.localKey] = (p.contribution_uec || 0) + refund + share;
    }
    return out;
  }, [participants, totals.net_profit, expenseRefunds]);

  // ── Mutations on locals ──
  function addParticipant() {
    setParticipants((ps) => [
      ...ps,
      {
        id: uid(),
        localKey: uid(),
        user_id: null,
        display_name: "",
        avatar_url: null,
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

  /**
   * computeSplitPreview
   *
   * Given a strategy, compute the recommended per-participant split for the
   * Complete + Split modal. Each row returns:
   *   - role_pct_preview : % of NET profit assigned (0-100)
   *   - profit_share    : net_profit * role_pct_preview / 100
   *   - expense_refund  : out-of-pocket expenses this person paid (matched by
   *                       payer_id, falling back to payer_name)
   *   - payout          : contribution_uec + expense_refund + profit_share
   *
   * The key insight: inversión (contribution_uec) and expense refunds are
   * RETURNS OF CAPITAL, not profit. They come off the top before we apply the
   * split strategy to the remaining net_profit.
   *
   * Strategies:
   *   role_pct   → use whatever % the user already set; if sum is 0, show
   *                zero profit shares (the UI warns and suggests Equalize).
   *   equal      → divide net_profit in equal shares; last person absorbs
   *                rounding residual.
   *   by_aporte  → divide net_profit proportional to contribution_uec (the
   *                participant's actual investment). Falls back to equal
   *                if total_contrib is 0.
   */
  function computeSplitPreview(strategy: SplitStrategy) {
    const n = participants.length;
    const net = totals.net_profit;
    const totalContrib = totals.total_contrib;
    const rows = participants.map((p, i) => {
      let pct = 0;
      if (strategy === "role_pct") {
        pct = Number(p.role_pct) || 0;
      } else if (strategy === "equal") {
        if (n === 0) pct = 0;
        else if (i === n - 1) {
          // last person absorbs rounding residual
          const each = Math.floor((100 / n) * 100) / 100;
          pct = Math.round((100 - each * (n - 1)) * 100) / 100;
        } else {
          pct = Math.floor((100 / n) * 100) / 100;
        }
      } else if (strategy === "by_aporte") {
        if (totalContrib > 0) {
          pct = ((p.contribution_uec || 0) / totalContrib) * 100;
          pct = Math.round(pct * 100) / 100;
        } else if (n > 0) {
          // fallback: equal
          pct = Math.round((100 / n) * 100) / 100;
        }
      }
      const profit_share = Math.round((net * pct) / 100);
      const expense_refund = Math.round(expenseRefunds[p.localKey] || 0);
      const payout = Math.round(
        (p.contribution_uec || 0) + expense_refund + profit_share,
      );
      return {
        localKey: p.localKey,
        id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        contribution_uec: p.contribution_uec || 0,
        role: p.role,
        role_pct_preview: pct,
        profit_share,
        expense_refund,
        payout,
      };
    });
    // Patch: ensure sum(pct) == 100 for equal/by_aporte by adjusting last row
    if ((strategy === "equal" || strategy === "by_aporte") && rows.length > 0) {
      const sum = rows.reduce((s, r) => s + r.role_pct_preview, 0);
      const diff = Math.round((100 - sum) * 100) / 100;
      if (Math.abs(diff) > 0.001) {
        rows[rows.length - 1].role_pct_preview = Math.round(
          (rows[rows.length - 1].role_pct_preview + diff) * 100,
        ) / 100;
        // recompute last row's shares
        const last = rows[rows.length - 1];
        last.profit_share = Math.round((net * last.role_pct_preview) / 100);
        last.payout = Math.round(
          (last.contribution_uec || 0) + last.expense_refund + last.profit_share,
        );
      }
    }
    return rows;
  }

  /**
   * Apply the split preview to the local participants and trigger a save
   * that also transitions status → "completed". We set `pendingCompleteSave`
   * so that a useEffect fires saveAll("completed") on the NEXT render once
   * participants state has flushed (and saveAll's useCallback has been
   * rebuilt with the fresh closure).
   */
  function applySplitAndComplete() {
    const rows = computeSplitPreview(splitStrategy);
    const byKey = new Map(rows.map((r) => [r.localKey, r]));
    setParticipants((ps) =>
      ps.map((p) => {
        const r = byKey.get(p.localKey);
        if (!r) return p;
        return {
          ...p,
          role_pct: r.role_pct_preview,
          payout_uec: r.payout,
          dirty: true,
        };
      }),
    );
    setShowSplitModal(false);
    setPendingCompleteSave(true);
  }

  // ── Load participants from the user's active party ──
  // Queries party_members → parties → profiles, then merges any members not
  // already in the local list. Keeps existing rows untouched so manual edits
  // survive. Also stamps `partyId` so the WO links back to the party row.
  async function loadFromParty() {
    setLoadingParty(true);
    setPartyMsg(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be logged in");

      const { data: memberships, error: mErr } = await supabase
        .from("party_members")
        .select("party_id")
        .eq("user_id", user.id)
        .limit(1);
      if (mErr) throw mErr;
      if (!memberships || memberships.length === 0) {
        setPartyMsg("You're not in any party. Create one in /party first.");
        return;
      }
      const pid = memberships[0].party_id;

      const { data: members, error: memErr } = await supabase
        .from("party_members")
        .select("user_id, role")
        .eq("party_id", pid);
      if (memErr) throw memErr;
      if (!members || members.length === 0) {
        setPartyMsg("The party is empty.");
        return;
      }

      const ids = members.map((m) => m.user_id);
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", ids);
      if (pErr) throw pErr;

      const profileMap = new Map<
        string,
        { display_name?: string; username?: string; avatar_url?: string | null }
      >();
      (profiles ?? []).forEach((pf: any) => profileMap.set(pf.id, pf));

      setPartyId(pid);

      // Merge: skip users that are already in the local list (by user_id)
      setParticipants((prev) => {
        const existing = new Set(prev.map((p) => p.user_id).filter(Boolean));
        const toAdd: LocalParticipant[] = [];
        for (const m of members) {
          if (existing.has(m.user_id)) continue;
          const pf = profileMap.get(m.user_id) || {};
          const name = pf.display_name || pf.username || "Jugador";
          toAdd.push({
            id: uid(),
            localKey: uid(),
            user_id: m.user_id,
            display_name: name,
            avatar_url: pf.avatar_url || null,
            role: m.role === "leader" ? "pilot" : "crew",
            role_pct: 0,
            contribution_uec: 0,
            contribution_note: null,
            payout_uec: 0,
            paid: false,
            isNew: true,
            dirty: true,
          });
        }
        return [...prev, ...toAdd];
      });

      setPartyMsg(`${members.length} miembro${members.length === 1 ? "" : "s"} cargado${members.length === 1 ? "" : "s"} desde la party.`);
    } catch (e: any) {
      setPartyMsg(e.message || "No se pudo cargar la party.");
    } finally {
      setLoadingParty(false);
    }
  }

  function addExpense() {
    setExpenses((es) => [
      ...es,
      {
        id: uid(),
        localKey: uid(),
        payer_id: null,
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
                avatar_url: p.avatar_url,
                role: p.role,
                role_pct: p.role_pct,
                contribution_uec: p.contribution_uec,
                contribution_note: p.contribution_note,
                payout_uec: p.payout_uec,
              })),
              expenses: expenses.map((e) => ({
                payer_id: e.payer_id,
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
          clearDraft(); // first save succeeded — drop the cached draft

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
                avatar_url: p.avatar_url,
                role: p.role,
                role_pct: p.role_pct,
                contribution_uec: p.contribution_uec,
                contribution_note: p.contribution_note,
                payout_uec: p.payout_uec,
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
                avatar_url: p.avatar_url,
                role: p.role,
                role_pct: p.role_pct,
                contribution_uec: p.contribution_uec,
                contribution_note: p.contribution_note,
                payout_uec: p.payout_uec,
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
                payer_id: e.payer_id,
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

  // Fires saveAll("completed") on the render AFTER applySplitAndComplete
  // mutated participants, so saveAll's closure sees the fresh role_pct/payout.
  useEffect(() => {
    if (!pendingCompleteSave) return;
    setPendingCompleteSave(false);
    saveAll("completed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCompleteSave, saveAll]);

  async function deleteOrder() {
    if (!serverId) {
      backToList();
      return;
    }
    if (!confirm("Delete this Work Order? This cannot be undone.")) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/trade/work-orders/${serverId}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("Delete failed");
      clearDraft();
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
              Delete
            </button>
          )}
          <button
            onClick={() => saveAll()}
            disabled={saving}
            className="px-3 py-1.5 text-[10px] uppercase tracking-widest bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/60 rounded-sm text-zinc-300 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
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
              onClick={() => {
                // Open the split modal with a sensible default strategy:
                //   - If the user already set some %, prefer role_pct
                //   - If % are all 0 but aportes exist, suggest by_aporte
                //   - Otherwise, equal split
                if (totals.pct_sum > 0) {
                  setSplitStrategy("role_pct");
                } else if (totals.total_contrib > 0) {
                  setSplitStrategy("by_aporte");
                } else {
                  setSplitStrategy("equal");
                }
                setShowSplitModal(true);
              }}
              disabled={saving || participants.length === 0}
              title={participants.length === 0 ? "Add at least one participant" : ""}
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
          Route and cargo
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
          <MiniStat label="Investment" value={`${fmt(totals.total_buy)} aUEC`} color="text-zinc-200" />
          <MiniStat label="Sale" value={`${fmt(totals.total_sell)} aUEC`} color="text-cyan-300" />
          <MiniStat label="Expenses" value={`${fmt(totals.total_expenses)} aUEC`} color="text-amber-300" />
          <MiniStat
            label="Net profit"
            value={`${fmt(totals.net_profit)} aUEC`}
            color={totals.net_profit >= 0 ? "text-emerald-400" : "text-red-400"}
          />
        </div>
      </div>

      {/* ── Expenses ── */}
      <div className={sectionCard}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">
            General expenses
          </div>
          <button
            onClick={addExpense}
            className="text-[10px] uppercase tracking-widest px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-sm text-amber-300"
          >
            + Expense
          </button>
        </div>

        {expenses.length === 0 ? (
          <div className="text-[11px] text-zinc-600">No expenses yet.</div>
        ) : (
          <div className="space-y-2">
            {expenses.map((e) => {
              // Does the current payer reference a known participant?
              const matchedParticipant = participants.find((p) => {
                if (e.payer_id && p.user_id && e.payer_id === p.user_id) return true;
                if (!e.payer_id && e.payer_name && p.display_name === e.payer_name) return true;
                return false;
              });
              // Selector value: participant localKey if matched, "__other__" when
              // free-text is active, "" when unset.
              const selectorValue = matchedParticipant
                ? matchedParticipant.localKey
                : e.payer_name
                  ? "__other__"
                  : "";
              return (
                <div
                  key={e.localKey}
                  className="grid grid-cols-12 gap-2 items-end"
                >
                  <div className="col-span-3">
                    <select
                      value={selectorValue}
                      onChange={(ev) => {
                        const v = ev.target.value;
                        if (v === "") {
                          updateExpense(e.localKey, { payer_id: null, payer_name: "" });
                        } else if (v === "__other__") {
                          // Switch to free-text mode; keep any existing name, else blank
                          updateExpense(e.localKey, {
                            payer_id: null,
                            payer_name: e.payer_name && !matchedParticipant ? e.payer_name : "",
                          });
                        } else {
                          const picked = participants.find((p) => p.localKey === v);
                          if (picked) {
                            updateExpense(e.localKey, {
                              payer_id: picked.user_id,
                              payer_name: picked.display_name || "Unnamed",
                            });
                          }
                        }
                      }}
                      className={inputClass}
                      title="Pagado por"
                    >
                      <option value="">— Pagado por —</option>
                      {participants.map((p) => (
                        <option key={p.localKey} value={p.localKey}>
                          {p.display_name || "Unnamed"}
                        </option>
                      ))}
                      <option value="__other__">Otro (escribir)…</option>
                    </select>
                    {selectorValue === "__other__" && (
                      <input
                        value={e.payer_name}
                        onChange={(ev) =>
                          updateExpense(e.localKey, { payer_id: null, payer_name: ev.target.value })
                        }
                        className={`${inputClass} mt-1`}
                        placeholder="Nombre libre"
                      />
                    )}
                  </div>
                  <div className="col-span-4">
                    <input value={e.description} onChange={(ev) => updateExpense(e.localKey, { description: ev.target.value })} className={inputClass} placeholder="Description" />
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
              );
            })}
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
              onClick={loadFromParty}
              disabled={loadingParty}
              title="Add all members from your current party"
              className="text-[10px] uppercase tracking-widest px-2.5 py-1 bg-cyan-500/15 hover:bg-cyan-500/25 disabled:opacity-50 border border-cyan-500/30 rounded-sm text-cyan-300"
            >
              {loadingParty ? "Loading…" : "⇪ Load Party"}
            </button>
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
              + Member
            </button>
          </div>
        </div>

        {partyMsg && (
          <div className="mb-3 text-[10px] font-mono text-cyan-400/80 bg-cyan-500/5 border border-cyan-500/20 rounded-sm px-3 py-1.5">
            {partyMsg}
          </div>
        )}

        {participants.length === 0 ? (
          <div className="text-[11px] text-zinc-600">
            Solo run (you are the only participant) — add members if this is a party operation.
          </div>
        ) : (
          <div className="space-y-2">
            {/* Inversión vs total_buy validation bar */}
            {(() => {
              const buy = totals.total_buy;
              const contrib = totals.total_contrib;
              if (buy <= 0 && contrib <= 0) return null;
              const diff = Math.round((contrib - buy) * 100) / 100;
              const ok = Math.abs(diff) < 0.5;
              const under = diff < 0;
              return (
                <div
                  className={`flex items-center justify-between text-[10px] font-mono rounded-sm border px-3 py-1.5 ${
                    ok
                      ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-300"
                      : under
                        ? "bg-amber-500/5 border-amber-500/30 text-amber-300"
                        : "bg-red-500/5 border-red-500/30 text-red-300"
                  }`}
                  title="The sum of investments should equal the total purchase."
                >
                  <span>
                    Investment covered: {fmt(contrib)} / {fmt(buy)} aUEC
                  </span>
                  <span>
                    {ok
                      ? "✓ cuadra"
                      : under
                        ? `falta ${fmt(Math.abs(diff))} aUEC`
                        : `excede ${fmt(diff)} aUEC`}
                  </span>
                </div>
              );
            })()}

            <div className="grid grid-cols-12 gap-2 text-[9px] uppercase tracking-widest text-zinc-600 px-1">
              <div className="col-span-3">Name</div>
              <div className="col-span-2">Role</div>
              <div className="col-span-1 text-right">%</div>
              <div className="col-span-2 text-right">Investment (aUEC)</div>
              <div className="col-span-3">Investment note</div>
              <div className="col-span-1 text-right">Payout</div>
            </div>

            {participants.map((p) => (
              <div key={p.localKey} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-3 flex items-center gap-2">
                  {p.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.avatar_url}
                      alt=""
                      className="w-7 h-7 rounded-full shrink-0 border border-zinc-700/60 object-cover bg-zinc-900"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full shrink-0 border border-zinc-700/60 bg-zinc-800/80 flex items-center justify-center text-[10px] font-mono text-zinc-500">
                      {(p.display_name || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
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

      {/* ── Complete + Split modal ── */}
      {showSplitModal && (() => {
        const rows = computeSplitPreview(splitStrategy);
        const payoutTotal = rows.reduce((s, r) => s + r.payout, 0);
        const profitShareTotal = rows.reduce((s, r) => s + r.profit_share, 0);
        const refundTotal = rows.reduce((s, r) => s + r.expense_refund, 0);
        const pctSum = rows.reduce((s, r) => s + r.role_pct_preview, 0);
        const unassignedPct = splitStrategy === "role_pct" && Math.abs(pctSum) < 0.001;

        return (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowSplitModal(false)}
          >
            <div
              className="bg-zinc-950 border border-emerald-500/30 rounded-sm w-full max-w-4xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-zinc-800/60">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-emerald-400">
                    Reparto final
                  </div>
                  <div className="text-lg font-mono text-zinc-100 mt-0.5">
                    Complete + Split
                  </div>
                </div>
                <button
                  onClick={() => setShowSplitModal(false)}
                  className="text-zinc-500 hover:text-zinc-300 text-xl leading-none"
                >
                  ×
                </button>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-3 p-4 border-b border-zinc-800/60">
                <MiniStat
                  label="Total investment"
                  value={`${fmt(totals.total_buy)} aUEC`}
                  color="text-zinc-200"
                />
                <MiniStat
                  label="Expenses"
                  value={`${fmt(totals.total_expenses)} aUEC`}
                  color="text-amber-300"
                />
                <MiniStat
                  label="Net profit"
                  value={`${fmt(totals.net_profit)} aUEC`}
                  color={totals.net_profit >= 0 ? "text-emerald-400" : "text-red-400"}
                />
              </div>

              {/* Strategy selector */}
              <div className="p-4 border-b border-zinc-800/60">
                <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-2">
                  Estrategia de reparto
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: "role_pct", label: "Por % asignado", hint: "Usa los % que ya configuraste" },
                      { id: "equal", label: "Partes iguales", hint: "Profit dividido en partes iguales" },
                      { id: "by_aporte", label: "Por aporte", hint: "Profit proporcional a lo que cada uno puso" },
                    ] as { id: SplitStrategy; label: string; hint: string }[]
                  ).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSplitStrategy(s.id)}
                      title={s.hint}
                      className={`px-3 py-1.5 text-[10px] uppercase tracking-widest border rounded-sm transition-colors ${
                        splitStrategy === s.id
                          ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                          : "bg-zinc-900/60 border-zinc-700/50 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {unassignedPct && (
                  <div className="mt-3 p-2 bg-amber-950/30 border border-amber-800/40 rounded-sm text-[11px] text-amber-300">
                    ⚠ All percentages are at 0. Switch to "Equal shares" or "By contribution",
                    or close the modal and click <span className="font-mono">Equalize</span> first.
                  </div>
                )}
              </div>

              {/* Per-participant breakdown */}
              <div className="p-4">
                <div className="grid grid-cols-12 gap-2 text-[9px] uppercase tracking-widest text-zinc-500 mb-2 px-1">
                  <div className="col-span-3">Participant</div>
                  <div className="col-span-2 text-right">Investment</div>
                  <div className="col-span-2 text-right">Expense refund</div>
                  <div className="col-span-1 text-right">%</div>
                  <div className="col-span-2 text-right">Profit share</div>
                  <div className="col-span-2 text-right">Transfer</div>
                </div>
                <div className="space-y-1.5">
                  {rows.map((r) => (
                    <div
                      key={r.localKey}
                      className="grid grid-cols-12 gap-2 items-center px-2 py-2 bg-zinc-900/40 border border-zinc-800/50 rounded-sm text-xs"
                    >
                      <div className="col-span-3 flex items-center gap-2 min-w-0">
                        {r.avatar_url ? (
                          <img
                            src={r.avatar_url}
                            alt=""
                            className="w-7 h-7 rounded-full shrink-0 border border-zinc-700/60 object-cover bg-zinc-900"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full shrink-0 border border-zinc-700/60 bg-zinc-800/80 flex items-center justify-center text-[10px] font-mono text-zinc-500">
                            {(r.display_name || "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-zinc-100">{r.display_name || "—"}</div>
                          <div className="text-[9px] uppercase tracking-widest text-zinc-500">
                            {r.role}
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2 text-right font-mono text-zinc-300">
                        {fmt(r.contribution_uec)}
                      </div>
                      <div
                        className={`col-span-2 text-right font-mono ${
                          r.expense_refund > 0 ? "text-cyan-300" : "text-zinc-600"
                        }`}
                      >
                        {r.expense_refund > 0 ? `+${fmt(r.expense_refund)}` : "—"}
                      </div>
                      <div className="col-span-1 text-right font-mono text-zinc-400">
                        {r.role_pct_preview.toFixed(1)}
                      </div>
                      <div
                        className={`col-span-2 text-right font-mono ${
                          r.profit_share >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {r.profit_share >= 0 ? "+" : ""}
                        {fmt(r.profit_share)}
                      </div>
                      <div className="col-span-2 text-right font-mono font-bold text-emerald-300">
                        {fmt(r.payout)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals row */}
                <div className="grid grid-cols-12 gap-2 items-center px-2 py-2 mt-2 border-t border-zinc-800/60 text-xs">
                  <div className="col-span-3 text-[10px] uppercase tracking-widest text-zinc-500">
                    Totales
                  </div>
                  <div className="col-span-2 text-right font-mono text-zinc-400">
                    {fmt(totals.total_contrib)}
                  </div>
                  <div className="col-span-2 text-right font-mono text-cyan-400">
                    {fmt(refundTotal)}
                  </div>
                  <div className="col-span-1 text-right font-mono text-zinc-500">
                    {pctSum.toFixed(1)}
                  </div>
                  <div className="col-span-2 text-right font-mono text-emerald-400">
                    {fmt(profitShareTotal)}
                  </div>
                  <div className="col-span-2 text-right font-mono font-bold text-emerald-300">
                    {fmt(payoutTotal)}
                  </div>
                </div>

                {/* Helper legend */}
                <div className="mt-3 text-[10px] text-zinc-500 leading-relaxed">
                  <span className="text-zinc-400">Transfer</span> = investment + personal expense refund + profit share.
                  Investors recover their capital first; what remains of net profit is distributed according to the chosen strategy.
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-3 p-4 border-t border-zinc-800/60">
                <div className="text-[11px] text-zinc-500">
                  Upon confirmation, we save a snapshot of the distribution and mark the order as <span className="text-emerald-400">completed</span>.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSplitModal(false)}
                    disabled={saving}
                    className="px-3 py-1.5 text-[10px] uppercase tracking-widest bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/60 rounded-sm text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={applySplitAndComplete}
                    disabled={saving || (unassignedPct)}
                    className="px-4 py-1.5 text-[10px] uppercase tracking-widest bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-500/50 rounded-sm text-emerald-200 disabled:opacity-40"
                  >
                    {saving ? "Saving…" : "Apply and Complete"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
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
