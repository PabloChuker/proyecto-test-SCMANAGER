"use client";
// =============================================================================
// SC LABS — BgVideo
//
// <video> decorativo de fondo que SOLO se monta en modo "full" (ver
// usePerformanceStore). En modo "light" — el default — no renderiza nada, así
// el navegador no descarga el .mp4/.webm.
//
// Reemplaza a los <video autoPlay loop muted playsInline> sueltos que había en
// cada página: mismas clases, mismo src, pero respetando el modo.
//
// Usage:
//   <BgVideo src="/videos/mineria.mp4"
//            className="fixed inset-0 w-full h-full object-cover opacity-15 pointer-events-none z-0" />
// =============================================================================

import { useEffect, useRef } from "react";
import { useShowBackgroundVideo } from "@/store/usePerformanceStore";

interface BgVideoProps {
  src: string;
  className?: string;
}

function mimeFor(src: string): string {
  return /\.webm$/i.test(src) ? "video/webm" : "video/mp4";
}

export function BgVideo({ src, className }: BgVideoProps) {
  const show = useShowBackgroundVideo();
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!show) return;
    // Algunos navegadores ignoran el atributo autoPlay: forzamos play().
    ref.current?.play().catch(() => {});
  }, [show]);

  if (!show) return null;

  return (
    <video ref={ref} autoPlay loop muted playsInline className={className}>
      <source src={src} type={mimeFor(src)} />
    </video>
  );
}
