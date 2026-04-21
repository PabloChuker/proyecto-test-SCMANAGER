// =============================================================================
// SC LABS — Mining Store (Supabase-backed)
//
// Zustand store that talks to /api/mining/* endpoints.
// Manages sessions, members, work orders, inventory, and ledger.
// Provides auto-load-party, role management, and share balancing.
// =============================================================================

import { create } from "zustand";
import type {
  MiningSession,
  MiningMember,
  MiningWorkOrder,
  MiningExpense,
  MiningCrewPayout,
  MiningInventoryItem,
  MiningMovement,
  MiningMemberLedger,
  MiningRole,
} from "@/types/mining";
import { autoBalanceShares } from "@/types/mining";

// ─── State shape ────────────────────────────────────────────────────────────

export type MiningScope = "solo" | "party";

interface MiningState {
  // Data
  sessions: MiningSession[];
  activeSessionId: string | null;
  members: MiningMember[];
  workOrders: MiningWorkOrder[];
  inventory: MiningInventoryItem[];
  movements: MiningMovement[];
  ledger: MiningMemberLedger[];

  // UI
  isLoading: boolean;
  error: string | null;
  lockedShareIds: Set<string>;   // members whose share_pct was manually set

  // ── Scope (Fase H.13) ───────────────────────────────────────────────────
  // Single source of truth compartido por Calculator, Dashboard e Inventory.
  // Cuando el user elige "party", toda la cadena apunta a la party session;
  // cuando elige "solo", toda la cadena apunta a la solo session.  Evita el
  // drift entre tabs donde cada componente montaba su propio toggle.
  scope: MiningScope;
  soloSessionId: string | null;   // cached: mining_sessions.party_id IS NULL
  partySessionId: string | null;  // cached: mining_sessions.party_id = <active party>
  activePartyId: string | null;   // cached: parties.id where user is active member
  scopeReady: boolean;            // true after first ensureScopedSessions call
  setScope: (scope: MiningScope) => void;
  ensureScopedSessions: (userId: string) => Promise<void>;

  // ── Session actions ─────────────────────────────────────────────────────
  fetchSessions: () => Promise<void>;
  createSession: (name: string, partyId?: string | null) => Promise<MiningSession | null>;
  setActiveSession: (id: string | null) => void;
  closeSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  // ── Member actions ──────────────────────────────────────────────────────
  fetchMembers: (sessionId: string) => Promise<void>;
  addMember: (sessionId: string, displayName: string, userId?: string | null, avatarUrl?: string | null, role?: MiningRole) => Promise<void>;
  updateMember: (id: string, updates: { role?: MiningRole; share_pct?: number }) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  rebalanceShares: () => void;
  lockShare: (memberId: string) => void;
  unlockShare: (memberId: string) => void;

  // ── Work order actions ──────────────────────────────────────────────────
  fetchWorkOrders: (sessionId: string) => Promise<void>;
  createWorkOrder: (order: Partial<MiningWorkOrder> & {
    expenses?: Partial<MiningExpense>[];
    payouts?: Partial<MiningCrewPayout>[];
  }) => Promise<MiningWorkOrder | null>;
  updateOrderStatus: (id: string, status: "completed" | "collected") => Promise<void>;
  deleteWorkOrder: (id: string) => Promise<void>;

  // ── Inventory actions ───────────────────────────────────────────────────
  fetchInventory: (sessionId: string) => Promise<void>;
  recordInventoryAction: (params: {
    session_id: string;
    mineral_id: string;
    mineral_name: string;
    quantity: number;
    reason: string;
    member_id?: string;
    member_name?: string;
    work_order_id?: string;
    destination_ref?: string;
  }) => Promise<void>;
  clearInventory: (sessionId: string) => Promise<void>;

  // ── Ledger actions ──────────────────────────────────────────────────────
  fetchLedger: (all?: boolean) => Promise<void>;
  recordPayment: (payoutId: string) => Promise<void>;
}

// ─── API helpers ────────────────────────────────────────────────────────────

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `API error ${res.status}`);
  return json;
}

// ─── Store ──────────────────────────────────────────────────────────────────

const SCOPE_STORAGE_KEY = "sc-labs-mining-scope";

function readStoredScope(): MiningScope {
  if (typeof window === "undefined") return "solo";
  try {
    const raw = window.localStorage.getItem(SCOPE_STORAGE_KEY);
    return raw === "party" ? "party" : "solo";
  } catch {
    return "solo";
  }
}

function writeStoredScope(scope: MiningScope) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SCOPE_STORAGE_KEY, scope);
  } catch {
    /* storage quota / private mode — non-fatal */
  }
}

export const useMiningStore = create<MiningState>((set, get) => ({
  // Initial state
  sessions: [],
  activeSessionId: null,
  members: [],
  workOrders: [],
  inventory: [],
  movements: [],
  ledger: [],
  isLoading: false,
  error: null,
  lockedShareIds: new Set(),

  // Scope defaults (persisted preference, will be applied once sessions load)
  scope: readStoredScope(),
  soloSessionId: null,
  partySessionId: null,
  activePartyId: null,
  scopeReady: false,

  // ══════════════════════════════════════════════════════════════════════════
  // Scope (Fase H.13)
  // ══════════════════════════════════════════════════════════════════════════

  setScope: (scope) => {
    writeStoredScope(scope);
    const { soloSessionId, partySessionId } = get();
    const targetId = scope === "party" ? partySessionId : soloSessionId;
    set({ scope });
    // Side-effect: retarget activeSessionId so Dashboard/Inventory refetch
    // inventory + workOrders against the right session.
    if (targetId) {
      get().setActiveSession(targetId);
    }
  },

  ensureScopedSessions: async (userId) => {
    // Idempotente: siempre refresca `sessions` desde el backend, detecta la
    // party activa del user, asegura que existe una solo session y —si hay
    // party— una party session, y rehidrata el activeSessionId desde el
    // scope persistido.
    set({ isLoading: true, error: null });
    try {
      // 1. Refresh sessions
      await get().fetchSessions();

      // 2. Detect active party membership (directly via API to avoid coupling
      //    to any Supabase client here).
      let activePartyId: string | null = null;
      let activePartyName: string | null = null;
      try {
        const partyRes = await fetch("/api/party/active", {
          credentials: "include",
        });
        if (partyRes.ok) {
          const json = await partyRes.json();
          activePartyId = json?.party?.id ?? null;
          activePartyName = json?.party?.name ?? null;
        }
      } catch {
        /* endpoint puede no existir todavía — se hace fallback abajo */
      }

      // 3. Find (or create) solo + party mining_sessions
      let sessions = get().sessions.filter((s) => s.status === "active");
      let solo = sessions.find((s) => !s.party_id) || null;
      if (!solo) {
        solo = await get().createSession("Default", null);
        if (solo) {
          // createSession prepends and sets activeSessionId — refresh sessions
          sessions = get().sessions.filter((s) => s.status === "active");
        }
      }

      let party = activePartyId
        ? sessions.find((s) => s.party_id === activePartyId) || null
        : null;
      if (activePartyId && !party) {
        party = await get().createSession(
          activePartyName || "Party",
          activePartyId,
        );
      }

      const soloSessionId = solo?.id ?? null;
      const partySessionId = party?.id ?? null;

      // 4. Apply persisted scope (fallback to 'solo' if party missing).
      const storedScope = readStoredScope();
      const effectiveScope: MiningScope =
        storedScope === "party" && partySessionId ? "party" : "solo";
      const targetId =
        effectiveScope === "party" ? partySessionId : soloSessionId;

      set({
        soloSessionId,
        partySessionId,
        activePartyId,
        scope: effectiveScope,
        scopeReady: true,
        isLoading: false,
      });
      if (effectiveScope !== storedScope) writeStoredScope(effectiveScope);

      if (targetId) {
        // Only re-target if it differs from the current active session, to
        // avoid clobbering fetch side-effects when the user is already on
        // the correct session.
        if (get().activeSessionId !== targetId) {
          get().setActiveSession(targetId);
        }
      }
    } catch (e: any) {
      set({ error: e.message, isLoading: false, scopeReady: true });
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Sessions
  // ══════════════════════════════════════════════════════════════════════════

  fetchSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await api<{ data: MiningSession[] }>("/api/mining/sessions");
      set({ sessions: res.data, isLoading: false });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  createSession: async (name, partyId) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api<{ data: { session: MiningSession; members: MiningMember[] } }>(
        "/api/mining/sessions",
        { method: "POST", body: JSON.stringify({ name, party_id: partyId }) },
      );
      set((s) => ({
        sessions: [res.data.session, ...s.sessions],
        activeSessionId: res.data.session.id,
        members: res.data.members,
        isLoading: false,
      }));
      return res.data.session;
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
      return null;
    }
  },

  setActiveSession: (id) => {
    set({ activeSessionId: id, workOrders: [], inventory: [], movements: [], members: [] });
    if (id) {
      get().fetchMembers(id);
      get().fetchWorkOrders(id);
      get().fetchInventory(id);
    }
  },

  closeSession: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api<{ data: MiningSession }>("/api/mining/sessions", {
        method: "PATCH",
        body: JSON.stringify({ id, status: "completed" }),
      });
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === id ? { ...sess, status: "completed" } : sess
        ),
        activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
        isLoading: false,
      }));
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  deleteSession: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api<{ success: boolean }>(`/api/mining/sessions?id=${id}`, {
        method: "DELETE",
      });
      set((s) => ({
        sessions: s.sessions.filter((sess) => sess.id !== id),
        activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
        members: s.activeSessionId === id ? [] : s.members,
        workOrders: s.activeSessionId === id ? [] : s.workOrders,
        inventory: s.activeSessionId === id ? [] : s.inventory,
        isLoading: false,
      }));
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Members
  // ══════════════════════════════════════════════════════════════════════════

  fetchMembers: async (sessionId) => {
    try {
      const res = await api<{ data: MiningMember[] }>(
        `/api/mining/members?session_id=${sessionId}`,
      );
      set({ members: res.data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  addMember: async (sessionId, displayName, userId, avatarUrl, role) => {
    try {
      const res = await api<{ data: MiningMember }>("/api/mining/members", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          display_name: displayName,
          user_id: userId,
          avatar_url: avatarUrl,
          role: role || "miner",
        }),
      });
      set((s) => ({ members: [...s.members, res.data] }));
      get().rebalanceShares();
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  updateMember: async (id, updates) => {
    try {
      const res = await api<{ data: MiningMember }>("/api/mining/members", {
        method: "PATCH",
        body: JSON.stringify({ id, ...updates }),
      });
      set((s) => ({
        members: s.members.map((m) => (m.id === id ? res.data : m)),
      }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  removeMember: async (id) => {
    try {
      await api("/api/mining/members?id=" + id, { method: "DELETE" });
      set((s) => ({
        members: s.members.filter((m) => m.id !== id),
        lockedShareIds: (() => {
          const next = new Set(s.lockedShareIds);
          next.delete(id);
          return next;
        })(),
      }));
      get().rebalanceShares();
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  rebalanceShares: () => {
    const { members, lockedShareIds } = get();
    if (members.length === 0) return;

    const newShares = autoBalanceShares(members, lockedShareIds);
    const updated = members.map((m) => ({
      ...m,
      share_pct: newShares.get(m.id) ?? m.share_pct,
    }));
    set({ members: updated });

    // Persist to API in background (fire-and-forget)
    for (const m of updated) {
      const newPct = newShares.get(m.id);
      if (newPct !== undefined && newPct !== m.share_pct) {
        api("/api/mining/members", {
          method: "PATCH",
          body: JSON.stringify({ id: m.id, share_pct: newPct }),
        }).catch(() => {});
      }
    }
  },

  lockShare: (memberId) => {
    set((s) => {
      const next = new Set(s.lockedShareIds);
      next.add(memberId);
      return { lockedShareIds: next };
    });
  },

  unlockShare: (memberId) => {
    set((s) => {
      const next = new Set(s.lockedShareIds);
      next.delete(memberId);
      return { lockedShareIds: next };
    });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Work Orders
  // ══════════════════════════════════════════════════════════════════════════

  fetchWorkOrders: async (sessionId) => {
    try {
      const res = await api<{ data: MiningWorkOrder[] }>(
        `/api/mining/work-orders?session_id=${sessionId}`,
      );
      set({ workOrders: res.data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  createWorkOrder: async (order) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api<{ data: MiningWorkOrder }>("/api/mining/work-orders", {
        method: "POST",
        body: JSON.stringify(order),
      });
      set((s) => ({
        workOrders: [res.data, ...s.workOrders],
        isLoading: false,
      }));
      return res.data;
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
      return null;
    }
  },

  updateOrderStatus: async (id, status) => {
    try {
      const res = await api<{ data: MiningWorkOrder }>("/api/mining/work-orders", {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
      set((s) => ({
        workOrders: s.workOrders.map((o) => (o.id === id ? res.data : o)),
      }));
      // Refresh inventory if collected
      if (status === "collected") {
        const sessionId = get().activeSessionId;
        if (sessionId) get().fetchInventory(sessionId);
      }
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  deleteWorkOrder: async (id) => {
    try {
      await api(`/api/mining/work-orders?id=${id}`, { method: "DELETE" });
      set((s) => ({
        workOrders: s.workOrders.filter((o) => o.id !== id),
      }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Inventory
  // ══════════════════════════════════════════════════════════════════════════

  fetchInventory: async (sessionId) => {
    try {
      const res = await api<{
        inventory: MiningInventoryItem[];
        movements: MiningMovement[];
      }>(`/api/mining/inventory?session_id=${sessionId}`);
      set({ inventory: res.inventory, movements: res.movements });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  recordInventoryAction: async (params) => {
    try {
      await api("/api/mining/inventory", {
        method: "POST",
        body: JSON.stringify(params),
      });
      // Refresh inventory after action
      const sessionId = get().activeSessionId;
      if (sessionId) get().fetchInventory(sessionId);
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  clearInventory: async (sessionId) => {
    set({ isLoading: true, error: null });
    try {
      await api<{ success: boolean }>(`/api/mining/inventory?session_id=${sessionId}`, {
        method: "DELETE",
      });
      set({ inventory: [], movements: [], isLoading: false });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Ledger
  // ══════════════════════════════════════════════════════════════════════════

  fetchLedger: async (all = true) => {
    try {
      const res = await api<{ data: MiningMemberLedger[] }>(
        `/api/mining/ledger?all=${all}`,
      );
      set({ ledger: res.data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  recordPayment: async (payoutId) => {
    try {
      await api("/api/mining/ledger", {
        method: "PATCH",
        body: JSON.stringify({ payout_id: payoutId }),
      });
      // Refresh ledger and work orders
      get().fetchLedger(true);
      const sessionId = get().activeSessionId;
      if (sessionId) get().fetchWorkOrders(sessionId);
    } catch (e: any) {
      set({ error: e.message });
    }
  },
}));
