"use client";

// =============================================================================
// SC LABS — RaffleStage (public) — 2026-05-07
//
// Reemplaza el cartel/mapa del evento por la "stage" en vivo del sorteo cuando
// raffle_session.phase != "idle". Renders depending on phase:
//
//   loading  → "el equipo prepara un premio..." (skeleton)
//   loaded   → ship 3D + nombre + "esperando sorteo..."
//   spinning → ship 3D + pasarela giratoria de candidatos (cycle a través de
//              todos los presentes, frena en el ganador del payload)
//   won      → ship 3D + popup WINNER + countdown 1 minuto para reclamar
//   claimed  → ship 3D + reclamado por X
//
// Nota sobre la pasarela: usamos el spin_seed del payload como seed del shuffle
// determinista. Todos los clientes ven la misma secuencia. Después de ~5s la
// pasarela "frena" en el ganador real reportado por el server.
// =============================================================================

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { ShipViewer3D } from "@/components/shared/flight-dynamics/ShipViewer3D";
import { shipGlbCandidates } from "@/lib/shipGlb";

export interface RaffleSession {
  phase: "idle" | "loading" | "loaded" | "spinning" | "won" | "claimed";
  prize: {
    type: "ship" | "item";
    ship_id: string | null;
    ship_name: string | null;
    ship_class: string | null;
    label: string | null;
    description: string | null;
  } | null;
  winner: {
    registration_id: string;
    user_id: string | null;
    display_name: string;
    avatar_url: string | null;
    rsi_handle: string | null;
  } | null;
  won_at?: string | null;
  claim_deadline_seconds?: number;
  spin_seed?: number;
}

interface CandidatePreview {
  display_name: string;
  avatar_url: string | null;
}

export function RaffleStage({
  session,
  candidates,
  eventName,
}: {
  session: RaffleSession;
  /** Lista de presentes (display_name + avatar) para animar la pasarela. */
  candidates: CandidatePreview[];
  eventName: string;
}) {
  // ── ship 3D candidates URL chain ─────────────────────────────────────
  const glbUrls = useMemo<string[] | null>(() => {
    if (session.prize?.type !== "ship") return null;
    const ref = session.prize.ship_class || null;
    if (!ref) return null;
    const list = shipGlbCandidates(ref);
    return list.length > 0 ? list : null;
  }, [session.prize?.type, session.prize?.ship_class]);

  const showShipViewer =
    session.phase !== "idle" && session.prize?.type === "ship";

  return (
    <div className="medieval-card rounded-md overflow-hidden">
      <div className="px-3 py-2 border-b border-amber-200/30 flex items-center justify-between">
        <h3 className="text-[12px] font-bold gold-text flex items-center gap-2">
          🎰 Modo sorteo · {eventName}
        </h3>
        <PhaseBadge phase={session.phase} />
      </div>

      <div className="relative w-full bg-gradient-to-b from-zinc-950/60 to-zinc-900/40 min-h-[480px] flex items-center justify-center p-4">
        {/* ─── Background ship 3D ─── */}
        {showShipViewer ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <ShipViewer3D
              glbUrl={glbUrls ?? undefined}
              rotationAxis="free"
              autoRotate
              autoRotateSpeed={0.6}
              animate={false}
              transparent
              className="w-full h-full opacity-90"
            />
          </div>
        ) : session.phase === "loaded" ||
          session.phase === "spinning" ||
          session.phase === "won" ||
          session.phase === "claimed" ? (
          // Item custom (MonsterTech, etc) — no hay 3D, ponemos un placeholder
          // estilo cofre dorado para que la stage no se vea vacía.
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-[140px] opacity-30">🎁</div>
          </div>
        ) : null}

        {/* ─── Foreground content por phase ─── */}
        <div className="relative z-10 w-full max-w-2xl text-center space-y-4 pointer-events-none">
          {session.phase === "loading" && <LoadingPhase />}
          {session.phase === "loaded" && session.prize && (
            <LoadedPhase prize={session.prize} />
          )}
          {session.phase === "spinning" && session.winner && session.prize && (
            <SpinningPhase
              prize={session.prize}
              winner={session.winner}
              candidates={candidates}
              spinSeed={session.spin_seed ?? 0}
            />
          )}
          {session.phase === "won" && session.winner && session.prize && (
            <WonPhase
              prize={session.prize}
              winner={session.winner}
              wonAt={session.won_at}
              claimDeadlineSeconds={session.claim_deadline_seconds ?? 60}
            />
          )}
          {session.phase === "claimed" && session.winner && session.prize && (
            <ClaimedPhase prize={session.prize} winner={session.winner} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Phases ────────────────────────────────────────────────────────────────

function PhaseBadge({ phase }: { phase: RaffleSession["phase"] }) {
  const cls: Record<typeof phase, string> = {
    idle: "border-zinc-600/40 text-zinc-400",
    loading: "border-amber-500/40 text-amber-300",
    loaded: "border-cyan-500/40 text-cyan-300",
    spinning: "border-violet-500/40 text-violet-300 animate-pulse",
    won: "border-emerald-500/40 text-emerald-300",
    claimed: "border-emerald-700/40 text-emerald-200",
  };
  const labels: Record<typeof phase, string> = {
    idle: "—",
    loading: "Preparando",
    loaded: "Listo",
    spinning: "Girando",
    won: "¡Ganador!",
    claimed: "Reclamado",
  };
  return (
    <span
      className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-sm border ${cls[phase]}`}
    >
      {labels[phase]}
    </span>
  );
}

function LoadingPhase() {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-mono uppercase tracking-[0.25em] gold-text animate-pulse">
        El equipo está preparando un premio...
      </p>
      <div className="text-7xl animate-bounce">🎁</div>
    </div>
  );
}

function LoadedPhase({ prize }: { prize: NonNullable<RaffleSession["prize"]> }) {
  const title = prize.label || prize.ship_name || "Premio";
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] gold-text">
        Próximo premio
      </p>
      <h2 className="text-3xl sm:text-4xl font-bold text-amber-50 tracking-wider drop-shadow-[0_2px_8px_rgba(232,213,170,0.5)]">
        {title}
      </h2>
      {prize.description && (
        <p className="text-[12px] text-amber-100/80 italic font-serif">
          {prize.description}
        </p>
      )}
      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-200/60 pt-3">
        Esperando sorteo...
      </p>
    </div>
  );
}

function SpinningPhase({
  prize,
  winner,
  candidates,
  spinSeed,
}: {
  prize: NonNullable<RaffleSession["prize"]>;
  winner: NonNullable<RaffleSession["winner"]>;
  candidates: CandidatePreview[];
  spinSeed: number;
}) {
  // Construye la cinta de la pasarela: muchas iteraciones aleatorias terminando
  // siempre con el ganador real para que el "frenado" coincida visualmente con
  // el avatar correcto.
  const reel = useMemo(() => {
    const shuffled = shuffleSeeded(candidates.length > 0 ? candidates : [
      { display_name: winner.display_name, avatar_url: winner.avatar_url },
    ], spinSeed);
    // Repetimos varias vueltas para sensación de pasarela
    const loops: CandidatePreview[] = [];
    for (let i = 0; i < 6; i++) {
      loops.push(...shuffled);
    }
    // Aseguramos que la última posición sea el ganador
    loops.push({
      display_name: winner.display_name,
      avatar_url: winner.avatar_url,
    });
    return loops;
  }, [candidates, winner, spinSeed]);

  const title = prize.label || prize.ship_name || "Premio";

  // 2026-05-07 Fix: el chip ganador no caia bajo el marcador (caia el
  // siguiente). El bug estaba en el end transform `calc(-100% + 50vw)`: usaba
  // 50vw como referencia del centro pero la card del reel no es full
  // viewport. Ahora medimos el DOM real y usamos Web Animations API para que
  // el centro del ULTIMO chip coincida exactamente con el centro del
  // contenedor.
  const containerRef = useRef<HTMLDivElement>(null);
  const reelRef = useRef<HTMLDivElement>(null);
  const lastChipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const reelEl = reelRef.current;
    const lastEl = lastChipRef.current;
    if (!container || !reelEl || !lastEl) return;

    // Esperamos al next frame para asegurar que el layout esta calculado.
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      const cRect = container.getBoundingClientRect();
      const lRect = lastEl.getBoundingClientRect();
      const containerCenterX = cRect.left + cRect.width / 2;
      const lastCenterX = lRect.left + lRect.width / 2;
      // delta: lo que tenemos que mover el reel para que el ultimo chip quede
      // exactamente debajo del marcador central.
      const delta = containerCenterX - lastCenterX;

      const anim = reelEl.animate(
        [
          { transform: "translate(0px, -50%)" },
          { transform: `translate(${delta}px, -50%)` },
        ],
        {
          duration: 5400,
          easing: "cubic-bezier(0.15, 0.5, 0.05, 1)",
          fill: "forwards",
        },
      );
      // Si el componente se desmonta antes de que termine, cortamos.
      return () => anim.cancel();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [reel, spinSeed]);

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] gold-text">
        🎲 Sorteando · {title}
      </p>
      <div
        ref={containerRef}
        className="relative h-24 overflow-hidden rounded-md border-2 border-amber-400/50 bg-zinc-950/60 backdrop-blur-sm shadow-[0_0_30px_rgba(232,213,170,0.3)]"
      >
        {/* Indicador central */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-amber-400 z-20 -translate-x-1/2" />
        <div className="absolute left-1/2 top-0 -translate-x-1/2 z-30 text-amber-400 text-[10px]">▼</div>
        <div className="absolute left-1/2 bottom-0 -translate-x-1/2 z-30 text-amber-400 text-[10px]">▲</div>
        {/* Cinta — empieza con el primer chip ya alineado al marcador (left:50%) */}
        <div
          ref={reelRef}
          className="flex items-center gap-4 absolute top-1/2 left-1/2"
          style={{ transform: "translate(0px, -50%)", willChange: "transform" }}
        >
          {reel.map((c, i) => (
            <CandidateChip
              key={i}
              c={c}
              ref={i === reel.length - 1 ? lastChipRef : undefined}
            />
          ))}
        </div>
      </div>
      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-amber-200/50">
        Quien ríe último, ríe mejor...
      </p>
    </div>
  );
}

const CandidateChip = forwardRef<HTMLDivElement, { c: CandidatePreview }>(
  function CandidateChip({ c }, ref) {
    return (
      <div
        ref={ref}
        className="flex items-center gap-2 shrink-0 bg-zinc-900/70 border border-amber-200/30 rounded-md px-3 py-1.5"
      >
        {c.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.avatar_url}
            alt=""
            className="w-8 h-8 rounded-full border border-amber-200/40 shrink-0"
            draggable={false}
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-[14px] shrink-0">
            ⚔
          </div>
        )}
        <span className="text-[12px] font-bold text-amber-50 whitespace-nowrap">
          {c.display_name}
        </span>
      </div>
    );
  },
);

function WonPhase({
  prize,
  winner,
  wonAt,
  claimDeadlineSeconds,
}: {
  prize: NonNullable<RaffleSession["prize"]>;
  winner: NonNullable<RaffleSession["winner"]>;
  wonAt: string | null | undefined;
  claimDeadlineSeconds: number;
}) {
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef<number>(wonAt ? new Date(wonAt).getTime() : Date.now());
  useEffect(() => {
    startedRef.current = wonAt ? new Date(wonAt).getTime() : Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedRef.current) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [wonAt]);

  const remaining = Math.max(0, claimDeadlineSeconds - elapsed);
  const expired = remaining === 0;
  const title = prize.label || prize.ship_name || "Premio";

  return (
    <div className="space-y-3 pointer-events-auto">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] gold-text">
        🏆 Ganador del sorteo · {title}
      </p>

      <div className="inline-flex flex-col items-center gap-3 px-8 py-6 rounded-xl border-4 border-amber-400 bg-gradient-to-b from-amber-500/30 to-amber-700/20 shadow-[0_0_60px_rgba(245,158,11,0.6)] animate-winner-pop">
        {winner.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={winner.avatar_url}
            alt=""
            className="w-24 h-24 rounded-full border-4 border-amber-300 shadow-[0_0_20px_rgba(252,211,77,0.7)]"
            draggable={false}
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-amber-500/30 border-4 border-amber-300 flex items-center justify-center text-5xl shadow-[0_0_20px_rgba(252,211,77,0.7)]">
            👑
          </div>
        )}
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-200">
          Winner
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold text-amber-50 tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          {winner.display_name}
        </h2>
        {winner.rsi_handle && (
          <p className="text-[11px] text-amber-200/80 font-mono">
            @{winner.rsi_handle}
          </p>
        )}
      </div>

      <div
        className={`mt-2 inline-block px-4 py-2 rounded-md border text-[12px] font-serif italic ${
          expired
            ? "border-rose-500/60 bg-rose-500/15 text-rose-200"
            : "border-amber-500/40 bg-zinc-950/60 text-amber-200"
        }`}
      >
        {expired ? (
          <>⚠ Tiempo agotado — el equipo va a re-sortear.</>
        ) : (
          <>
            ⏳ Tenés <strong className="font-mono not-italic">{remaining}s</strong> para reclamar el premio o se sortea de nuevo.
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes winner-pop {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.06); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-winner-pop {
          animation: winner-pop 0.7s cubic-bezier(0.2, 1.2, 0.4, 1) forwards;
        }
      `}</style>
    </div>
  );
}

function ClaimedPhase({
  prize,
  winner,
}: {
  prize: NonNullable<RaffleSession["prize"]>;
  winner: NonNullable<RaffleSession["winner"]>;
}) {
  const title = prize.label || prize.ship_name || "Premio";
  return (
    <div className="space-y-3 pointer-events-auto">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] gold-text">
        ✓ Premio reclamado · {title}
      </p>
      <div className="inline-flex flex-col items-center gap-3 px-8 py-5 rounded-xl border-2 border-emerald-500/60 bg-emerald-500/10">
        {winner.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={winner.avatar_url}
            alt=""
            className="w-16 h-16 rounded-full border-2 border-emerald-400"
            draggable={false}
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-emerald-500/30 border-2 border-emerald-400 flex items-center justify-center text-3xl">
            ✓
          </div>
        )}
        <p className="text-2xl font-bold text-emerald-50">
          {winner.display_name}
        </p>
        <p className="text-[10px] text-emerald-200/70 font-serif italic">
          ¡Felicitaciones!
        </p>
      </div>
      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-200/50">
        Esperando próximo sorteo...
      </p>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

/** Mulberry32 — PRNG determinista a partir de un seed entero. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  const rnd = mulberry32(seed || 1);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default RaffleStage;
