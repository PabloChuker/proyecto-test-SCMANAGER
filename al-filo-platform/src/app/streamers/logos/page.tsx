"use client";
// =============================================================================
// SC LABS — /streamers/logos — Logo downloads
//
// Página de descarga de los logos de SC Labs para creadores de contenido.
// Muestra los assets sobre distintos fondos para que puedan elegir el que
// mejor contraste en sus overlays.
// =============================================================================

import Link from "next/link";
import Image from "next/image";
import Header from "@/app/assets/header/Header";

interface LogoAsset {
  filename: string;
  href: string;
  label: string;
  description: string;
  size: string;
  /** Fondo sobre el que se muestra el preview */
  preview: "dark" | "light" | "pink";
}

const ASSETS: LogoAsset[] = [
  {
    filename: "sclabs-logo.png",
    href: "/sclabs-logo.png",
    label: "Logo principal · PNG",
    description:
      "Logo oficial SC Labs en fondo transparente. Recomendado para overlays, thumbnails y branding general.",
    size: "512 × 512",
    preview: "dark",
  },
  {
    filename: "icon-512.png",
    href: "/icon-512.png",
    label: "Icon 512 · PNG",
    description: "Versión de alto contraste, útil como favicon de stream o avatar.",
    size: "512 × 512",
    preview: "dark",
  },
  {
    filename: "icon-192.png",
    href: "/icon-192.png",
    label: "Icon 192 · PNG",
    description: "Formato compacto para barras inferiores de stream.",
    size: "192 × 192",
    preview: "light",
  },
  {
    filename: "apple-touch-icon.png",
    href: "/apple-touch-icon.png",
    label: "Apple Touch Icon",
    description: "Versión cuadrada para uso en dispositivos iOS / Android.",
    size: "180 × 180",
    preview: "pink",
  },
];

function PreviewBg({
  preview,
  children,
}: {
  preview: LogoAsset["preview"];
  children: React.ReactNode;
}) {
  const bg =
    preview === "dark"
      ? "bg-zinc-950"
      : preview === "light"
      ? "bg-zinc-100"
      : "bg-pink-900/40";
  return (
    <div
      className={`${bg} border border-zinc-800/60 rounded flex items-center justify-center p-6`}
      style={{ minHeight: 180 }}
    >
      {children}
    </div>
  );
}

export default function StreamerLogosPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
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

      <Header subtitle="Streamers · Logos" />

      <div className="relative z-10 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">
        <div className="mb-6 flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase text-zinc-600">
          <Link href="/streamers" className="hover:text-zinc-400 transition-colors">
            ← Streamers
          </Link>
          <span className="text-zinc-800">/</span>
          <span className="text-amber-500">Logos</span>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-light text-zinc-100 tracking-tight">
            Logos & Branding
          </h1>
          <p className="text-xs text-zinc-500 mt-2 max-w-2xl leading-relaxed">
            Descargá los logos de SC Labs para usar en tus videos, overlays y material
            promocional. Todos los assets están en PNG con transparencia.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {ASSETS.map((asset) => (
            <div
              key={asset.filename}
              className="border border-zinc-800/60 bg-zinc-900/40 rounded overflow-hidden flex flex-col"
            >
              <PreviewBg preview={asset.preview}>
                <Image
                  src={asset.href}
                  alt={asset.label}
                  width={120}
                  height={120}
                  className="object-contain"
                  unoptimized
                />
              </PreviewBg>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h3 className="text-sm text-zinc-100 font-medium">
                    {asset.label}
                  </h3>
                  <span className="text-[9px] font-mono text-zinc-600 tracking-wider uppercase whitespace-nowrap">
                    {asset.size}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed mb-3 flex-1">
                  {asset.description}
                </p>
                <a
                  href={asset.href}
                  download={asset.filename}
                  className="inline-flex items-center justify-center gap-2 py-2 text-[10px] tracking-widest uppercase font-mono rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Descargar
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 border border-zinc-800/40 bg-zinc-900/30 rounded p-4">
          <div className="text-[10px] tracking-widest uppercase font-mono text-amber-500 mb-2">
            Uso permitido
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Podés usar los logos libremente en tus streams y videos sobre Star Citizen
            mientras menciones SC Labs como fuente. No modificarlos en cuanto a colores
            principales y proporciones. Si necesitás versiones vectoriales (SVG / AI)
            pedilas en el Discord de SC Labs.
          </p>
        </div>
      </div>
    </main>
  );
}
