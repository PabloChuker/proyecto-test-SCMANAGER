"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import LoadoutBuilder from "@/components/ships/LoadoutBuilder";

export default function DpsPage() {
  return (
    <main className="relative min-h-screen bg-zinc-950 text-zinc-100">
      {/* ── Background video ── */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="fixed inset-0 w-full h-full object-cover opacity-15 pointer-events-none z-0"
      >
        <source src="/videos/dps.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/80 to-zinc-950/95 pointer-events-none z-0" />

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-[1800px] mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <Image src="/sclabs-logo.png" alt="SC LABS" width={36} height={36} className="rounded-sm" />
                <span className="text-[11px] font-medium tracking-[0.2em] uppercase text-zinc-400">SC Labs</span>
              </Link>
              <div className="h-4 w-px bg-zinc-800" />
              <span className="text-[10px] tracking-[0.15em] uppercase text-amber-500/70 font-mono">
                DPS Calculator
              </span>
            </div>

            <nav className="hidden sm:flex items-center gap-5 text-[10px] tracking-[0.12em] uppercase text-zinc-600">
              <span className="text-amber-500 border-b border-amber-500/30 pb-0.5">DPS Calc</span>
              <Link href="/ships" className="hover:text-zinc-400 transition-colors">Ships</Link>
              <Link href="/compare" className="hover:text-zinc-400 transition-colors">Compare</Link>
            </nav>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="relative z-10 max-w-[1800px] mx-auto px-4 py-3">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <div className="w-4 h-4 border-2 border-zinc-800 border-t-amber-500 rounded-full animate-spin mr-3" />
              <span className="text-xs text-zinc-600 font-mono uppercase tracking-widest">
                Loading calculator...
              </span>
            </div>
          }
        >
          <LoadoutBuilder shipId="AEGS_Avenger_Titan" />
        </Suspense>
      </div>
    </main>
  );
}
