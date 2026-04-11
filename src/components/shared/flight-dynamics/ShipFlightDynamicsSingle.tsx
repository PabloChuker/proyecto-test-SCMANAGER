"use client";
// =============================================================================
// SC LABS — ShipFlightDynamicsSingle
//
// Contenedor para la página de loadout de una nave.
// Muestra 3 módulos en fila: pitch, yaw y roll.
//
// Props:
//   shipName  — nombre a mostrar en el header
//   pitchRate — velocidad de pitch en °/s (de la DB)
//   yawRate   — velocidad de yaw en °/s
//   rollRate  — velocidad de roll en °/s
//   shipColor — color hex para teñir la nave procedural (fallback)
//   glbUrl    — URL del modelo 3D real
//   className — clases extra para el div raíz
// =============================================================================

import { RotationModule } from "./RotationModule";

export interface ShipFlightDynamicsSingleProps {
  shipName?: string;
  pitchRate?: number | null;
  yawRate?:   number | null;
  rollRate?:  number | null;
  shipColor?: string;
  glbUrl?:    string | null;
  className?: string;
}

export function ShipFlightDynamicsSingle({
  shipName,
  pitchRate,
  yawRate,
  rollRate,
  shipColor,
  glbUrl,
  className = "",
}: ShipFlightDynamicsSingleProps) {
  return (
    <div className={className}>

      {/* Header de sección */}
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-500">
          Flight Dynamics
        </span>
        {shipName && (
          <span className="text-[9px] font-mono text-zinc-700 truncate">
            — {shipName}
          </span>
        )}
        <div className="flex-1 h-px bg-zinc-800/50" />
        <span className="text-[7px] font-mono text-zinc-700 tracking-widest">3D</span>
      </div>

      {/* 3 módulos en columnas iguales */}
      <div className="grid grid-cols-3 gap-3">
        <RotationModule axis="pitch" rate={pitchRate} shipColor={shipColor} glbUrl={glbUrl} />
        <RotationModule axis="yaw"   rate={yawRate}   shipColor={shipColor} glbUrl={glbUrl} />
        <RotationModule axis="roll"  rate={rollRate}  shipColor={shipColor} glbUrl={glbUrl} />
      </div>

    </div>
  );
}
