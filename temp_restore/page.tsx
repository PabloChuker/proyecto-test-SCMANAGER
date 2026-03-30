// =============================================================================
// AL FILO — /ships/[id]/page.tsx (v2 — LoadoutBuilder)
//
// Cambios vs v1:
//   - Consume la nueva respuesta v2 de la API (con flatHardpoints)
//   - Reemplaza las secciones estáticas de stats + hardpoints por
//     el LoadoutBuilder interactivo
//   - Mantiene el panel de specs en sidebar
// =============================================================================

import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { ShipDetailResponseV2 } from "@/types/ships";
import { LoadoutBuilder } from "@/components/ships/LoadoutBuilder";
import { ShipSpecs } from "@/components/ships/ShipSpecs";

// ── Data Fetching ──

async function getShip(id: string): Promise<ShipDetailResponseV2 | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/ships/${encodeURIComponent(id)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Metadata ──

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const result = await getShip(id);
  if (!result) return { title: "Nave no encontrada — Al Filo" };

  const name = result.data.localizedName || result.data.name;
  return {
    title: `${name} — Al Filo Loadout Builder`,
    description: `Configurá el loadout de ${name}. DPS, escudos y balance de energía en tiempo real.`,
  };
}

// ── Page ──

export default async function ShipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getShip(id);
  if (!result) notFound();

  const { data: ship } = result;
  const shipInfo = ship.ship;
  const displayName = ship.localizedName || ship.name;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(6,182,212,0.05),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.03),transparent_60%)]" />
      </div>

      {/* Nav */}
      <header className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-14 gap-4">
            <Link
              href="/ships"
              className="flex items-center gap-2 text-zinc-500 hover:text-cyan-400 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Naves
            </Link>
            <div className="h-4 w-px bg-zinc-800" />
            <span className="text-sm text-zinc-300 truncate">{displayName}</span>
            <span className="ml-auto text-[10px] text-zinc-700 font-mono">
              v{ship.gameVersion}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        {/* ═══ HERO ═══ */}
        <section className="pt-8 pb-6 border-b border-zinc-800/30">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[10px] tracking-[0.2em] uppercase text-zinc-600 font-mono">
                  {ship.manufacturer || "Unknown"}
                </span>
                {shipInfo?.role && (
                  <>
                    <span className="text-zinc-800">·</span>
                    <span className="text-[10px] tracking-[0.15em] uppercase text-cyan-600/70">
                      {shipInfo.role}
                    </span>
                  </>
                )}
              </div>
              <h1 className="text-3xl sm:text-4xl font-extralight tracking-wide text-zinc-50">
                {displayName}
              </h1>
              {shipInfo?.focus && shipInfo.focus !== shipInfo.role && (
                <p className="text-sm text-zinc-500 mt-1">{shipInfo.focus}</p>
              )}
            </div>

            {/* Quick specs */}
            <div className="flex gap-4 text-center">
              {shipInfo?.maxCrew && (
                <QuickStat label="Crew" value={shipInfo.maxCrew.toString()} />
              )}
              {shipInfo?.cargo != null && shipInfo.cargo > 0 && (
                <QuickStat label="SCU" value={shipInfo.cargo.toString()} />
              )}
              {shipInfo?.maxSpeed && (
                <QuickStat label="SCM" value={`${Math.round(shipInfo.maxSpeed)}`} unit="m/s" />
              )}
            </div>
          </div>
        </section>

        {/* ═══ MAIN LAYOUT: Loadout (2/3) + Sidebar (1/3) ═══ */}
        <section className="py-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Loadout Builder — columna principal */}
            <div className="lg:col-span-3">
              <LoadoutBuilder shipData={result} />
            </div>

            {/* Sidebar — specs + info */}
            <div className="space-y-4">
              <div className="p-4 rounded-sm bg-zinc-900/30 border border-zinc-800/30">
                <ShipSpecs ship={ship as any} />
              </div>

              <div className="p-3 rounded-sm bg-zinc-900/20 border border-zinc-800/20">
                <div className="text-[10px] tracking-[0.15em] uppercase text-zinc-600 mb-2">
                  Info
                </div>
                <div className="space-y-1 text-[11px] text-zinc-500">
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Reference</span>
                    <span className="font-mono text-[10px] text-zinc-400 truncate max-w-[140px]">
                      {ship.reference}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Type</span>
                    <span>{ship.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Version</span>
                    <span className="font-mono">{ship.gameVersion}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function QuickStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <div className="text-[9px] tracking-[0.12em] uppercase text-zinc-600">{label}</div>
      <div className="text-sm font-mono text-zinc-300">
        {value}
        {unit && <span className="text-[10px] text-zinc-600 ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}
