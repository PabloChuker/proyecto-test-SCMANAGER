"use client";
// =============================================================================
// SC LABS — Reusable Video Background
// Client component to ensure autoplay works reliably across browsers.
// Usage: <PageVideoBackground src="/videos/comparador.mp4" />
// =============================================================================

import { useRef, useEffect } from "react";

interface PageVideoBackgroundProps {
  src?: string;
  opacity?: string;
  overlay?: string;
}

export function PageVideoBackground({
  src = "/videos/comparador.mp4",
  opacity = "0.20",
  overlay = "bg-zinc-950/50",
}: PageVideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.play().catch(() => {});
    }
  }, []);

  return (
    <div className="fixed inset-0 z-0">
      {/* Dark base */}
      <div className="absolute inset-0 bg-zinc-950" />

      {/* Video */}
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

      {/* Dim overlay */}
      <div className={`absolute inset-0 ${overlay}`} />

      {/* Subtle ambient gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(69,91,163,0.05),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(143,197,134,0.03),transparent_50%)]" />
    </div>
  );
}
