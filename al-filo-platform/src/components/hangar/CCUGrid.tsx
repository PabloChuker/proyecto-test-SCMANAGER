"use client";

import { CCUCard } from "./CCUCard";
import type { HangarCCU } from "@/store/useHangarStore";

interface CCUGridProps {
  ccus: HangarCCU[];
}

export function CCUGrid({ ccus }: CCUGridProps) {
  if (ccus.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <p className="text-zinc-400 text-sm">No CCUs in your inventory</p>
          <p className="text-zinc-500 text-xs mt-1">Add a CCU to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {ccus.map((ccu) => (
        <CCUCard key={ccu.id} ccu={ccu} />
      ))}
    </div>
  );
}
