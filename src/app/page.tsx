"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

const PANELS = [
  {
    id: "loadout",
    labelKey: "loadout",
    video: "/videos/loadout_new.mp4",
    href: "/loadout",
  },
  {
    id: "compare",
    labelKey: "compare",
    video: "/videos/ships.mp4",
    href: "/compare",
  },
  {
    id: "mining",
    labelKey: "mining",
    video: "/videos/industria.mp4",
    href: "/mining",
  },
  {
    id: "crafting",
    labelKey: "hangar",
    video: "/videos/hangar.webm",
    href: "/hangar",
  },
] as const;

export default function Home() {
  const [phase, setPhase] = useState<"logo" | "reveal" | "ready">("logo");
  // Branding.1 (2026-05-02): mounted dispara el fade-in inicial — antes
  // el logo aparecía de golpe (transitionDuration: 0ms) y se sentía como
  // un "salto". Ahora arranca con opacity 0 + scale 0.6 + blur, y al
  // primer paint pasa a estado normal con una transición de 1800ms.
  const [mounted, setMounted] = useState(false);
  const [hoveredPanel, setHoveredPanel] = useState<string | null>(null);
  const router = useRouter();
  const t = useTranslations("Landing");

  useEffect(() => {
    // Trigger fade-in en el siguiente frame (importante: que sea después
    // del primer paint para que el browser haga la transición).
    const m = requestAnimationFrame(() => setMounted(true));
    // Hold logo grande: antes 2700ms, ahora 4500ms (+67% más tiempo).
    // Reveal complete: antes 3900ms, ahora 5700ms (mantiene 1200ms para
    // la transición center → top-left).
    const t1 = setTimeout(() => setPhase("reveal"), 4500);
    const t2 = setTimeout(() => setPhase("ready"), 5700);
    return () => {
      cancelAnimationFrame(m);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-white">
      {/* ── Background video ── */}
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

      {/* ── Logo animado ── */}
      <div
        className="fixed z-50 transition-all ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          ...(phase === "logo"
            ? {
                top: "50%",
                left: "50%",
                // Branding.1: entrada "desde las sombras" — antes de mounted
                // (primer paint) el logo está oculto y reducido; al activarse
                // mounted=true el browser anima opacity/scale/blur durante 1800ms.
                transform: mounted
                  ? "translate(-50%, -50%) scale(1)"
                  : "translate(-50%, -50%) scale(0.6)",
                opacity: mounted ? 1 : 0,
                filter: mounted ? "blur(0px)" : "blur(24px)",
                // Logo +50%: antes 420px, ahora 630px. Móvil: clamp a 90vw.
                width: "min(630px, 90vw)",
                height: "min(630px, 90vw)",
                transitionDuration: "1800ms",
                transitionProperty: "opacity, transform, filter",
              }
            : {
                top: "16px",
                left: "24px",
                transform: "translate(0, 0) scale(1)",
                opacity: 1,
                filter: "blur(0px)",
                width: "52px",
                height: "52px",
                transitionDuration: "1200ms",
              }),
        }}
      >
        <Image
          src="/sclabs-logo.png"
          alt="SC LABS"
          fill
          className="object-contain drop-shadow-[0_0_40px_rgba(232,137,12,0.35)]"
          priority
        />
      </div>

      {/* Glow detrás del logo centrado — escalado al nuevo tamaño del logo
          (+50%: antes 600px, ahora 900px) y sincronizado con el fade-in del
          mounted state para que aparezca junto con el logo. */}
      <div
        className="fixed z-40 pointer-events-none"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          // Móvil: clamp a 95vw/95vh para que no se desborde por los costados.
          width: "min(900px, 95vw)",
          height: "min(900px, 95vh)",
          background:
            "radial-gradient(circle, rgba(232,137,12,0.18) 0%, transparent 70%)",
          opacity: phase === "logo" && mounted ? 1 : 0,
          // Fade-in lento al inicio, fade-out rápido al retirarse.
          transition: phase === "logo"
            ? "opacity 1800ms ease-out"
            : "opacity 700ms ease-in",
        }}
      />

      {/* ── Contenido: 4 paneles ──
          Desktop: paneles verticales side-by-side (flex-row implícito).
          Móvil:   paneles apilados en columna (banda horizontal cada uno). */}
      <div
        className="relative z-10 h-full w-full flex flex-col md:flex-row transition-all duration-700 ease-out"
        style={{
          opacity: phase === "ready" ? 1 : 0,
        }}
      >
        {PANELS.map((panel) => {
          const isHovered = hoveredPanel === panel.id;
          const hasHover = hoveredPanel !== null;
          const isOther = hasHover && !isHovered;

          return (
            <div
              key={panel.id}
              // Móvil: cada panel ocupa 25vh (banda horizontal — los 4 paneles llenan el viewport).
              // Desktop: h-full + flex inline manda (idéntico al render anterior).
              className="relative h-[25vh] md:h-full cursor-pointer overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]"
              style={{
                flex: isHovered ? 2.5 : isOther ? 0.7 : 1,
              }}
              onMouseEnter={() => setHoveredPanel(panel.id)}
              onMouseLeave={() => setHoveredPanel(null)}
              onClick={() => {
                if (panel.href !== "#") router.push(panel.href);
              }}
            >
              {/* Video del panel */}
              <VideoPanel src={panel.video} isHovered={isHovered} />

              {/* Overlay gradiente */}
              <div
                className="absolute inset-0 transition-all duration-500"
                style={{
                  background: isHovered
                    ? "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 40%, transparent 100%)"
                    : "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.3) 100%)",
                }}
              />

              {/* Bordes verticales */}
              <div className="absolute top-0 bottom-0 left-0 w-px bg-white/[0.06]" />
              <div className="absolute top-0 bottom-0 right-0 w-px bg-white/[0.06]" />

              {/* Label */}
              <div className="absolute inset-0 flex items-end justify-center pb-16 px-4">
                <div
                  className="text-center transition-all duration-500"
                  style={{
                    transform: isHovered
                      ? "translateY(0)"
                      : "translateY(8px)",
                  }}
                >
                  <span
                    className="block text-xs tracking-[0.3em] uppercase transition-all duration-500"
                    style={{
                      color: isHovered
                        ? "rgba(232,137,12,0.9)"
                        : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {t(`panels.${panel.labelKey}`)}
                  </span>

                  {/* Línea decorativa */}
                  <div
                    className="mx-auto mt-3 h-px transition-all duration-500"
                    style={{
                      width: isHovered ? "60px" : "20px",
                      background: isHovered
                        ? "rgba(232,137,12,0.5)"
                        : "rgba(255,255,255,0.15)",
                    }}
                  />

                  {/* Enter hint */}
                  <span
                    className="block text-[10px] tracking-[0.2em] uppercase mt-3 transition-all duration-400"
                    style={{
                      opacity: isHovered ? 0.6 : 0,
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    {panel.href !== "#" ? t("clickToEnter") : t("comingSoon")}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Header minimalista (aparece con el contenido) ── */}
      <div
        className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-6 h-20 transition-all duration-700"
        style={{
          opacity: phase === "ready" ? 1 : 0,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)",
        }}
      >
        {/* Espacio para el logo fijo */}
        <div className="flex items-center gap-3 pl-14">
          <span className="text-[11px] font-medium tracking-[0.25em] uppercase text-white/50">
            SC Labs
          </span>
        </div>

        <span className="text-[10px] tracking-[0.2em] uppercase text-white/20">
          v4.0.2
        </span>
      </div>
    </main>
  );
}

/* ── Video panel component ── */
function VideoPanel({
  src,
  isHovered,
}: {
  src: string;
  isHovered: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (isHovered) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isHovered]);

  return (
    <video
      ref={videoRef}
      loop
      muted
      playsInline
      className="absolute inset-0 w-full h-full object-cover transition-all duration-500"
      style={{
        filter: isHovered
          ? "brightness(1) saturate(1.1)"
          : "brightness(0.3) saturate(0.5)",
        transform: isHovered ? "scale(1.05)" : "scale(1)",
      }}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
