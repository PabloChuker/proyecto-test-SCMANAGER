// =============================================================================
// SC LABS — Mining & Industry Types (Supabase-backed)
// =============================================================================

// ─── Roles ──────────────────────────────────────────────────────────────────

export type MiningRole = "miner" | "escort" | "pilot" | "logistics" | "refiner" | "scout" | "custom";

export const ROLE_DEFAULTS: Record<MiningRole, { label: string; icon: string; suggestedPct: number }> = {
  miner:      { label: "Miner",      icon: "⛏",  suggestedPct: 25 },
  escort:     { label: "Escort",     icon: "🛡",  suggestedPct: 15 },
  pilot:      { label: "Pilot",      icon: "✈",   suggestedPct: 20 },
  logistics:  { label: "Logistics",  icon: "📦",  suggestedPct: 15 },
  refiner:    { label: "Refiner",    icon: "🔥",  suggestedPct: 10 },
  scout:      { label: "Scout",      icon: "🔍",  suggestedPct: 10 },
  custom:     { label: "Custom",     icon: "⚙",   suggestedPct: 0 },
};

// ─── DB Row types ───────────────────────────────────────────────────────────

export interface MiningSession {
  id: string;
  party_id: string | null;
  owner_id: string;
  name: string;
  status: "active" | "completed" | "archived";
  created_at: string;
  completed_at: string | null;
  notes: string | null;
}

export interface MiningMember {
  id: string;
  session_id: string;
  user_id: string | null;
  display_name: string;
  avatar_url: string | null;
  role: MiningRole;
  share_pct: number;
  is_from_party: boolean;
  joined_at: string;
}

export type OrderType = "ship" | "roc" | "salvage" | "share";
export type OrderStatus = "in_progress" | "completed" | "collected";

export interface MiningOre {
  id: string;
  name: string;
  quantity: number;
  yieldQty: number;
  value: number;
  quality?: number;        // 0-1000 (game unit, manually entered)
}

export interface MiningWorkOrder {
  id: string;
  session_id: string;
  created_by: string;
  order_type: OrderType;
  status: OrderStatus;
  refinery_id: string | null;
  refinery_name: string | null;
  refining_method: string | null;
  ores: MiningOre[];
  total_yield: number;
  gross_value: number;
  sell_price: number;
  net_profit: number;
  motrader_fee: number;
  countdown_seconds: number;
  countdown_ends_at: string | null;
  created_at: string;
  collected_at: string | null;
  notes: string | null;
}

export type ExpenseType = "fuel" | "ammo" | "repair" | "fee" | "general";

export interface MiningExpense {
  id: string;
  work_order_id: string;
  claimant_id: string | null;
  claimant_name: string;
  expense_name: string;
  amount: number;
  expense_type: ExpenseType;
  created_at: string;
}

export interface MiningCrewPayout {
  id: string;
  work_order_id: string;
  member_id: string;
  share_pct: number;
  payout_auec: number;
  paid: boolean;
  paid_at: string | null;
}

export interface MiningInventoryItem {
  id: string;
  session_id: string;
  mineral_id: string;
  mineral_name: string;
  quantity: number;
  total_received: number;
  quality?: number;          // 0-1000 (inherited from work order ore)
  location?: string;         // station/refinery where material is stored
  location_system?: string;  // system (Stanton, Pyro, Nyx)
}

export type MovementReason =
  | "refine_complete"
  | "sell"
  | "craft"
  | "distribute"
  | "transfer_out"
  | "manual_add"
  | "manual_remove";

export interface MiningMovement {
  id: string;
  session_id: string;
  work_order_id: string | null;
  mineral_id: string;
  mineral_name: string;
  delta: number;
  reason: MovementReason;
  member_id: string | null;
  member_name: string | null;
  destination_ref: string | null;
  created_at: string;
}

export interface MiningMemberLedger {
  id: string;
  user_id: string | null;
  display_name: string;
  total_earned: number;
  total_paid: number;
  total_expenses: number;
  balance: number;
  total_orders: number;
  total_sessions: number;
  materials_received: Record<string, number>;
  materials_value: number;
  updated_at: string;
}

// ─── Helper: auto-balance shares ────────────────────────────────────────────

/**
 * Recalcula los porcentajes de share para un grupo de miembros.
 * Los miembros con share_pct fijado manualmente (lockedIds) se mantienen;
 * el resto se distribuye proporcionalmente al % sugerido de su rol.
 */
export function autoBalanceShares(
  members: Pick<MiningMember, "id" | "role" | "share_pct">[],
  lockedIds: Set<string> = new Set(),
): Map<string, number> {
  const result = new Map<string, number>();
  if (members.length === 0) return result;

  // Sumar lo fijado
  let lockedTotal = 0;
  for (const m of members) {
    if (lockedIds.has(m.id)) {
      lockedTotal += m.share_pct;
      result.set(m.id, m.share_pct);
    }
  }

  const remaining = Math.max(0, 100 - lockedTotal);
  const unlocked = members.filter((m) => !lockedIds.has(m.id));

  if (unlocked.length === 0) return result;

  // Sumar % sugeridos de los no fijados
  const rawSum = unlocked.reduce((acc, m) => acc + ROLE_DEFAULTS[m.role].suggestedPct, 0);

  if (rawSum <= 0) {
    // Repartir equitativamente
    const each = remaining / unlocked.length;
    for (const m of unlocked) result.set(m.id, Math.round(each * 100) / 100);
  } else {
    // Repartir proporcionalmente
    for (const m of unlocked) {
      const pct = (ROLE_DEFAULTS[m.role].suggestedPct / rawSum) * remaining;
      result.set(m.id, Math.round(pct * 100) / 100);
    }
  }

  return result;
}
