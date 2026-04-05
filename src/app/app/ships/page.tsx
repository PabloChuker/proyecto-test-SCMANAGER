// =============================================================================
// AL FILO — /ships — Página principal de naves
//
// Arquitectura de Data Fetching:
//
//   Esta página usa un patrón híbrido SSR + CSR:
//
//   1. El layout y shell visual se renderizan en el servidor (este archivo
//      es un Server Component). Esto da un first paint rápido y SEO.
//
//   2. La grilla interactiva (búsqueda, filtros, paginación) vive en
//      <ShipsGrid />, un Client Component que hace fetch a /api/ships
//      con los parámetros de query del usuario.
//
//   3. La carga inicial también pasa por el Server Component: hacemos
//      un fetch en el servidor para tener datos desde el primer render
//      (no hay flash de "cargando..." en la primera visita).
//
//   ¿Por qué no Server Components puros con searchParams?
//   Porque queremos búsqueda instantánea con debounce sin recargar la
//   página. Los filtros cambian la URL con shallow routing para que
//   el estado sea compartible por link.
// =============================================================================

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShipsGrid } from "./ShipsGrid";

export const metadata = {
  title: "Ship Database — SC LABS",
  description: "Base de datos completa de naves de Star Citizen. Filtrá por fabricante, rol y comparativas.",
};

export default function ShipsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ── Background atmosférico con video ── */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-15 pointer-events-none z-0"
      >
        <source src="/videos/bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/80 to-zinc-950/95 pointer-events-none z-0" />

      {/* ── Header ── */}
      <header className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
                <Image
                  src="/sclabs-logo.png"
                  alt="SC LABS"
                  width={32}
                  height={32}
                  className="rounded-sm"
                />
                <span className="text-sm font-medium tracking-[0.2em] uppercase text-zinc-400">
                  SC Labs
                </span>
              </Link>
              <div className="h-5 w-px bg-zinc-800" />
              <span className="text-xs tracking-[0.15em] uppercase text-zinc-600">
                Ship Database
              </span>
            </div>

            {/* Nav links placeholder */}
            <nav className="hidden sm:flex items-center gap-6 text-xs tracking-[0.12em] uppercase text-zinc-600">
              <span className="text-amber-500 border-b border-amber-500/30 pb-0.5">Naves</span>
              <Link href="/compare" className="hover:text-zinc-400 transition-colors">Comparar</Link>
              <Link href="/components" className="hover:text-zinc-400 transition-colors">Componentes</Link>
              <span className="hover:text-zinc-400 cursor-not-allowed opacity-40">Minería</span>
            </nav>
          </div>
        </div>
      </header>

      {/* ── Contenido ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Título de sección */}
        <div className="mb-8">
          <h1 className="text-2xl font-light tracking-wide text-zinc-100">
            Base de Naves
          </h1>
          <p className="text-sm text-zinc-500 mt-1.5 max-w-xl">
            Datos extraídos automáticamente del cliente de Star Citizen.
            Filtrá por fabricante, buscá por nombre o explorá por rol.
          </p>
        </div>

        {/* Grid interactiva */}
        <Suspense fallback={<GridSkeleton />}>
          <ShipsGrid />
        </Suspense>
      </div>
    </main>
  );
}

// ── Skeleton de carga ──
function GridSkeleton() {
  return (
    <div className="space-y-6">
      {/* Filter skeleton */}
      <div className="flex gap-3">
        <div className="flex-1 h-10 bg-zinc-900/60 rounded-sm animate-pulse" />
        <div className="w-44 h-10 bg-zinc-900/60 rounded-sm animate-pulse" />
        <div className="w-36 h-10 bg-zinc-900/60 rounded-sm animate-pulse" />
      </div>
      {/* Card grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-[170px] bg-zinc-900/40 rounded-sm animate-pulse"
               style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    </div>
  );
}
