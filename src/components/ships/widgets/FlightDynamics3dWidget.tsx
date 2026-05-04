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
      className="text-[11px] font-mono font-bold tracking-[0.12em] uppercase border rounded-sm transition-colors px-2 py-0.5"
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
//
// Fase W.9 (2026-05-02): rotación interpolada por pips reales de thrusters
// según VerseTools §8.1:
//
//     ThrusterMult = (currentPips - 1) / (maxPips - 1)   (clamp 0..1)
//     Rate = Base + ThrusterMult × (Boosted - Base)
//
// Branding/Loadout fix (2026-05-03, Pablo): la fórmula sigue intacta, pero
// ahora SOLO aplica cuando boost está ON.
//   · SCM  (boost OFF): mult = 0   → Rate = Base SIEMPRE.
//                                    Las rotaciones son estables; los pips de
//                                    motores no afectan el cabeceo en vuelo
//                                    normal de combate.
//   · BOOST (boost ON):  mult = computedMult (pips reales)
//                                    Rate interpola entre Base (pips=1) y
//                                    Boosted (pips=max). Más energía a
//                                    motores = más cerca del extremo boosted.
function interpolateRate(
  base: number | null | undefined,
  boosted: number | null | undefined,
  mult: number,
): number | null {
  if (base == null || base <= 0) return null;
  if (boosted == null || boosted <= 0) return base;
  return base + Math.max(0, Math.min(1, mult)) * (boosted - base);
}

export const FlightDynamics3dContent = memo(function FlightDynamics3dContent({
  boost,
}: { boost: boolean }) {
  const shipInfo = useLoadoutStore(s => s.shipInfo);
  // Fase W.11 (2026-05-02): suscribir a PRIMITIVOS en vez de un objeto.
  // El selector original devolvía `{ allocated, total }` que es una nueva
  // referencia en cada llamada → zustand detecta cambio → re-render infinito
  // → "This page couldn't load" en /loadout. Dos selectors primitivos
  // separados son comparados por `===` y solo retriggean cuando el valor
  // numérico real cambia.
  const thrPips = useLoadoutStore(s =>
    s.getStats().powerNetwork.instances.find(i => i.category === "thrusters")?.allocatedPips ?? 0
  );
  const thrMaxPips = useLoadoutStore(s =>
    s.getStats().powerNetwork.instances.find(i => i.category === "thrusters")?.totalPips ?? 0
  );
  if (!shipInfo) return null;
  const si = shipInfo as any;
  // VerseTools define ThrusterMult con (pips - 1) / (maxPips - 1). Cuando
  // maxPips ≤ 1 (no hay slider real) el multiplier queda 1 (full).
  const computedMult = thrMaxPips > 1
    ? Math.max(0, Math.min(1, (thrPips - 1) / (thrMaxPips - 1)))
    : 1;
  // SCM: rotación = base (pips no afectan). BOOST: interpola por pips reales.
  // El toggle activa la mecánica de "los motores aceleran las rotaciones",
  // que no debería notarse en vuelo de combate normal.
  const mult = boost ? computedMult : 0;

  const pitch = interpolateRate(si.pitchRate, si.boostedPitch, mult);
  const yaw   = interpolateRate(si.yawRate,   si.boostedYaw,   mult);
  const roll  = interpolateRate(si.rollRate,  si.boostedRoll,  mult);

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
