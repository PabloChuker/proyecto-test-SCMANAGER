"use client";

import Header from "@/app/assets/header/Header";
import { HangarDashboard } from "@/components/hangar/HangarDashboard";

export default function HangarPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <video autoPlay loop muted playsInline className="fixed inset-0 w-full h-full object-cover opacity-15 pointer-events-none z-0">
        <source src="/media/videos/bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/80 to-zinc-950/95 pointer-events-none z-0" />
      <Header subtitle="Hangar Manager" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <HangarDashboard />
      </div>
    </main>
  );
}
