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
  description: "Compare up to 3 Star Citizen ships side-by-side. Speed, DPS, shields, cargo, and 24+ metrics.",
};

export default function ComparePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(232,137,12,0.04),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(93,160,7,0.03),transparent_50%)]" />
      </div>

      <Header subtitle="Ship Comparator" />

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-light tracking-wide text-zinc-100">
            Ship Comparator
          </h1>
          <p className="text-sm text-zinc-500 mt-1.5 max-w-xl">
            Select up to 3 ships to compare side-by-side. View performance radar,
            combat stats, and 24+ detailed specifications.
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
