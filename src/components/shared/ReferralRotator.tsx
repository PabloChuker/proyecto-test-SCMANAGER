"use client";

// =============================================================================
// SC Labs — ReferralRotator (Header)
//
// Pill compacta para el header que muestra un código de referral del Star
// Citizen Referral Program elegido al azar (ponderado por priority_weight)
// desde la tabla `referral_codes`. Dos affordances:
//
//   • Click en el código (o en el ícono "copy") → copia SOLO el alfanumérico
//     (ej. "STAR-NX5M-LHLQ") al portapapeles, listo para pegar en el formulario
//     de registro de RSI.
//   • Click en "Sign up" → abre en pestaña nueva
//     https://www.robertsspaceindustries.com/enlist?referral=STAR-XXX-XXXX
//     con el código pre-cargado.
//
// Rotación: pide un código nuevo al endpoint cada 60s. El usuario también
// puede forzar rotación con el ícono shuffle.
//
// Si no hay códigos activos (404 del endpoint) o falla el fetch, el componente
// se oculta silenciosamente — no queremos que el header se rompa por un dato.
// =============================================================================

import { useState, useEffect, useCallback, useRef } from "react";

interface ReferralPayload {
  code: string;
  ownerLabel: string | null;
  isDev: boolean;
  enlistUrl: string;
}

const ROTATE_MS = 60_000;

export default function ReferralRotator() {
  const [data, setData] = useState<ReferralPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [hidden, setHidden] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    const id = setInterval(fetchOne, ROTATE_MS);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [fetchOne]);

  const handleCopy = useCallback(async () => {
    if (!data?.code) return;
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback antiguo: select + execCommand. Best effort.
      const ta = document.createElement("textarea");
      ta.value = data.code;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); } catch {}
      document.body.removeChild(ta);
    }
  }, [data?.code]);

  if (hidden || !data) return null;

  return (
    <div
      className="hidden md:flex items-center gap-1 h-8 px-1.5 rounded-sm bg-zinc-900/60 border border-zinc-800/60 hover:border-amber-500/40 transition-colors"
      title="Star Citizen referral program — click to copy code"
    >
      {/* Etiqueta breve */}
      <span className="text-[8px] font-mono tracking-widest uppercase text-zinc-500 px-1">
        Referral
      </span>

      {/* Código + click-to-copy */}
      <button
        type="button"
        onClick={handleCopy}
        className="group flex items-center gap-1 px-1.5 h-full text-amber-300/90 hover:text-amber-200 cursor-pointer"
        title={copied ? "Copied!" : "Copy code to clipboard"}
      >
        <span className="text-[10px] font-mono font-medium tabular-nums tracking-wide">
          {data.code}
        </span>
        {/* Copy icon (becomes check when copied) */}
        {copied ? (
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

      {/* Sign up en RSI con el código pre-cargado */}
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

      {/* Shuffle (rotación manual) */}
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
    </div>
  );
}
