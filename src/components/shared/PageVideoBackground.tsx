"use client";
// =============================================================================
// SC LABS — Reusable Video Background
//
// Fondo reutilizable que monta un <video> autoplay loop en modo "full" y
// cae a un <img> poster estático en modo "light" (ver usePerformanceStore).
// Eliminar el video en light baja el uso de GPU idle a cero y ahorra
// ~5-15 MB de bandwidth por página en equipos modestos.
//
// Convención de posters: si no se pasa `poster` explícito, se deriva del
// nombre del video reemplazando la extensión por "-poster.webp". Ejemplos:
//   /videos/comparador.mp4  →  /videos/comparador-poster.webp
//   /videos/hangar.webm     →  /videos/hangar-poster.webp
//
// Si el poster no existe el <img> se rompe silencioso pero el fondo base
// (zinc-950 + overlay + gradients) sigue tapando todo, así que no es crítico
// que estén los 9 posters en la primera pasada.
//
// Usage:
//   <PageVideoBackground src="/videos/comparador.mp4" />
//   <PageVideoBackground src="/videos/dps.mp4" poster="/videos/dps-frame.webp" />
// =============================================================================

import { useRef, useEffect, useState } from "react";
import { useIsLight } from "@/store/usePerformanceStore";

interface PageVideoBackgroundProps {
  src?: string;
  /** Opcional. Si no se pasa, se deriva de `src` reemplazando la extensión. */
  poster?: string;
  opacity?: string;
  overlay?: string;
}

function derivePosterPath(src: string): string {
  // /videos/comparador.mp4 → /videos/comparador-poster.webp
  return src.replace(/\.(mp4|webm|mov)$/i, "-poster.webp");
}

export function PageVideoBackground({
  src = "/videos/comparador.mp4",
  poster,
  opacity = "0.20",
  overlay = "bg-zinc-950/50",
}: PageVideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isLight = useIsLight();

  // Evita hydration mismatch: el estado persistido sólo está en cliente.
  // En el primer render mostramos el video (estado "full" default) y hacemos
  // swap al poster apenas el mount cumple — imperceptible visualmente pero
  // necesario para que React no queje del mismatch de markup.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const effectiveLight = mounted && isLight;
  const posterUrl = poster ?? derivePosterPath(src);

  useEffect(() => {
    if (effectiveLight) return;
    const video = videoRef.current;
    if (video) {
      video.play().catch(() => {});
    }
  }, [effectiveLight]);

  return (
    <div className="fixed inset-0 z-0">
      {/* Dark base — siempre presente, tapa cualquier fallo de poster/video */}
      <div className="absolute inset-0 bg-zinc-950" />

      {/* Poster (light) o Video (full) */}
      {effectiveLight ? (
        <img
          src={posterUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: parseFloat(opacity) }}
          onError={(e) => {
            // Si el poster no existe todavía, ocultamos el <img> roto.
            // El fondo base + overlays siguen renderizando.
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: parseFloat(opacity) }}
        >
          <source src={src} type="video/mp4" />
        </video>
      )}

      {/* Dim overlay */}
      <div className={`absolute inset-0 ${overlay}`} />

      {/* Subtle ambient gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(69,91,163,0.05),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(143,197,134,0.03),transparent_50%)]" />
    </div>
  );
}
