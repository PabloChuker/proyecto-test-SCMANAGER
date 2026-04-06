// =============================================================================
// SC LABS — /compare — Ship Comparator Page
// Compare up to 3 ships side-by-side with charts and detailed specs.
// =============================================================================

import { Suspense } from "react";
import Image from "next/image";
import { ShipComparator } from "@/components/compare/ShipComparator";
import Link from "next/link";
import Header from "@/app/assets/header/Header";
import { PageVideoBackground } from "@/components/shared/PageVideoBackground";

export const metadata = {
  title: "Ship Comparator — SC LABS",
  description: "Compare up to 3 Star Citizen ships side-by-side. Speed, acceleration, shields, hull, combat, dimensions, emissions, fuel, and 40+ metrics.",
};

export default function ComparePage() {
  return (
    <main className="relative min-h-screen text-zinc-100">
      <PageVideoBackground />

      <div className="relative z-10">
        <Header subtitle="Ship Comparator" />

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Suspense fallback={<CompareSkeleton />}>
            <ShipComparator />
          </Suspense>
        </div>
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
