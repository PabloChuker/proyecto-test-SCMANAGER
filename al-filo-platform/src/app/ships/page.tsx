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
import Header from "@/app/assets/header/Header";
import { PageVideoBackground } from "@/components/shared/PageVideoBackground";

export const metadata = {
  title: "Ship Database — SC LABS",
  description: "Base de datos completa de naves de Star Citizen. Filtrá por fabricante, rol y comparativas.",
};

export default function ShipsPage() {
  return (
    <main className="relative min-h-screen text-zinc-100">
      <PageVideoBackground src="/videos/comparador.mp4" />

      <div className="relative z-10">
        <Header subtitle="Ship Database" />

        {/* ── Contenido ── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Grid interactiva */}
          <Suspense fallback={<GridSkeleton />}>
            <ShipsGrid />
          </Suspense>
        </div>
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
