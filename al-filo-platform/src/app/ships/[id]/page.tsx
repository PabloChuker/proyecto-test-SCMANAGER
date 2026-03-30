// =============================================================================
// AL FILO — /ships/[id]/page.tsx (v6)
// Server Component shell. Passes shipId to LoadoutBuilder (Client).
// LoadoutBuilder handles its own data fetching via Zustand loadShip().
// =============================================================================

import Link from "next/link";
import { LoadoutBuilder } from "@/components/ships/LoadoutBuilder";
import { ShipHero } from "@/components/ships/ShipHero";

export default async function ShipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(6,182,212,0.05),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.03),transparent_60%)]" />
      </div>
      <header className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-14 gap-4">
            <Link href="/ships" className="flex items-center gap-2 text-zinc-500 hover:text-cyan-400 transition-colors text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
              Ships
            </Link>
            <div className="h-4 w-px bg-zinc-800" />
            <span className="text-sm text-zinc-400">Loadout Builder</span>
          </div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <ShipHero shipId={id} />
        <section className="py-6">
          <LoadoutBuilder shipId={id} />
        </section>
      </div>
    </main>
  );
}
