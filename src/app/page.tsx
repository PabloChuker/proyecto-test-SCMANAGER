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
  const [hoveredPanel, setHoveredPanel] = useState<string | null>(null);
  const router = useRouter();
  const t = useTranslations("Landing");

  useEffect(() => {
    // Branding.2 (2026-05-02): el logo estático fue reemplazado por el video
    // SCLABS_logo_intro.mp4. El video tiene su propia entrada "desde las
    // sombras" — ya no necesitamos el `mounted` state que hacía fade-in.
    //
    // Branding.3 (2026-05-03): video acelerado 2x → ahora dura ~4s en vez
    // de 8s (Pablo lo sentía largo). Timeouts re-sincronizados:
    //   t=0      → video empieza a reproducirse (autoPlay)
    //   t=4000   → video termina + phase pasa a "reveal" (logo grande hace
    //              fade-out, logo estático top-left hace fade-in)
    //   t=5200   → phase pasa a "ready" (los 4 paneles del landing aparecen)
    const t1 = setTimeout(() => setPhase("reveal"), 4000);
    const t2 = setTimeout(() => setPhase("ready"), 5200);
    return () => {
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

      {/* ── Logo intro animado (video) ──
          Branding.2 (2026-05-02): el video reemplaza al logo estático. Para
          mezclarse con el video de fondo (bg.mp4) usa:
            · mix-blend-mode: screen   → los píxeles negros del video se vuelven
                                          transparentes; solo se ve el logo +
                                          chispas + glow del propio video.
            · mask-image radial         → feather suave de los bordes en forma
                                          de elipse; sin "borde rectangular"
                                          visible al ojo.
          Cuando phase pasa a "reveal" (a los 8s, justo cuando el video termina)
          este container hace fade-out y el logo estático del top-left aparece. */}
      <div
        className="fixed z-50 pointer-events-none"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          // Container con aspect del video (16:9). Tamaño generoso para que
          // el logo se vea grande pero deje aire para el feather.
          width: "min(960px, 95vw)",
          aspectRatio: "16 / 9",
          opacity: phase === "logo" ? 1 : 0,
          // Fade-out de 1200ms cuando el video termina y entra phase=reveal.
          transition: "opacity 1200ms ease-out",
        }}
      >
        <video
          autoPlay
          muted
          playsInline
          // No loop: el video termina justo cuando phase cambia a "reveal".
          className="w-full h-full object-contain"
          style={{
            // Negro → transparente sobre el bg.mp4 que está debajo.
            mixBlendMode: "screen",
            // Branding.2b (2026-05-02): el screen blend dejaba pasar un velo
            // gris muy tenue por la compresión H.264 (los pixeles "casi negros"
            // no son #000 puros sino ~#080808). El contrast(1.35) aplasta esos
            // tonos bajos a negro real → se vuelven 100% transparentes; el
            // brightness(1.05) compensa para que el logo no pierda luz.
            filter: "contrast(1.35) brightness(1.05)",
            // Mask radial más estrecho (45%/55% en lugar de 60%/70%) para que
            // el feather empiece más cerca del logo y los bordes del video se
            // desvanezcan antes — elimina el rectángulo sutil del fondo.
            WebkitMaskImage:
              "radial-gradient(ellipse 45% 55% at center, black 40%, transparent 95%)",
            maskImage:
              "radial-gradient(ellipse 45% 55% at center, black 40%, transparent 95%)",
          }}
        >
          <source src="/videos/sclabs-logo-intro.mp4" type="video/mp4" />
        </video>
      </div>

      {/* ── Logo estático top-left ──
          Aparece con fade-in cuando phase != "logo" (después de los 8s del
          video). Es el logo definitivo que queda en la esquina mientras se
          navega por el sitio. */}
      <div
        className="fixed top-4 left-6 z-50 w-[52px] h-[52px] transition-opacity duration-700 ease-in-out"
        style={{ opacity: phase === "logo" ? 0 : 1 }}
      >
        <Image
          src="/sclabs-logo.png"
          alt="SC LABS"
          fill
          className="object-contain drop-shadow-[0_0_20px_rgba(232,137,12,0.4)]"
          priority
        />
      </div>

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
