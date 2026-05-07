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
    /** id de la fila en event_raffle_winners — solo presente cuando phase=claimed
     *  para que el ganador self pueda PATCHear su email contra esa fila. */
    winner_id?: string | null;
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
  currentUserId,
  slug,
}: {
  session: RaffleSession;
  /** Lista de presentes (display_name + avatar) para animar la pasarela. */
  candidates: CandidatePreview[];
  eventName: string;
  /** id del usuario logueado, para detectar si es el ganador y mostrar UI especial. */
  currentUserId?: string | null;
  /** slug del evento para el endpoint claim-email. */
  slug: string;
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
              isMe={!!currentUserId && session.winner.user_id === currentUserId}
            />
          )}
          {session.phase === "claimed" && session.winner && session.prize && (
            <ClaimedPhase
              prize={session.prize}
              winner={session.winner}
              isMe={!!currentUserId && session.winner.user_id === currentUserId}
              slug={slug}
            />
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
  //
  // 2026-05-07 Fix #2: la pagina publica pollea cada 1.5s, lo que crea
  // referencias nuevas de session.winner cada vez. Sin un guard, el useEffect
  // reiniciaba la animacion cada poll → saltos visibles. Ahora trackeamos
  // qué (spin_seed + winner_id) ya animamos via animStartedKey y solo
  // arrancamos UNA vez por sorteo.
  const containerRef = useRef<HTMLDivElement>(null);
  const reelRef = useRef<HTMLDivElement>(null);
  const lastChipRef = useRef<HTMLDivElement>(null);
  const animStartedKey = useRef<string | null>(null);

  // Key estable: combina spin_seed + winner_registration_id. Mientras el
  // server reporte el mismo sorteo (aunque el objeto venga por polling) la
  // key no cambia y no re-ejecutamos la animacion.
  const spinKey = `${spinSeed}-${winner.registration_id}`;

  useEffect(() => {
    if (animStartedKey.current === spinKey) return; // ya estamos animando este sorteo
    const container = containerRef.current;
    const reelEl = reelRef.current;
    const lastEl = lastChipRef.current;
    if (!container || !reelEl || !lastEl) return;
    animStartedKey.current = spinKey;

    // Esperamos al next frame para asegurar que el layout esta calculado.
    let cancelled = false;
    let anim: Animation | null = null;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      const cRect = container.getBoundingClientRect();
      const lRect = lastEl.getBoundingClientRect();
      const containerCenterX = cRect.left + cRect.width / 2;
      const lastCenterX = lRect.left + lRect.width / 2;
      // delta: lo que tenemos que mover el reel para que el ultimo chip quede
      // exactamente debajo del marcador central.
      const delta = containerCenterX - lastCenterX;

      anim = reelEl.animate(
        [
          { transform: "translate(0px, -50%)" },
          { transform: `translate(${delta}px, -50%)` },
        ],
        {
          duration: 5400,
          easing: "cubic-bezier(0.12, 0.55, 0.05, 1)", // un toque mas suave en el frenado
          fill: "forwards",
        },
      );
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
      // Importante: NO cancelamos `anim` aca — lo dejamos correr para que el
      // re-render del polling no reinicie la animacion. Solo se cancela si
      // cambia el spinKey o se desmonta el SpinningPhase entero (cuando phase
      // pasa a "won" y este componente desaparece).
    };
  }, [spinKey]);

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
  isMe,
}: {
  prize: NonNullable<RaffleSession["prize"]>;
  winner: NonNullable<RaffleSession["winner"]>;
  wonAt: string | null | undefined;
  claimDeadlineSeconds: number;
  isMe: boolean;
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
    <div className="space-y-3 pointer-events-auto relative">
      {/* Confeti dorado solo para el ganador */}
      {isMe && <Confetti />}
      <p className={`text-[10px] font-mono uppercase tracking-[0.25em] won-stage-caption ${isMe ? "text-amber-200" : "gold-text"}`}>
        {isMe ? "🎉 ¡GANASTE!" : `🏆 Ganador del sorteo · ${title}`}
      </p>

      <div
        className={`inline-flex flex-col items-center gap-3 px-8 py-6 rounded-xl border-4 won-stage-card ${
          isMe
            ? "border-amber-300 bg-gradient-to-b from-amber-400/40 to-amber-700/30 shadow-[0_0_120px_rgba(252,211,77,0.85)]"
            : "border-amber-400 bg-gradient-to-b from-amber-500/30 to-amber-700/20 shadow-[0_0_60px_rgba(245,158,11,0.6)]"
        }`}
      >
        {winner.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={winner.avatar_url}
            alt=""
            className="w-24 h-24 rounded-full border-4 border-amber-300 shadow-[0_0_20px_rgba(252,211,77,0.7)] won-stage-avatar"
            draggable={false}
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-amber-500/30 border-4 border-amber-300 flex items-center justify-center text-5xl shadow-[0_0_20px_rgba(252,211,77,0.7)] won-stage-avatar">
            👑
          </div>
        )}
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-200 won-stage-text-1">
          Winner
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold text-amber-50 tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] won-stage-text-2">
          {winner.display_name}
        </h2>
        {winner.rsi_handle && (
          <p className="text-[11px] text-amber-200/80 font-mono won-stage-text-3">
            @{winner.rsi_handle}
          </p>
        )}
      </div>

      <div
        className={`mt-2 inline-block px-4 py-2 rounded-md border text-[12px] font-serif italic won-stage-countdown ${
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
        /* Stagger suave estilo "credits" — cada elemento entra con fade+rise
           sin overshoot. Total = ~1.6s para el ultimo elemento.
           Pablo: el winner-pop con scale 0.6 → 1.06 se sentia brusco, esto es
           fluido y mantiene la pose final estable.                            */
        @keyframes won-fade {
          from { opacity: 0; transform: translateY(8px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes won-glow {
          from { opacity: 0; transform: scale(0.92); filter: blur(4px); }
          to   { opacity: 1; transform: scale(1);    filter: blur(0); }
        }
        .won-stage-caption {
          animation: won-fade 0.55s cubic-bezier(0.2, 0.7, 0.3, 1) both;
          animation-delay: 0ms;
        }
        .won-stage-card {
          animation: won-glow 0.85s cubic-bezier(0.18, 0.7, 0.25, 1) both;
          animation-delay: 180ms;
          transform-origin: center center;
        }
        .won-stage-avatar {
          animation: won-fade 0.55s cubic-bezier(0.2, 0.7, 0.3, 1) both;
          animation-delay: 380ms;
        }
        .won-stage-text-1 {
          animation: won-fade 0.5s cubic-bezier(0.2, 0.7, 0.3, 1) both;
          animation-delay: 540ms;
        }
        .won-stage-text-2 {
          animation: won-fade 0.55s cubic-bezier(0.2, 0.7, 0.3, 1) both;
          animation-delay: 720ms;
        }
        .won-stage-text-3 {
          animation: won-fade 0.5s cubic-bezier(0.2, 0.7, 0.3, 1) both;
          animation-delay: 900ms;
        }
        .won-stage-countdown {
          animation: won-fade 0.5s cubic-bezier(0.2, 0.7, 0.3, 1) both;
          animation-delay: 1050ms;
        }
      `}</style>
    </div>
  );
}

function ClaimedPhase({
  prize,
  winner,
  isMe,
  slug,
}: {
  prize: NonNullable<RaffleSession["prize"]>;
  winner: NonNullable<RaffleSession["winner"]>;
  isMe: boolean;
  slug: string;
}) {
  const title = prize.label || prize.ship_name || "Premio";
  return (
    <div className="space-y-3 pointer-events-auto relative">
      {isMe && <Confetti />}
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] gold-text">
        {isMe ? "🎉 ¡Ganaste!" : `✓ Premio reclamado · ${title}`}
      </p>
      <div
        className={`inline-flex flex-col items-center gap-3 px-8 py-5 rounded-xl border-2 ${
          isMe
            ? "border-amber-300 bg-gradient-to-b from-amber-400/30 to-amber-700/20 shadow-[0_0_60px_rgba(252,211,77,0.6)]"
            : "border-emerald-500/60 bg-emerald-500/10"
        }`}
      >
        {winner.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={winner.avatar_url}
            alt=""
            className={`w-16 h-16 rounded-full border-2 ${
              isMe ? "border-amber-300" : "border-emerald-400"
            }`}
            draggable={false}
          />
        ) : (
          <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center text-3xl ${
            isMe ? "bg-amber-500/30 border-amber-300" : "bg-emerald-500/30 border-emerald-400"
          }`}>
            {isMe ? "👑" : "✓"}
          </div>
        )}
        <p className={`text-2xl font-bold ${isMe ? "text-amber-50" : "text-emerald-50"}`}>
          {winner.display_name}
        </p>
        <p className={`text-[11px] font-serif italic ${isMe ? "text-amber-100/90" : "text-emerald-200/70"}`}>
          {isMe ? `Premio: ${title}` : "¡Felicitaciones!"}
        </p>
      </div>

      {isMe && winner.winner_id ? (
        <ClaimEmailForm slug={slug} winnerId={winner.winner_id} />
      ) : isMe ? (
        <p className="text-[11px] text-amber-200/80 font-serif italic">
          Esperá un momento — el equipo está confirmando el reclamo.
        </p>
      ) : (
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-200/50">
          Esperando próximo sorteo...
        </p>
      )}
    </div>
  );
}

// ─── Confetti ────────────────────────────────────────────────────────────
// 60 partículas doradas/ambar cayendo con rotación. Pure CSS, sin libs.

function Confetti() {
  const pieces = useMemo(() => {
    return Array.from({ length: 60 }).map((_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.2,
      duration: 2.5 + Math.random() * 2.5,
      size: 6 + Math.random() * 8,
      hue: 35 + Math.random() * 20, // amber/gold range
      sat: 80 + Math.random() * 20,
      lit: 50 + Math.random() * 25,
      drift: -30 + Math.random() * 60,
      rotateEnd: 360 + Math.random() * 720,
      shape: i % 3, // 0=square, 1=circle, 2=line
    }));
  }, []);
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible z-20" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: p.shape === 2 ? "2px" : `${p.size}px`,
            background: `hsl(${p.hue}, ${p.sat}%, ${p.lit}%)`,
            borderRadius: p.shape === 1 ? "50%" : "1px",
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ["--drift" as any]: `${p.drift}px`,
            ["--rotate" as any]: `${p.rotateEnd}deg`,
          }}
        />
      ))}
      <style jsx>{`
        .confetti-piece {
          position: absolute;
          top: -10%;
          opacity: 0;
          animation-name: confetti-fall;
          animation-iteration-count: infinite;
          animation-timing-function: linear;
          will-change: transform, opacity;
        }
        @keyframes confetti-fall {
          0%   { transform: translate(0, 0) rotate(0deg); opacity: 0; }
          10%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translate(var(--drift), 460px) rotate(var(--rotate)); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── ClaimEmailForm ──────────────────────────────────────────────────────
// El ganador completa su email para que el equipo le envíe el premio. Una
// vez submit, queda grabado en event_raffle_winners.winner_email + claimed_at.

function ClaimEmailForm({
  slug,
  winnerId,
}: {
  slug: string;
  winnerId: string;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/events/${slug}/raffle/winner-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner_id: winnerId, email: email.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Error ${r.status}`);
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="inline-block px-4 py-3 rounded-md border-2 border-emerald-500/60 bg-emerald-500/10 text-emerald-200">
        <p className="text-[12px] font-bold flex items-center gap-2">✓ Email guardado</p>
        <p className="text-[10px] text-emerald-300/80 mt-1 font-serif italic">
          El equipo organizador te va a contactar para entregarte el premio.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="inline-flex flex-col gap-2 items-stretch text-left bg-zinc-950/70 border-2 border-amber-300/70 rounded-md p-4 max-w-md mx-auto shadow-[0_0_30px_rgba(252,211,77,0.4)]"
    >
      <p className="text-[11px] font-bold text-amber-100 text-center">
        ✉ Registrá tu email para recibir el premio
      </p>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu-email@ejemplo.com"
        className="px-3 py-2 bg-zinc-900 border border-amber-400/40 rounded-sm text-[12px] text-amber-50 placeholder-zinc-600 focus:outline-none focus:border-amber-400"
      />
      <button
        type="submit"
        disabled={busy || !email.trim()}
        className="px-4 py-2 bg-gradient-to-b from-amber-400 to-amber-600 text-zinc-950 rounded-sm font-bold text-[12px] hover:from-amber-300 hover:to-amber-500 transition disabled:opacity-50"
      >
        {busy ? "Guardando..." : "Confirmar email"}
      </button>
      {error && (
        <p className="text-[11px] text-rose-300 font-mono">{error}</p>
      )}
      <p className="text-[9px] text-amber-200/60 font-serif italic text-center">
        Solo el equipo organizador del evento ve tu email. No lo compartimos.
      </p>
    </form>
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
