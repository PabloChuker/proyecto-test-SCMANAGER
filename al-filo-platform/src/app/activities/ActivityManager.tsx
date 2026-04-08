"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  contributed: boolean; // did they contribute cards/resources?
  weight: number; // extra weight for lottery (1 = normal, 2+ = extra chances)
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
  "ship",
  "card",
  "powerplant",
  "shield",
  "cooler",
  "quantum_drive",
  "weapon",
  "fps_weapon",
  "armor",
  "material",
  "misc",
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
  // Build weighted pool: each participant appears weight times
  const pool: { p: Participant; rand: number }[] = [];
  for (const p of participants) {
    for (let i = 0; i < p.weight; i++) {
      pool.push({ p, rand: Math.random() });
    }
  }
  pool.sort((a, b) => a.rand - b.rand);
  // Deduplicate keeping first occurrence (higher weighted = more likely to be first)
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
  } catch {
    /* quota exceeded */
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ActivityManager() {
  // ── Data from API / fallback ──
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>(
    activityTypesFallback as ActivityType[]
  );
  const [lootCatalog, setLootCatalog] = useState<LootItem[]>(
    lootItemsFallback as LootItem[]
  );

  // ── Session state ──
  const [step, setStep] = useState<
    "setup" | "loot" | "raffle" | "results" | "history"
  >("setup");
  const [selectedActivity, setSelectedActivity] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [newName, setNewName] = useState("");
  const [lootEntries, setLootEntries] = useState<LootEntry[]>([]);
  const [raffleMode, setRaffleMode] = useState<"lottery" | "draft">("lottery");
  const [results, setResults] = useState<RaffleResult[] | null>(null);
  const [draftResults, setDraftResults] = useState<DraftResult | null>(null);
  const [history, setHistory] = useState<ActivitySession[]>([]);
  const [viewingSession, setViewingSession] = useState<ActivitySession | null>(
    null
  );

  // ── Loot entry form ──
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedItem, setSelectedItem] = useState("");
  const [customItemName, setCustomItemName] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [lootSearch, setLootSearch] = useState("");

  // ── Animation ──
  const [isRolling, setIsRolling] = useState(false);
  const [rollingName, setRollingName] = useState("");
  const rollRef = useRef<NodeJS.Timeout | null>(null);

  // ── Load data ──
  useEffect(() => {
    fetch("/api/activities/types")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d) && d.length > 0) setActivityTypes(d);
      })
      .catch(() => {});

    fetch("/api/activities/loot")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d) && d.length > 0) setLootCatalog(d);
      })
      .catch(() => {});

    setHistory(loadHistory());
  }, []);

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

  // ── Participants ──
  const addParticipant = useCallback(() => {
    const name = newName.trim();
    if (!name || participants.some((p) => p.name === name)) return;
    setParticipants((prev) => [
      ...prev,
      { id: uid(), name, contributed: false, weight: 1 },
    ]);
    setNewName("");
  }, [newName, participants]);

  const removeParticipant = useCallback((id: string) => {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const toggleContributed = useCallback((id: string) => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, contributed: !p.contributed, weight: !p.contributed ? 2 : 1 }
          : p
      )
    );
  }, []);

  const setWeight = useCallback((id: string, w: number) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, weight: Math.max(1, w) } : p))
    );
  }, []);

  // ── Loot management ──
  const addLootEntry = useCallback(() => {
    const item = lootCatalog.find((i) => i.id === selectedItem);
    const name = item ? item.name : customItemName.trim();
    if (!name) return;

    setLootEntries((prev) => [
      ...prev,
      {
        id: uid(),
        itemId: item?.id ?? "custom-" + uid(),
        itemName: name,
        category: item?.category ?? (selectedCategory || "misc"),
        rarity: item?.rarity ?? "common",
        quantity: itemQty,
      },
    ]);
    setSelectedItem("");
    setCustomItemName("");
    setItemQty(1);
  }, [selectedItem, customItemName, itemQty, lootCatalog, selectedCategory]);

  const removeLootEntry = useCallback((id: string) => {
    setLootEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // ── Flatten loot into individual items ──
  const flatLoot = useMemo(() => {
    const items: { itemName: string; category: string; rarity: string }[] = [];
    for (const entry of lootEntries) {
      for (let i = 0; i < entry.quantity; i++) {
        items.push({
          itemName: entry.itemName,
          category: entry.category,
          rarity: entry.rarity,
        });
      }
    }
    return items;
  }, [lootEntries]);

  // ── Raffle: Lottery Mode ──
  const runLottery = useCallback(() => {
    if (participants.length === 0 || flatLoot.length === 0) return;

    setIsRolling(true);
    let rollCount = 0;
    const totalRolls = 20;

    rollRef.current = setInterval(() => {
      rollCount++;
      const randomP =
        participants[Math.floor(Math.random() * participants.length)];
      setRollingName(randomP.name);

      if (rollCount >= totalRolls) {
        if (rollRef.current) clearInterval(rollRef.current);
        setIsRolling(false);
        setRollingName("");

        // Actual distribution
        const shuffledItems = shuffleArray(flatLoot);
        const resultMap: Record<
          string,
          { participantName: string; items: typeof flatLoot }
        > = {};

        // Initialize all participants
        for (const p of participants) {
          resultMap[p.id] = { participantName: p.name, items: [] };
        }

        // Weighted round-robin distribution
        const orderedParticipants = weightedShuffle(participants);

        shuffledItems.forEach((item, idx) => {
          const p = orderedParticipants[idx % orderedParticipants.length];
          resultMap[p.id].items.push(item);
        });

        const raffleResults: RaffleResult[] = Object.entries(resultMap).map(
          ([pid, data]) => ({
            participantId: pid,
            participantName: data.participantName,
            items: data.items,
          })
        );

        setResults(raffleResults);
        setStep("results");
      }
    }, 100);
  }, [participants, flatLoot]);

  // ── Raffle: Draft Mode ──
  const runDraft = useCallback(() => {
    if (participants.length === 0) return;

    setIsRolling(true);
    let rollCount = 0;
    const totalRolls = 20;

    rollRef.current = setInterval(() => {
      rollCount++;
      const randomP =
        participants[Math.floor(Math.random() * participants.length)];
      setRollingName(randomP.name);

      if (rollCount >= totalRolls) {
        if (rollRef.current) clearInterval(rollRef.current);
        setIsRolling(false);
        setRollingName("");

        const ordered = weightedShuffle(participants);
        const draft: DraftResult = {
          order: ordered.map((p, i) => ({
            participantId: p.id,
            participantName: p.name,
            position: i + 1,
          })),
        };

        setDraftResults(draft);
        setStep("results");
      }
    }, 100);
  }, [participants]);

  // ── Save session ──
  const saveSession = useCallback(() => {
    const session: ActivitySession = {
      id: uid(),
      date: new Date().toISOString(),
      activityName: activity?.name ?? "Custom",
      activityId: selectedActivity,
      participants,
      loot: lootEntries,
      mode: raffleMode,
      results: raffleMode === "lottery" ? results : draftResults,
    };

    const updated = [session, ...history].slice(0, 100);
    setHistory(updated);
    saveHistory(updated);
  }, [
    activity,
    selectedActivity,
    participants,
    lootEntries,
    raffleMode,
    results,
    draftResults,
    history,
  ]);

  // ── Reset ──
  const resetSession = useCallback(() => {
    setStep("setup");
    setSelectedActivity("");
    setParticipants([]);
    setLootEntries([]);
    setResults(null);
    setDraftResults(null);
    setRollingName("");
    setViewingSession(null);
  }, []);

  const deleteHistoryItem = useCallback(
    (id: string) => {
      const updated = history.filter((s) => s.id !== id);
      setHistory(updated);
      saveHistory(updated);
    },
    [history]
  );

  // ── Cleanup interval on unmount ──
  useEffect(() => {
    return () => {
      if (rollRef.current) clearInterval(rollRef.current);
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── Top Nav ── */}
      <div className="flex items-center gap-3 border-b border-zinc-800/60 pb-3">
        <button
          onClick={() => {
            setStep("setup");
            setViewingSession(null);
          }}
          className={`px-4 py-2 text-sm tracking-wider uppercase transition-all ${
            step !== "history" && !viewingSession
              ? "text-amber-400 border-b-2 border-amber-500"
              : "text-zinc-500 hover:text-zinc-400 border-b-2 border-transparent"
          }`}
        >
          🎲 Nueva Actividad
        </button>
        <button
          onClick={() => {
            setStep("history");
            setViewingSession(null);
          }}
          className={`px-4 py-2 text-sm tracking-wider uppercase transition-all ${
            step === "history" || viewingSession
              ? "text-amber-400 border-b-2 border-amber-500"
              : "text-zinc-500 hover:text-zinc-400 border-b-2 border-transparent"
          }`}
        >
          📜 Historial ({history.length})
        </button>
      </div>

      {/* ═══ HISTORY VIEW ═══ */}
      {(step === "history" || viewingSession) && !viewingSession && (
        <div className="space-y-3">
          <h2 className="text-lg text-zinc-300 tracking-wider uppercase">
            Historial de Actividades
          </h2>
          {history.length === 0 ? (
            <p className="text-zinc-500 text-sm">
              No hay actividades guardadas todavía.
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded border border-zinc-800/50 bg-zinc-900/40 hover:bg-zinc-900/60 transition-colors"
                >
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => setViewingSession(s)}
                  >
                    <div className="text-sm text-zinc-200">
                      {s.activityName}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {new Date(s.date).toLocaleString("es-AR")} •{" "}
                      {s.participants.length} participantes •{" "}
                      {s.mode === "lottery" ? "Lotería" : "Draft"} •{" "}
                      {s.loot.reduce((a, l) => a + l.quantity, 0)} items
                    </div>
                  </div>
                  <button
                    onClick={() => deleteHistoryItem(s.id)}
                    className="text-zinc-600 hover:text-red-400 text-xs ml-2"
                    title="Eliminar"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ VIEWING SAVED SESSION ═══ */}
      {viewingSession && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setViewingSession(null)}
              className="text-zinc-500 hover:text-zinc-300 text-sm"
            >
              ← Volver
            </button>
            <h2 className="text-lg text-zinc-300 tracking-wider">
              {viewingSession.activityName}
            </h2>
            <span className="text-xs text-zinc-500">
              {new Date(viewingSession.date).toLocaleString("es-AR")}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded border border-zinc-800/50 bg-zinc-900/40">
              <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
                Participantes
              </h3>
              {viewingSession.participants.map((p) => (
                <div key={p.id} className="text-sm text-zinc-300">
                  {p.name}
                  {p.contributed && (
                    <span className="text-amber-400 ml-1">★</span>
                  )}
                  {p.weight > 1 && (
                    <span className="text-xs text-zinc-500 ml-1">
                      (x{p.weight})
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="p-3 rounded border border-zinc-800/50 bg-zinc-900/40">
              <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
                Botín
              </h3>
              {viewingSession.loot.map((l) => (
                <div key={l.id} className="text-sm text-zinc-300">
                  <span className={RARITY_COLORS[l.rarity] ?? "text-zinc-400"}>
                    {l.itemName}
                  </span>
                  {l.quantity > 1 && (
                    <span className="text-zinc-500"> x{l.quantity}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Results */}
          {viewingSession.mode === "lottery" &&
            Array.isArray(viewingSession.results) && (
              <div className="space-y-3">
                <h3 className="text-sm text-zinc-400 uppercase tracking-wider">
                  Resultado del Sorteo
                </h3>
                {renderLotteryResults(
                  viewingSession.results as RaffleResult[]
                )}
              </div>
            )}

          {viewingSession.mode === "draft" && viewingSession.results && (
            <div className="space-y-3">
              <h3 className="text-sm text-zinc-400 uppercase tracking-wider">
                Orden de Selección
              </h3>
              {renderDraftResults(viewingSession.results as DraftResult)}
            </div>
          )}
        </div>
      )}

      {/* ═══ STEP 1: SETUP ═══ */}
      {step === "setup" && !viewingSession && (
        <div className="space-y-6">
          {/* Activity Selection */}
          <div className="space-y-3">
            <h2 className="text-sm text-zinc-400 uppercase tracking-wider">
              1. Seleccionar Actividad
            </h2>
            <select
              value={selectedActivity}
              onChange={(e) => setSelectedActivity(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="">— Elegir actividad —</option>
              {Object.entries(
                activityTypes.reduce(
                  (acc, a) => {
                    if (!acc[a.category]) acc[a.category] = [];
                    acc[a.category].push(a);
                    return acc;
                  },
                  {} as Record<string, ActivityType[]>
                )
              ).map(([cat, items]) => (
                <optgroup
                  key={cat}
                  label={cat.charAt(0).toUpperCase() + cat.slice(1)}
                >
                  {items.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {activity && (
              <div className="p-3 rounded border border-zinc-800/50 bg-zinc-900/30 text-sm">
                <div className="text-zinc-300">{activity.description}</div>
                <div className="flex gap-4 mt-2 text-xs text-zinc-500">
                  <span>
                    Jugadores: {activity.minPlayers}-{activity.maxPlayers}
                  </span>
                  <span
                    className={DIFFICULTY_COLORS[activity.difficulty] ?? ""}
                  >
                    {activity.difficulty.toUpperCase()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Participants */}
          <div className="space-y-3">
            <h2 className="text-sm text-zinc-400 uppercase tracking-wider">
              2. Participantes
            </h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addParticipant()}
                placeholder="Nombre del jugador..."
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
              />
              <button
                onClick={addParticipant}
                className="px-4 py-2 bg-amber-600/80 hover:bg-amber-600 text-zinc-950 text-sm font-medium rounded transition-colors"
              >
                + Agregar
              </button>
            </div>

            {participants.length > 0 && (
              <div className="space-y-1">
                {participants.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 p-2 rounded border border-zinc-800/40 bg-zinc-900/30"
                  >
                    <span className="text-xs text-zinc-600 w-5">{i + 1}</span>
                    <span className="flex-1 text-sm text-zinc-200">
                      {p.name}
                    </span>

                    <label className="flex items-center gap-1 text-xs text-zinc-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.contributed}
                        onChange={() => toggleContributed(p.id)}
                        className="accent-amber-500"
                      />
                      Aportó
                    </label>

                    <div className="flex items-center gap-1">
                      <span className="text-xs text-zinc-600">Peso:</span>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={p.weight}
                        onChange={(e) =>
                          setWeight(p.id, parseInt(e.target.value) || 1)
                        }
                        className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-xs text-center text-zinc-300 focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    <button
                      onClick={() => removeParticipant(p.id)}
                      className="text-zinc-600 hover:text-red-400 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Raffle Mode */}
          <div className="space-y-3">
            <h2 className="text-sm text-zinc-400 uppercase tracking-wider">
              3. Modo de Reparto
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRaffleMode("lottery")}
                className={`p-3 rounded border text-left transition-all ${
                  raffleMode === "lottery"
                    ? "border-amber-500 bg-amber-500/10 text-amber-300"
                    : "border-zinc-700 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                <div className="text-sm font-medium">🎰 Lotería</div>
                <div className="text-xs mt-1 opacity-70">
                  El botín se reparte automáticamente. Los que aportaron tienen
                  más chances.
                </div>
              </button>
              <button
                onClick={() => setRaffleMode("draft")}
                className={`p-3 rounded border text-left transition-all ${
                  raffleMode === "draft"
                    ? "border-amber-500 bg-amber-500/10 text-amber-300"
                    : "border-zinc-700 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                <div className="text-sm font-medium">📋 Draft (Orden)</div>
                <div className="text-xs mt-1 opacity-70">
                  Se sortea el orden y cada uno elige lo que quiere por turno.
                </div>
              </button>
            </div>
          </div>

          {/* Next */}
          <button
            onClick={() => setStep("loot")}
            disabled={participants.length < 2}
            className="w-full py-3 bg-amber-600/80 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-medium rounded transition-colors disabled:cursor-not-allowed"
          >
            Siguiente → Cargar Botín
          </button>
        </div>
      )}

      {/* ═══ STEP 2: LOOT ENTRY ═══ */}
      {step === "loot" && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep("setup")}
              className="text-zinc-500 hover:text-zinc-300 text-sm"
            >
              ← Volver
            </button>
            <h2 className="text-sm text-zinc-400 uppercase tracking-wider">
              Cargar Botín
            </h2>
          </div>

          {/* Quick add form */}
          <div className="p-4 rounded border border-zinc-800/50 bg-zinc-900/30 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {/* Category filter */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">
                  Categoría
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setSelectedItem("");
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
                >
                  <option value="">Todas</option>
                  {CATEGORY_ORDER.filter((c) => groupedCatalog[c]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c] ?? c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Item select with search */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">
                  Item
                </label>
                <input
                  type="text"
                  value={lootSearch}
                  onChange={(e) => setLootSearch(e.target.value)}
                  placeholder="Buscar item..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Quantity */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">
                  Cantidad
                </label>
                <input
                  type="number"
                  min={1}
                  value={itemQty}
                  onChange={(e) => setItemQty(parseInt(e.target.value) || 1)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Filtered items grid */}
            {(lootSearch || selectedCategory) && (
              <div className="max-h-48 overflow-y-auto space-y-0.5 mt-2">
                {filteredItems.slice(0, 50).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedItem(item.id);
                      setLootSearch(item.name);
                    }}
                    className={`w-full text-left px-2 py-1 rounded text-sm transition-colors ${
                      selectedItem === item.id
                        ? "bg-amber-500/20 text-amber-300"
                        : "hover:bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    <span className={RARITY_COLORS[item.rarity] ?? ""}>
                      {item.name}
                    </span>
                    <span className="text-xs text-zinc-600 ml-2">
                      {CATEGORY_LABELS[item.category]?.split(" ")[1] ??
                        item.category}
                    </span>
                  </button>
                ))}
                {filteredItems.length === 0 && (
                  <div className="text-xs text-zinc-600 py-2">
                    No se encontraron items. Podés escribir un nombre
                    personalizado.
                  </div>
                )}
              </div>
            )}

            {/* Custom item name (when no catalog match) */}
            {!selectedItem && lootSearch && filteredItems.length === 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Item personalizado:</span>
                <input
                  type="text"
                  value={customItemName || lootSearch}
                  onChange={(e) => setCustomItemName(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
                />
              </div>
            )}

            <button
              onClick={() => {
                if (!selectedItem && !customItemName && lootSearch) {
                  setCustomItemName(lootSearch);
                }
                addLootEntry();
                setLootSearch("");
              }}
              disabled={!selectedItem && !customItemName && !lootSearch}
              className="w-full py-2 bg-emerald-600/80 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 text-sm font-medium rounded transition-colors"
            >
              + Agregar al Botín
            </button>
          </div>

          {/* Current loot list */}
          {lootEntries.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs text-zinc-500 uppercase tracking-wider">
                Botín Cargado ({flatLoot.length} items totales)
              </h3>
              {lootEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between p-2 rounded border ${
                    RARITY_BG[entry.rarity] ?? "border-zinc-700 bg-zinc-900/30"
                  }`}
                >
                  <div>
                    <span
                      className={`text-sm ${
                        RARITY_COLORS[entry.rarity] ?? "text-zinc-300"
                      }`}
                    >
                      {entry.itemName}
                    </span>
                    <span className="text-xs text-zinc-500 ml-2">
                      {CATEGORY_LABELS[entry.category]?.split(" ")[1] ??
                        entry.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-400">
                      x{entry.quantity}
                    </span>
                    <button
                      onClick={() => removeLootEntry(entry.id)}
                      className="text-zinc-600 hover:text-red-400 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Summary & Run */}
          <div className="p-3 rounded border border-zinc-800/50 bg-zinc-900/30 text-sm text-zinc-400">
            <span className="text-zinc-300">{participants.length}</span>{" "}
            participantes •{" "}
            <span className="text-zinc-300">{flatLoot.length}</span> items
            totales •{" "}
            <span className="text-amber-400">
              {raffleMode === "lottery" ? "Lotería" : "Draft"}
            </span>
          </div>

          <button
            onClick={() => {
              setStep("raffle");
              if (raffleMode === "lottery") {
                runLottery();
              } else {
                runDraft();
              }
            }}
            disabled={
              (raffleMode === "lottery" && flatLoot.length === 0) ||
              participants.length < 2
            }
            className="w-full py-3 bg-amber-600/80 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 text-lg font-bold rounded transition-colors disabled:cursor-not-allowed"
          >
            🎲 SORTEAR
          </button>
        </div>
      )}

      {/* ═══ STEP 3: RAFFLE ANIMATION ═══ */}
      {step === "raffle" && isRolling && (
        <div className="flex flex-col items-center justify-center py-20 space-y-6">
          <div className="text-6xl animate-bounce">🎲</div>
          <div className="text-3xl text-amber-400 font-bold animate-pulse tracking-wider">
            {rollingName}
          </div>
          <div className="text-sm text-zinc-500">Sorteando...</div>
        </div>
      )}

      {/* ═══ STEP 4: RESULTS ═══ */}
      {step === "results" && (
        <div className="space-y-6">
          <h2 className="text-lg text-amber-400 tracking-wider uppercase text-center">
            🏆 Resultados del Sorteo
          </h2>

          {raffleMode === "lottery" && results && renderLotteryResults(results)}
          {raffleMode === "draft" && draftResults && (
            <>
              {renderDraftResults(draftResults)}
              {/* Show loot list for reference */}
              {lootEntries.length > 0 && (
                <div className="mt-4 p-3 rounded border border-zinc-800/50 bg-zinc-900/30">
                  <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
                    Botín disponible para elegir
                  </h3>
                  {lootEntries.map((entry) => (
                    <div key={entry.id} className="text-sm text-zinc-300">
                      <span
                        className={
                          RARITY_COLORS[entry.rarity] ?? "text-zinc-400"
                        }
                      >
                        {entry.itemName}
                      </span>
                      {entry.quantity > 1 && (
                        <span className="text-zinc-500"> x{entry.quantity}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                saveSession();
              }}
              className="flex-1 py-2 bg-emerald-600/80 hover:bg-emerald-600 text-zinc-950 font-medium rounded transition-colors"
            >
              💾 Guardar en Historial
            </button>
            <button
              onClick={resetSession}
              className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-medium rounded transition-colors"
            >
              🔄 Nueva Actividad
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Render helpers ──

  function renderLotteryResults(res: RaffleResult[]) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {res.map((r) => (
          <div
            key={r.participantId}
            className="p-3 rounded border border-zinc-800/50 bg-zinc-900/40"
          >
            <div className="text-sm text-amber-400 font-medium mb-2">
              {r.participantName}
            </div>
            {r.items.length === 0 ? (
              <div className="text-xs text-zinc-600">Sin items</div>
            ) : (
              <div className="space-y-1">
                {r.items.map((item, i) => (
                  <div
                    key={i}
                    className={`text-sm ${
                      RARITY_COLORS[item.rarity] ?? "text-zinc-300"
                    }`}
                  >
                    • {item.itemName}
                  </div>
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
          <div
            key={o.participantId}
            className="flex items-center gap-3 p-3 rounded border border-zinc-800/50 bg-zinc-900/40"
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                o.position === 1
                  ? "bg-amber-500/30 text-amber-300 border border-amber-500"
                  : o.position === 2
                    ? "bg-zinc-400/20 text-zinc-300 border border-zinc-500"
                    : o.position === 3
                      ? "bg-orange-700/20 text-orange-400 border border-orange-600"
                      : "bg-zinc-800 text-zinc-500 border border-zinc-700"
              }`}
            >
              {o.position}
            </div>
            <span className="text-sm text-zinc-200">{o.participantName}</span>
            {o.position === 1 && (
              <span className="text-xs text-amber-400">← Elige primero</span>
            )}
          </div>
        ))}
      </div>
    );
  }
}
