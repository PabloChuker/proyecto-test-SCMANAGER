"use client";

// =============================================================================
// SC LABS — RaffleStageAdmin — 2026-05-07
//
// Controles admin del "modo sorteo" en vivo. Se muestra dentro de
// /events/[slug]/admin y dispara acciones contra
// /api/events/[slug]/admin/raffle-state.
//
// Flujo tipico:
//   1. Click "Iniciar modo sorteo"  → phase=loading
//   2. Buscar nave (o cargar item custom) → phase=loaded
//   3. Click "Sortear"              → phase=spinning (server pickea ganador)
//      El cliente espera ~5s mientras anima la pasarela y manda "award" para
//      que la phase pase a "won" en todos los espectadores sincronizados.
//   4. Click "Registrar ganador"    → phase=claimed (persiste el winner)
//      o "Re-roll"                  → phase=spinning con nuevo ganador
//   5. Click "Próximo sorteo"       → phase=loading (cargar siguiente premio)
//   6. Click "Cerrar modo sorteo"   → phase=idle (vuelve al mapa)
// =============================================================================

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { RaffleSession } from "./RaffleStage";

interface ShipOption {
  id: string;
  reference: string;     // class_name — usada como ship_class
  name: string;
  manufacturer: string | null;
}

export function RaffleStageAdmin({
  slug,
  session,
  presentCount,
  onChange,
}: {
  slug: string;
  session: RaffleSession;
  presentCount: number;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Selector de premios
  const [prizeMode, setPrizeMode] = useState<"ship" | "item">("ship");
  const [shipQuery, setShipQuery] = useState("");
  const [shipResults, setShipResults] = useState<ShipOption[]>([]);
  const [pickedShip, setPickedShip] = useState<ShipOption | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [itemLabel, setItemLabel] = useState("");
  const [itemDescription, setItemDescription] = useState("");

  // Buscador de naves: debounced fetch a /api/ships.
  // Pablo: "el listado de naves para elegir no esta completo faltan naves".
  // El endpoint /api/ships acepta limit hasta 200 (validateInt lo capea).
  // Subimos el limit al maximo + sort por nombre asc para que el dropdown
  // muestre la mayor cantidad de naves posible aun sin tipear nada.
  const searchAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!searchOpen) return;
    if (prizeMode !== "ship") return;
    searchAbortRef.current?.abort();
    const ctrl = new AbortController();
    searchAbortRef.current = ctrl;
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (shipQuery.trim()) params.set("search", shipQuery.trim());
        params.set("limit", "200");
        params.set("sortBy", "name");
        params.set("sortOrder", "ASC");
        const r = await fetch(`/api/ships?${params.toString()}`, { signal: ctrl.signal });
        if (!r.ok) return;
        const j = await r.json();
        const list: ShipOption[] = (j?.data ?? j?.ships ?? []).map((s: any) => ({
          id: s.id,
          reference: s.reference || s.class_name,
          name: s.name,
          manufacturer: s.manufacturer ?? null,
        }));
        setShipResults(list);
      } catch (e) {
        if ((e as any)?.name !== "AbortError") {
          // swallow — no molestamos al admin
        }
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [shipQuery, searchOpen, prizeMode]);

  // ── action helper ──
  const action = useCallback(
    async (act: string, payload?: Record<string, unknown>) => {
      setBusy(act);
      setError(null);
      try {
        const r = await fetch(`/api/events/${slug}/admin/raffle-state`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: act, ...(payload ?? {}) }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `Error ${r.status}`);
        onChange();
      } catch (e: any) {
        setError(e?.message ?? "Error.");
      } finally {
        setBusy(null);
      }
    },
    [slug, onChange],
  );

  // ── Animation handoff: cuando phase=spinning, esperamos ~5.5s y mandamos
  //    "award" para que el server marque phase=won (los espectadores
  //    transicionan al popup ganador). Si el server ya reportó won o claimed
  //    no disparamos nada.
  const awardedRef = useRef<string | null>(null);
  useEffect(() => {
    if (session.phase !== "spinning") {
      awardedRef.current = null;
      return;
    }
    const seedKey = `${session.spin_seed ?? 0}-${session.winner?.registration_id ?? ""}`;
    if (awardedRef.current === seedKey) return;
    awardedRef.current = seedKey;
    const t = window.setTimeout(() => {
      action("award").catch(() => undefined);
    }, 5500);
    return () => window.clearTimeout(t);
  }, [session.phase, session.spin_seed, session.winner?.registration_id, action]);

  // ── handlers ──
  const handleStart = () => action("start");
  const handleEnd = () => action("end");
  const handleLoadShip = () => {
    if (!pickedShip) return;
    action("loadPrize", {
      prize: {
        type: "ship",
        ship_id: pickedShip.id,
        ship_name: pickedShip.name,
        ship_class: pickedShip.reference,
        label: pickedShip.name,
      },
    });
  };
  const handleLoadItem = () => {
    if (!itemLabel.trim()) return;
    action("loadPrize", {
      prize: {
        type: "item",
        label: itemLabel.trim(),
        description: itemDescription.trim() || null,
      },
    });
    setItemLabel("");
    setItemDescription("");
  };
  const handleSpin = () => {
    if (!confirm("¿Sortear ahora? Se elige al azar entre los presentes confirmados.")) return;
    action("spin", { exclude_previous_winners: true });
  };
  const handleReroll = () => {
    if (!confirm("¿Re-sortear? El ganador actual queda descartado y se elige otro.")) return;
    action("reroll", { exclude_previous_winners: true });
  };
  const handleClaim = () => {
    action("claim");
  };
  const handleNext = () => {
    action("reset");
    setPickedShip(null);
    setItemLabel("");
    setItemDescription("");
  };

  return (
    <div className="bg-zinc-900/40 border border-violet-500/40 rounded-md p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-[14px] font-semibold text-violet-300 flex items-center gap-2">
            🎬 Modo sorteo en vivo
          </h2>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            Reemplaza el cartel del evento por una pasarela de sorteo en la página pública.
          </p>
        </div>
        {session.phase === "idle" ? (
          <button
            onClick={handleStart}
            disabled={!!busy || presentCount === 0}
            title={presentCount === 0 ? "Marcá al menos 1 asistente como presente" : ""}
            className="px-3 py-2 rounded-sm border border-violet-500/40 bg-violet-500/15 text-violet-300 text-[12px] font-medium hover:bg-violet-500/25 transition-colors disabled:opacity-40 whitespace-nowrap"
          >
            🎬 Iniciar modo sorteo
          </button>
        ) : (
          <button
            onClick={handleEnd}
            disabled={!!busy}
            className="px-3 py-2 rounded-sm border border-rose-500/40 bg-rose-500/10 text-rose-300 text-[12px] font-medium hover:bg-rose-500/20 transition-colors disabled:opacity-40 whitespace-nowrap"
          >
            ✕ Cerrar modo sorteo
          </button>
        )}
      </div>

      <PhaseSummary session={session} presentCount={presentCount} />

      {error && (
        <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-sm px-3 py-2 space-y-2">
          <p className="font-mono">{error}</p>
          {/raffle_session.*does not exist|column.*raffle_session/i.test(error) && (
            <div className="text-amber-200/90 space-y-1.5 pt-2 border-t border-rose-500/30">
              <p className="font-bold">⚠ Falta aplicar la migración 073 en Supabase.</p>
              <p>
                Abrí el SQL Editor de Supabase y ejecutá el contenido de{" "}
                <code className="px-1 py-0.5 bg-zinc-950/60 border border-amber-500/30 rounded">
                  database/migrations/073_event_raffle_session.sql
                </code>
                . Después recargá esta página y volvé a probar.
              </p>
              <p className="text-amber-200/70 italic">
                Mientras tanto, el sorteo clásico de abajo sigue funcionando.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Cargar premio (solo en loading o claimed) */}
      {(session.phase === "loading" || session.phase === "claimed") && (
        <div className="space-y-3 border border-zinc-800/60 rounded-md p-3 bg-zinc-950/40">
          <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
            Cargar próximo premio
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => setPrizeMode("ship")}
              className={`flex-1 px-3 py-1.5 rounded-sm border text-[11px] font-medium transition-colors ${
                prizeMode === "ship"
                  ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200"
                  : "border-zinc-800/60 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              🚀 Nave
            </button>
            <button
              onClick={() => setPrizeMode("item")}
              className={`flex-1 px-3 py-1.5 rounded-sm border text-[11px] font-medium transition-colors ${
                prizeMode === "item"
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                  : "border-zinc-800/60 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              🎁 Item custom (MonsterTech, etc)
            </button>
          </div>

          {prizeMode === "ship" ? (
            <div className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  value={shipQuery}
                  onChange={(e) => setShipQuery(e.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="Buscar nave por nombre..."
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[12px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                />
                {searchOpen && shipResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-[520px] overflow-y-auto bg-zinc-950 border border-zinc-800/80 rounded-sm shadow-xl z-30">
                    <div className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-zinc-500 font-mono bg-zinc-900/60 border-b border-zinc-800/60 sticky top-0">
                      {shipResults.length} {shipResults.length === 1 ? "nave" : "naves"}
                      {shipResults.length === 200 && (
                        <span className="ml-2 text-amber-400/80 normal-case">
                          (cap 200 — buscá para filtrar más)
                        </span>
                      )}
                    </div>
                    {shipResults.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setPickedShip(s);
                          setShipQuery(s.name);
                          setSearchOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-cyan-500/10 transition-colors border-b border-zinc-900/60"
                      >
                        <span className="text-zinc-100 font-medium">{s.name}</span>
                        {s.manufacturer && (
                          <span className="text-[10px] text-zinc-500 ml-2 font-mono">{s.manufacturer}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {pickedShip && (
                <p className="text-[11px] text-cyan-300">
                  Seleccionada: <strong>{pickedShip.name}</strong>
                  {pickedShip.manufacturer && (
                    <span className="text-zinc-500 ml-1">· {pickedShip.manufacturer}</span>
                  )}
                </p>
              )}
              <button
                onClick={handleLoadShip}
                disabled={!pickedShip || !!busy}
                className="px-4 py-2 rounded-sm border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 text-[12px] font-medium hover:bg-cyan-500/25 transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                {busy === "loadPrize" ? "Cargando..." : "Cargar nave al sorteo"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={itemLabel}
                onChange={(e) => setItemLabel(e.target.value)}
                placeholder="Nombre del premio (ej: Soportes MonsterTech)"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[12px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
              />
              <textarea
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                rows={2}
                placeholder="Descripción opcional (modelo, sponsor...)"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800/60 rounded-sm text-[12px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-y"
              />
              <button
                onClick={handleLoadItem}
                disabled={!itemLabel.trim() || !!busy}
                className="px-4 py-2 rounded-sm border border-amber-500/40 bg-amber-500/15 text-amber-300 text-[12px] font-medium hover:bg-amber-500/25 transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                {busy === "loadPrize" ? "Cargando..." : "Cargar item al sorteo"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Sortear (en phase=loaded) */}
      {session.phase === "loaded" && (
        <div className="space-y-2 border border-amber-500/40 rounded-md p-3 bg-amber-500/5">
          <p className="text-[11px] text-amber-200">
            Premio cargado: <strong>{session.prize?.label || session.prize?.ship_name}</strong>
          </p>
          <button
            onClick={handleSpin}
            disabled={!!busy || presentCount === 0}
            className="w-full px-4 py-3 rounded-sm border-2 border-amber-400/60 bg-gradient-to-b from-amber-500/30 to-amber-700/20 text-amber-100 text-[14px] font-bold hover:from-amber-500/40 hover:to-amber-700/30 transition-colors disabled:opacity-40 shadow-[0_0_20px_rgba(245,158,11,0.3)]"
          >
            {busy === "spin" ? "Sorteando..." : "🎲 Sortear ahora"}
          </button>
        </div>
      )}

      {/* Spinning visual placeholder en admin (la pasarela completa la ven todos en la pública) */}
      {session.phase === "spinning" && (
        <div className="border border-violet-500/40 rounded-md p-3 bg-violet-500/5 text-center">
          <p className="text-[12px] text-violet-200 animate-pulse">
            🎲 Pasarela en vivo... ({session.winner?.display_name})
          </p>
        </div>
      )}

      {/* Won — Re-roll / Registrar ganador */}
      {session.phase === "won" && session.winner && (
        <div className="space-y-2 border-2 border-emerald-500/60 rounded-md p-3 bg-emerald-500/10">
          <p className="text-[12px] text-emerald-200">
            🏆 Ganador: <strong>{session.winner.display_name}</strong>
            {session.winner.rsi_handle && (
              <span className="text-zinc-400 ml-1 font-mono">@{session.winner.rsi_handle}</span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleClaim}
              disabled={!!busy}
              className="flex-1 px-3 py-2 rounded-sm border border-emerald-500/50 bg-emerald-500/20 text-emerald-200 text-[12px] font-medium hover:bg-emerald-500/30 transition-colors disabled:opacity-40"
            >
              {busy === "claim" ? "..." : "✓ Registrar ganador"}
            </button>
            <button
              onClick={handleReroll}
              disabled={!!busy}
              className="flex-1 px-3 py-2 rounded-sm border border-amber-500/50 bg-amber-500/15 text-amber-200 text-[12px] font-medium hover:bg-amber-500/25 transition-colors disabled:opacity-40"
            >
              {busy === "reroll" ? "..." : "🎲 Re-roll"}
            </button>
          </div>
        </div>
      )}

      {/* Claimed — Próximo sorteo */}
      {session.phase === "claimed" && session.winner && (
        <div className="space-y-2 border border-emerald-700/50 rounded-md p-3 bg-emerald-900/20">
          <p className="text-[12px] text-emerald-200">
            ✓ Reclamado por <strong>{session.winner.display_name}</strong>.
            Cargá el siguiente premio cuando quieras.
          </p>
          <button
            onClick={handleNext}
            disabled={!!busy}
            className="w-full px-3 py-2 rounded-sm border border-cyan-500/50 bg-cyan-500/15 text-cyan-200 text-[12px] font-medium hover:bg-cyan-500/25 transition-colors disabled:opacity-40"
          >
            {busy === "reset" ? "..." : "→ Cargar próximo premio"}
          </button>
        </div>
      )}
    </div>
  );
}

function PhaseSummary({
  session,
  presentCount,
}: {
  session: RaffleSession;
  presentCount: number;
}) {
  const items = useMemo(() => {
    const x: { label: string; value: string }[] = [
      { label: "Phase", value: session.phase },
      { label: "Pool", value: `${presentCount} presentes` },
    ];
    if (session.prize) {
      x.push({
        label: "Premio",
        value:
          session.prize.label ||
          session.prize.ship_name ||
          session.prize.description ||
          "—",
      });
    }
    if (session.winner) {
      x.push({ label: "Winner", value: session.winner.display_name });
    }
    return x;
  }, [session, presentCount]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-sm border border-zinc-800/60 bg-zinc-950/40 px-2 py-1.5"
        >
          <p className="text-[8px] uppercase tracking-widest text-zinc-500 font-mono">
            {it.label}
          </p>
          <p className="text-[11px] text-zinc-200 truncate font-mono">{it.value}</p>
        </div>
      ))}
    </div>
  );
}

export default RaffleStageAdmin;
