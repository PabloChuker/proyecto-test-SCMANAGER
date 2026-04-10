"use client";
// =============================================================================
// SC LABS — /streamers — Streamers Hub
//
// Landing para streamers/creadores de contenido. Acceso a:
//  • Generador de tarjetas de naves (para streams y videos)
//  • Descarga de logos SC Labs
//  • Info del programa de referrals
// =============================================================================

import Link from "next/link";
import Image from "next/image";
import Header from "@/app/assets/header/Header";

interface ToolCard {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
}

const TOOLS: ToolCard[] = [
  {
    href: "/streamers/cards",
    title: "Ship Info Cards",
    description:
      "Armá tarjetas de información horizontales y verticales de cualquier nave. Ideales para overlays de stream, miniaturas de YouTube y Reels. Con presets de color y exportación a PNG.",
    accent: "#f59e0b",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <path d="M6 15h4" />
      </svg>
    ),
  },
  {
    href: "/streamers/logos",
    title: "Logos & Branding",
    description:
      "Descargá los logos oficiales de SC Labs en varios formatos y colores para usar en tus videos, overlays, o material promocional.",
    accent: "#a855f7",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M3 21h18" />
      </svg>
    ),
  },
  {
    href: "/streamers/overlay",
    title: "OBS Overlay URL",
    description:
      "Pegá tu URL personalizada como Browser Source en OBS y la tarjeta se actualiza en vivo sin tener que re-exportar la imagen cada vez que cambies de nave.",
    accent: "#06b6d4",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <circle cx="12" cy="13" r="3" />
      </svg>
    ),
  },
  {
    href: "/streamers/referral",
    title: "Programa de Referral",
    description:
      "Enterate cómo funciona el sistema de referral: cada visita que llega por tu link queda registrada para darte visibilidad y futuros beneficios dentro de SC Labs.",
    accent: "#22c55e",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
  },
];

export default function StreamersHubPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-10 pointer-events-none z-0"
      >
        <source src="/media/videos/bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/85 to-zinc-950/95 pointer-events-none z-0" />

      <Header subtitle="Streamers" />

      <div className="relative z-10 max-w-5xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-14">
        {/* Hero */}
        <div className="mb-10 sm:mb-14">
          <div className="flex items-center gap-3 mb-3">
            <Image
              src="/sclabs-logo.png"
              alt="SC LABS"
              width={40}
              height={40}
              className="rounded-sm"
            />
            <div>
              <div className="text-[10px] tracking-[0.18em] uppercase text-amber-500/80 font-mono">
                SC Labs · Creator Toolkit
              </div>
              <h1 className="text-2xl sm:text-3xl font-light text-zinc-100 tracking-tight mt-1">
                Herramientas para Streamers
              </h1>
            </div>
          </div>
          <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
            Recursos visuales listos para usar en tus streams y videos sobre Star Citizen.
            Generá tarjetas de información de naves, descargá logos y conectá tu código de
            referral para llevar el seguimiento de tu comunidad.
          </p>
        </div>

        {/* Tools grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {TOOLS.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group relative border border-zinc-800/60 bg-zinc-900/40 rounded-md p-5 sm:p-6 hover:border-zinc-700 hover:bg-zinc-900/60 transition-all duration-200"
              style={
                {
                  ["--accent" as any]: tool.accent,
                } as React.CSSProperties
              }
            >
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 flex-shrink-0 rounded flex items-center justify-center border transition-colors"
                  style={{
                    borderColor: `${tool.accent}40`,
                    backgroundColor: `${tool.accent}10`,
                    color: tool.accent,
                  }}
                >
                  <div className="w-5 h-5">{tool.icon}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="text-sm sm:text-base font-medium text-zinc-100 tracking-tight">
                      {tool.title}
                    </h3>
                    <svg
                      className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed">{tool.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Footer note */}
        <p className="mt-10 text-[10px] text-zinc-600 font-mono tracking-wider text-center uppercase">
          ¿Querés sumarte como creador? Pedí tu código de referral en Discord.
        </p>
      </div>
    </main>
  );
}
