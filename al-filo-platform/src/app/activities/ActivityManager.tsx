"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth, type Profile } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import activityTypesFallback from "@/data/activities/activity-types.json";
import lootItemsFallback from "@/data/activities/loot-items.json";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ActivityType {
  id: string;
  name: string;
  category: string;
  description: string;
  typicalLoot: string[];
  minPlayers: number;
  maxPlayers: number;
  difficulty: string;
}

interface LootItem {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  rarity: string;
  estimatedValue: number;
  source: string;
}

interface Participant {
  id: string;
  name: string;
  avatarUrl: string | null;
  contributed: boolean;
  weight: number;
  isFromParty: boolean;
  /** Gastos/inversión del participante (money spent out-of-pocket to be reimbursed) */
  expense?: number;
  /** Marca si este participante fue quien cobró/vendió el botín (tiene el dinero) */
  collected?: boolean;
}

interface LootEntry {
  id: string;
  itemId: string;
  itemName: string;
  category: string;
  rarity: string;
  quantity: number;
}

interface RaffleResult {
  participantId: string;
  participantName: string;
  items: { itemName: string; category: string; rarity: string }[];
}

interface DraftResult {
  order: { participantId: string; participantName: string; position: number }[];
}

/** Sentinel entry used inside lootEntries to persist money without DB schema changes */
const MONEY_SENTINEL_ID = "__money__";
/** In-game transfer tax coefficient: sender sends X, receiver gets X * 0.995 */
const TAX_COEF = 0.995;

type RaffleMode = "lottery" | "draft" | "split";

interface SettlementEntry {
  participantId: string;
  participantName: string;
  /** Net amount participant should end up with (positive = gets money, negative = owes) */
  netShare: number;
  /** Gross amount after money they are currently holding (positive = owed money, negative = owes money) */
  balance: number;
}

interface SettlementTransaction {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  /** Amount the sender actually sends (gross, pre-tax) */
  grossAmount: number;
  /** Amount the receiver actually gets (net, grossAmount * TAX_COEF) */
  netAmount: number;
}

interface Settlement {
  moneyAmount: number;
  totalExpenses: number;
  profit: number;
  shareEach: number;
  entries: SettlementEntry[];
  transactions: SettlementTransaction[];
  warning: string | null;
}

interface ActivitySession {
  id: string;
  date: string;
  activityName: string;
  activityId: string;
  participants: Participant[];
  loot: LootEntry[];
  mode: RaffleMode;
  results: RaffleResult[] | DraftResult | null;
  settlement?: Settlement | null;
}

type SessionRole = "host" | "cohost" | "viewer";

interface ConnectedUser {
  id: string;
  name: string;
  role: SessionRole;
}

interface SyncPayload {
  selectedActivity: string;
  lootEntries: LootEntry[];
  participants: Participant[];
  raffleMode: RaffleMode;
  results: RaffleResult[] | null;
  draftResults: DraftResult | null;
  settlement: Settlement | null;
  isRolling: boolean;
  rollingName: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  ship: "🚀 Naves",
  powerplant: "⚡ Power Plants",
  shield: "🛡 Shields",
  cooler: "❄ Coolers",
  quantum_drive: "🌀 Quantum Drives",
  weapon: "🔫 Armas de Nave",
  fps_weapon: "🔫 Armas FPS",
  armor: "🦺 Armaduras",
  card: "🃏 Tarjetas",
  material: "💎 Materiales",
  misc: "📦 Otros",
  money: "💰 Dinero",
};

const CATEGORY_ORDER = [
  "ship", "card", "powerplant", "shield", "cooler", "quantum_drive",
  "weapon", "fps_weapon", "armor", "material", "misc",
];

const RARITY_COLORS: Record<string, string> = {
  common: "text-zinc-400",
  uncommon: "text-emerald-400",
  rare: "text-blue-400",
  epic: "text-purple-400",
  legendary: "text-amber-400",
};

const RARITY_BG: Record<string, string> = {
  common: "border-zinc-600 bg-zinc-700/30",
  uncommon: "border-emerald-600 bg-emerald-900/20",
  rare: "border-blue-600 bg-blue-900/20",
  epic: "border-purple-600 bg-purple-900/20",
  legendary: "border-amber-600 bg-amber-900/20",
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "text-emerald-400",
  medium: "text-amber-400",
  hard: "text-red-400",
  extreme: "text-purple-400",
};

const STORAGE_KEY = "sc-labs-activity-history";
const AUTOSAVE_DELAY = 1500; // ms debounce for DB autosave

// ─── Helpers ────────────────────────────────────────────────────────────────

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function weightedShuffle(participants: Participant[]): Participant[] {
  const pool: { p: Participant; rand: number }[] = [];
  for (const p of participants) {
    for (let i = 0; i < p.weight; i++) {
      pool.push({ p, rand: Math.random() });
    }
  }
  pool.sort((a, b) => a.rand - b.rand);
  const seen = new Set<string>();
  const result: Participant[] = [];
  for (const { p } of pool) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      result.push(p);
    }
  }
  return result;
}

/**
 * Compute money settlement: reimburse expenses first, split remaining profit equally,
 * then compute a minimal set of transfers from collectors (holders of the money) to
 * people who are owed money. Applies the in-game transfer tax (TAX_COEF = 0.995)
 * so the sender sends a gross amount and the receiver gets `gross * TAX_COEF` net.
 *
 * Algorithm:
 *  - netShare[i] = expense[i] + (moneyAmount - totalExpenses) / N   // what they should end up with
 *  - held[i]     = collected[i] ? (moneyAmount / numCollectors) : 0 // what they currently hold
 *  - balance[i]  = netShare[i] - held[i]                            // +ve = owed, -ve = owes
 *  - Greedy match largest debtor with largest creditor; the debtor (sender) sends
 *    `gross` such that `gross * TAX_COEF = min(|debtor|, creditor)` (i.e. the
 *    receiver's owed amount), and we reduce both balances accordingly. The tax cost
 *    comes out of the debtor's pocket — that's how in-game money transfer works.
 */
function computeSettlement(
  participants: Participant[],
  moneyAmount: number,
): Settlement {
  const N = participants.length;
  const totalExpenses = participants.reduce((s, p) => s + (p.expense ?? 0), 0);
  const profit = Math.max(0, moneyAmount - totalExpenses);
  const shareEach = N > 0 ? profit / N : 0;

  const collectors = participants.filter((p) => p.collected);
  const numCollectors = collectors.length;
  const heldEach = numCollectors > 0 ? moneyAmount / numCollectors : 0;

  const entries: SettlementEntry[] = participants.map((p) => {
    const netShare = (p.expense ?? 0) + shareEach;
    const held = p.collected ? heldEach : 0;
    return {
      participantId: p.id,
      participantName: p.name,
      netShare,
      balance: +(netShare - held).toFixed(2), // +ve = owed money, -ve = owes money
    };
  });

  let warning: string | null = null;
  if (N === 0 || moneyAmount <= 0) {
    return { moneyAmount, totalExpenses, profit, shareEach, entries, transactions: [], warning };
  }
  if (numCollectors === 0) {
    warning = "Nadie marcó que cobró el dinero — no se pueden calcular transferencias.";
    return { moneyAmount, totalExpenses, profit, shareEach, entries, transactions: [], warning };
  }
  if (totalExpenses > moneyAmount) {
    warning = "Los gastos superan el dinero obtenido — no hay profit para repartir (solo reintegros).";
  }

  // Greedy match of debtors -> creditors (copy of balances so we can mutate)
  const work = entries.map((e) => ({ ...e }));
  const transactions: SettlementTransaction[] = [];
  const EPS = 0.005; // below ~0.5 centavo we consider settled

  while (true) {
    // Find biggest creditor (most positive balance) and biggest debtor (most negative)
    let creditorIdx = -1;
    let debtorIdx = -1;
    let maxCred = 0;
    let minDebt = 0;
    for (let i = 0; i < work.length; i++) {
      if (work[i].balance > maxCred) { maxCred = work[i].balance; creditorIdx = i; }
      if (work[i].balance < minDebt) { minDebt = work[i].balance; debtorIdx = i; }
    }
    if (creditorIdx === -1 || debtorIdx === -1) break;
    if (maxCred < EPS || -minDebt < EPS) break;

    const creditor = work[creditorIdx];
    const debtor = work[debtorIdx];
    // The receiver is owed `creditor.balance` net. Sender has `-debtor.balance` to give.
    // The debtor pays gross; receiver gets gross * TAX_COEF.
    // Limit to what the debtor can actually pay in gross terms.
    const maxNetReceiverWants = creditor.balance;
    const maxGrossDebtorCanPay = -debtor.balance; // debtor's budget is in "net share" terms
    // If debtor pays G gross, their own cost is G (they spend G from their wallet).
    // So the smaller of the two caps in gross terms is:
    //   grossCap = min(maxGrossDebtorCanPay, maxNetReceiverWants / TAX_COEF)
    const grossFromReceiverCap = maxNetReceiverWants / TAX_COEF;
    const gross = Math.min(maxGrossDebtorCanPay, grossFromReceiverCap);
    const net = gross * TAX_COEF;

    transactions.push({
      fromId: debtor.participantId,
      fromName: debtor.participantName,
      toId: creditor.participantId,
      toName: creditor.participantName,
      grossAmount: Math.round(gross * 100) / 100,
      netAmount: Math.round(net * 100) / 100,
    });

    debtor.balance = +(debtor.balance + gross).toFixed(2); // less negative
    creditor.balance = +(creditor.balance - net).toFixed(2); // less positive
  }

  return { moneyAmount, totalExpenses, profit, shareEach, entries, transactions, warning };
}

function loadHistory(): ActivitySession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(sessions: ActivitySession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 100)));
  } catch { /* quota */ }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ActivityManager() {
  const { user, profile } = useAuth();
  const supabase = createClient();

  // ── Data ──
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>(activityTypesFallback as ActivityType[]);
  const [lootCatalog, setLootCatalog] = useState<LootItem[]>(lootItemsFallback as LootItem[]);

  // ── Main state ──
  const [tab, setTab] = useState<"activity" | "history">("activity");
  const [selectedActivity, setSelectedActivity] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [newName, setNewName] = useState("");
  const [lootEntries, setLootEntries] = useState<LootEntry[]>([]);
  const [raffleMode, setRaffleMode] = useState<RaffleMode>("lottery");
  const [results, setResults] = useState<RaffleResult[] | null>(null);
  const [draftResults, setDraftResults] = useState<DraftResult | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [moneyInput, setMoneyInput] = useState<string>("");
  const [history, setHistory] = useState<ActivitySession[]>([]);
  const [viewingSession, setViewingSession] = useState<ActivitySession | null>(null);
  const [saved, setSaved] = useState(false);

  // ── Loot form ──
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedItem, setSelectedItem] = useState("");
  const [customItemName, setCustomItemName] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [lootSearch, setLootSearch] = useState("");

  // ── Animation ──
  const [isRolling, setIsRolling] = useState(false);
  const [rollingName, setRollingName] = useState("");
  const rollRef = useRef<NodeJS.Timeout | null>(null);

  // ── Party members auto-load ──
  const [partyMembers, setPartyMembers] = useState<Profile[]>([]);
  const [partyName, setPartyName] = useState<string | null>(null);
  const [loadingParty, setLoadingParty] = useState(true);

  // ── Real-time sync state ──
  const [partyId, setPartyId] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<SessionRole>("viewer");
  const [coHostIds, setCoHostIds] = useState<Set<string>>(new Set());
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const skipBroadcastRef = useRef(false);

  // ── Persistence state ──
  const [dbSessionId, setDbSessionId] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"" | "saving" | "saved">("");
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const skipAutoSaveRef = useRef(false);

  const canManage = sessionRole === "host" || sessionRole === "cohost";
  const hasActiveSession = selectedActivity !== "" || lootEntries.length > 0 || (results !== null) || (draftResults !== null);

  // ── Load data ──
  useEffect(() => {
    fetch("/api/activities/types")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d) && d.length > 0) setActivityTypes(d); })
      .catch(() => {});
    fetch("/api/activities/loot")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d) && d.length > 0) setLootCatalog(d); })
      .catch(() => {});
    setHistory(loadHistory());
  }, []);

  // ── Load party members ──
  useEffect(() => {
    async function loadParty() {
      if (!user) { setLoadingParty(false); return; }

      const { data: membership } = await supabase
        .from("party_members")
        .select("party_id")
        .eq("user_id", user.id)
        .limit(1);

      if (!membership || membership.length === 0) {
        setPartyMembers([]);
        setPartyName(null);
        setPartyId(null);
        setSessionRole("host"); // No party = solo host
        setLoadingParty(false);
        setSessionLoaded(true);
        return;
      }

      const pid = membership[0].party_id;
      setPartyId(pid);

      const { data: party } = await supabase
        .from("parties")
        .select("name, leader_id")
        .eq("id", pid)
        .single();

      if (party) {
        setPartyName(party.name);
        if (party.leader_id === user.id) {
          setSessionRole("host");
        } else {
          setSessionRole("viewer");
        }
      }

      const { data: members } = await supabase
        .from("party_members")
        .select("user_id")
        .eq("party_id", pid);

      if (members && members.length > 0) {
        const userIds = members.map((m) => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("*")
          .in("id", userIds);

        setPartyMembers((profiles ?? []) as Profile[]);
      }
      setLoadingParty(false);
    }
    loadParty();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENCE: Load active session from DB
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!partyId || !user || loadingParty) return;

    async function loadActiveSession() {
      const { data } = await supabase
        .from("activity_sessions")
        .select("*")
        .eq("party_id", partyId)
        .eq("status", "active")
        .limit(1)
        .single();

      if (data) {
        skipAutoSaveRef.current = true;
        skipBroadcastRef.current = true;
        setDbSessionId(data.id);
        setSelectedActivity(data.selected_activity ?? "");
        setParticipants(data.participants as Participant[] ?? []);
        setLootEntries(data.loot_entries as LootEntry[] ?? []);
        setRaffleMode((data.raffle_mode as RaffleMode) ?? "lottery");
        setResults(data.results as RaffleResult[] | null ?? null);
        setDraftResults(data.draft_results as DraftResult | null ?? null);
        setCoHostIds(new Set(data.co_host_ids ?? []));
        // Check if current user is a co-host
        if ((data.co_host_ids ?? []).includes(user!.id)) {
          setSessionRole("cohost");
        }
        setTimeout(() => {
          skipAutoSaveRef.current = false;
          skipBroadcastRef.current = false;
        }, 200);
      }
      setSessionLoaded(true);
    }

    loadActiveSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId, loadingParty]);

  // ── Auto-load party members as participants ──
  const loadPartyAsParticipants = useCallback(() => {
    if (partyMembers.length === 0) return;
    const partyParticipants: Participant[] = partyMembers.map((m) => ({
      id: m.id,
      name: m.display_name ?? m.username ?? "Jugador",
      avatarUrl: m.avatar_url,
      contributed: false,
      weight: 1,
      isFromParty: true,
    }));
    setParticipants((prev) => {
      const manual = prev.filter((p) => !p.isFromParty);
      return [...partyParticipants, ...manual];
    });
  }, [partyMembers]);

  useEffect(() => {
    if (!loadingParty && sessionLoaded && partyMembers.length > 0 && participants.length === 0) {
      loadPartyAsParticipants();
    }
  }, [loadingParty, sessionLoaded, partyMembers, participants.length, loadPartyAsParticipants]);

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENCE: Auto-save to DB (debounced)
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!canManage || !partyId || !user || !sessionLoaded || skipAutoSaveRef.current || isRolling) return;
    // Don't save if nothing meaningful exists
    if (!selectedActivity && lootEntries.length === 0 && !results && !draftResults) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      setAutoSaveStatus("saving");

      const sessionData = {
        party_id: partyId,
        host_id: user.id,
        selected_activity: selectedActivity,
        participants,
        loot_entries: lootEntries,
        raffle_mode: raffleMode,
        results,
        draft_results: draftResults,
        co_host_ids: Array.from(coHostIds),
        updated_at: new Date().toISOString(),
      };

      if (dbSessionId) {
        // Update existing
        await supabase
          .from("activity_sessions")
          .update(sessionData)
          .eq("id", dbSessionId);
      } else {
        // Create new
        const { data } = await supabase
          .from("activity_sessions")
          .insert({ ...sessionData, status: "active" })
          .select("id")
          .single();
        if (data) setDbSessionId(data.id);
      }

      setAutoSaveStatus("saved");
      setTimeout(() => setAutoSaveStatus(""), 2000);
    }, AUTOSAVE_DELAY);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedActivity, lootEntries, participants, raffleMode, results, draftResults, coHostIds]);

  // ═══════════════════════════════════════════════════════════════════════════
  // REAL-TIME BROADCAST CHANNEL
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!partyId || !user || !profile) return;

    const channel = supabase.channel(`activity-session:${partyId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const users: ConnectedUser[] = [];
      for (const key of Object.keys(state)) {
        for (const p of state[key] as unknown as { user_id: string; display_name: string; role: SessionRole }[]) {
          if (!users.find((u) => u.id === p.user_id)) {
            users.push({ id: p.user_id, name: p.display_name, role: p.role });
          }
        }
      }
      setConnectedUsers(users);
    });

    channel.on("broadcast", { event: "state_sync" }, ({ payload }: { payload: SyncPayload }) => {
      skipBroadcastRef.current = true;
      skipAutoSaveRef.current = true;
      setSelectedActivity(payload.selectedActivity);
      setLootEntries(payload.lootEntries);
      setParticipants(payload.participants);
      setRaffleMode(payload.raffleMode);
      setResults(payload.results);
      setDraftResults(payload.draftResults);
      setSettlement(payload.settlement ?? null);
      setIsRolling(payload.isRolling);
      setRollingName(payload.rollingName);
      setSaved(false);
      setTimeout(() => {
        skipBroadcastRef.current = false;
        skipAutoSaveRef.current = false;
      }, 100);
    });

    channel.on("broadcast", { event: "role_change" }, ({ payload }: { payload: { userId: string; newRole: SessionRole; allCoHostIds: string[] } }) => {
      if (payload.userId === user.id) {
        setSessionRole(payload.newRole);
      }
      setCoHostIds(new Set(payload.allCoHostIds));
    });

    // Session cancelled broadcast
    channel.on("broadcast", { event: "session_cancelled" }, () => {
      skipBroadcastRef.current = true;
      skipAutoSaveRef.current = true;
      setSelectedActivity("");
      setLootEntries([]);
      setResults(null);
      setDraftResults(null);
      setSettlement(null);
      setMoneyInput("");
      setRollingName("");
      setDbSessionId(null);
      setSaved(false);
      // Reload party participants
      if (partyMembers.length > 0) {
        const partyP: Participant[] = partyMembers.map((m) => ({
          id: m.id, name: m.display_name ?? m.username ?? "Jugador",
          avatarUrl: m.avatar_url, contributed: false, weight: 1, isFromParty: true,
        }));
        setParticipants(partyP);
      } else {
        setParticipants([]);
      }
      setTimeout(() => {
        skipBroadcastRef.current = false;
        skipAutoSaveRef.current = false;
      }, 200);
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          user_id: user.id,
          display_name: profile.display_name ?? profile.username ?? "Jugador",
          role: sessionRole,
        });
      }
    });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId, user, profile]);

  // Re-track presence when role changes
  useEffect(() => {
    if (!channelRef.current || !user || !profile) return;
    channelRef.current.track({
      user_id: user.id,
      display_name: profile.display_name ?? profile.username ?? "Jugador",
      role: sessionRole,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionRole]);

  // Auto-broadcast state changes if host/cohost
  useEffect(() => {
    if (!channelRef.current || !canManage || skipBroadcastRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "state_sync",
      payload: {
        selectedActivity,
        lootEntries,
        participants,
        raffleMode,
        results,
        draftResults,
        settlement,
        isRolling,
        rollingName,
      } as SyncPayload,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedActivity, lootEntries, participants, raffleMode, results, draftResults, settlement, isRolling, rollingName]);

  // ── Promote / demote co-host ──
  const toggleCoHost = useCallback((userId: string) => {
    if (sessionRole !== "host") return;
    setCoHostIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "role_change",
          payload: {
            userId,
            newRole: next.has(userId) ? "cohost" : "viewer",
            allCoHostIds: Array.from(next),
          },
        });
      }
      return next;
    });
  }, [sessionRole]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CANCEL ACTIVITY SESSION
  // ═══════════════════════════════════════════════════════════════════════════

  const cancelSession = useCallback(async () => {
    // Delete from DB
    if (dbSessionId) {
      await supabase
        .from("activity_sessions")
        .delete()
        .eq("id", dbSessionId);
    }

    // Broadcast cancellation to all viewers
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "session_cancelled",
        payload: {},
      });
    }

    // Reset local state
    skipAutoSaveRef.current = true;
    setDbSessionId(null);
    setSelectedActivity("");
    setLootEntries([]);
    setResults(null);
    setDraftResults(null);
    setSettlement(null);
    setMoneyInput("");
    setRollingName("");
    setSaved(false);
    setShowCancelConfirm(false);

    if (partyMembers.length > 0) {
      const partyP: Participant[] = partyMembers.map((m) => ({
        id: m.id, name: m.display_name ?? m.username ?? "Jugador",
        avatarUrl: m.avatar_url, contributed: false, weight: 1, isFromParty: true,
      }));
      setParticipants(partyP);
    } else {
      setParticipants([]);
    }

    setTimeout(() => { skipAutoSaveRef.current = false; }, 300);
  }, [dbSessionId, supabase, partyMembers]);

  // ═══════════════════════════════════════════════════════════════════════════
  // DERIVED
  // ═══════════════════════════════════════════════════════════════════════════

  const activity = activityTypes.find((a) => a.id === selectedActivity);

  const groupedCatalog = useMemo(() => {
    const groups: Record<string, LootItem[]> = {};
    for (const item of lootCatalog) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [lootCatalog]);

  const filteredItems = useMemo(() => {
    let items = selectedCategory
      ? lootCatalog.filter((i) => i.category === selectedCategory)
      : lootCatalog;
    if (lootSearch.trim()) {
      const q = lootSearch.toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q));
    }
    return items;
  }, [lootCatalog, selectedCategory, lootSearch]);

  // Money is stored inside lootEntries as a sentinel entry (category === "money"),
  // so we don't need DB schema changes. The `quantity` field holds the money amount.
  const moneyAmount = useMemo(() => {
    const e = lootEntries.find((x) => x.itemId === MONEY_SENTINEL_ID);
    return e ? e.quantity : 0;
  }, [lootEntries]);

  // Keep the text input in sync when data loads from DB/realtime
  useEffect(() => {
    if (moneyAmount > 0 && moneyInput === "") setMoneyInput(String(moneyAmount));
    if (moneyAmount === 0 && moneyInput !== "") {
      // only clear if user hasn't started typing a new value
      const parsed = parseInt(moneyInput, 10);
      if (!isNaN(parsed) && parsed > 0) return;
      setMoneyInput("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moneyAmount]);

  const setMoneyAmount = useCallback((amount: number) => {
    setLootEntries((prev) => {
      const filtered = prev.filter((e) => e.itemId !== MONEY_SENTINEL_ID);
      if (amount > 0) {
        filtered.unshift({
          id: MONEY_SENTINEL_ID,
          itemId: MONEY_SENTINEL_ID,
          itemName: "Dinero (aUEC)",
          category: "money",
          rarity: "legendary",
          quantity: Math.floor(amount),
        });
      }
      return filtered;
    });
  }, []);

  const flatLoot = useMemo(() => {
    const items: { itemName: string; category: string; rarity: string }[] = [];
    for (const entry of lootEntries) {
      if (entry.itemId === MONEY_SENTINEL_ID) continue; // skip money sentinel
      for (let i = 0; i < entry.quantity; i++) {
        items.push({ itemName: entry.itemName, category: entry.category, rarity: entry.rarity });
      }
    }
    return items;
  }, [lootEntries]);

  // Physical loot entries (excluding the money sentinel) — used by the list UI
  const physicalLootEntries = useMemo(
    () => lootEntries.filter((e) => e.itemId !== MONEY_SENTINEL_ID),
    [lootEntries],
  );

  const hasResults = results !== null || draftResults !== null || settlement !== null;

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const addParticipant = useCallback(() => {
    const name = newName.trim();
    if (!name || participants.some((p) => p.name === name)) return;
    setParticipants((prev) => [...prev, { id: uid(), name, avatarUrl: null, contributed: false, weight: 1, isFromParty: false }]);
    setNewName("");
  }, [newName, participants]);

  const removeParticipant = useCallback((id: string) => {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const toggleContributed = useCallback((id: string) => {
    setParticipants((prev) =>
      prev.map((p) => p.id === id ? { ...p, contributed: !p.contributed, weight: !p.contributed ? 2 : 1 } : p)
    );
  }, []);

  const setWeight = useCallback((id: string, w: number) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, weight: Math.max(1, w) } : p)));
  }, []);

  const toggleCollected = useCallback((id: string) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, collected: !p.collected } : p)));
  }, []);

  const setExpense = useCallback((id: string, v: number) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, expense: Math.max(0, v) } : p)));
  }, []);

  // ── Loot ──
  const addLootEntry = useCallback(() => {
    const item = lootCatalog.find((i) => i.id === selectedItem);
    const name = item ? item.name : customItemName.trim();
    if (!name) return;
    setLootEntries((prev) => [
      ...prev,
      { id: uid(), itemId: item?.id ?? "custom-" + uid(), itemName: name, category: item?.category ?? (selectedCategory || "misc"), rarity: item?.rarity ?? "common", quantity: itemQty },
    ]);
    setSelectedItem("");
    setCustomItemName("");
    setItemQty(1);
    setLootSearch("");
  }, [selectedItem, customItemName, itemQty, lootCatalog, selectedCategory]);

  const removeLootEntry = useCallback((id: string) => {
    setLootEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // ── Lottery (wishlist-aware) ──
  const runLottery = useCallback(async () => {
    if (participants.length === 0 || flatLoot.length === 0) return;

    const partyParticipantIds = participants.filter((p) => p.isFromParty).map((p) => p.id);
    let wishlists: Record<string, Set<string>> = {};

    if (partyParticipantIds.length > 0) {
      try {
        const { data } = await supabase
          .from("user_wishlist")
          .select("user_id, item_name, priority")
          .in("user_id", partyParticipantIds);
        if (data) {
          for (const row of data) {
            if (!wishlists[row.user_id]) wishlists[row.user_id] = new Set();
            wishlists[row.user_id].add(row.item_name.toLowerCase());
          }
        }
      } catch {
        // If wishlist fetch fails, proceed without
      }
    }

    setIsRolling(true);
    setSaved(false);
    let rollCount = 0;
    rollRef.current = setInterval(() => {
      rollCount++;
      setRollingName(participants[Math.floor(Math.random() * participants.length)].name);
      if (rollCount >= 20) {
        if (rollRef.current) clearInterval(rollRef.current);
        setIsRolling(false);
        setRollingName("");

        const resultMap: Record<string, { participantName: string; items: typeof flatLoot }> = {};
        for (const p of participants) resultMap[p.id] = { participantName: p.name, items: [] };

        const ordered = weightedShuffle(participants);
        const maxPerPerson = Math.ceil(flatLoot.length / participants.length);

        const wishlistedItems: { item: (typeof flatLoot)[0]; wanters: string[] }[] = [];
        const genericItems: (typeof flatLoot)[0][] = [];

        for (const item of shuffleArray(flatLoot)) {
          const wanters = ordered
            .filter((p) => wishlists[p.id]?.has(item.itemName.toLowerCase()))
            .map((p) => p.id);
          if (wanters.length > 0) {
            wishlistedItems.push({ item, wanters });
          } else {
            genericItems.push(item);
          }
        }

        for (const { item, wanters } of wishlistedItems) {
          const eligible = wanters
            .filter((id) => resultMap[id].items.length < maxPerPerson)
            .sort((a, b) => resultMap[a].items.length - resultMap[b].items.length);
          if (eligible.length > 0) {
            resultMap[eligible[0]].items.push(item);
          } else {
            genericItems.push(item);
          }
        }

        let idx = 0;
        for (const item of shuffleArray(genericItems)) {
          const p = ordered[idx % ordered.length];
          resultMap[p.id].items.push(item);
          idx++;
        }

        setResults(Object.entries(resultMap).map(([pid, data]) => ({
          participantId: pid, participantName: data.participantName, items: data.items,
        })));
        setDraftResults(null);
      }
    }, 100);
  }, [participants, flatLoot, supabase]);

  // ── Split (deterministic equal distribution, round-robin by rarity) ──
  const runSplit = useCallback(() => {
    if (participants.length === 0 || flatLoot.length === 0) return;
    setIsRolling(true);
    setSaved(false);
    let rollCount = 0;
    rollRef.current = setInterval(() => {
      rollCount++;
      setRollingName(participants[Math.floor(Math.random() * participants.length)].name);
      if (rollCount >= 20) {
        if (rollRef.current) clearInterval(rollRef.current);
        setIsRolling(false);
        setRollingName("");

        // Sort by rarity descending so that rarest items get distributed first (fairness)
        const rarityRank: Record<string, number> = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
        const sortedLoot = [...flatLoot].sort(
          (a, b) => (rarityRank[b.rarity] ?? 0) - (rarityRank[a.rarity] ?? 0),
        );

        const resultMap: Record<string, { participantName: string; items: typeof flatLoot }> = {};
        for (const p of participants) resultMap[p.id] = { participantName: p.name, items: [] };

        // Weighted round-robin: participants with higher weight receive more passes
        const expanded: Participant[] = [];
        for (const p of participants) {
          for (let i = 0; i < p.weight; i++) expanded.push(p);
        }
        // Shuffle the expanded order once so ties in rarity are distributed fairly
        const order = shuffleArray(expanded);

        let idx = 0;
        for (const item of sortedLoot) {
          const p = order[idx % order.length];
          resultMap[p.id].items.push(item);
          idx++;
        }

        setResults(
          participants.map((p) => ({
            participantId: p.id,
            participantName: p.name,
            items: resultMap[p.id].items,
          })),
        );
        setDraftResults(null);
      }
    }, 100);
  }, [participants, flatLoot]);

  // ── Draft ──
  const runDraft = useCallback(() => {
    if (participants.length === 0) return;
    setIsRolling(true);
    setSaved(false);
    let rollCount = 0;
    rollRef.current = setInterval(() => {
      rollCount++;
      setRollingName(participants[Math.floor(Math.random() * participants.length)].name);
      if (rollCount >= 20) {
        if (rollRef.current) clearInterval(rollRef.current);
        setIsRolling(false);
        setRollingName("");
        const ordered = weightedShuffle(participants);
        setDraftResults({ order: ordered.map((p, i) => ({ participantId: p.id, participantName: p.name, position: i + 1 })) });
        setResults(null);
      }
    }, 100);
  }, [participants]);

  // ── Unified SORTEAR: compute money settlement + run the chosen loot distribution ──
  const runSorteo = useCallback(() => {
    if (participants.length < 2) return;

    // Compute settlement upfront if there's money at stake
    if (moneyAmount > 0) {
      const s = computeSettlement(participants, moneyAmount);
      setSettlement(s);
    } else {
      setSettlement(null);
    }

    // Run the appropriate loot distribution (only if there's physical loot)
    if (flatLoot.length === 0) {
      // Money-only activity: no loot to distribute, just show settlement
      setResults(null);
      setDraftResults(null);
      setSaved(false);
      return;
    }

    if (raffleMode === "lottery") runLottery();
    else if (raffleMode === "split") runSplit();
    else runDraft();
  }, [participants, moneyAmount, flatLoot.length, raffleMode, runLottery, runSplit, runDraft]);

  // ── Save to local history ──
  const saveSession = useCallback(() => {
    const session: ActivitySession = {
      id: uid(), date: new Date().toISOString(),
      activityName: activity?.name ?? "Custom", activityId: selectedActivity,
      participants, loot: lootEntries, mode: raffleMode,
      results: raffleMode === "draft" ? draftResults : results,
      settlement,
    };
    const updated = [session, ...history].slice(0, 100);
    setHistory(updated);
    saveHistory(updated);
    setSaved(true);
  }, [activity, selectedActivity, participants, lootEntries, raffleMode, results, draftResults, settlement, history]);

  // ── Finish + close: save to history then cancel DB session ──
  const finishSession = useCallback(async () => {
    // Save to local history first
    saveSession();
    // Mark DB session as completed and clean up
    if (dbSessionId) {
      await supabase
        .from("activity_sessions")
        .update({ status: "completed" })
        .eq("id", dbSessionId);
    }
    // Broadcast cancellation so viewers see it's done
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "session_cancelled",
        payload: {},
      });
    }
    skipAutoSaveRef.current = true;
    setDbSessionId(null);
    setSelectedActivity("");
    setLootEntries([]);
    setResults(null);
    setDraftResults(null);
    setSettlement(null);
    setMoneyInput("");
    setRollingName("");
    setSaved(false);
    if (partyMembers.length > 0) {
      const partyP: Participant[] = partyMembers.map((m) => ({
        id: m.id, name: m.display_name ?? m.username ?? "Jugador",
        avatarUrl: m.avatar_url, contributed: false, weight: 1, isFromParty: true,
      }));
      setParticipants(partyP);
    } else {
      setParticipants([]);
    }
    setTimeout(() => { skipAutoSaveRef.current = false; }, 300);
  }, [saveSession, dbSessionId, supabase, partyMembers]);

  // ── Reset (new activity, same session concept) ──
  const resetSession = useCallback(async () => {
    // Delete DB session to start fresh
    if (dbSessionId) {
      await supabase
        .from("activity_sessions")
        .delete()
        .eq("id", dbSessionId);
      setDbSessionId(null);
    }
    skipAutoSaveRef.current = true;
    setResults(null);
    setDraftResults(null);
    setSettlement(null);
    setMoneyInput("");
    setRollingName("");
    setLootEntries([]);
    setSelectedActivity("");
    setSaved(false);
    if (partyMembers.length > 0) {
      const partyP: Participant[] = partyMembers.map((m) => ({
        id: m.id, name: m.display_name ?? m.username ?? "Jugador",
        avatarUrl: m.avatar_url, contributed: false, weight: 1, isFromParty: true,
      }));
      setParticipants(partyP);
    } else {
      setParticipants([]);
    }
    setTimeout(() => { skipAutoSaveRef.current = false; }, 300);
  }, [partyMembers, dbSessionId, supabase]);

  const deleteHistoryItem = useCallback((id: string) => {
    const updated = history.filter((s) => s.id !== id);
    setHistory(updated);
    saveHistory(updated);
  }, [history]);

  useEffect(() => {
    return () => { if (rollRef.current) clearInterval(rollRef.current); };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  const roleLabel = sessionRole === "host" ? "HOST" : sessionRole === "cohost" ? "CO-HOST" : "VIEWER";
  const roleBg = sessionRole === "host" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : sessionRole === "cohost" ? "bg-sky-500/20 text-sky-400 border-sky-500/30" : "bg-zinc-700/30 text-zinc-400 border-zinc-600/30";

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Cancel confirmation modal ── */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-sm w-full mx-4 space-y-4 shadow-2xl">
            <h3 className="text-lg text-zinc-200 font-medium">Cancelar actividad?</h3>
            <p className="text-sm text-zinc-400">
              Se perdera todo el progreso actual: loot cargado, configuracion de participantes y resultados.
              {connectedUsers.length > 1 && " Todos los usuarios conectados veran la sesion cerrada."}
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-medium rounded transition-colors"
              >
                Volver
              </button>
              <button
                onClick={cancelSession}
                className="flex-1 py-2 bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium rounded transition-colors active:scale-[0.98]"
              >
                Si, cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Connected users bar ── */}
      {partyId && connectedUsers.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-zinc-800/50 bg-zinc-900/40">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider">En vivo</span>
          </div>
          <div className="flex items-center gap-2 flex-1 overflow-x-auto">
            {connectedUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800/60 border border-zinc-700/40 shrink-0">
                <span className="text-xs text-zinc-300">{u.name}</span>
                <span className={`text-[9px] px-1 rounded ${
                  u.role === "host" ? "bg-amber-500/20 text-amber-400" :
                  u.role === "cohost" ? "bg-sky-500/20 text-sky-400" :
                  "bg-zinc-700/40 text-zinc-500"
                }`}>
                  {u.role === "host" ? "HOST" : u.role === "cohost" ? "CO-HOST" : ""}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {/* Auto-save indicator */}
            {autoSaveStatus && (
              <span className={`text-[10px] ${autoSaveStatus === "saving" ? "text-amber-400/60" : "text-emerald-400/60"}`}>
                {autoSaveStatus === "saving" ? "Guardando..." : "Guardado ✓"}
              </span>
            )}
            <div className={`text-[10px] px-2 py-0.5 rounded-full border ${roleBg}`}>
              {roleLabel}
            </div>
          </div>
        </div>
      )}

      {/* ── Viewer banner ── */}
      {partyId && !canManage && (
        <div className="px-3 py-2 rounded-lg border border-sky-500/20 bg-sky-500/5 text-sm text-sky-400/80 text-center">
          👁 Modo espectador — solo el host y co-hosts pueden gestionar la actividad
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex items-center gap-3 border-b border-zinc-800/60 pb-3">
        <button
          onClick={() => { setTab("activity"); setViewingSession(null); }}
          className={`px-4 py-2 text-sm tracking-wider uppercase transition-all ${tab === "activity" && !viewingSession ? "text-amber-400 border-b-2 border-amber-500" : "text-zinc-500 hover:text-zinc-400 border-b-2 border-transparent"}`}
        >
          🎲 Actividad
        </button>
        <button
          onClick={() => { setTab("history"); setViewingSession(null); }}
          className={`px-4 py-2 text-sm tracking-wider uppercase transition-all ${tab === "history" || viewingSession ? "text-amber-400 border-b-2 border-amber-500" : "text-zinc-500 hover:text-zinc-400 border-b-2 border-transparent"}`}
        >
          📜 Historial ({history.length})
        </button>
        {/* Cancel activity — visible when there's an active session */}
        {tab === "activity" && hasActiveSession && canManage && !isRolling && (
          <button
            onClick={() => setShowCancelConfirm(true)}
            className="ml-auto px-3 py-1.5 text-xs text-red-400/70 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 rounded transition-all hover:bg-red-500/5"
          >
            ✕ Cancelar Actividad
          </button>
        )}
      </div>

      {/* ═══ HISTORY ═══ */}
      {tab === "history" && !viewingSession && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">No hay actividades guardadas.</p>
          ) : (
            history.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded border border-zinc-800/50 bg-zinc-900/40 hover:bg-zinc-900/60 transition-colors">
                <div className="flex-1 cursor-pointer" onClick={() => setViewingSession(s)}>
                  <div className="text-sm text-zinc-200">{s.activityName}</div>
                  <div className="text-xs text-zinc-500">
                    {new Date(s.date).toLocaleString("es-AR")} • {s.participants.length} participantes • {s.mode === "lottery" ? "Loteria" : s.mode === "split" ? "Repartir" : "Draft"} • {s.loot.filter((l) => l.itemId !== MONEY_SENTINEL_ID).reduce((a, l) => a + l.quantity, 0)} items{s.settlement && s.settlement.moneyAmount > 0 ? ` • 💰 ${s.settlement.moneyAmount.toLocaleString("es-AR")} aUEC` : ""}
                  </div>
                </div>
                <button onClick={() => deleteHistoryItem(s.id)} className="text-zinc-600 hover:text-red-400 text-xs ml-2">✕</button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ═══ VIEWING SESSION ═══ */}
      {viewingSession && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewingSession(null)} className="text-zinc-500 hover:text-zinc-300 text-sm">← Volver</button>
            <h2 className="text-lg text-zinc-300">{viewingSession.activityName}</h2>
            <span className="text-xs text-zinc-500">{new Date(viewingSession.date).toLocaleString("es-AR")}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded border border-zinc-800/50 bg-zinc-900/40">
              <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Participantes</h3>
              {viewingSession.participants.map((p) => (
                <div key={p.id} className="text-sm text-zinc-300">
                  {p.name}{p.contributed && <span className="text-amber-400 ml-1">★</span>}
                  {p.weight > 1 && <span className="text-xs text-zinc-500 ml-1">(x{p.weight})</span>}
                </div>
              ))}
            </div>
            <div className="p-3 rounded border border-zinc-800/50 bg-zinc-900/40">
              <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Botin</h3>
              {viewingSession.loot.map((l) => (
                <div key={l.id} className="text-sm text-zinc-300">
                  <span className={RARITY_COLORS[l.rarity] ?? "text-zinc-400"}>{l.itemName}</span>
                  {l.quantity > 1 && <span className="text-zinc-500"> x{l.quantity}</span>}
                </div>
              ))}
            </div>
          </div>
          {viewingSession.settlement && renderSettlement(viewingSession.settlement)}
          {(viewingSession.mode === "lottery" || viewingSession.mode === "split") && Array.isArray(viewingSession.results) && (
            <div className="space-y-3">
              <h3 className="text-sm text-zinc-400 uppercase tracking-wider">Resultado del Sorteo</h3>
              {renderLotteryResults(viewingSession.results as RaffleResult[])}
            </div>
          )}
          {viewingSession.mode === "draft" && viewingSession.results && (
            <div className="space-y-3">
              <h3 className="text-sm text-zinc-400 uppercase tracking-wider">Orden de Seleccion</h3>
              {renderDraftResults(viewingSession.results as DraftResult)}
            </div>
          )}
        </div>
      )}

      {/* ═══ MAIN ACTIVITY VIEW — ALL IN ONE ═══ */}
      {tab === "activity" && !viewingSession && (
        <>
          {/* Rolling animation overlay */}
          {isRolling && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4 rounded-lg border border-amber-500/20 bg-zinc-900/60">
              <div className="text-5xl animate-bounce">🎲</div>
              <div className="text-2xl text-amber-400 font-bold animate-pulse tracking-wider">{rollingName}</div>
              <div className="text-sm text-zinc-500">Sorteando...</div>
            </div>
          )}

          {/* Results block */}
          {hasResults && !isRolling && (
            <div className="space-y-4 p-4 rounded-lg border border-amber-500/20 bg-zinc-900/40">
              <h2 className="text-lg text-amber-400 tracking-wider uppercase text-center">🏆 Resultados</h2>

              {/* Settlement (money distribution) always shown first if present */}
              {settlement && renderSettlement(settlement)}

              {/* Loot distribution */}
              {(raffleMode === "lottery" || raffleMode === "split") && results && renderLotteryResults(results)}
              {raffleMode === "draft" && draftResults && (
                <>
                  {renderDraftResults(draftResults)}
                  {physicalLootEntries.length > 0 && (
                    <div className="mt-3 p-3 rounded border border-zinc-800/50 bg-zinc-900/30">
                      <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Botin disponible para elegir</h3>
                      {physicalLootEntries.map((entry) => (
                        <div key={entry.id} className="text-sm text-zinc-300">
                          <span className={RARITY_COLORS[entry.rarity] ?? "text-zinc-400"}>{entry.itemName}</span>
                          {entry.quantity > 1 && <span className="text-zinc-500"> x{entry.quantity}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-3">
                {canManage ? (
                  <>
                    <button
                      onClick={finishSession}
                      className="flex-1 py-2 bg-emerald-600/80 hover:bg-emerald-600 active:scale-[0.98] text-zinc-950 font-medium rounded transition-all"
                    >
                      💾 Guardar y Finalizar
                    </button>
                    <button onClick={resetSession} className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-medium rounded transition-colors">
                      🔄 Nueva Actividad
                    </button>
                  </>
                ) : (
                  <button
                    onClick={saveSession}
                    disabled={saved}
                    className={`flex-1 py-2 font-medium rounded transition-all duration-200 ${saved ? "bg-emerald-800/30 text-emerald-400 border border-emerald-600/30 cursor-default" : "bg-emerald-600/80 hover:bg-emerald-600 active:scale-[0.98] text-zinc-950"}`}
                  >
                    {saved ? "Guardado ✓" : "💾 Guardar en mi Historial"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Two-column layout ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ═══ LEFT COLUMN: Activity + Participants ═══ */}
            <div className="space-y-5">

              {/* Activity Selection */}
              <div className="space-y-2">
                <h2 className="text-xs text-zinc-500 uppercase tracking-wider">Actividad</h2>
                <select
                  value={selectedActivity}
                  onChange={(e) => setSelectedActivity(e.target.value)}
                  disabled={!canManage}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">— Elegir actividad —</option>
                  {Object.entries(
                    activityTypes.reduce((acc, a) => {
                      if (!acc[a.category]) acc[a.category] = [];
                      acc[a.category].push(a);
                      return acc;
                    }, {} as Record<string, ActivityType[]>)
                  ).map(([cat, items]) => (
                    <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                      {items.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                    </optgroup>
                  ))}
                </select>
                {activity && (
                  <div className="p-2.5 rounded border border-zinc-800/50 bg-zinc-900/30 text-sm">
                    <div className="text-zinc-400 text-xs">{activity.description}</div>
                    <div className="flex gap-3 mt-1.5 text-[10px] text-zinc-500">
                      <span>Jugadores: {activity.minPlayers}-{activity.maxPlayers}</span>
                      <span className={DIFFICULTY_COLORS[activity.difficulty] ?? ""}>{activity.difficulty.toUpperCase()}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Participants */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs text-zinc-500 uppercase tracking-wider">
                    Participantes ({participants.length})
                  </h2>
                  {partyMembers.length > 0 && canManage && (
                    <button
                      onClick={loadPartyAsParticipants}
                      className="text-[10px] text-amber-500/70 hover:text-amber-400 transition-colors"
                    >
                      ↻ Recargar Party
                    </button>
                  )}
                </div>

                {partyMembers.length > 0 && participants.some((p) => p.isFromParty) && (
                  <div className="px-2.5 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400/80">
                    🎮 Miembros de <span className="font-medium">{partyName ?? "tu party"}</span> cargados automaticamente
                  </div>
                )}

                {canManage && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addParticipant()}
                      placeholder="Agregar jugador manual..."
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
                    />
                    <button onClick={addParticipant} className="px-3 py-1.5 bg-amber-600/80 hover:bg-amber-600 active:scale-95 text-zinc-950 text-sm rounded transition-all">+</button>
                  </div>
                )}

                {participants.length > 0 && (
                  <div className="space-y-1 max-h-80 overflow-y-auto">
                    {participants.map((p, i) => (
                      <div key={p.id} className="p-1.5 rounded border border-zinc-800/40 bg-zinc-900/30 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-600 w-4">{i + 1}</span>
                          {p.avatarUrl ? (
                            <img src={p.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px]">👤</div>
                          )}
                          <span className="flex-1 text-sm text-zinc-200">{p.name}</span>
                          {p.isFromParty && <span className="text-[9px] text-amber-500/50 bg-amber-500/10 px-1 rounded">PARTY</span>}

                          {sessionRole === "host" && p.isFromParty && p.id !== user?.id && (
                            <button
                              onClick={() => toggleCoHost(p.id)}
                              className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                                coHostIds.has(p.id)
                                  ? "bg-sky-500/20 text-sky-400 border-sky-500/30 hover:bg-sky-500/10"
                                  : "bg-zinc-800/60 text-zinc-500 border-zinc-700/40 hover:text-sky-400 hover:border-sky-500/30"
                              }`}
                              title={coHostIds.has(p.id) ? "Quitar co-host" : "Hacer co-host"}
                            >
                              {coHostIds.has(p.id) ? "CO-HOST ✓" : "→ Co-host"}
                            </button>
                          )}

                          {canManage && (
                            <>
                              <label className="flex items-center gap-1 text-[10px] text-zinc-500 cursor-pointer">
                                <input type="checkbox" checked={p.contributed} onChange={() => toggleContributed(p.id)} className="accent-amber-500 w-3 h-3" />
                                Aporto
                              </label>
                              <div className="flex items-center gap-0.5">
                                <span className="text-[10px] text-zinc-600">x</span>
                                <input
                                  type="number" min={1} max={5} value={p.weight}
                                  onChange={(e) => setWeight(p.id, parseInt(e.target.value) || 1)}
                                  className="w-8 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[10px] text-center text-zinc-300 focus:border-amber-500 focus:outline-none"
                                />
                              </div>
                              <button onClick={() => removeParticipant(p.id)} className="text-zinc-600 hover:text-red-400 text-xs">✕</button>
                            </>
                          )}
                        </div>

                        {/* Money row — only visible when there's money at stake */}
                        {moneyAmount > 0 && canManage && (
                          <div className="flex items-center gap-2 pl-6 text-[10px]">
                            <label className="flex items-center gap-1 text-zinc-500 cursor-pointer" title="Marca si este participante cobró/vendió el botín (tiene el dinero en su cuenta)">
                              <input
                                type="checkbox"
                                checked={!!p.collected}
                                onChange={() => toggleCollected(p.id)}
                                className="accent-emerald-500 w-3 h-3"
                              />
                              <span className={p.collected ? "text-emerald-400" : ""}>💰 Cobró</span>
                            </label>
                            <div className="flex items-center gap-1 flex-1">
                              <span className="text-zinc-500" title="Dinero que este participante invirtió/gastó (será reintegrado)">Gasto:</span>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={p.expense ?? 0}
                                onChange={(e) => setExpense(p.id, parseInt(e.target.value) || 0)}
                                placeholder="0"
                                className="w-20 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-300 focus:border-amber-500 focus:outline-none"
                              />
                              <span className="text-zinc-600">aUEC</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!loadingParty && partyMembers.length === 0 && participants.length === 0 && (
                  <div className="text-xs text-zinc-600 text-center py-3">
                    No estas en una party. Agrega participantes manualmente o crea una party primero.
                  </div>
                )}
              </div>

              {/* Raffle Mode */}
              <div className="space-y-2">
                <h2 className="text-xs text-zinc-500 uppercase tracking-wider">Modo de Reparto del Botín</h2>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => canManage && setRaffleMode("lottery")}
                    className={`p-2.5 rounded border text-left transition-all ${!canManage ? "opacity-50 cursor-not-allowed" : ""} ${raffleMode === "lottery" ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-zinc-700 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600"}`}
                  >
                    <div className="text-sm font-medium">🎰 Loteria</div>
                    <div className="text-[10px] mt-0.5 opacity-70">Sortear con wishlist</div>
                  </button>
                  <button
                    onClick={() => canManage && setRaffleMode("split")}
                    className={`p-2.5 rounded border text-left transition-all ${!canManage ? "opacity-50 cursor-not-allowed" : ""} ${raffleMode === "split" ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-zinc-700 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600"}`}
                  >
                    <div className="text-sm font-medium">⚖ Repartir</div>
                    <div className="text-[10px] mt-0.5 opacity-70">Dividir en partes iguales</div>
                  </button>
                  <button
                    onClick={() => canManage && setRaffleMode("draft")}
                    className={`p-2.5 rounded border text-left transition-all ${!canManage ? "opacity-50 cursor-not-allowed" : ""} ${raffleMode === "draft" ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-zinc-700 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600"}`}
                  >
                    <div className="text-sm font-medium">📋 Draft</div>
                    <div className="text-[10px] mt-0.5 opacity-70">Orden y elegir turno</div>
                  </button>
                </div>
              </div>
            </div>

            {/* ═══ RIGHT COLUMN: Loot ═══ */}
            <div className="space-y-5">

              {/* Money input (Dinero) */}
              <div className="space-y-2">
                <h2 className="text-xs text-zinc-500 uppercase tracking-wider">💰 Dinero (aUEC)</h2>
                {canManage ? (
                  <div className="p-3 rounded border border-amber-500/20 bg-amber-500/5 space-y-2">
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={moneyInput}
                        onChange={(e) => {
                          const v = e.target.value;
                          setMoneyInput(v);
                          const parsed = parseInt(v, 10);
                          setMoneyAmount(isNaN(parsed) ? 0 : parsed);
                        }}
                        placeholder="0"
                        className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-amber-300 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
                      />
                      <span className="text-xs text-zinc-500">aUEC</span>
                      {moneyAmount > 0 && (
                        <button
                          onClick={() => { setMoneyAmount(0); setMoneyInput(""); }}
                          className="text-zinc-600 hover:text-red-400 text-xs px-2"
                          title="Limpiar dinero"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {moneyAmount > 0 && (
                      <div className="text-[10px] text-zinc-500 leading-tight">
                        Se reparte en partes iguales tras reintegrar gastos. Marca quién <span className="text-amber-400">cobró</span> y quién <span className="text-amber-400">invirtió</span> en la sección de participantes. Impuesto de transferencia: <span className="text-amber-400">0.5%</span> (coef {TAX_COEF}).
                      </div>
                    )}
                  </div>
                ) : moneyAmount > 0 ? (
                  <div className="p-3 rounded border border-amber-500/20 bg-amber-500/5 text-amber-300 text-sm">
                    💰 {moneyAmount.toLocaleString("es-AR")} aUEC
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <h2 className="text-xs text-zinc-500 uppercase tracking-wider">Cargar Botin</h2>
                {canManage ? (
                  <div className="p-3 rounded border border-zinc-800/50 bg-zinc-900/30 space-y-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-0.5">Categoria</label>
                        <select
                          value={selectedCategory}
                          onChange={(e) => { setSelectedCategory(e.target.value); setSelectedItem(""); }}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
                        >
                          <option value="">Todas</option>
                          {CATEGORY_ORDER.filter((c) => groupedCatalog[c]).map((c) => (
                            <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-0.5">Item</label>
                        <input
                          type="text" value={lootSearch} onChange={(e) => setLootSearch(e.target.value)}
                          placeholder="Buscar..."
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-0.5">Cant.</label>
                        <input
                          type="number" min={1} value={itemQty}
                          onChange={(e) => setItemQty(parseInt(e.target.value) || 1)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {(lootSearch || selectedCategory) && (
                      <div className="max-h-36 overflow-y-auto space-y-0.5">
                        {filteredItems.slice(0, 40).map((item) => (
                          <button
                            key={item.id}
                            onClick={() => { setSelectedItem(item.id); setLootSearch(item.name); }}
                            className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${selectedItem === item.id ? "bg-amber-500/20 text-amber-300" : "hover:bg-zinc-800 text-zinc-300"}`}
                          >
                            <span className={RARITY_COLORS[item.rarity] ?? ""}>{item.name}</span>
                            <span className="text-[10px] text-zinc-600 ml-1.5">{CATEGORY_LABELS[item.category]?.split(" ")[1] ?? item.category}</span>
                          </button>
                        ))}
                        {filteredItems.length === 0 && (
                          <div className="text-[10px] text-zinc-600 py-1">Sin resultados — escribe un nombre personalizado</div>
                        )}
                      </div>
                    )}

                    {!selectedItem && lootSearch && filteredItems.length === 0 && (
                      <input
                        type="text"
                        value={customItemName || lootSearch}
                        onChange={(e) => setCustomItemName(e.target.value)}
                        placeholder="Nombre personalizado..."
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
                      />
                    )}

                    <button
                      onClick={() => {
                        if (!selectedItem && !customItemName && lootSearch) setCustomItemName(lootSearch);
                        addLootEntry();
                      }}
                      disabled={!selectedItem && !customItemName && !lootSearch}
                      className="w-full py-1.5 bg-emerald-600/80 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 text-xs font-medium rounded transition-colors active:scale-[0.98]"
                    >
                      + Agregar al Botin
                    </button>
                  </div>
                ) : (
                  <div className="p-3 rounded border border-zinc-800/30 bg-zinc-900/20 text-xs text-zinc-500 text-center">
                    Solo el host y co-hosts pueden cargar botin
                  </div>
                )}
              </div>

              {/* Loot list — visible to everyone */}
              {physicalLootEntries.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    Botin Cargado ({flatLoot.length} items)
                  </h3>
                  <div className="max-h-52 overflow-y-auto space-y-1">
                    {physicalLootEntries.map((entry) => (
                      <div key={entry.id} className={`flex items-center justify-between p-1.5 rounded border ${RARITY_BG[entry.rarity] ?? "border-zinc-700 bg-zinc-900/30"}`}>
                        <div>
                          <span className={`text-xs ${RARITY_COLORS[entry.rarity] ?? "text-zinc-300"}`}>{entry.itemName}</span>
                          <span className="text-[10px] text-zinc-500 ml-1.5">{CATEGORY_LABELS[entry.category]?.split(" ")[1] ?? entry.category}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400">x{entry.quantity}</span>
                          {canManage && (
                            <button onClick={() => removeLootEntry(entry.id)} className="text-zinc-600 hover:text-red-400 text-xs">✕</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Summary + SORTEAR button ── */}
          {!hasResults && !isRolling && (
            <div className="space-y-3 pt-2">
              <div className="p-2.5 rounded border border-zinc-800/50 bg-zinc-900/30 text-sm text-zinc-400 text-center">
                <span className="text-zinc-300">{participants.length}</span> participantes • <span className="text-zinc-300">{flatLoot.length}</span> items
                {moneyAmount > 0 && (<> • <span className="text-amber-400">💰 {moneyAmount.toLocaleString("es-AR")} aUEC</span></>)}
                {flatLoot.length > 0 && (<> • <span className="text-amber-400">{raffleMode === "lottery" ? "Loteria" : raffleMode === "split" ? "Repartir" : "Draft"}</span></>)}
              </div>
              {canManage ? (
                <button
                  onClick={runSorteo}
                  disabled={
                    participants.length < 2 ||
                    isRolling ||
                    (flatLoot.length === 0 && moneyAmount === 0)
                  }
                  className="w-full py-3 bg-amber-600/80 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 text-lg font-bold rounded transition-all active:scale-[0.98] disabled:cursor-not-allowed"
                >
                  🎲 SORTEAR
                </button>
              ) : (
                <div className="w-full py-3 bg-zinc-800/60 text-zinc-500 text-lg font-bold rounded text-center">
                  🎲 Esperando que el host inicie el sorteo...
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  // ── Render helpers ──
  function renderLotteryResults(res: RaffleResult[]) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {res.map((r) => (
          <div key={r.participantId} className="p-3 rounded border border-zinc-800/50 bg-zinc-900/40">
            <div className="text-sm text-amber-400 font-medium mb-2">{r.participantName}</div>
            {r.items.length === 0 ? (
              <div className="text-xs text-zinc-600">Sin items</div>
            ) : (
              <div className="space-y-1">
                {r.items.map((item, i) => (
                  <div key={i} className={`text-sm ${RARITY_COLORS[item.rarity] ?? "text-zinc-300"}`}>• {item.itemName}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderSettlement(s: Settlement) {
    const fmt = (n: number) =>
      n.toLocaleString("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
    return (
      <div className="space-y-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
        <h3 className="text-sm text-amber-400 uppercase tracking-wider flex items-center gap-2">
          💰 Reparto de Dinero
          <span className="text-[10px] text-zinc-500 normal-case">(coef. impuesto {TAX_COEF})</span>
        </h3>

        {/* Summary row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2 rounded bg-zinc-900/60 border border-zinc-800/40">
            <div className="text-[10px] text-zinc-500 uppercase">Total</div>
            <div className="text-sm text-amber-300">{fmt(s.moneyAmount)} aUEC</div>
          </div>
          <div className="p-2 rounded bg-zinc-900/60 border border-zinc-800/40">
            <div className="text-[10px] text-zinc-500 uppercase">Gastos</div>
            <div className="text-sm text-red-300">{fmt(s.totalExpenses)} aUEC</div>
          </div>
          <div className="p-2 rounded bg-zinc-900/60 border border-zinc-800/40">
            <div className="text-[10px] text-zinc-500 uppercase">Profit</div>
            <div className="text-sm text-emerald-300">{fmt(s.profit)} aUEC</div>
          </div>
          <div className="p-2 rounded bg-zinc-900/60 border border-zinc-800/40">
            <div className="text-[10px] text-zinc-500 uppercase">Por persona</div>
            <div className="text-sm text-zinc-200">{fmt(s.shareEach)} aUEC</div>
          </div>
        </div>

        {/* Warning if any */}
        {s.warning && (
          <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5">
            ⚠ {s.warning}
          </div>
        )}

        {/* Per-participant net shares */}
        <div className="space-y-1">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Le corresponde a cada uno</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {s.entries.map((e) => (
              <div key={e.participantId} className="flex items-center justify-between px-2 py-1 rounded bg-zinc-900/40 border border-zinc-800/40 text-xs">
                <span className="text-zinc-300">{e.participantName}</span>
                <span className="text-zinc-200 tabular-nums">{fmt(e.netShare)} aUEC</span>
              </div>
            ))}
          </div>
        </div>

        {/* Transactions */}
        {s.transactions.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Transferencias a realizar</div>
            <div className="space-y-1">
              {s.transactions.map((t, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded bg-zinc-900/60 border border-zinc-800/40 text-xs">
                  <span className="text-red-300 font-medium flex-1 truncate">{t.fromName}</span>
                  <span className="text-zinc-600">→</span>
                  <span className="text-emerald-300 font-medium flex-1 truncate">{t.toName}</span>
                  <span className="text-amber-300 tabular-nums whitespace-nowrap">
                    envía {fmt(t.grossAmount)}
                  </span>
                  <span className="text-zinc-500 text-[10px] whitespace-nowrap">
                    (recibe {fmt(t.netAmount)})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {s.transactions.length === 0 && !s.warning && s.moneyAmount > 0 && (
          <div className="text-[11px] text-zinc-500 italic text-center py-1">
            No hacen falta transferencias — el dinero ya está bien distribuido.
          </div>
        )}
      </div>
    );
  }

  function renderDraftResults(draft: DraftResult) {
    return (
      <div className="space-y-2">
        {draft.order.map((o) => (
          <div key={o.participantId} className="flex items-center gap-3 p-3 rounded border border-zinc-800/50 bg-zinc-900/40">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              o.position === 1 ? "bg-amber-500/30 text-amber-300 border border-amber-500"
                : o.position === 2 ? "bg-zinc-400/20 text-zinc-300 border border-zinc-500"
                : o.position === 3 ? "bg-orange-700/20 text-orange-400 border border-orange-600"
                : "bg-zinc-800 text-zinc-500 border border-zinc-700"
            }`}>
              {o.position}
            </div>
            <span className="text-sm text-zinc-200">{o.participantName}</span>
            {o.position === 1 && <span className="text-xs text-amber-400">← Elige primero</span>}
          </div>
        ))}
      </div>
    );
  }
}
