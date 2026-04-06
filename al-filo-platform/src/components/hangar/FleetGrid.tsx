"use client";

import { HangarShipCard } from "./HangarShipCard";
import type { HangarShip } from "@/store/useHangarStore";

interface FleetGridProps {
  ships: HangarShip[];
}

export function FleetGrid({ ships }: FleetGridProps) {
  if (ships.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <p className="text-zinc-400 text-sm">No ships in your hangar</p>
          <p className="text-zinc-500 text-xs mt-1">Add a ship to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {ships.map((ship) => (
        <HangarShipCard key={ship.id} ship={ship} />
      ))}
    </div>
  );
}
