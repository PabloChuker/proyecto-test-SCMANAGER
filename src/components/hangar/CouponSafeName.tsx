"use client";

// =============================================================================
// CouponSafeName — Renderiza un nombre de pledge ocultando códigos de cupón
//
// Caso de uso: streamers / creadores de contenido pueden tener su Hangar
// abierto en cámara y exponer accidentalmente sus códigos de Imperator,
// Referral, BIS, etc. Por defecto el código se muestra como "••••••••••"
// y el usuario hace click en el ícono de ojo para revelarlo. Auto-oculta
// después de COUPON_AUTO_HIDE_MS para que ni aunque se distraiga quede
// expuesto en pantalla mucho tiempo.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { maskCoupon, COUPON_AUTO_HIDE_MS } from "./hangar-utils";

interface CouponSafeNameProps {
  /** Nombre tal como viene del hangar (puede contener "Coupon: XXXX"). */
  name: string;
  /** Clase css para el span del nombre. */
  className?: string;
  /** Variante compacta para vistas tipo list (botón más chico). */
  compact?: boolean;
}

export function CouponSafeName({ name, className, compact }: CouponSafeNameProps) {
  const { display, code, hasCoupon } = maskCoupon(name);
  const [revealed, setRevealed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleToggle = () => {
    if (revealed) {
      setRevealed(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    setRevealed(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setRevealed(false), COUPON_AUTO_HIDE_MS);
  };

  // Si no hay cupón, render plano sin botón.
  if (!hasCoupon) {
    return <span className={className}>{name}</span>;
  }

  const visibleText = revealed && code ? name : display;
  const eyeSize = compact ? 12 : 14;

  return (
    <span className={(className ?? "") + " inline-flex items-center gap-1.5"}>
      <span className={revealed ? "text-amber-200" : ""}>{visibleText}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleToggle();
        }}
        title={
          revealed
            ? "Hide code (auto-hides in a few seconds)"
            : "Reveal code (visible only to you)"
        }
        className={
          "flex-shrink-0 inline-flex items-center justify-center rounded-[2px] " +
          "border transition-colors " +
          (revealed
            ? "text-amber-300 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20"
            : "text-zinc-500 border-zinc-700/60 hover:text-zinc-200 hover:border-zinc-500") +
          (compact ? " w-5 h-5" : " w-6 h-6")
        }
        aria-pressed={revealed}
        aria-label={revealed ? "Hide coupon code" : "Reveal coupon code"}
      >
        {revealed ? (
          // Eye-off
          <svg width={eyeSize} height={eyeSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 11 7 11 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 1 12s4 7 11 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          // Eye
          <svg width={eyeSize} height={eyeSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  );
}
