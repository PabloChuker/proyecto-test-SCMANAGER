"use client";
// =============================================================================
// SC LABS — Comparator Video Background
// Client component to ensure autoplay works reliably across browsers.
// =============================================================================

import { useRef, useEffect } from "react";

export function CompareVideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Force play on mount — some browsers block autoPlay attribute
    const video = videoRef.current;
    if (video) {
      video.play().catch(() => {
        // Silently fail if autoplay is blocked
      });
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
        className="absolute inset-0 w-full h-full object-cover opacity-[0.20] pointer-events-none"
      >
        <source src="/videos/comparador.mp4" type="video/mp4" />
      </video>

      {/* Dim overlay to keep text readable */}
      <div className="absolute inset-0 bg-zinc-950/50" />

      {/* Subtle color gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(69,91,163,0.06),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(143,197,134,0.04),transparent_50%)]" />
    </div>
  );
}
