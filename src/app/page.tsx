"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

// Branding.4 (2026-05-04): Pablo simplificó el landing — fuera los 4 paneles
// (loadout / compare / mining / hangar). Ahora la home muestra el video de
// presentación a la MITAD del tiempo anterior (~2s en vez de ~4s) y al
// terminar redirige automáticamente al gestor de loadouts. Click en
// cualquier parte de la pantalla salta el video y entra directo.
//
// Destino por defecto: `/loadout`. Es el módulo más usado y la entrada
// natural al producto.
const DEFAULT_ROUTE = "/loadout";

// Multiplicador de velocidad del video. El asset SCLABS_logo_intro.mp4
// dura ~8s a 1x. En Branding.3 se aceleró a 2x (4s); ahora 4x (2s).
const VIDEO_PLAYBACK_RATE = 4;

export default function Home() {
  const [phase, setPhase] = useState<"logo" | "fadeout">("logo");
  const router = useRouter();
  const skippedRef = useRef(false);
  const logoVideoRef = useRef<HTMLVideoElement>(null);

  // Skip / autocompletar — siempre navega al gestor de loadouts. El ref
  // previene doble navegación cuando el video termina y el usuario también
  // hace click. Una vez disparado, ignora invocaciones posteriores.
  const enterApp = useCallback(() => {
    if (skippedRef.current) return;
    skippedRef.current = true;
    setPhase("fadeout");
    // Pequeño delay para que se vea el fade-out (250ms) antes del push.
    setTimeout(() => router.push(DEFAULT_ROUTE), 250);
  }, [router]);

  useEffect(() => {
    // Setear playbackRate cuando el video carga su metadata. No se puede
    // setear como atributo HTML — solo via JS.
    const v = logoVideoRef.current;
    if (v) {
      v.playbackRate = VIDEO_PLAYBACK_RATE;
    }

    // Fallback: si el video no dispara `onEnded` (cache, ad-block, etc),
    // a los 3.5s redirigimos igual. Aprox 1.5x del tiempo esperado del
    // video acelerado.
    const fallback = setTimeout(() => enterApp(), 3500);
    return () => clearTimeout(fallback);
  }, [enterApp]);

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-black text-white cursor-pointer"
      onClick={enterApp}
      // Accesibilidad: Enter/Espacio también disparan el skip para
      // teclado-only / lectores de pantalla.
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          enterApp();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Entrar a SC Labs"
    >
      {/* ── Background video (loop, decorativo) ── */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
      >
        <source src="/videos/bg.mp4" type="video/mp4" />
      </video>

      {/* Overlay oscuro sobre el video */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* ── Logo intro animado (video, ~2s con playbackRate=4) ──
          Branding.4: cuando termina el video o el usuario clickea, navegamos
          al gestor de loadouts. Mantiene el mix-blend-screen + mask radial
          para fundirse con el bg.mp4 (ver Branding.2 para detalles del feather). */}
      <div
        className="fixed z-50 pointer-events-none"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(960px, 95vw)",
          aspectRatio: "16 / 9",
          opacity: phase === "logo" ? 1 : 0,
          transition: "opacity 250ms ease-out",
        }}
      >
        <video
          ref={logoVideoRef}
          autoPlay
          muted
          playsInline
          // No loop: el video termina y disparamos el redirect via onEnded.
          onEnded={enterApp}
          className="w-full h-full object-contain"
          style={{
            mixBlendMode: "screen",
            filter: "contrast(1.35) brightness(1.05)",
            WebkitMaskImage:
              "radial-gradient(ellipse 45% 55% at center, black 40%, transparent 95%)",
            maskImage:
              "radial-gradient(ellipse 45% 55% at center, black 40%, transparent 95%)",
          }}
        >
          <source src="/videos/sclabs-logo-intro.mp4" type="video/mp4" />
        </video>
      </div>

      {/* ── Logo estático top-left (oculto durante el intro) ── */}
      <div className="fixed top-4 left-6 z-30 w-[52px] h-[52px] opacity-0">
        <Image
          src="/sclabs-logo.png"
          alt="SC LABS"
          fill
          className="object-contain"
          priority
        />
      </div>

      {/* ── Hint sutil de "click to skip" ──
          Aparece tras 800ms para no spamear de información en el primer
          frame. Pulsa con animate-pulse para sugerir interactividad. */}
      <div
        className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 text-white/30 text-[10px] tracking-[0.3em] uppercase pointer-events-none"
        style={{
          opacity: phase === "logo" ? 1 : 0,
          transition: "opacity 400ms ease-out",
          animation: "pulse 2s ease-in-out infinite",
        }}
      >
        click para entrar
      </div>
    </main>
  );
}
