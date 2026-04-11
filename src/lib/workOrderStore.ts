// ═══════════════════════════════════════════════════════════════════════════
// AL FILO — Work Order LocalStorage Store v2
//
// Persists work order sessions, orders, inventory, and crew shares.
// All data keyed under "alfilo_wo_*" namespace.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Types ───────────────────────────────────────────────────────────────────

export type OrderStatus = "in_progress" | "completed" | "collected";

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
  quantity: number;   // input cSCU / mSCU / SCU
  yieldQty: number;   // output after refining
  value: number;       // aUEC value
}

export interface WorkOrder {
  id: string;
  sessionId: string;
  type: "ship" | "roc" | "salvage" | "share";
  status: OrderStatus;
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
  countdownSeconds: number;   // total refinery time in seconds
  countdownEndsAt: string | null; // ISO timestamp when countdown finishes
  createdAt: string;
}

export interface WOSession {
  id: string;
  name: string;
  createdAt: string;
  orderIds: string[];
  isActive: boolean;
}

// ─── Inventory types ─────────────────────────────────────────────────────────

export interface InventoryItem {
  mineralId: string;
  mineralName: string;
  quantity: number;        // available to sell/use
  totalReceived: number;   // lifetime total from orders
}

export interface InventoryMovement {
  id: string;
  orderId?: string;
  mineralId: string;
  mineralName: string;
  delta: number;           // positive = received, negative = sold/used
  reason: "refine_complete" | "sell" | "craft" | "distribute" | "manual_add" | "manual_remove";
  note?: string;
  crewMember?: string;     // who received in distribution
  createdAt: string;
}

// ─── Storage Keys ────────────────────────────────────────────────────────────

const KEY_SESSIONS = "alfilo_wo_sessions";
const KEY_ORDERS = "alfilo_wo_orders";
const KEY_ACTIVE_SESSION = "alfilo_wo_active_session";
const KEY_INVENTORY = "alfilo_wo_inventory";
const KEY_MOVEMENTS = "alfilo_wo_movements";

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

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
    id: genId("ses"),
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

  // Calculate countdown end time
  let countdownEndsAt: string | null = null;
  if (order.countdownSeconds > 0) {
    countdownEndsAt = new Date(Date.now() + order.countdownSeconds * 1000).toISOString();
  }

  const fullOrder: WorkOrder = {
    ...order,
    id: genId("wo"),
    createdAt: new Date().toISOString(),
    status: order.countdownSeconds > 0 ? "in_progress" : "completed",
    countdownEndsAt,
  };
  orders.unshift(fullOrder);
  writeJSON(KEY_ORDERS, orders);

  const sessionIdx = sessions.findIndex((s) => s.id === order.sessionId);
  if (sessionIdx >= 0) {
    sessions[sessionIdx].orderIds.unshift(fullOrder.id);
    writeJSON(KEY_SESSIONS, sessions);
  }

  return fullOrder;
}

export function updateOrderStatus(orderId: string, status: OrderStatus) {
  const orders = getOrders();
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx >= 0) {
    orders[idx].status = status;
    writeJSON(KEY_ORDERS, orders);
  }
}

/** Mark an in_progress order as completed (timer done) */
export function completeOrder(orderId: string) {
  updateOrderStatus(orderId, "completed");
}

/** Collect a completed order — moves refined materials into inventory */
export function collectOrder(orderId: string) {
  const orders = getOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order || order.status !== "completed") return;

  // Add refined minerals to inventory
  for (const ore of order.ores) {
    if (ore.yieldQty > 0) {
      addToInventory(ore.id, ore.name, ore.yieldQty, {
        orderId,
        reason: "refine_complete",
        note: `Collected from order ${orderId.slice(3, 14)}`,
      });
    }
  }

  updateOrderStatus(orderId, "collected");
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

/** Check all in_progress orders and auto-complete any whose countdown has passed */
export function tickOrders(): string[] {
  const orders = getOrders();
  const now = Date.now();
  const completed: string[] = [];

  let changed = false;
  for (const order of orders) {
    if (order.status === "in_progress" && order.countdownEndsAt) {
      if (new Date(order.countdownEndsAt).getTime() <= now) {
        order.status = "completed";
        completed.push(order.id);
        changed = true;
      }
    }
  }

  if (changed) writeJSON(KEY_ORDERS, orders);
  return completed;
}

// ─── Inventory CRUD ──────────────────────────────────────────────────────────

export function getInventory(): InventoryItem[] {
  return readJSON<InventoryItem[]>(KEY_INVENTORY, []);
}

export function getMovements(): InventoryMovement[] {
  return readJSON<InventoryMovement[]>(KEY_MOVEMENTS, []);
}

function addToInventory(
  mineralId: string,
  mineralName: string,
  qty: number,
  movement: { orderId?: string; reason: InventoryMovement["reason"]; note?: string; crewMember?: string }
) {
  // Update inventory
  const inv = getInventory();
  const idx = inv.findIndex((i) => i.mineralId === mineralId);
  if (idx >= 0) {
    inv[idx].quantity += qty;
    inv[idx].totalReceived += Math.max(0, qty);
  } else {
    inv.push({ mineralId, mineralName, quantity: qty, totalReceived: Math.max(0, qty) });
  }
  writeJSON(KEY_INVENTORY, inv);

  // Log movement
  const movements = getMovements();
  movements.unshift({
    id: genId("mv"),
    orderId: movement.orderId,
    mineralId,
    mineralName,
    delta: qty,
    reason: movement.reason,
    note: movement.note,
    crewMember: movement.crewMember,
    createdAt: new Date().toISOString(),
  });
  writeJSON(KEY_MOVEMENTS, movements);
}

/** Sell minerals from inventory */
export function sellFromInventory(mineralId: string, mineralName: string, qty: number, note?: string) {
  addToInventory(mineralId, mineralName, -qty, { reason: "sell", note });
}

/** Use minerals for crafting */
export function useForCrafting(mineralId: string, mineralName: string, qty: number, note?: string) {
  addToInventory(mineralId, mineralName, -qty, { reason: "craft", note });
}

/** Distribute materials to a crew member */
export function distributeToMember(mineralId: string, mineralName: string, qty: number, memberName: string) {
  addToInventory(mineralId, mineralName, -qty, {
    reason: "distribute",
    note: `Distributed to ${memberName}`,
    crewMember: memberName,
  });
}

/** Manually add materials (e.g. bought, found) */
export function manualAdd(mineralId: string, mineralName: string, qty: number, note?: string) {
  addToInventory(mineralId, mineralName, qty, { reason: "manual_add", note });
}

/** Manually remove materials */
export function manualRemove(mineralId: string, mineralName: string, qty: number, note?: string) {
  addToInventory(mineralId, mineralName, -qty, { reason: "manual_remove", note });
}

/** Get per-order inventory (what an order produced, minus distributions) */
export function getOrderInventory(orderId: string): { mineralId: string; mineralName: string; received: number; distributed: number; remaining: number }[] {
  const movements = getMovements().filter((m) => m.orderId === orderId);
  const map = new Map<string, { mineralId: string; mineralName: string; received: number; distributed: number }>();

  for (const mv of movements) {
    const existing = map.get(mv.mineralId);
    if (existing) {
      if (mv.delta > 0) existing.received += mv.delta;
      else existing.distributed += Math.abs(mv.delta);
    } else {
      map.set(mv.mineralId, {
        mineralId: mv.mineralId,
        mineralName: mv.mineralName,
        received: mv.delta > 0 ? mv.delta : 0,
        distributed: mv.delta < 0 ? Math.abs(mv.delta) : 0,
      });
    }
  }

  return Array.from(map.values()).map((m) => ({
    ...m,
    remaining: m.received - m.distributed,
  }));
}

/** Calculate how much each crew member should get based on share % and available inventory */
export function calculateDistribution(orderId: string): { memberName: string; share: number; minerals: { mineralId: string; mineralName: string; qty: number; value: number }[] }[] {
  const orders = getOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) return [];

  const totalShares = order.crew.reduce((s, c) => s + c.share, 0);
  if (totalShares <= 0) return [];

  return order.crew.map((member) => {
    const shareRatio = member.share / totalShares;
    return {
      memberName: member.name,
      share: member.share,
      minerals: order.ores.map((ore) => ({
        mineralId: ore.id,
        mineralName: ore.name,
        qty: Math.round(ore.yieldQty * shareRatio * 100) / 100,
        value: Math.round(ore.value * shareRatio),
      })),
    };
  });
}

// ─── Aggregation helpers ─────────────────────────────────────────────────────

export interface CrewShareSummary {
  name: string;
  totalPayout: number;
  orderCount: number;
  totalMaterialsValue: number;
}

export function getCrewSharesSummary(sessionId?: string): CrewShareSummary[] {
  const orders = sessionId ? getOrdersBySession(sessionId) : getOrders();
  const map = new Map<string, CrewShareSummary>();

  for (const order of orders) {
    const totalShares = order.crew.reduce((s, c) => s + c.share, 0);
    for (const member of order.crew) {
      const shareRatio = totalShares > 0 ? member.share / totalShares : 0;
      const materialValue = order.ores.reduce((s, o) => s + o.value, 0) * shareRatio;

      const existing = map.get(member.name);
      if (existing) {
        existing.totalPayout += member.payout;
        existing.orderCount += 1;
        existing.totalMaterialsValue += materialValue;
      } else {
        map.set(member.name, {
          name: member.name,
          totalPayout: member.payout,
          orderCount: 1,
          totalMaterialsValue: materialValue,
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
  byStatus: Record<OrderStatus, number>;
}

export function getStats(sessionId?: string): WOStats {
  const orders = sessionId ? getOrdersBySession(sessionId) : getOrders();

  const byType: Record<string, { count: number; gross: number }> = {};
  const byMonthMap = new Map<string, { count: number; gross: number }>();
  const oreMap = new Map<string, { id: string; name: string; totalQty: number; totalValue: number }>();
  const byStatus: Record<OrderStatus, number> = { in_progress: 0, completed: 0, collected: 0 };

  let totalGross = 0, totalNet = 0, totalExpenses = 0, totalYield = 0;

  for (const order of orders) {
    totalGross += order.grossValue;
    totalNet += order.netProfit;
    totalExpenses += order.totalExpenses;
    totalYield += order.totalYield;
    byStatus[order.status] = (byStatus[order.status] || 0) + 1;

    if (!byType[order.type]) byType[order.type] = { count: 0, gross: 0 };
    byType[order.type].count += 1;
    byType[order.type].gross += order.grossValue;

    const d = new Date(order.createdAt);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const existing = byMonthMap.get(monthKey);
    if (existing) { existing.count += 1; existing.gross += order.grossValue; }
    else byMonthMap.set(monthKey, { count: 1, gross: order.grossValue });

    for (const ore of order.ores) {
      const ex = oreMap.get(ore.id);
      if (ex) { ex.totalQty += ore.quantity; ex.totalValue += ore.value; }
      else oreMap.set(ore.id, { id: ore.id, name: ore.name, totalQty: ore.quantity, totalValue: ore.value });
    }
  }

  return {
    totalOrders: orders.length,
    totalGross, totalNet, totalExpenses, totalYield,
    avgOrderValue: orders.length > 0 ? Math.round(totalGross / orders.length) : 0,
    byType,
    byMonth: Array.from(byMonthMap.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([month, data]) => ({ month, ...data })),
    topOres: Array.from(oreMap.values()).sort((a, b) => b.totalValue - a.totalValue).slice(0, 10),
    byStatus,
  };
}

// ─── Clear all data ──────────────────────────────────────────────────────────

export function clearAllData() {
  if (typeof window === "undefined") return;
  [KEY_SESSIONS, KEY_ORDERS, KEY_ACTIVE_SESSION, KEY_INVENTORY, KEY_MOVEMENTS].forEach(
    (k) => localStorage.removeItem(k)
  );
}
