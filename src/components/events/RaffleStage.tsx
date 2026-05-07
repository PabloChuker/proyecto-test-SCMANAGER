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
  // Construye la cinta de la pasarela: pre-roll de nombres barajados, el
  // chip GANADOR en una posicion intermedia (~80% del reel), y post-roll
  // de mas nombres despues. Asi el frenado deja al ganador bajo el marcador
  // PERO con nombres visibles a la derecha — da la sensacion de que la
  // pasarela "podria seguir", evita el feeling de "se quedo al final".
  // Pablo: "deberia ser n continuados de nombre para que no de la sensacion
  // como que se quedo al final".
  const winnerChip: CandidatePreview = useMemo(
    () => ({ display_name: winner.display_name, avatar_url: winner.avatar_url }),
    [winner.display_name, winner.avatar_url],
  );
  const { reel, winnerIndex } = useMemo(() => {
    const sameAsWinner = (c: CandidatePreview) =>
      c.display_name === winner.display_name &&
      c.avatar_url === winner.avatar_url;
    const otherCandidates = candidates.filter((c) => !sameAsWinner(c));
    const allShuffled = shuffleSeeded(
      candidates.length > 0
        ? candidates
        : [{ display_name: winner.display_name, avatar_url: winner.avatar_url }],
      spinSeed,
    );
    // Para los chips ADYACENTES al ganador queremos garantizar que no sea
    // tambien el ganador (sino se ve "Pablo | Pablo | Pablo" y queda como
    // bug visual). Si hay otros candidatos, usamos esa lista para el ultimo
    // chip pre-roll y todo el post-roll. Si NO hay otros (ganador es el
    // unico inscripto), caemos a usar el shuffle completo — no hay opcion.
    const adjacentPool = otherCandidates.length > 0
      ? shuffleSeeded(otherCandidates, spinSeed + 1)
      : allShuffled;

    const loops: CandidatePreview[] = [];
    // Pre-roll: 5 vueltas para que de impresion de muchos nombres pasando
    for (let i = 0; i < 5; i++) loops.push(...allShuffled);
    // Si la ultima posicion antes del ganador resulto ser el ganador
    // (porque el shuffle lo dejo ahi), la swapeamos por uno del adjacentPool.
    if (loops.length > 0 && sameAsWinner(loops[loops.length - 1]) && otherCandidates.length > 0) {
      loops[loops.length - 1] = adjacentPool[0];
    }
    // Insert ganador
    const idx = loops.length;
    loops.push(winnerChip);
    // Post-roll: solo non-winner para evitar el duplicado a la derecha del
    // marcador. 2 vueltas — suficiente para llenar el viewport visible.
    for (let i = 0; i < 2; i++) loops.push(...adjacentPool);
    return { reel: loops, winnerIndex: idx };
  }, [candidates, winner.display_name, winner.avatar_url, winnerChip, spinSeed]);

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
  const winnerChipRef = useRef<HTMLDivElement>(null);
  const animStartedKey = useRef<string | null>(null);

  // Key estable: combina spin_seed + winner_registration_id. Mientras el
  // server reporte el mismo sorteo (aunque el objeto venga por polling) la
  // key no cambia y no re-ejecutamos la animacion.
  const spinKey = `${spinSeed}-${winner.registration_id}`;

  useEffect(() => {
    if (animStartedKey.current === spinKey) return; // ya estamos animando este sorteo
    const container = containerRef.current;
    const reelEl = reelRef.current;
    const targetEl = winnerChipRef.current;
    if (!container || !reelEl || !targetEl) return;
    animStartedKey.current = spinKey;

    // Esperamos al next frame para asegurar que el layout esta calculado.
    let cancelled = false;
    let anim: Animation | null = null;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      const cRect = container.getBoundingClientRect();
      const tRect = targetEl.getBoundingClientRect();
      const containerCenterX = cRect.left + cRect.width / 2;
      const targetCenterX = tRect.left + tRect.width / 2;
      // delta: lo que tenemos que mover el reel para que el chip GANADOR
      // (no el ultimo) quede exactamente debajo del marcador central.
      const delta = containerCenterX - targetCenterX;

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
              ref={i === winnerIndex ? winnerChipRef : undefined}
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

  // Vista del NO-GANADOR: card chica e informativa, sin confeti.
  if (!isMe) {
    return (
      <div className="space-y-3 pointer-events-auto">
        <p className="text-[10px] font-mono uppercase tracking-[0.25em] gold-text won-stage-caption">
          🏆 Ganador del sorteo · {title}
        </p>
        <div className="inline-flex items-center gap-3 px-5 py-3 rounded-md border border-amber-500/50 bg-amber-500/10 won-stage-card">
          {winner.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={winner.avatar_url}
              alt=""
              className="w-12 h-12 rounded-full border-2 border-amber-300 won-stage-avatar"
              draggable={false}
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-amber-500/20 border-2 border-amber-300 flex items-center justify-center text-2xl won-stage-avatar">
              🏆
            </div>
          )}
          <div className="text-left">
            <p className="text-[9px] font-mono uppercase tracking-widest text-amber-300 won-stage-text-1">
              Ganador
            </p>
            <h2 className="text-xl font-bold text-amber-50 tracking-wide won-stage-text-2">
              {winner.display_name}
            </h2>
            {winner.rsi_handle && (
              <p className="text-[10px] text-amber-200/70 font-mono won-stage-text-3">
                @{winner.rsi_handle}
              </p>
            )}
          </div>
        </div>
        <div className="text-[10px] text-amber-200/60 font-serif italic won-stage-countdown">
          {expired
            ? "⚠ Tiempo agotado — re-sorteo en curso."
            : `⏳ El ganador tiene ${remaining}s para reclamar.`}
        </div>

        <style jsx>{`
          @keyframes won-fade-mini {
            from { opacity: 0; transform: translateY(4px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .won-stage-caption { animation: won-fade-mini 0.45s ease both; animation-delay: 0ms; }
          .won-stage-card { animation: won-fade-mini 0.55s ease both; animation-delay: 120ms; }
          .won-stage-avatar { animation: won-fade-mini 0.45s ease both; animation-delay: 240ms; }
          .won-stage-text-1 { animation: won-fade-mini 0.4s ease both; animation-delay: 320ms; }
          .won-stage-text-2 { animation: won-fade-mini 0.45s ease both; animation-delay: 420ms; }
          .won-stage-text-3 { animation: won-fade-mini 0.4s ease both; animation-delay: 520ms; }
          .won-stage-countdown { animation: won-fade-mini 0.4s ease both; animation-delay: 620ms; }
        `}</style>
      </div>
    );
  }

  // Vista del GANADOR (isMe): pantalla MASIVA dorada con confeti, "¡ERES EL
  // GANADOR!" enorme. Pablo: "esa tiene que ser dorada y con confeti y con
  // la frase de eres el ganador".
  return (
    <div className="space-y-4 pointer-events-auto relative">
      <Confetti />
      <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-amber-200 won-stage-caption">
        🎉 Sorteo · {title}
      </p>
      <div className="inline-flex flex-col items-center gap-4 px-10 py-8 rounded-2xl border-4 border-amber-300 bg-gradient-to-b from-amber-400/45 to-amber-800/35 shadow-[0_0_140px_rgba(252,211,77,0.95)] won-stage-card">
        <p className="text-[12px] font-mono uppercase tracking-[0.4em] text-amber-100/95 won-stage-text-1">
          Felicitaciones
        </p>
        <h1
          className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-wider text-amber-50 drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)] won-hero-title"
          style={{ textShadow: "0 0 24px rgba(252,211,77,0.7), 0 2px 6px rgba(0,0,0,0.85)" }}
        >
          ¡ERES EL GANADOR!
        </h1>
        <div className="won-stage-avatar">
          {winner.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={winner.avatar_url}
              alt=""
              className="w-32 h-32 rounded-full border-4 border-amber-200 shadow-[0_0_40px_rgba(252,211,77,0.95)]"
              draggable={false}
            />
          ) : (
            <div className="w-32 h-32 rounded-full bg-amber-400/40 border-4 border-amber-200 flex items-center justify-center text-7xl shadow-[0_0_40px_rgba(252,211,77,0.95)]">
              👑
            </div>
          )}
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-amber-50 tracking-wide drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] won-stage-text-2">
          {winner.display_name}
        </h2>
        {winner.rsi_handle && (
          <p className="text-[12px] text-amber-100/85 font-mono won-stage-text-3">
            @{winner.rsi_handle}
          </p>
        )}
      </div>

      <div
        className={`inline-block px-5 py-2.5 rounded-md border-2 text-[13px] font-serif italic won-stage-countdown ${
          expired
            ? "border-rose-500/70 bg-rose-500/20 text-rose-100"
            : "border-amber-300/70 bg-zinc-950/70 text-amber-100"
        }`}
      >
        {expired ? (
          <>⚠ Tiempo agotado — el equipo va a re-sortear.</>
        ) : (
          <>
            ⏳ Tenés <strong className="font-mono not-italic">{remaining}s</strong> para reclamar el premio.
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
        @keyframes won-hero-pulse {
          0%   { opacity: 0; transform: translateY(10px) scale(0.95); }
          60%  { opacity: 1; transform: translateY(0)    scale(1.02); }
          100% { opacity: 1; transform: translateY(0)    scale(1); }
        }
        .won-hero-title {
          animation: won-hero-pulse 1s cubic-bezier(0.18, 0.7, 0.25, 1) both;
          animation-delay: 280ms;
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
  const [emailFormOpen, setEmailFormOpen] = useState(false);
  const title = prize.label || prize.ship_name || "Premio";

  // ── Vista NO-GANADOR ──
  // Card compacta, sin confeti, sin botones de email. Solo informativa.
  if (!isMe) {
    return (
      <div className="space-y-3 pointer-events-auto">
        <p className="text-[10px] font-mono uppercase tracking-[0.25em] gold-text">
          ✓ Premio reclamado · {title}
        </p>
        <div className="inline-flex items-center gap-3 px-5 py-3 rounded-md border border-emerald-500/50 bg-emerald-500/10">
          {winner.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={winner.avatar_url}
              alt=""
              className="w-12 h-12 rounded-full border-2 border-emerald-400"
              draggable={false}
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-emerald-500/30 border-2 border-emerald-400 flex items-center justify-center text-2xl">
              ✓
            </div>
          )}
          <div className="text-left">
            <p className="text-[9px] font-mono uppercase tracking-widest text-emerald-300">
              Ganador
            </p>
            <p className="text-base font-bold text-emerald-50">
              {winner.display_name}
            </p>
          </div>
        </div>
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-200/50">
          Esperando próximo sorteo...
        </p>
      </div>
    );
  }

  // ── Vista GANADOR (isMe) ──
  // Pantalla dorada masiva con confeti + boton ROJO grande "CARGAR TU E-MAIL".
  // Al click, expande el form. Pablo: "esa tiene que ser dorada y con confeti
  // y con la frase de eres el ganador" + "un boton grande que diga cargar tu
  // e-mail roja".
  return (
    <div className="space-y-4 pointer-events-auto relative">
      <Confetti />
      <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-amber-200">
        🎉 Sorteo reclamado · {title}
      </p>

      <div className="inline-flex flex-col items-center gap-4 px-10 py-7 rounded-2xl border-4 border-amber-300 bg-gradient-to-b from-amber-400/45 to-amber-800/35 shadow-[0_0_140px_rgba(252,211,77,0.95)]">
        <p className="text-[12px] font-mono uppercase tracking-[0.4em] text-amber-100/95">
          Felicitaciones
        </p>
        <h1
          className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-wider text-amber-50 drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]"
          style={{ textShadow: "0 0 24px rgba(252,211,77,0.7), 0 2px 6px rgba(0,0,0,0.85)" }}
        >
          ¡ERES EL GANADOR!
        </h1>
        {winner.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={winner.avatar_url}
            alt=""
            className="w-28 h-28 rounded-full border-4 border-amber-200 shadow-[0_0_40px_rgba(252,211,77,0.95)]"
            draggable={false}
          />
        ) : (
          <div className="w-28 h-28 rounded-full bg-amber-400/40 border-4 border-amber-200 flex items-center justify-center text-6xl shadow-[0_0_40px_rgba(252,211,77,0.95)]">
            👑
          </div>
        )}
        <h2 className="text-2xl sm:text-3xl font-bold text-amber-50 tracking-wide drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
          {winner.display_name}
        </h2>
        <p className="text-[12px] text-amber-100/85 font-serif italic">
          Premio: <strong className="not-italic font-bold">{title}</strong>
        </p>
      </div>

      {/* CTA: boton rojo grande para abrir el form de email. Cuando se
          presiona, fade in del form abajo. */}
      {!emailFormOpen && winner.winner_id && (
        <button
          onClick={() => setEmailFormOpen(true)}
          className="claim-cta-button block w-full max-w-md mx-auto mt-2 px-6 py-4 rounded-lg border-2 border-rose-400 bg-gradient-to-b from-rose-500 to-rose-700 text-white text-lg sm:text-xl font-black tracking-wider uppercase shadow-[0_6px_24px_rgba(244,63,94,0.55)] hover:from-rose-400 hover:to-rose-600 hover:shadow-[0_6px_32px_rgba(244,63,94,0.75)] transition-all"
        >
          ✉ Cargar tu e-mail
        </button>
      )}
      {emailFormOpen && winner.winner_id && (
        <ClaimEmailForm slug={slug} winnerId={winner.winner_id} />
      )}
      {!winner.winner_id && (
        <p className="text-[11px] text-amber-200/80 font-serif italic">
          Esperá un momento — el equipo está confirmando el reclamo.
        </p>
      )}

      <style jsx>{`
        @keyframes claim-cta-pulse {
          0%, 100% { transform: scale(1);    box-shadow: 0 6px 24px rgba(244, 63, 94, 0.55); }
          50%      { transform: scale(1.03); box-shadow: 0 6px 36px rgba(244, 63, 94, 0.85); }
        }
        .claim-cta-button {
          animation: claim-cta-pulse 1.6s ease-in-out infinite;
        }
        .claim-cta-button:hover {
          animation: none;
        }
      `}</style>
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
