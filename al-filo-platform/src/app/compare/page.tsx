// =============================================================================
// SC LABS — /compare — Ship Comparator Page
// Compare up to 3 ships side-by-side with charts and detailed specs.
// =============================================================================

import { Suspense } from "react";
import Image from "next/image";
import { ShipComparator } from "@/components/compare/ShipComparator";
import Link from "next/link";
import Header from "@/app/assets/header/Header";

export const metadata = {
  title: "Ship Comparator — SC LABS",
  description: "Compare up to 3 Star Citizen ships side-by-side. Speed, acceleration, shields, hull, combat, dimensions, emissions, fuel, and 40+ metrics.",
};

export default function ComparePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Background video + gradient overlays */}
      <div className="fixed inset-0 -z-10">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-[0.08] pointer-events-none"
        >
          <source src="/videos/comparador.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-zinc-950/70" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(69,91,163,0.06),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(143,197,134,0.04),transparent_50%)]" />
      </div>

      <Header subtitle="Ship Comparator" />

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-light tracking-wide text-zinc-100">
            Ship Comparator
          </h1>
          <p className="text-sm text-zinc-500 mt-1.5 max-w-xl">
            Select up to 3 ships to compare side-by-side. Speed, propulsion, rotation,
            shields, hull, combat, dimensions, emissions, fuel, quantum, and 40+ specs.
          </p>
        </div>

        <Suspense fallback={<CompareSkeleton />}>
          <ShipComparator />
        </Suspense>
      </div>
    </main>
  );
}

function CompareSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 bg-zinc-900/40 rounded animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
        ))}
      </div>
      <div className="h-96 bg-zinc-900/20 rounded animate-pulse" />
    </div>
  );
}
