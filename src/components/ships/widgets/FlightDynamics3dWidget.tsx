// =============================================================================
// AL FILO — FlightDynamics3dWidget
// Self-contained: reads shipInfo from store, lazy-loads Three.js.
// Only re-renders when the active ship changes.
//
// Fase U.6 (2026-04-29): toggle SCM / BOOST. Por defecto los modelos 3D
// rotan a la pitch/yaw/roll-Rate "normal" (modo SCM). Al hacer click en
// BOOST se cambian a boostedPitch/Yaw/Roll, replicando el incremento de
// velocidad de rotación con afterburner. Coincide con las gráficas de
// abajo (FlightDynamicsWidget) que también muestran SCM vs AFB.
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

type RotMode = "SCM" | "BOOST";

// ── Store-connected export ────────────────────────────────────────────────────
export const FlightDynamics3dContent = memo(function FlightDynamics3dContent() {
  const shipInfo = useLoadoutStore(s => s.shipInfo);
  const [mode, setMode] = useState<RotMode>("SCM");
  if (!shipInfo) return null;
  const si = shipInfo as any;

  // Si la nave no tiene boostedXxx, dehabilitamos el botón BOOST para no
  // confundir al user (no hay data → no hay diferencia visible).
  const hasBoost =
    (si.boostedPitch != null && si.boostedPitch > 0) ||
    (si.boostedYaw   != null && si.boostedYaw   > 0) ||
    (si.boostedRoll  != null && si.boostedRoll  > 0);

  const pitch = mode === "BOOST" && si.boostedPitch != null ? si.boostedPitch : si.pitchRate;
  const yaw   = mode === "BOOST" && si.boostedYaw   != null ? si.boostedYaw   : si.yawRate;
  const roll  = mode === "BOOST" && si.boostedRoll  != null ? si.boostedRoll  : si.rollRate;

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-3">
      {/* Toggle SCM / BOOST — match al toggle del power grid: dos botones
          segmentados, amber el activo, gris transparente el inactivo. */}
      <div className="flex gap-1 mb-2">
        <ModeBtn label="SCM" active={mode === "SCM"} onClick={() => setMode("SCM")} />
        <ModeBtn
          label="BOOST"
          active={mode === "BOOST"}
          disabled={!hasBoost}
          onClick={() => hasBoost && setMode("BOOST")}
        />
      </div>

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

function ModeBtn({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1 py-1.5 text-[9px] font-mono font-bold tracking-[0.1em] uppercase text-center border rounded-sm transition-colors"
      style={
        disabled
          ? { backgroundColor: "transparent", color: "#3f3f46", borderColor: "#1f1f23", cursor: "not-allowed" }
          : active
            ? { backgroundColor: "#f59e0b20", color: "#f59e0b", borderColor: "#f59e0b60" }
            : { backgroundColor: "transparent", color: "#52525b", borderColor: "#27272a", cursor: "pointer" }
      }
      title={
        disabled
          ? `${label} no disponible para esta nave (sin datos de rotación con afterburner)`
          : label === "BOOST"
            ? "Rotación con afterburner — usa boostedPitch/Yaw/Roll"
            : "Rotación SCM — pitch/yaw/roll standard"
      }
    >
      {label}
    </button>
  );
}
