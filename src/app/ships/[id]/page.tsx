"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import Header from "@/app/assets/header/Header";
import ShipSpecSheet from "@/components/ships/ShipSpecSheet";
import { PageVideoBackground } from "@/components/shared/PageVideoBackground";
import { useTranslations } from "next-intl";
function ShipDetailContent() {
  const params = useParams();
  const id = params.id as string;
  const t = useTranslations("PageTitles");

  // Quick access: add ship when loaded via the global function exposed by ShipQuickAccess (in layout)
  const handleShipLoaded = useCallback((name: string, reference: string, manufacturer: string | null) => {
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
      addFn({ reference, name, manufacturer, thumbUrl: `/ships/${slug}.webp` });
    }
  }, []);

  return (
    <main className="relative min-h-screen text-zinc-100">
      <PageVideoBackground src="/videos/comparador.mp4" />

      <div className="relative z-10">
        <Header subtitle={t("ships")} />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          {/* Navigation */}
          <div className="flex items-center gap-4 py-4 border-b border-zinc-800/50 mb-6">
            <Link
              href="/ships"
              className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-cyan-400 transition-colors"
            >
              ← Naves
            </Link>
          </div>

          {/* Ship Spec Sheet */}
          <ShipSpecSheet shipId={id} onShipLoaded={handleShipLoaded} />
        </div>
      </div>
    </main>
  );
}

export default function ShipDetailPage() {
  return (
    <Suspense fallback={
      <main className="relative min-h-screen text-zinc-100">
        <PageVideoBackground src="/videos/comparador.mp4" />
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <div className="text-xs font-mono text-zinc-600 animate-pulse uppercase tracking-widest">
            Loading Ship Data...
          </div>
        </div>
      </main>
    }>
      <ShipDetailContent />
    </Suspense>
  );
}
