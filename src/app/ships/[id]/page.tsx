import { Suspense } from 'react';
import Link from 'next/link';
import LoadoutBuilder from '@/components/ships/LoadoutBuilder';
import { ShipHero } from '@/components/ships/ShipHero';
import Header from "@/app/assets/header/Header";

export default async function ShipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(6,182,212,0.05),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.03),transparent_60%)]" />
      </div>
      <Header subtitle="Loadout Builder" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <ShipHero shipId={id} />
        <section className="py-6">
          <Suspense fallback={<div className="text-xs font-mono text-zinc-600 animate-pulse uppercase tracking-widest py-20 text-center">Inizializing Neural Link...</div>}>
            <LoadoutBuilder shipId={id} />
          </Suspense>
        </section>
      </div>
    </main>
  );
}