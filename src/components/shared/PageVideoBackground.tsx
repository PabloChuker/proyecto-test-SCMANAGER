"use client";
// =============================================================================
// SC LABS — Reusable Page Background
//
// Fondo reutilizable. En modo "light" (el DEFAULT desde 2026-11-14) es un
// fondo oscuro estático: no se pide ningún video ni imagen. En modo "full"
// (lo activa el usuario con el toggle del header) monta el <video> en loop.
//
// `poster` es opcional: si se pasa una imagen explícita, se muestra en modo
// light. Antes se derivaba un "-poster.webp" del nombre del video, pero esos
// archivos nunca existieron y cada página pedía un 404 de más.
//
// Usage:
//   <PageVideoBackground src="/videos/comparador.mp4" />
//   <PageVideoBackground src="/videos/dps.mp4" poster="/videos/dps-frame.webp" />
// =============================================================================

import { BgVideo } from "@/components/shared/BgVideo";
import { useShowBackgroundVideo } from "@/store/usePerformanceStore";

interface PageVideoBackgroundProps {
  src?: string;
  /** Opcional. Imagen estática para el modo light. */
  poster?: string;
  opacity?: string;
  overlay?: string;
}

export function PageVideoBackground({
  src = "/videos/comparador.mp4",
  poster,
  opacity = "0.20",
  overlay = "bg-zinc-950/50",
}: PageVideoBackgroundProps) {
  const showVideo = useShowBackgroundVideo();

  return (
    <div className="fixed inset-0 z-0">
      {/* Dark base — siempre presente */}
      <div className="absolute inset-0 bg-zinc-950" />

      {/* Video solo en modo full; poster solo si se pasó explícito */}
      {showVideo ? (
        <div className="absolute inset-0" style={{ opacity: parseFloat(opacity) }}>
          <BgVideo
            src={src}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        </div>
      ) : poster ? (
        <img
          src={poster}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: parseFloat(opacity) }}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : null}

      {/* Dim overlay */}
      <div className={`absolute inset-0 ${overlay}`} />

      {/* Subtle ambient gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(69,91,163,0.05),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(143,197,134,0.03),transparent_50%)]" />
    </div>
  );
}
