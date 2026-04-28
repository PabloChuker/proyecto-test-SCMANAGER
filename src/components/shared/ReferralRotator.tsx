"use client";

// =============================================================================
// SC Labs — ReferralRotator (Header)
//
// Pill compacta para el header que muestra un código de referral del Star
// Citizen Referral Program elegido al azar (ponderado por priority_weight)
// desde la tabla `referral_codes`.
//
// PROTECCIÓN PARA STREAMERS (2026-04-27, pedido de Pablo)
// -------------------------------------------------------
// El código está OCULTO por default y solo se revela al hacer click en
// "Referral". Razón: si un streamer/youtuber abre sclabs.space en cámara,
// no quiere mostrar accidentalmente un código de referral ajeno (de otro
// dev o user) durante toda la sesión. El user que QUIERE ver/copiar el
// código hace click → lo ve por 8 segundos → se vuelve a ocultar
// automáticamente.
//
// Mientras está revelado, la rotación automática queda en pausa (no queremos
// cambiar el código mientras lo está leyendo o copiando).
//
// Affordances:
//
//   • Click en "Referral" o en el código tapado → revela el código por 8s.
//   • Click en el código revelado → copia al portapapeles + extiende el
//     timer de auto-hide.
//   • Click en "Sign up" → abre en pestaña nueva con el código pre-cargado
//     en la URL. NOTA: el código SÍ va en el href; un streamer atento podría
//     verlo al hover. Es un trade-off — el referral solo funciona si el
//     código viaja en la URL.
//
// Rotación: pide un código nuevo al endpoint cada 60s, salvo cuando esté
// revelado (pausa). El usuario también puede forzar rotación con el shuffle.
// Si no hay códigos activos, el componente se oculta silenciosamente.
// =============================================================================

import { useState, useEffect, useCallback, useRef } from "react";

interface ReferralPayload {
  code: string;
  ownerLabel: string | null;
  isDev: boolean;
  enlistUrl: string;
}

const ROTATE_MS = 60_000;
const REVEAL_AUTO_HIDE_MS = 8_000;

/**
 * Convierte "STAR-NX5M-LHLQ" → "STAR-••••-••••" preservando guiones.
 * Mantiene el prefijo "STAR-" porque es estructura genérica del programa,
 * no identifica a nadie en particular.
 */
function maskCode(code: string): string {
  if (!code) return "STAR-••••-••••";
  return code.replace(/[A-Z0-9]/g, (ch, idx) => {
    // Conservar el prefijo STAR (primeros 4 chars alfanuméricos del string)
    return idx < 4 ? ch : "•";
  });
}

export default function ReferralRotator() {
  const [data, setData] = useState<ReferralPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchOne = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await fetch("/api/referral/random", {
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!r.ok) {
        if (r.status === 404) setHidden(true); // sin códigos activos: ocultar
        return;
      }
      const json = (await r.json()) as ReferralPayload;
      setData(json);
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
      // No molestar al usuario si falla — solo log dev
      // eslint-disable-next-line no-console
      console.warn("[ReferralRotator] fetch failed", e);
    }
  }, []);

  useEffect(() => {
    fetchOne();
    const id = setInterval(() => {
      // FEAT 2026-04-27: NO rotar mientras el código está revelado, así no
      // cambia debajo del user que lo está leyendo o por copiar.
      if (revealed) return;
      fetchOne();
    }, ROTATE_MS);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [fetchOne, revealed]);

  // Auto-hide del código revelado tras 8s. Si el user hace algo que extienda
  // (ej. copy), reseteamos el timer.
  const scheduleAutoHide = useCallback(() => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => {
      setRevealed(false);
      revealTimerRef.current = null;
    }, REVEAL_AUTO_HIDE_MS);
  }, []);

  const handleReveal = useCallback(() => {
    setRevealed(true);
    scheduleAutoHide();
  }, [scheduleAutoHide]);

  const handleHide = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    setRevealed(false);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!data?.code) return;
    // Si no estaba revelado, revelarlo al copiar (acción afirmativa del user).
    if (!revealed) handleReveal();
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1800);
      // Extender el timer de hide para que el user pueda ver el "Copied!" feedback
      scheduleAutoHide();
    } catch {
      // Fallback antiguo: select + execCommand. Best effort.
      const ta = document.createElement("textarea");
      ta.value = data.code;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); } catch {}
      document.body.removeChild(ta);
    }
  }, [data?.code, revealed, handleReveal, scheduleAutoHide]);

  // Cleanup de los timers al unmount
  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  if (hidden || !data) return null;

  const displayCode = revealed ? data.code : maskCode(data.code);

  return (
    <div
      className="hidden md:flex items-center gap-1 h-8 px-1.5 rounded-sm bg-zinc-900/60 border border-zinc-800/60 hover:border-amber-500/40 transition-colors"
      title={revealed
        ? "Click sobre el código para copiar — se vuelve a ocultar en 8s"
        : "Click sobre 'Referral' o el código tapado para revelar"}
    >
      {/* Etiqueta breve — clickeable para revelar/ocultar */}
      <button
        type="button"
        onClick={revealed ? handleHide : handleReveal}
        className={`text-[8px] font-mono tracking-widest uppercase px-1 transition-colors cursor-pointer ${
          revealed
            ? "text-amber-400/80 hover:text-amber-300"
            : "text-zinc-500 hover:text-zinc-400"
        }`}
        title={revealed ? "Ocultar código" : "Mostrar código"}
        aria-label={revealed ? "Ocultar código de referral" : "Mostrar código de referral"}
      >
        Referral
      </button>

      {/* Código + click-to-copy. Si no está revelado, click revela. */}
      <button
        type="button"
        onClick={handleCopy}
        className="group flex items-center gap-1 px-1.5 h-full text-amber-300/90 hover:text-amber-200 cursor-pointer"
        title={
          !revealed ? "Click para revelar y copiar" :
          copied ? "Copied!" : "Copiar código al portapapeles"
        }
      >
        <span className={`text-[10px] font-mono font-medium tabular-nums tracking-wide ${
          revealed ? "" : "text-zinc-500"
        }`}>
          {displayCode}
        </span>
        {/* Icon: eye when hidden, copy/check when revealed */}
        {!revealed ? (
          <svg className="w-3 h-3 text-zinc-500 group-hover:text-amber-300/90 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : copied ? (
          <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg className="w-3 h-3 text-zinc-500 group-hover:text-amber-300/90 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>

      {/* Divider */}
      <span className="block w-px h-4 bg-zinc-800/80" />

      {/* Sign up en RSI con el código pre-cargado.
          Nota: el código SÍ viaja en el href — un streamer atento podría
          verlo al hover sobre el link. Es necesario para que el referral
          funcione. La protección principal es el código display arriba. */}
      <a
        href={data.enlistUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 px-1.5 h-full text-[9px] font-mono tracking-widest uppercase text-zinc-400 hover:text-amber-300 transition-colors"
        title="Open RSI sign-up with this referral pre-filled"
      >
        Sign up
        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17 17 7" />
          <path d="M7 7h10v10" />
        </svg>
      </a>

      {/* Shuffle (rotación manual). Solo visible cuando NO está revelado, así
          el user no rota accidentalmente el código que estaba a punto de copiar. */}
      {!revealed && (
        <button
          type="button"
          onClick={fetchOne}
          className="flex items-center justify-center w-6 h-6 text-zinc-600 hover:text-amber-300 transition-colors"
          title="Show another referral code"
          aria-label="Rotate referral code"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3h5v5" />
            <path d="M4 20 21 3" />
            <path d="M21 16v5h-5" />
            <path d="m15 15 6 6" />
            <path d="M4 4l5 5" />
          </svg>
        </button>
      )}
    </div>
  );
}
