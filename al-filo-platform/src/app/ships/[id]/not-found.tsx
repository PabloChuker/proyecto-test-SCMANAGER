// =============================================================================
// AL FILO — /ships/[id]/not-found.tsx
// 404 personalizado cuando no se encuentra una nave.
// =============================================================================

import Link from "next/link";

export default function ShipNotFound() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
      <div className="text-center px-4">
        <div className="text-6xl mb-6 opacity-15">🚀</div>

        <h1 className="text-xl font-light tracking-wide text-zinc-300 mb-2">
          Nave no encontrada
        </h1>
        <p className="text-sm text-zinc-600 mb-8 max-w-sm mx-auto">
          El identificador proporcionado no coincide con ninguna nave en
          nuestra base de datos. Puede que haya sido removida o que el
          ID sea incorrecto.
        </p>

        <Link
          href="/ships"
          className="
            inline-flex items-center gap-2
            px-4 py-2.5 rounded-sm
            border border-zinc-800 bg-zinc-900/50
            text-sm text-zinc-400
            hover:border-cyan-500/30 hover:text-cyan-300
            transition-all duration-200
          "
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Volver a la base de naves
        </Link>
      </div>
    </main>
  );
}
