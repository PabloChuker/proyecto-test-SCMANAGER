// ═══════════════════════════════════════════════════════════════════════════
// AL FILO — Work Order LocalStorage Store
//
// Persists work order sessions, orders, and crew shares in the browser.
// All data keyed under "alfilo_wo_*" namespace.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WOCrewMember {
  name: string;
  share: number;
  payout: number;
}

export interface WOExpense {
  claimant: string;
  name: string;
  amount: number;
}

export interface WOMineral {
  id: string;
  name: string;
  quantity: number;
  yieldQty: number;
  value: number;
}

export interface WorkOrder {
  id: string;
  sessionId: string;
  type: "ship" | "roc" | "salvage" | "share";
  refinery?: string;
  method?: string;
  ores: WOMineral[];
  totalYield: number;
  grossValue: number;
  expenses: WOExpense[];
  totalExpenses: number;
  motraderFee: number;
  netProfit: number;
  crew: WOCrewMember[];
  sellPrice: number;
  timer: number; // seconds
  createdAt: string; // ISO
}

export interface WOSession {
  id: string;
  name: string;
  createdAt: string;
  orderIds: string[];
  isActive: boolean;
}

// ─── Storage Keys ────────────────────────────────────────────────────────────

const KEY_SESSIONS = "alfilo_wo_sessions";
const KEY_ORDERS = "alfilo_wo_orders";
const KEY_ACTIVE_SESSION = "alfilo_wo_active_session";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, data: any) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── Session CRUD ────────────────────────────────────────────────────────────

export function getSessions(): WOSession[] {
  return readJSON<WOSession[]>(KEY_SESSIONS, []);
}

export function getActiveSessionId(): string | null {
  return readJSON<string | null>(KEY_ACTIVE_SESSION, null);
}

export function setActiveSessionId(id: string | null) {
  writeJSON(KEY_ACTIVE_SESSION, id);
}

export function createSession(name?: string): WOSession {
  const sessions = getSessions();
  const now = new Date();
  const session: WOSession = {
    id: `ses_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: name || `Session: ${now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}...`,
    createdAt: now.toISOString(),
    orderIds: [],
    isActive: true,
  };
  sessions.unshift(session);
  writeJSON(KEY_SESSIONS, sessions);
  setActiveSessionId(session.id);
  return session;
}

export function deleteSession(sessionId: string) {
  let sessions = getSessions();
  const session = sessions.find((s) => s.id === sessionId);
  if (session) {
    // Remove associated orders
    let orders = getOrders();
    orders = orders.filter((o) => o.sessionId !== sessionId);
    writeJSON(KEY_ORDERS, orders);
  }
  sessions = sessions.filter((s) => s.id !== sessionId);
  writeJSON(KEY_SESSIONS, sessions);
  if (getActiveSessionId() === sessionId) {
    setActiveSessionId(sessions[0]?.id || null);
  }
}

// ─── Order CRUD ──────────────────────────────────────────────────────────────

export function getOrders(): WorkOrder[] {
  return readJSON<WorkOrder[]>(KEY_ORDERS, []);
}

export function getOrdersBySession(sessionId: string): WorkOrder[] {
  return getOrders().filter((o) => o.sessionId === sessionId);
}

export function addOrder(order: Omit<WorkOrder, "id" | "createdAt">): WorkOrder {
  const orders = getOrders();
  const sessions = getSessions();
  const fullOrder: WorkOrder = {
    ...order,
    id: `wo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  orders.unshift(fullOrder);
  writeJSON(KEY_ORDERS, orders);

  // Add order to session
  const sessionIdx = sessions.findIndex((s) => s.id === order.sessionId);
  if (sessionIdx >= 0) {
    sessions[sessionIdx].orderIds.unshift(fullOrder.id);
    writeJSON(KEY_SESSIONS, sessions);
  }

  return fullOrder;
}

export function deleteOrder(orderId: string) {
  let orders = getOrders();
  const order = orders.find((o) => o.id === orderId);
  orders = orders.filter((o) => o.id !== orderId);
  writeJSON(KEY_ORDERS, orders);

  if (order) {
    const sessions = getSessions();
    const sessionIdx = sessions.findIndex((s) => s.id === order.sessionId);
    if (sessionIdx >= 0) {
      sessions[sessionIdx].orderIds = sessions[sessionIdx].orderIds.filter((id) => id !== orderId);
      writeJSON(KEY_SESSIONS, sessions);
    }
  }
}

// ─── Aggregation helpers ─────────────────────────────────────────────────────

export interface CrewShareSummary {
  name: string;
  totalPayout: number;
  orderCount: number;
}

export function getCrewSharesSummary(sessionId?: string): CrewShareSummary[] {
  const orders = sessionId ? getOrdersBySession(sessionId) : getOrders();
  const map = new Map<string, CrewShareSummary>();

  for (const order of orders) {
    for (const member of order.crew) {
      const existing = map.get(member.name);
      if (existing) {
        existing.totalPayout += member.payout;
        existing.orderCount += 1;
      } else {
        map.set(member.name, {
          name: member.name,
          totalPayout: member.payout,
          orderCount: 1,
        });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalPayout - a.totalPayout);
}

export interface WOStats {
  totalOrders: number;
  totalGross: number;
  totalNet: number;
  totalExpenses: number;
  totalYield: number;
  avgOrderValue: number;
  byType: Record<string, { count: number; gross: number }>;
  byMonth: { month: string; count: number; gross: number }[];
  topOres: { id: string; name: string; totalQty: number; totalValue: number }[];
}

export function getStats(sessionId?: string): WOStats {
  const orders = sessionId ? getOrdersBySession(sessionId) : getOrders();

  const byType: Record<string, { count: number; gross: number }> = {};
  const byMonthMap = new Map<string, { count: number; gross: number }>();
  const oreMap = new Map<string, { id: string; name: string; totalQty: number; totalValue: number }>();

  let totalGross = 0;
  let totalNet = 0;
  let totalExpenses = 0;
  let totalYield = 0;

  for (const order of orders) {
    totalGross += order.grossValue;
    totalNet += order.netProfit;
    totalExpenses += order.totalExpenses;
    totalYield += order.totalYield;

    // By type
    if (!byType[order.type]) byType[order.type] = { count: 0, gross: 0 };
    byType[order.type].count += 1;
    byType[order.type].gross += order.grossValue;

    // By month
    const d = new Date(order.createdAt);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    const existing = byMonthMap.get(monthKey);
    if (existing) {
      existing.count += 1;
      existing.gross += order.grossValue;
    } else {
      byMonthMap.set(monthKey, { count: 1, gross: order.grossValue });
    }

    // Top ores
    for (const ore of order.ores) {
      const ex = oreMap.get(ore.id);
      if (ex) {
        ex.totalQty += ore.quantity;
        ex.totalValue += ore.value;
      } else {
        oreMap.set(ore.id, { id: ore.id, name: ore.name, totalQty: ore.quantity, totalValue: ore.value });
      }
    }
  }

  const byMonth = Array.from(byMonthMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, data]) => ({ month, ...data }));

  const topOres = Array.from(oreMap.values())
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 10);

  return {
    totalOrders: orders.length,
    totalGross,
    totalNet,
    totalExpenses,
    totalYield,
    avgOrderValue: orders.length > 0 ? Math.round(totalGross / orders.length) : 0,
    byType,
    byMonth,
    topOres,
  };
}

// ─── Clear all data ──────────────────────────────────────────────────────────

export function clearAllData() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY_SESSIONS);
  localStorage.removeItem(KEY_ORDERS);
  localStorage.removeItem(KEY_ACTIVE_SESSION);
}
