"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import Header from "@/app/assets/header/Header";
import ShipSpecSheet from "@/components/ships/ShipSpecSheet";
import ShipQuickAccess from "@/components/ships/ShipQuickAccess";
import LoadoutBuilder from "@/components/ships/LoadoutBuilder";
import { ShipHero } from "@/components/ships/ShipHero";

function ShipDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const view = searchParams.get("view");
  const [activeView, setActiveView] = useState<"spec" | "loadout">(view === "loadout" ? "loadout" : "spec");

  // Quick access: add ship when loaded
  const handleShipLoaded = useCallback((name: string, reference: string, manufacturer: string | null) => {
    // Use the global function exposed by ShipQuickAccess
    const addFn = (window as unknown as Record<string, unknown>).__shipQuickAccessAdd as
      ((ship: { reference: string; name: string; manufacturer: string | null; thumbUrl: string }) => void) | undefined;
    if (addFn) {
      const MFR_PREFIXES = [
        "Aegis", "RSI", "Drake", "MISC", "Anvil", "Origin", "Crusader", "Argo",
        "Aopoa", "Consolidated Outland", "Esperia", "Gatac", "Greycat", "Kruger",
        "Musashi Industrial", "Tumbril", "Banu", "Vanduul", "Roberts Space Industries",
        "Crusader Industries", "Musashi", "CO",
      ];
      let n = name;
      if (manufacturer) {
        const m = manufacturer.trim();
        if (n.startsWith(m + " ")) n = n.slice(m.length + 1);
      }
      for (const m of MFR_PREFIXES) {
        if (n.startsWith(m + " ")) { n = n.slice(m.length + 1); break; }
      }
      const slug = n.toLowerCase().replace(/[''()]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/-$/, "");
      addFn({ reference, name, manufacturer, thumbUrl: `/ships/${slug}.jpg` });
    }
  }, []);

  return (
    <>
      <ShipQuickAccess currentShipRef={id} />

      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(6,182,212,0.05),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.03),transparent_60%)]" />
        </div>

        <Header subtitle="Ship Database" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          {/* Navigation bar */}
          <div className="flex items-center gap-4 py-4 border-b border-zinc-800/50 mb-6">
            <Link
              href="/ships"
              className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-cyan-400 transition-colors"
            >
              ← Naves
            </Link>
            <div className="flex-1" />
            <div className="flex items-center bg-zinc-900/60 rounded border border-zinc-800/50 p-0.5">
              <button
                onClick={() => setActiveView("spec")}
                className={`px-4 py-1.5 text-xs rounded transition-all ${
                  activeView === "spec"
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                    : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                }`}
              >
                📋 Ficha Tecnica
              </button>
              <button
                onClick={() => setActiveView("loadout")}
                className={`px-4 py-1.5 text-xs rounded transition-all ${
                  activeView === "loadout"
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                    : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                }`}
              >
                ⚙ DPS Calculator
              </button>
            </div>
          </div>

          {/* Content */}
          {activeView === "spec" ? (
            <ShipSpecSheet shipId={id} onShipLoaded={handleShipLoaded} />
          ) : (
            <>
              <ShipHero shipId={id} />
              <section className="py-6">
                <Suspense fallback={
                  <div className="text-xs font-mono text-zinc-600 animate-pulse uppercase tracking-widest py-20 text-center">
                    Inizializing Neural Link...
                  </div>
                }>
                  <LoadoutBuilder shipId={id} />
                </Suspense>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}

export default function ShipDetailPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-xs font-mono text-zinc-600 animate-pulse uppercase tracking-widest">
          Loading Ship Data...
        </div>
      </main>
    }>
      <ShipDetailContent />
    </Suspense>
  );
}
