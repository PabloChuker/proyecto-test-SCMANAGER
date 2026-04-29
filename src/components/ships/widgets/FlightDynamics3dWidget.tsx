// =============================================================================
// AL FILO — FlightDynamics3dWidget
// Self-contained: reads shipInfo from store, lazy-loads Three.js.
// Only re-renders when the active ship changes.
//
// Fase U.6 (2026-04-29): toggle BOOST. Por defecto los modelos 3D rotan a
// la pitch/yaw/roll-Rate "normal" (modo SCM). Click en el botoncito BOOST
// del header → cambia a boostedPitch/Yaw/Roll, replicando el incremento
// de velocidad con afterburner. Coincide con las gráficas SCM vs AFB de
// FlightDynamicsWidget de abajo.
//
// Fase U.6b (2026-04-29): el toggle se movió DEL contenido AL header del
// WidgetShell para liberar espacio dentro de la card. El botón es ahora
// un único toggle compacto: gris cuando OFF (modo SCM, default), amber
// cuando ON (modo BOOST). Click alterna.
// =============================================================================
"use client";

import { memo, useState } from "react";
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

// ── Boost toggle inyectado en el header del WidgetShell ─────────────────────
export function FlightDynamics3dHeaderActions({
  boost,
  setBoost,
  hasBoost,
}: {
  boost: boolean;
  setBoost: (b: boolean) => void;
  hasBoost: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => hasBoost && setBoost(!boost)}
      disabled={!hasBoost}
      className="text-[9px] font-mono font-bold tracking-[0.12em] uppercase border rounded-sm transition-colors px-2 py-0.5"
      style={
        !hasBoost
          ? { backgroundColor: "transparent", color: "#3f3f46", borderColor: "#1f1f23", cursor: "not-allowed" }
          : boost
            ? { backgroundColor: "#f59e0b20", color: "#f59e0b", borderColor: "#f59e0b60", cursor: "pointer" }
            : { backgroundColor: "transparent", color: "#52525b", borderColor: "#27272a", cursor: "pointer" }
      }
      title={
        !hasBoost
          ? "BOOST no disponible para esta nave (sin datos de rotación con afterburner)"
          : boost
            ? "Modo BOOST activo — click para volver a SCM"
            : "Modo SCM (rotación standard) — click para activar BOOST"
      }
    >
      Boost
    </button>
  );
}

// ── Body del widget — recibe el modo del wrapper (no maneja estado propio) ──
export const FlightDynamics3dContent = memo(function FlightDynamics3dContent({
  boost,
}: { boost: boolean }) {
  const shipInfo = useLoadoutStore(s => s.shipInfo);
  if (!shipInfo) return null;
  const si = shipInfo as any;

  const pitch = boost && si.boostedPitch != null ? si.boostedPitch : si.pitchRate;
  const yaw   = boost && si.boostedYaw   != null ? si.boostedYaw   : si.yawRate;
  const roll  = boost && si.boostedRoll  != null ? si.boostedRoll  : si.rollRate;

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-3">
      <ShipFlightDynamicsSingle
        shipName={shipInfo.localizedName || shipInfo.name}
        pitchRate={pitch}
        yawRate={yaw}
        rollRate={roll}
        glbUrl={shipGlbCandidates(shipInfo.reference)}
      />
    </div>
  );
});

// ── Hook para que el LoadoutBuilder comparta el estado boost entre header y body ──
export function useFlightDynamics3dBoost(): {
  boost: boolean;
  setBoost: (b: boolean) => void;
  hasBoost: boolean;
} {
  const shipInfo = useLoadoutStore(s => s.shipInfo);
  const [boost, setBoost] = useState(false);
  const si = shipInfo as any;
  const hasBoost = !!shipInfo && (
    (si?.boostedPitch != null && si.boostedPitch > 0) ||
    (si?.boostedYaw   != null && si.boostedYaw   > 0) ||
    (si?.boostedRoll  != null && si.boostedRoll  > 0)
  );
  return { boost: boost && hasBoost, setBoost, hasBoost };
}
