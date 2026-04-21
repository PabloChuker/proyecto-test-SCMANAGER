"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import minerals from "@/data/mining/minerals.json";
import refineries from "@/data/mining/refineries.json";
import refiningMethods from "@/data/mining/refining-methods.json";
import {
  addOrder,
  createSession,
  getActiveSessionId,
  getSessions,
  type WOMineral,
} from "@/lib/workOrderStore";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useMiningStore } from "@/store/useMiningStore";
import { useMiningBroadcast } from "@/store/useMiningRealtime";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabMode = "ship" | "roc" | "salvage" | "share";

interface Mineral {
  id: string;
  name: string;
  type: string;
  tier: string;
  basePrice: number;
  abbr: string;
}

interface Refinery {
  id: string;
  name: string;
  system?: string;
  bonuses: Record<string, number>;
}

interface RefiningMethod {
  id: string;
  name: string;
  yieldMultiplier: number;
  timeMultiplier: number;
  costMultiplier: number;
}

interface SessionMember {
  id: string;
  display_name: string;
  role: string;
  avatar_url?: string;
}

interface SessionOption {
  id: string;
  name: string;
  memberCount: number;
}

interface CrewMember {
  id: string;
  name: string;
  shareType: "equal" | "fixed";
  share: number;
}

// Bug #2 fix: ore rows are an ordered list of entries (not a Set),
// so the same ore can appear multiple times with different qualities.
interface OreEntry {
  key: string;      // unique per row
  oreId: string;    // mineral.id (can repeat across rows)
  quantity: number;
  quality: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TAB_CONFIG: { key: TabMode; icon: string }[] = [
  { key: "ship", icon: "⛏" },
  { key: "roc", icon: "💎" },
  { key: "salvage", icon: "♻" },
  { key: "share", icon: "🏛" },
];

const MOTRADER_FEE_PERCENT = 3.75;
const REFINERY_FEE_PERCENT = 5;

// ─── Color map for ore tier ─────────────────────────────────────────────────
function tierColor(tier: string): string {
  switch (tier) {
    case "premium": return "border-amber-500 bg-amber-500/20 text-amber-300";
    case "high": return "border-red-500 bg-red-500/15 text-red-300";
    case "mid": return "border-blue-500 bg-blue-500/15 text-blue-300";
    case "low": return "border-zinc-600 bg-zinc-700/40 text-zinc-300";
    default: return "border-zinc-700 bg-zinc-800/40 text-zinc-500";
  }
}

function tierColorSelected(tier: string): string {
  switch (tier) {
    case "premium": return "border-amber-400 bg-amber-500/50 text-amber-100 shadow-[0_0_10px_rgba(245,158,11,0.3)]";
    case "high": return "border-red-400 bg-red-500/40 text-red-100 shadow-[0_0_10px_rgba(239,68,68,0.3)]";
    case "mid": return "border-blue-400 bg-blue-500/40 text-blue-100 shadow-[0_0_10px_rgba(59,130,246,0.3)]";
    case "low": return "border-emerald-400 bg-emerald-500/30 text-emerald-100 shadow-[0_0_10px_rgba(16,185,129,0.3)]";
    default: return "border-zinc-500 bg-zinc-600/40 text-zinc-300";
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAuec(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return v.toLocaleString("en-US");
  return v.toFixed(0);
}

function padZero(n: number): string {
  return n.toString().padStart(2, "0");
}

// ─── Countdown Timer Hook ────────────────────────────────────────────────────

function useCountdown() {
  // Input fields (what the user types)
  const [inputH, setInputH] = useState(0);
  const [inputM, setInputM] = useState(0);
  const [inputS, setInputS] = useState(0);

  // Countdown state
  const [remaining, setRemaining] = useState(0); // seconds left
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalInputSeconds = inputH * 3600 + inputM * 60 + inputS;

  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            setRunning(false);
            setFinished(true);
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, remaining]);

  const start = () => {
    if (totalInputSeconds > 0 && !running) {
      setRemaining(totalInputSeconds);
      setFinished(false);
      setRunning(true);
    }
  };

  const pause = () => setRunning(false);
  const resume = () => { if (remaining > 0) setRunning(true); };
  const reset = () => { setRunning(false); setRemaining(0); setFinished(false); };

  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const display = `${padZero(h)}:${padZero(m)}:${padZero(s)}`;

  return {
    inputH, inputM, inputS,
    setInputH, setInputM, setInputS,
    totalInputSeconds,
    remaining, running, finished, display,
    start, pause, resume, reset,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function WorkOrderCalculator() {
  const t = useTranslations("Mining.woc");
  const typedMinerals = minerals as Mineral[];
  const typedRefineries = refineries as Refinery[];
  const typedMethods = refiningMethods as RefiningMethod[];

  // ── Auth & Supabase ──
  const { user } = useAuth();
  const {
    activeSessionId: supabaseSessionId,
    createWorkOrder,
    createSession: sbCreateSession,
  } = useMiningStore();
  const broadcast = useMiningBroadcast();

  // ── Tab state ──
  const [mode, setMode] = useState<TabMode>("ship");

  // ── Ore & refining state (Ship Mining) ──
  const [selectedRefinery, setSelectedRefinery] = useState(typedRefineries[0]?.id || "");
  const [selectedMethod, setSelectedMethod] = useState(typedMethods[0]?.id || "");
  // Bug #2 fix: array of entries (not a Set). Same ore can appear multiple
  // times with different qualities. Clicking an ore button ALWAYS adds a row.
  const [oreEntries, setOreEntries] = useState<OreEntry[]>([]);
  const oreEntryCounterRef = useRef(0);

  // UX: explicit order stage toggle so the user KNOWS whether the order will
  // land on "In Progress" (with countdown) or directly on "Ready to Collect".
  // Default = "refining" to keep the previous behaviour when a timer was set.
  const [orderStage, setOrderStage] = useState<"refining" | "ready">("refining");

  // ── Crew state ──
  const [crew, setCrew] = useState<CrewMember[]>([
    { id: "crew1", name: "You", shareType: "equal", share: 1 },
  ]);
  const [newMemberName, setNewMemberName] = useState("");

  // ── Active session crew (from Supabase) ──
  const [availableSessions, setAvailableSessions] = useState<SessionOption[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [sessionCrew, setSessionCrew] = useState<SessionMember[]>([]);
  const [crewLoaded, setCrewLoaded] = useState(false);
  const [loadingCrew, setLoadingCrew] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // ── Crew mode toggle (Fase H.4) ─────────────────────────────────────────
  // Pablo reportó: "cargue una orden como Solo me sigue trayendo una party
  // fantasma, Clear All no la saca, tengo que borrar uno por uno".
  // Root cause: el auto-load de sessionCrew → crew estaba SIEMPRE activo
  // cuando había supabaseSessionId, y `clearCrew` dejaba un loop donde
  // `crewLoaded=false && sessionCrew.length>0` disparaba la recarga.
  //
  // Con este toggle el usuario manda: "solo" = crew en blanco (You + lo que
  // agregue manual), "party" = autoload como hasta ahora.  La preferencia
  // persiste en localStorage para que el calculator siga en el modo que
  // dejaste la última vez.
  const CREW_MODE_STORAGE_KEY = "sc-labs-wo-crew-mode";
  const [crewMode, setCrewMode] = useState<"solo" | "party">(() => {
    if (typeof window === "undefined") return "solo";
    try {
      const raw = window.localStorage.getItem(CREW_MODE_STORAGE_KEY);
      return raw === "party" ? "party" : "solo";
    } catch {
      return "solo";
    }
  });

  // Persist mode changes.
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CREW_MODE_STORAGE_KEY, crewMode);
      }
    } catch {
      /* non-fatal */
    }
  }, [crewMode]);

  // ── Crew persistence (solo mode) ──────────────────────────────────────────
  // When the user ISN'T in a Supabase party session, their manual crew would
  // otherwise reset on every page refresh. We persist it to localStorage so
  // Pablo can close the tab, come back tomorrow, and still have the same
  // crew pre-loaded for the next work order. Party mode already handles this
  // via the session-crew auto-load path above, so we only write/read here
  // when there's no active Supabase session.
  const CREW_STORAGE_KEY = "sc-labs-wo-crew-solo";
  const didHydrateCrewRef = useRef(false);

  // Hydrate once on mount.
  //
  // 2026-04-20 (Fase F): antes de hidratar, preguntamos a Supabase si el user
  // sigue en alguna party `active`.  Si NO hay party activa donde sea miembro
  // (ni una sesión Supabase seleccionada), limpiamos el cache y dejamos el
  // crew default — evita el bug que reportó Pablo donde `/mining` precargaba
  // los miembros de la última party cerrada.  Mantenemos el cache para modo
  // solo real (sin party): si el user está en una party activa Y se
  // desconecta, el beacon / leaveParty ya lo limpia.
  useEffect(() => {
    if (didHydrateCrewRef.current) return;
    if (supabaseSessionId) return; // party mode handles its own crew
    if (!user) return;             // wait until we know who the user is

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: activeMembership } = await supabase
        .from("party_members")
        .select("party_id, parties!inner(status)")
        .eq("user_id", user.id)
        .eq("parties.status", "active")
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      const hasActiveParty = !!activeMembership;

      try {
        if (!hasActiveParty) {
          // Sin party activa → el cache solo-mode puede estar contaminado con
          // miembros de la última party.  Lo borramos y dejamos el crew default.
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(CREW_STORAGE_KEY);
          }
        } else {
          // Con party activa → hidratar cache como siempre.
          const raw = typeof window !== "undefined"
            ? window.localStorage.getItem(CREW_STORAGE_KEY)
            : null;
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0 &&
                parsed.every((m) => m && typeof m.name === "string")) {
              setCrew(parsed as CrewMember[]);
            }
          }
        }
      } catch {
        /* ignore malformed cache */
      } finally {
        didHydrateCrewRef.current = true;
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseSessionId, user]);

  // Persist whenever crew changes in solo mode.
  useEffect(() => {
    if (supabaseSessionId) return; // don't pollute solo cache with party crew
    if (!didHydrateCrewRef.current) return; // wait until we've loaded once
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CREW_STORAGE_KEY, JSON.stringify(crew));
      }
    } catch {
      /* storage quota / privacy mode — non-fatal */
    }
  }, [crew, supabaseSessionId]);

  // ── Countdown Timer ──
  const timer = useCountdown();

  // ── Derived minerals for current tab ──
  const tabMinerals = useMemo(() => {
    if (mode === "ship") return typedMinerals.filter((m) => m.type === "ship");
    if (mode === "roc") return typedMinerals.filter((m) => m.type === "hand");
    if (mode === "salvage") return typedMinerals.filter((m) => m.type === "salvage");
    return [];
  }, [mode, typedMinerals]);

  const refinery = typedRefineries.find((r) => r.id === selectedRefinery);
  const method = typedMethods.find((m) => m.id === selectedMethod);

  // ── Unit label per mode ──
  const unitLabel = mode === "ship" ? "cSCU" : mode === "roc" ? "mSCU" : "SCU";

  // ── Calculate refined value (ship mining only) ──
  const refinedValue = useMemo(() => {
    if (mode !== "ship" || !refinery || !method) return 0;
    let total = 0;
    oreEntries.forEach((entry) => {
      if (entry.quantity <= 0) return;
      const mineral = typedMinerals.find((m) => m.id === entry.oreId);
      if (!mineral) return;
      const bonus = refinery.bonuses[entry.oreId] || 0;
      const refined = entry.quantity * (method.yieldMultiplier + bonus / 100);
      total += refined * mineral.basePrice;
    });
    return Math.round(total);
  }, [mode, oreEntries, refinery, method, typedMinerals]);

  // ── Ore entry helpers (Bug #2 fix) ──
  // Clicking an ore ALWAYS adds a new row so the user can register the same
  // ore at different qualities. Rows are removed via the per-row ✕ button.
  const addOreEntry = useCallback((oreId: string) => {
    oreEntryCounterRef.current += 1;
    const key = `${oreId}_${Date.now()}_${oreEntryCounterRef.current}`;
    setOreEntries((prev) => [
      ...prev,
      { key, oreId, quantity: 0, quality: 0 },
    ]);
  }, []);

  const updateOreEntry = useCallback(
    (key: string, patch: Partial<Pick<OreEntry, "quantity" | "quality">>) => {
      setOreEntries((prev) =>
        prev.map((e) => (e.key === key ? { ...e, ...patch } : e))
      );
    },
    []
  );

  const removeOreEntry = useCallback((key: string) => {
    setOreEntries((prev) => prev.filter((e) => e.key !== key));
  }, []);

  const selectAllOres = () => {
    oreEntryCounterRef.current += 1;
    const base = Date.now();
    setOreEntries(
      tabMinerals.map((m, idx) => ({
        key: `${m.id}_${base}_${oreEntryCounterRef.current}_${idx}`,
        oreId: m.id,
        quantity: 0,
        quality: 0,
      }))
    );
  };

  const selectNoneOres = () => {
    setOreEntries([]);
  };

  // ── Reset on tab change ──
  useEffect(() => {
    setOreEntries([]);
    setOrderStage("refining");
  }, [mode]);

  // ── Auto-load available sessions for crew ──
  //
  // 2026-04-20 (Fase F): filtrar por `status='active'` así el dropdown no
  // muestra sesiones cerradas.  Antes listaba TODO y era la fuente del bug
  // "me carga la última party por defecto" — cualquier mining_session vieja
  // linked a una party terminada igual aparecía aquí.
  //
  // Fase H.12 (2026-04-21): si el user está en una party activa, nos
  // aseguramos de que exista una `mining_session` con `party_id` = la party.
  // Si no existe, la auto-creamos vía POST /api/mining/sessions (el endpoint
  // ya hace todo: trae party_members, enriquece con profiles y los inserta
  // como mining_members).  Antes de este fix, el dropdown "Load crew from
  // session" sólo mostraba la solo-session "Default" y Pablo no podía
  // seleccionar su party para cargar a Xoliii / kuzuribot / Sr_Frost.
  useEffect(() => {
    if (!user) return;
    setLoadingSessions(true);
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      // 1. ¿El user está en una party activa?
      const { data: membership } = await supabase
        .from("party_members")
        .select("party_id, parties!inner(id, name, status)")
        .eq("user_id", user.id)
        .eq("parties.status", "active")
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      const partyId = membership?.party_id as string | undefined;
      const partyName = (membership?.parties as any)?.name as string | undefined;

      if (partyId) {
        // 2. ¿Ya hay una mining_session activa linked a esa party?
        const { data: linkedSession } = await supabase
          .from("mining_sessions")
          .select("id")
          .eq("party_id", partyId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        // 3. Si no hay, auto-crearla.  El endpoint hace el heavy lifting
        //    (party_members → profiles → mining_members).
        if (!linkedSession) {
          try {
            await fetch("/api/mining/sessions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: partyName || "Party",
                party_id: partyId,
              }),
            });
          } catch {
            /* si falla, igual seguimos y cargamos lo que haya */
          }
        }
      }

      if (cancelled) return;

      // 4. Ahora sí, cargar el dropdown con todas las active sessions
      const { data } = await supabase
        .from("mining_sessions")
        .select("id, name, status, mining_members(count)")
        .eq("status", "active");

      if (cancelled) return;

      if (data) {
        setAvailableSessions(
          data.map((s: any) => ({
            id: s.id,
            name: s.name || "Unnamed",
            memberCount: s.mining_members?.[0]?.count || 0,
          }))
        );
        // Auto-select the active Supabase session if available
        if (supabaseSessionId) {
          setSelectedSessionId(supabaseSessionId);
        }
      }
      setLoadingSessions(false);
    })();

    return () => { cancelled = true; };
  }, [user, supabaseSessionId]);

  // Auto-load crew when a session is selected
  const handleSessionSelect = useCallback(async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setCrewLoaded(false);
    if (!sessionId) { setSessionCrew([]); return; }
    setLoadingCrew(true);
    try {
      const res = await fetch(`/api/mining/members?session_id=${sessionId}`);
      const json = await res.json();
      setSessionCrew(json.data || []);
    } catch { setSessionCrew([]); }
    setLoadingCrew(false);
  }, []);

  // Auto-load crew when supabaseSessionId matches.
  // Fase H.4: solo corre en modo "party". En "solo" el panel crew queda
  // a cargo del usuario sin intervención automática.
  useEffect(() => {
    if (crewMode !== "party") return;
    if (supabaseSessionId && selectedSessionId === supabaseSessionId && sessionCrew.length === 0 && !crewLoaded) {
      handleSessionSelect(supabaseSessionId);
    }
  }, [crewMode, supabaseSessionId, selectedSessionId, sessionCrew.length, crewLoaded, handleSessionSelect]);

  const loadSessionCrew = useCallback(() => {
    if (sessionCrew.length === 0) return;
    const mapped: CrewMember[] = sessionCrew.map((m, i) => ({
      id: `crew${Date.now()}-${i}`,
      name: m.display_name,
      shareType: "equal" as const,
      share: 1,
    }));
    setCrew(mapped);
    setCrewLoaded(true);
  }, [sessionCrew]);

  // Auto-load crew when session crew is fetched.
  // Fase H.4: gated por crewMode para que "Solo" no repueble el crew ni
  // cree el loop que reportó Pablo tras darle a Clear All.
  useEffect(() => {
    if (crewMode !== "party") return;
    if (sessionCrew.length > 0 && !crewLoaded) {
      loadSessionCrew();
    }
  }, [crewMode, sessionCrew, crewLoaded, loadSessionCrew]);

  // Fase H.4 — cuando el user pasa a modo "solo" limpiamos TODO rastro de
  // party: sessionCrew, selectedSessionId y el flag crewLoaded, más el
  // propio `crew` vuelve al default [You]. Sin esto, cambiar a solo dejaba
  // los miembros fantasma hasta que se los borraba uno por uno.
  useEffect(() => {
    if (crewMode !== "solo") return;
    setSessionCrew([]);
    setSelectedSessionId("");
    setCrewLoaded(false);
    setCrew([{ id: "crew1", name: "You", shareType: "equal", share: 1 }]);
  }, [crewMode]);

  const addCrewMember = () => {
    const name = newMemberName.trim() || `Crew ${crew.length + 1}`;
    setCrew([...crew, { id: `crew${Date.now()}`, name, shareType: "equal", share: 1 }]);
    setNewMemberName("");
  };

  const removeCrewMember = (id: string) => {
    if (crew.length > 1) setCrew(crew.filter((m) => m.id !== id));
  };

  // Fase H.4 — Clear All "de verdad". Antes `clearCrew` solo tocaba `crew`
  // y ponía `crewLoaded=false`, pero dejaba `sessionCrew` con los N miembros
  // de la party. El useEffect de auto-load veía `sessionCrew.length>0 &&
  // !crewLoaded` y re-poblaba el crew al instante → Pablo tenía que borrar
  // uno por uno. Ahora ponemos TODO en blanco, además de apagar el auto-load
  // vaciando `selectedSessionId` (si el user quiere volver a cargar la
  // party, puede seleccionarla desde el dropdown otra vez).
  const clearCrew = () => {
    setCrew([{ id: "crew1", name: "You", shareType: "equal", share: 1 }]);
    setSessionCrew([]);
    setSelectedSessionId("");
    setCrewLoaded(false);
  };

  // ── Yield for ship mining ──
  const getYield = (oreId: string, qty: number) => {
    if (!refinery || !method || qty <= 0) return 0;
    const bonus = refinery.bonuses[oreId] || 0;
    return Math.round(qty * (method.yieldMultiplier + bonus / 100) * 100) / 100;
  };

  // ── Submit Order ──
  // `submitted` drives the "Order Saved ✓" label on the main Save button.
  // `nextReady` drives a lighter confirmation on the "Save + Next" button so
  // Pablo can burst-save several orders in a row (same crew, same refinery)
  // without going back to Dashboard between each one.
  const [submitted, setSubmitted] = useState(false);
  const [nextReady, setNextReady] = useState(false);

  // Clears only the "content" of the current order (ores, refining stage,
  // countdown). Everything Pablo expects to carry between orders — crew,
  // selected session, mode, refinery, method — stays untouched. This is what
  // "Save + Next" calls after a successful submit.
  const resetForNextOrder = () => {
    setOreEntries([]);
    setOrderStage("refining");
    timer.reset();
  };

  const submitOrder = async (opts?: { continueAfter?: boolean }) => {
    const continueAfter = !!opts?.continueAfter;
    // Fase H.7 — los usuarios loggeados SIEMPRE guardan en Supabase. Antes de
    // H.7, si `supabaseSessionId` era null (caso típico post-Reset-All o primer
    // login después de borrar la default), el Calculator caía al branch
    // localStorage silenciosamente y el Dashboard en SOLO CLOUD nunca veía la
    // WO (lee sólo de Supabase). Ahora si hay `user` y no hay session activa
    // en el store, auto-creamos una "Default" solo session (party_id = null)
    // aquí mismo y la usamos como destino.
    let effectiveSbSessionId = supabaseSessionId;
    if (user && !effectiveSbSessionId) {
      const autoSess = await sbCreateSession("Default", null);
      if (autoSess) effectiveSbSessionId = autoSess.id;
    }
    const useSupabase = !!(effectiveSbSessionId && user);

    // Only create/use localStorage session when NOT in Supabase mode
    let sessionId = "";
    if (!useSupabase) {
      sessionId = getActiveSessionId() || "";
      if (!sessionId) {
        const session = createSession();
        sessionId = session.id;
      }
    }

    // Build ore list (each OreEntry becomes a line in the work order,
    // even if several entries share the same oreId with different qualities).
    const ores: WOMineral[] = [];
    oreEntries.forEach((entry) => {
      const qty = entry.quantity;
      if (qty <= 0 && mode !== "share") return;
      const mineral = typedMinerals.find((m) => m.id === entry.oreId);
      if (!mineral) return;
      const yieldQty = mode === "ship" ? getYield(entry.oreId, qty) : qty;
      ores.push({
        id: entry.oreId,
        name: mineral.name,
        quantity: qty,
        yieldQty,
        value: yieldQty * mineral.basePrice,
        quality: entry.quality || undefined,
      });
    });

    // ── Bug #3 fix + Bug #5 UX: if user marked the order as "ready" (already
    // refined), we DO NOT pass a countdown → the backend stores it as
    // "completed" (ready-to-collect). Otherwise we preserve the timer so the
    // dashboard shows the real remaining seconds.
    const effectiveCountdown = mode === "ship"
      ? (orderStage === "ready"
          ? 0
          : (timer.running || timer.finished
              ? timer.remaining
              : (timer.remaining > 0 ? timer.remaining : timer.totalInputSeconds)))
      : 0;

    // Safety net for "refining" orders: if the user forgot to set the timer,
    // don't silently downgrade the order to "Ready to Collect" — bail out.
    if (mode === "ship" && orderStage === "refining" && effectiveCountdown <= 0) {
      return;
    }

    // Save to localStorage ONLY when NOT connected to a Supabase party session
    if (!useSupabase) {
      addOrder({
        sessionId,
        type: mode,
        status: effectiveCountdown > 0 && mode === "ship" ? "in_progress" : "completed",
        refinery: mode === "ship" ? refinery?.name : undefined,
        method: mode === "ship" ? method?.name : undefined,
        ores,
        totalYield: ores.reduce((s, o) => s + o.yieldQty, 0),
        grossValue: 0,
        expenses: [],
        totalExpenses: 0,
        motraderFee: 0,
        netProfit: 0,
        crew: crew.map((c) => ({ name: c.name, share: c.share, payout: 0 })),
        sellPrice: 0,
        countdownSeconds: effectiveCountdown,
        countdownEndsAt: null,
      });
    }

    // Save to Supabase if connected to a party session (shared with all members)
    if (useSupabase) {
      createWorkOrder({
        session_id: effectiveSbSessionId!,
        order_type: mode,
        refinery_name: mode === "ship" ? refinery?.name || null : null,
        refining_method: mode === "ship" ? method?.name || null : null,
        ores: ores.map((o) => ({
          id: o.id,
          name: o.name,
          quantity: o.quantity,
          yieldQty: o.yieldQty,
          value: o.value,
          quality: o.quality,
        })),
        total_yield: ores.reduce((s, o) => s + o.yieldQty, 0),
        gross_value: 0,
        sell_price: 0,
        net_profit: 0,
        motrader_fee: 0,
        countdown_seconds: effectiveCountdown,
        expenses: [],
        payouts: crew.map((c) => ({
          member_name: c.name,
          share_pct: c.share,
          amount: 0,
        })),
      }).then(() => {
        // Broadcast to all party members so they see the order instantly
        broadcast("order_created");
      }).catch((err) => console.error("Supabase work order save failed:", err));
    }

    if (continueAfter) {
      // "Save + Next" path: confirm briefly, then wipe the order content so
      // the form is ready to capture the next haul without losing the party.
      setNextReady(true);
      setTimeout(() => setNextReady(false), 2000);
      resetForNextOrder();
    } else {
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    }
  };

  // ═════════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═════════════════════════════════════════════════════════════════════════════

  return (
    <div className="max-w-6xl mx-auto space-y-0">
      {/* ── Tab Bar ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-0 mb-6 border border-zinc-700/60 rounded-lg overflow-hidden">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setMode(tab.key)}
            className={`py-3 text-center text-xs tracking-[0.1em] uppercase font-bold transition-all
              ${mode === tab.key
                ? "bg-amber-500 text-zinc-900 shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
              }`}
          >
            <div className="text-lg mb-0.5">{tab.icon}</div>
            {t(`tab.${tab.key}`)}
          </button>
        ))}
      </div>

      {/* ── Main Content (two panels) ───────────────────────────────── */}
      <div className={`grid gap-6 ${mode === "share" ? "grid-cols-1 max-w-xl mx-auto" : "grid-cols-1 lg:grid-cols-2"}`}>
        {/* ═══════════════════════════════════════════════════════════ */}
        {/* LEFT PANEL — Materials / Ore Chooser                       */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {mode !== "share" && (
          <div className="bg-zinc-900/70 border border-amber-500/30 rounded-lg overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/20 bg-zinc-900/50">
              <h3 className="text-sm font-bold tracking-[0.1em] uppercase text-amber-400">
                {mode === "ship" ? t("panel.ship") : mode === "roc" ? t("panel.roc") : t("panel.salvage")}
              </h3>
              <span className="text-zinc-600 cursor-help text-lg" title={t("panel.helpTip")}>❓</span>
            </div>

            <div className="p-4 space-y-4">
              {/* ── Refinery + Method dropdowns (ship only) ── */}
              {mode === "ship" && (
                <>
                  <select
                    value={selectedRefinery}
                    onChange={(e) => setSelectedRefinery(e.target.value)}
                    className="w-full bg-zinc-800/70 border border-zinc-700 rounded px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
                  >
                    {typedRefineries.map((ref) => (
                      <option key={ref.id} value={ref.id}>
                        {ref.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedMethod}
                    onChange={(e) => setSelectedMethod(e.target.value)}
                    className="w-full bg-zinc-800/70 border border-zinc-700 rounded px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
                  >
                    {typedMethods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {/* ── Ore Chooser Grid ── */}
              <div>
                <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold mb-2">
                  {t("oreChooser")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tabMinerals.map((mineral) => {
                    const count = oreEntries.reduce(
                      (n, e) => (e.oreId === mineral.id ? n + 1 : n),
                      0
                    );
                    const isSelected = count > 0;
                    return (
                      <button
                        key={mineral.id}
                        onClick={() => addOreEntry(mineral.id)}
                        title={t("addRowForOre", { name: mineral.name })}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold tracking-wider border transition-all
                          ${isSelected ? tierColorSelected(mineral.tier) : tierColor(mineral.tier)}
                          hover:brightness-110`}
                      >
                        {mineral.abbr || mineral.id}
                        {count > 1 && (
                          <span className="ml-1 text-[9px] opacity-90">×{count}</span>
                        )}
                      </button>
                    );
                  })}
                  {/* ALL / NONE buttons */}
                  <button
                    onClick={selectAllOres}
                    className="px-2.5 py-1 rounded text-[11px] font-bold tracking-wider border border-blue-500 bg-blue-500/30 text-blue-200 hover:bg-blue-500/50 transition-all"
                  >
                    {t("all")}
                  </button>
                  <button
                    onClick={selectNoneOres}
                    className="px-2.5 py-1 rounded text-[11px] font-bold tracking-wider border border-zinc-500 bg-zinc-700/50 text-zinc-200 hover:bg-zinc-600/50 transition-all"
                  >
                    {t("none")}
                  </button>
                </div>
              </div>

              {/* ── Material Table ── */}
              <div>
                <div className="flex items-center justify-between text-[10px] tracking-[0.15em] uppercase text-zinc-500 font-bold border-b border-zinc-700/50 pb-1 mb-2">
                  <span className="flex-1">{t("material")}</span>
                  <span className="w-20 text-right">
                    {t("quality")}<br />
                    <span className="text-zinc-600">(0-1000)</span>
                  </span>
                  <span className="w-24 text-right">
                    {t("qty")}<br />
                    <span className="text-zinc-600">({unitLabel})</span>
                  </span>
                  {mode === "ship" && (
                    <span className="w-20 text-right">
                      {t("yield")}<br />
                      <span className="text-zinc-600">({unitLabel})</span>
                    </span>
                  )}
                </div>

                {oreEntries.length === 0 && (
                  <p className="text-center text-amber-600 text-sm py-4 italic">
                    {t("noOreSelected")}
                  </p>
                )}

                <div className="space-y-1">
                  {oreEntries.map((entry) => {
                    const mineral = tabMinerals.find((m) => m.id === entry.oreId);
                    if (!mineral) return null;
                    return (
                      <div
                        key={entry.key}
                        className="flex items-center gap-2 py-1 border-b border-zinc-800/40"
                      >
                        <span className="flex-1 text-xs font-bold text-zinc-200 uppercase tracking-wider">
                          {mineral.name}
                        </span>
                        <input
                          type="number"
                          min="0"
                          max="1000"
                          value={entry.quality || ""}
                          onChange={(e) =>
                            updateOreEntry(entry.key, {
                              quality: Math.min(1000, Math.max(0, parseInt(e.target.value) || 0)),
                            })
                          }
                          className="w-20 bg-cyan-500/10 border border-cyan-500/30 rounded px-2 py-1 text-sm text-right text-cyan-200 font-mono focus:outline-none focus:border-cyan-400"
                          placeholder="—"
                        />
                        <input
                          type="number"
                          min="0"
                          value={entry.quantity || ""}
                          onChange={(e) =>
                            updateOreEntry(entry.key, {
                              quantity: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-24 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1 text-sm text-right text-amber-200 font-mono focus:outline-none focus:border-amber-400"
                          placeholder="0"
                        />
                        {mode === "ship" && (
                          <span className="w-20 text-right text-xs font-mono text-zinc-400">
                            {getYield(entry.oreId, entry.quantity)}
                          </span>
                        )}
                        <button
                          onClick={() => removeOreEntry(entry.key)}
                          className="text-zinc-600 hover:text-red-400 text-sm px-1 transition-colors"
                          title={t("remove")}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Salvage info box ── */}
              {mode === "salvage" && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 mt-2">
                  <div className="flex items-start gap-2">
                    <span className="text-blue-400 text-sm">ℹ</span>
                    <div>
                      <div className="text-sm font-bold text-zinc-200">{t("salvageInfoTitle")}</div>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        {t.rich("salvageInfoBody", {
                          box: () => <span className="inline-block w-4 h-4 bg-zinc-700 rounded text-[9px] text-center leading-4">📦</span>,
                          final: (chunks) => <strong className="text-zinc-300">{chunks}</strong>,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Countdown Timer (ship mining) ── */}
              {mode === "ship" && (
                <div className="mt-4 space-y-2">
                  <div className="text-[10px] tracking-[0.15em] uppercase text-amber-500 font-bold">
                    {t("refineryTimer")}
                  </div>

                  {/* Input row — hidden when running */}
                  {!timer.running && !timer.finished && (
                    <div className="flex items-center gap-1 justify-center">
                      <input
                        type="number" min="0" max="99"
                        value={timer.inputH || ""}
                        onChange={(e) => timer.setInputH(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-14 bg-zinc-800/70 border border-zinc-700 rounded px-2 py-1.5 text-center text-lg font-mono text-zinc-100 focus:outline-none focus:border-amber-500"
                        placeholder="HH"
                      />
                      <span className="text-zinc-500 font-mono text-lg font-bold">:</span>
                      <input
                        type="number" min="0" max="59"
                        value={timer.inputM || ""}
                        onChange={(e) => timer.setInputM(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-14 bg-zinc-800/70 border border-zinc-700 rounded px-2 py-1.5 text-center text-lg font-mono text-zinc-100 focus:outline-none focus:border-amber-500"
                        placeholder="MM"
                      />
                      <span className="text-zinc-500 font-mono text-lg font-bold">:</span>
                      <input
                        type="number" min="0" max="59"
                        value={timer.inputS || ""}
                        onChange={(e) => timer.setInputS(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-14 bg-zinc-800/70 border border-zinc-700 rounded px-2 py-1.5 text-center text-lg font-mono text-zinc-100 focus:outline-none focus:border-amber-500"
                        placeholder="SS"
                      />
                      <button
                        onClick={timer.start}
                        disabled={timer.totalInputSeconds <= 0}
                        className="ml-2 px-4 py-1.5 bg-amber-500 text-zinc-900 rounded font-bold text-sm hover:bg-amber-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ▶ {t("start")}
                      </button>
                    </div>
                  )}

                  {/* Countdown display */}
                  {(timer.running || timer.finished) && (
                    <div
                      className={`w-full rounded-lg py-3 text-center font-mono text-2xl font-bold select-none transition-all
                        ${timer.finished
                          ? "bg-emerald-500 text-zinc-900 shadow-[0_0_20px_rgba(16,185,129,0.5)] animate-pulse"
                          : "bg-amber-500 text-zinc-900 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                        }`}
                    >
                      {timer.finished ? `✓ ${t("readyToCollect")}` : timer.display}
                    </div>
                  )}

                  {/* Controls when running/finished */}
                  {(timer.running || timer.finished) && (
                    <div className="flex justify-center gap-2">
                      {timer.running && (
                        <button onClick={timer.pause} className="px-3 py-1 bg-zinc-700 text-zinc-300 rounded text-xs font-bold hover:bg-zinc-600">
                          ⏸ {t("pause")}
                        </button>
                      )}
                      {!timer.running && timer.remaining > 0 && (
                        <button onClick={timer.resume} className="px-3 py-1 bg-amber-500/80 text-zinc-900 rounded text-xs font-bold hover:bg-amber-400">
                          ▶ {t("resume")}
                        </button>
                      )}
                      <button onClick={timer.reset} className="px-3 py-1 bg-zinc-800 text-zinc-400 rounded text-xs font-bold hover:bg-zinc-700">
                        ↺ {t("reset")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* RIGHT PANEL — Crew / Party                                  */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <div className="bg-zinc-900/70 border border-zinc-700/60 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/40 bg-zinc-900/50">
            <h3 className="text-sm font-bold tracking-[0.1em] uppercase text-zinc-300">
              {t("crewParty")}
            </h3>
            {/* Fase H.4 — toggle explícito SOLO / PARTY. "Solo" no
                auto-carga crew y deja el panel limpio; "Party" mantiene el
                autoload del dropdown de sesiones como hasta ahora. */}
            <div
              className="flex items-center gap-0 rounded-md overflow-hidden border border-zinc-700/60"
              role="group"
              aria-label={t("crewModeToggleAria")}
            >
              <button
                type="button"
                onClick={() => setCrewMode("solo")}
                className={
                  "px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors " +
                  (crewMode === "solo"
                    ? "bg-amber-500 text-zinc-900"
                    : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800")
                }
                title={t("crewModeSoloTip")}
              >
                {t("crewModeSolo")}
              </button>
              <button
                type="button"
                onClick={() => setCrewMode("party")}
                className={
                  "px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors " +
                  (crewMode === "party"
                    ? "bg-emerald-500 text-zinc-900"
                    : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800")
                }
                title={t("crewModePartyTip")}
              >
                {t("crewModeParty")}
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Session crew selector — solo visible en modo "party" (H.4).
                En solo mode escondemos este bloque para que el usuario no
                tenga forma de disparar el autoload por accidente. */}
            {crewMode === "party" && user && availableSessions.length > 0 && (
              <div className="border border-cyan-500/20 rounded-lg p-3 bg-cyan-500/5 space-y-2">
                <div className="text-[10px] tracking-[0.1em] uppercase text-cyan-400 font-bold">
                  {t("loadCrewFromSession")}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedSessionId}
                    onChange={(e) => handleSessionSelect(e.target.value)}
                    className="flex-1 bg-zinc-800/70 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500/50"
                  >
                    <option value="">{t("selectSession")}</option>
                    {availableSessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({t("membersCount", { n: s.memberCount })})
                      </option>
                    ))}
                  </select>
                  {sessionCrew.length > 0 && !crewLoaded && (
                    <button
                      onClick={loadSessionCrew}
                      className="px-4 py-2 bg-cyan-500/20 border border-cyan-500/40 rounded text-xs font-bold text-cyan-300 hover:bg-cyan-500/30 transition-colors whitespace-nowrap"
                    >
                      {t("load", { n: sessionCrew.length })}
                    </button>
                  )}
                </div>
                {loadingCrew && <div className="text-[10px] text-zinc-500">{t("loadingMembers")}</div>}
                {crewLoaded && (
                  <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                    <span>✓</span> {t("crewLoaded")}
                  </div>
                )}
              </div>
            )}

            {loadingSessions && (
              <div className="text-center py-2 text-xs text-zinc-500">{t("loadingSessions")}</div>
            )}

            {/* Add member input */}
            <div className="flex items-center gap-2">
              <span className="text-zinc-600 text-lg">👥</span>
              <input
                type="text"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCrewMember()}
                placeholder={t("addCrewMember")}
                className="flex-1 bg-transparent text-xs text-zinc-200 border-b border-zinc-700 focus:outline-none focus:border-amber-500/50 pb-1"
              />
              <button
                onClick={addCrewMember}
                className="text-amber-400 hover:text-amber-300 text-xl leading-none"
                title={t("addMember")}
              >
                +
              </button>
            </div>

            {/* Crew list */}
            <div className="border border-amber-500/20 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[auto_1fr_auto] gap-2 px-3 py-1.5 bg-zinc-800/40 text-[10px] tracking-[0.1em] uppercase text-zinc-500 font-bold border-b border-zinc-700/40">
                <span>#</span>
                <span>{t("memberHeader")}</span>
                <span></span>
              </div>

              {crew.map((member, i) => {
                const sessionMember = crewLoaded
                  ? sessionCrew.find((sc) => sc.display_name === member.name)
                  : null;
                return (
                  <div
                    key={member.id}
                    className="grid grid-cols-[auto_1fr_auto] gap-2 px-3 py-2 border-b border-zinc-800/30 items-center"
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      i === 0 ? "bg-amber-500/20 text-amber-400" : "bg-zinc-800 text-zinc-500"
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      {sessionMember?.avatar_url && (
                        <img src={sessionMember.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover border border-zinc-700" />
                      )}
                      <span className="text-xs font-bold text-zinc-200">{member.name}</span>
                      {sessionMember && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold uppercase tracking-wider">
                          {sessionMember.role}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removeCrewMember(member.id)}
                      className="text-zinc-600 hover:text-red-400 text-sm transition-colors"
                      title={t("remove")}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}

              {/* Clear all button */}
              <div className="px-3 py-2 bg-zinc-800/20 flex justify-end">
                <button
                  onClick={clearCrew}
                  className="text-[10px] font-bold text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <span className="text-sm">⊗</span> {t("clearAll")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Order Stage Toggle (ship mining only) ───────────────── */}
      {mode === "ship" && (
        <div className="mt-6">
          <div className="text-[10px] tracking-[0.15em] uppercase text-zinc-500 font-bold mb-2 text-center">
            {t("orderStageLabel")}
          </div>
          <div className="grid grid-cols-2 gap-0 border border-zinc-700/60 rounded-lg overflow-hidden">
            <button
              onClick={() => setOrderStage("refining")}
              className={`py-3 text-center text-xs font-bold uppercase tracking-wider transition-colors
                ${orderStage === "refining"
                  ? "bg-amber-500 text-zinc-900 shadow-[inset_0_0_15px_rgba(245,158,11,0.3)]"
                  : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
                }`}
            >
              ⏳ {t("stageRefining")}
            </button>
            <button
              onClick={() => setOrderStage("ready")}
              className={`py-3 text-center text-xs font-bold uppercase tracking-wider transition-colors
                ${orderStage === "ready"
                  ? "bg-emerald-500 text-zinc-900 shadow-[inset_0_0_15px_rgba(16,185,129,0.3)]"
                  : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
                }`}
            >
              ✅ {t("stageReady")}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-zinc-500 text-center italic">
            {orderStage === "refining" ? t("stageRefiningHint") : t("stageReadyHint")}
          </p>
        </div>
      )}

      {/* ── Submit Order Buttons ─────────────────────────────────────
           Two actions: Save (sticks on the confirmation and lets the user go
           do something else) and Save + Next (saves, then wipes only the
           order content so the same crew + session can batch-capture the
           next haul without going back to Dashboard). */}
      {(() => {
        const refiningNeedsTimer =
          mode === "ship" &&
          orderStage === "refining" &&
          !timer.running &&
          !timer.finished &&
          timer.totalInputSeconds === 0 &&
          timer.remaining === 0;
        const disabled = submitted || nextReady || refiningNeedsTimer;
        const submitLabel = submitted
          ? t("orderSaved")
          : mode === "ship" && orderStage === "refining"
            ? t("startRefining")
            : mode === "ship" && orderStage === "ready"
              ? t("saveAsRefined")
              : t("submitWorkOrder");
        const nextLabel = nextReady ? t("nextOrderReady") : t("saveAndNext");
        return (
          <div className={mode === "ship" ? "mt-4" : "mt-6"}>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
              <button
                onClick={() => submitOrder()}
                disabled={disabled}
                className={`w-full py-3.5 rounded-lg text-sm font-bold tracking-[0.15em] uppercase transition-all duration-300
                  ${submitted
                    ? "bg-emerald-500 text-zinc-900 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                    : disabled
                      ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                      : mode === "ship" && orderStage === "ready"
                        ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-900 shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                        : "bg-amber-500 hover:bg-amber-400 text-zinc-900 shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:shadow-[0_0_20px_rgba(245,158,11,0.5)]"
                  }`}
              >
                {submitLabel}
              </button>
              <button
                onClick={() => submitOrder({ continueAfter: true })}
                disabled={disabled}
                title={t("saveAndNextHint")}
                className={`w-full sm:w-auto px-5 py-3.5 rounded-lg text-xs font-bold tracking-[0.15em] uppercase transition-all duration-300
                  ${nextReady
                    ? "bg-cyan-500 text-zinc-900 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                    : disabled
                      ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                      : "bg-zinc-900/80 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/15"
                  }`}
              >
                + {nextLabel}
              </button>
            </div>
            {refiningNeedsTimer && !submitted && !nextReady && (
              <p className="mt-2 text-center text-[11px] text-amber-400 italic">
                ⚠ {t("timerRequired")}
              </p>
            )}
            <p className="mt-2 text-center text-[10px] text-zinc-500 italic">
              {t("partyPersistsHint")}
            </p>
          </div>
        );
      })()}

      {/* ── Footer Note ────────────────────────────────────────────── */}
      <div className="mt-6 bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 flex items-start gap-3">
        <span className="text-blue-400 text-lg">ℹ</span>
        <p className="text-xs text-zinc-400 leading-relaxed">
          <strong className="text-zinc-300">{t("footerNoteLabel")}</strong> {t("footerNoteBody")}
        </p>
      </div>
    </div>
  );
}
