// =============================================================================
// SC LABS — useTradeWorkOrderStore
//
// Zustand store for the Trade Work Order module:
//   - Cached list of work orders
//   - Currently-editing order id
//   - Route prefill payload (from "Send to WO" in TradeRoutes)
// =============================================================================

import { create } from "zustand";

export interface TradeRoutePrefill {
  commodity_code?: string;
  commodity_name?: string;
  buy_station?: string;
  buy_system?: string;
  sell_station?: string;
  sell_system?: string;
  buy_price_per_scu?: number;
  sell_price_per_scu?: number;
  scu_bought?: number;
}

export interface TradeWOParticipant {
  id: string;
  work_order_id: string;
  user_id: string | null;
  display_name: string;
  role: string;
  role_pct: number;
  contribution_uec: number;
  contribution_note: string | null;
  payout_uec: number;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
}

export interface TradeWOExpense {
  id: string;
  work_order_id: string;
  payer_id: string | null;
  payer_name: string;
  description: string;
  amount: number;
  expense_type: string;
  created_at: string;
}

export interface TradeWorkOrder {
  id: string;
  owner_id: string;
  party_id: string | null;
  title: string;
  status: "draft" | "in_progress" | "completed" | "archived";
  commodity_code: string | null;
  commodity_name: string | null;
  buy_station: string | null;
  buy_system: string | null;
  sell_station: string | null;
  sell_system: string | null;
  scu_bought: number;
  scu_sold: number;
  scu_lost: number;
  buy_price_per_scu: number;
  sell_price_per_scu: number;
  total_buy: number;
  total_sell: number;
  total_expenses: number;
  net_profit: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  trade_wo_participants?: TradeWOParticipant[];
  trade_wo_expenses?: TradeWOExpense[];
}

export type TradeWOView = "list" | "editor";

interface TradeWOState {
  view: TradeWOView;
  editingId: string | null;
  prefill: TradeRoutePrefill | null;
  requestTabSwitch: number; // incremented to signal page to switch to WO tab

  setView: (v: TradeWOView) => void;
  openNew: (prefill?: TradeRoutePrefill | null) => void;
  openEdit: (id: string) => void;
  backToList: () => void;
  consumePrefill: () => TradeRoutePrefill | null;
  requestOpenFromRoute: (prefill: TradeRoutePrefill) => void;
}

export const useTradeWorkOrderStore = create<TradeWOState>((set, get) => ({
  view: "list",
  editingId: null,
  prefill: null,
  requestTabSwitch: 0,

  setView: (v) => set({ view: v }),

  openNew: (prefill = null) =>
    set({ view: "editor", editingId: null, prefill: prefill || null }),

  openEdit: (id) =>
    set({ view: "editor", editingId: id, prefill: null }),

  backToList: () =>
    set({ view: "list", editingId: null, prefill: null }),

  consumePrefill: () => {
    const p = get().prefill;
    set({ prefill: null });
    return p;
  },

  requestOpenFromRoute: (prefill) =>
    set((s) => ({
      view: "editor",
      editingId: null,
      prefill,
      requestTabSwitch: s.requestTabSwitch + 1,
    })),
}));
