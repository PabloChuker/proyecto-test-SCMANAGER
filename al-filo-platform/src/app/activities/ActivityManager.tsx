"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth, type Profile } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
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

interface ActivitySession {
  id: string;
  date: string;
  activityName: string;
  activityId: string;
  participants: Participant[];
  loot: LootEntry[];
  mode: "lottery" | "draft";
  results: RaffleResult[] | DraftResult | null;
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
  const [raffleMode, setRaffleMode] = useState<"lottery" | "draft">("lottery");
  const [results, setResults] = useState<RaffleResult[] | null>(null);
  const [draftResults, setDraftResults] = useState<DraftResult | null>(null);
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
        setLoadingParty(false);
        return;
      }

      const partyId = membership[0].party_id;

      const { data: party } = await supabase
        .from("parties")
        .select("name")
        .eq("id", partyId)
        .single();

      if (party) setPartyName(party.name);

      const { data: members } = await supabase
        .from("party_members")
        .select("user_id")
        .eq("party_id", partyId);

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
  }, [user, supabase]);

  // Auto-load party members as participants when party loads
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
    // Merge: keep existing non-party participants, replace party ones
    setParticipants((prev) => {
      const manual = prev.filter((p) => !p.isFromParty);
      return [...partyParticipants, ...manual];
    });
  }, [partyMembers]);

  // Auto-load on first render if there's a party
  useEffect(() => {
    if (!loadingParty && partyMembers.length > 0 && participants.length === 0) {
      loadPartyAsParticipants();
    }
  }, [loadingParty, partyMembers, participants.length, loadPartyAsParticipants]);

  // ── Derived ──
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

  const flatLoot = useMemo(() => {
    const items: { itemName: string; category: string; rarity: string }[] = [];
    for (const entry of lootEntries) {
      for (let i = 0; i < entry.quantity; i++) {
        items.push({ itemName: entry.itemName, category: entry.category, rarity: entry.rarity });
      }
    }
    return items;
  }, [lootEntries]);

  const hasResults = results !== null || draftResults !== null;

  // ── Participants ──
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

  // ── Lottery ──
  const runLottery = useCallback(() => {
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
        const shuffledItems = shuffleArray(flatLoot);
        const resultMap: Record<string, { participantName: string; items: typeof flatLoot }> = {};
        for (const p of participants) resultMap[p.id] = { participantName: p.name, items: [] };
        const ordered = weightedShuffle(participants);
        shuffledItems.forEach((item, idx) => {
          const p = ordered[idx % ordered.length];
          resultMap[p.id].items.push(item);
        });
        setResults(Object.entries(resultMap).map(([pid, data]) => ({
          participantId: pid, participantName: data.participantName, items: data.items,
        })));
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

  // ── Save ──
  const saveSession = useCallback(() => {
    const session: ActivitySession = {
      id: uid(), date: new Date().toISOString(),
      activityName: activity?.name ?? "Custom", activityId: selectedActivity,
      participants, loot: lootEntries, mode: raffleMode,
      results: raffleMode === "lottery" ? results : draftResults,
    };
    const updated = [session, ...history].slice(0, 100);
    setHistory(updated);
    saveHistory(updated);
    setSaved(true);
  }, [activity, selectedActivity, participants, lootEntries, raffleMode, results, draftResults, history]);

  // ── Reset ──
  const resetSession = useCallback(() => {
    setResults(null);
    setDraftResults(null);
    setRollingName("");
    setLootEntries([]);
    setSelectedActivity("");
    setSaved(false);
    // Re-load party members
    if (partyMembers.length > 0) {
      const partyP: Participant[] = partyMembers.map((m) => ({
        id: m.id, name: m.display_name ?? m.username ?? "Jugador",
        avatarUrl: m.avatar_url, contributed: false, weight: 1, isFromParty: true,
      }));
      setParticipants(partyP);
    } else {
      setParticipants([]);
    }
  }, [partyMembers]);

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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
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
                    {new Date(s.date).toLocaleString("es-AR")} • {s.participants.length} participantes • {s.mode === "lottery" ? "Loteria" : "Draft"} • {s.loot.reduce((a, l) => a + l.quantity, 0)} items
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
          {viewingSession.mode === "lottery" && Array.isArray(viewingSession.results) && (
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

          {/* Results block (at top when available) */}
          {hasResults && !isRolling && (
            <div className="space-y-4 p-4 rounded-lg border border-amber-500/20 bg-zinc-900/40">
              <h2 className="text-lg text-amber-400 tracking-wider uppercase text-center">🏆 Resultados</h2>

              {raffleMode === "lottery" && results && renderLotteryResults(results)}
              {raffleMode === "draft" && draftResults && (
                <>
                  {renderDraftResults(draftResults)}
                  {lootEntries.length > 0 && (
                    <div className="mt-3 p-3 rounded border border-zinc-800/50 bg-zinc-900/30">
                      <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Botin disponible para elegir</h3>
                      {lootEntries.map((entry) => (
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
                <button
                  onClick={saveSession}
                  disabled={saved}
                  className={`flex-1 py-2 font-medium rounded transition-all duration-200 ${saved ? "bg-emerald-800/30 text-emerald-400 border border-emerald-600/30 cursor-default" : "bg-emerald-600/80 hover:bg-emerald-600 active:scale-[0.98] text-zinc-950"}`}
                >
                  {saved ? "Guardado ✓" : "💾 Guardar en Historial"}
                </button>
                <button onClick={resetSession} className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-medium rounded transition-colors">
                  🔄 Nueva Actividad
                </button>
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
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
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
                  {partyMembers.length > 0 && (
                    <button
                      onClick={loadPartyAsParticipants}
                      className="text-[10px] text-amber-500/70 hover:text-amber-400 transition-colors"
                    >
                      ↻ Recargar Party
                    </button>
                  )}
                </div>

                {/* Party auto-loaded banner */}
                {partyMembers.length > 0 && participants.some((p) => p.isFromParty) && (
                  <div className="px-2.5 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400/80">
                    🎮 Miembros de <span className="font-medium">{partyName ?? "tu party"}</span> cargados automaticamente
                  </div>
                )}

                {/* Add manual participant */}
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

                {participants.length > 0 && (
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {participants.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-2 p-1.5 rounded border border-zinc-800/40 bg-zinc-900/30">
                        <span className="text-[10px] text-zinc-600 w-4">{i + 1}</span>
                        {p.avatarUrl ? (
                          <img src={p.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px]">👤</div>
                        )}
                        <span className="flex-1 text-sm text-zinc-200">{p.name}</span>
                        {p.isFromParty && <span className="text-[9px] text-amber-500/50 bg-amber-500/10 px-1 rounded">PARTY</span>}
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
                <h2 className="text-xs text-zinc-500 uppercase tracking-wider">Modo de Reparto</h2>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setRaffleMode("lottery")}
                    className={`p-2.5 rounded border text-left transition-all ${raffleMode === "lottery" ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-zinc-700 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600"}`}
                  >
                    <div className="text-sm font-medium">🎰 Loteria</div>
                    <div className="text-[10px] mt-0.5 opacity-70">Reparto automatico ponderado</div>
                  </button>
                  <button
                    onClick={() => setRaffleMode("draft")}
                    className={`p-2.5 rounded border text-left transition-all ${raffleMode === "draft" ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-zinc-700 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600"}`}
                  >
                    <div className="text-sm font-medium">📋 Draft</div>
                    <div className="text-[10px] mt-0.5 opacity-70">Sortear orden, elegir por turno</div>
                  </button>
                </div>
              </div>
            </div>

            {/* ═══ RIGHT COLUMN: Loot ═══ */}
            <div className="space-y-5">
              <div className="space-y-2">
                <h2 className="text-xs text-zinc-500 uppercase tracking-wider">Cargar Botin</h2>
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
              </div>

              {/* Loot list */}
              {lootEntries.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    Botin Cargado ({flatLoot.length} items)
                  </h3>
                  <div className="max-h-52 overflow-y-auto space-y-1">
                    {lootEntries.map((entry) => (
                      <div key={entry.id} className={`flex items-center justify-between p-1.5 rounded border ${RARITY_BG[entry.rarity] ?? "border-zinc-700 bg-zinc-900/30"}`}>
                        <div>
                          <span className={`text-xs ${RARITY_COLORS[entry.rarity] ?? "text-zinc-300"}`}>{entry.itemName}</span>
                          <span className="text-[10px] text-zinc-500 ml-1.5">{CATEGORY_LABELS[entry.category]?.split(" ")[1] ?? entry.category}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400">x{entry.quantity}</span>
                          <button onClick={() => removeLootEntry(entry.id)} className="text-zinc-600 hover:text-red-400 text-xs">✕</button>
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
                <span className="text-zinc-300">{participants.length}</span> participantes • <span className="text-zinc-300">{flatLoot.length}</span> items • <span className="text-amber-400">{raffleMode === "lottery" ? "Loteria" : "Draft"}</span>
              </div>
              <button
                onClick={() => raffleMode === "lottery" ? runLottery() : runDraft()}
                disabled={(raffleMode === "lottery" && flatLoot.length === 0) || participants.length < 2 || isRolling}
                className="w-full py-3 bg-amber-600/80 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 text-lg font-bold rounded transition-all active:scale-[0.98] disabled:cursor-not-allowed"
              >
                🎲 SORTEAR
              </button>
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
