// =============================================================================
// AL FILO — FlightDynamics3dWidget
// Self-contained: reads shipInfo from store, lazy-loads Three.js.
// Only re-renders when the active ship changes.
// =============================================================================
"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import { shipGlbCandidates } from "@/lib/shipGlb";

const ShipFlightDynamicsSingle = dynamic(
  () => import("@/components/shared/flight-dynamics").then(m => ({ default: m.ShipFlightDynamicsSingle })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="w-3 h-3 border-2 border-zinc-800 border-t-yellow-500 rounded-full animate-spin" />
      </div>
    ),
  },
);

// ── Store-connected export ────────────────────────────────────────────────────
export const FlightDynamics3dContent = memo(function FlightDynamics3dContent() {
  const shipInfo = useLoadoutStore(s => s.shipInfo);
  if (!shipInfo) return null;
  const si = shipInfo as any;
  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-3">
      <ShipFlightDynamicsSingle
        shipName={shipInfo.localizedName || shipInfo.name}
        pitchRate={si.pitchRate}
        yawRate={si.yawRate}
        rollRate={si.rollRate}
        glbUrl={shipGlbCandidates(shipInfo.reference)}
      />
    </div>
  );
});
