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
  glbUrl?:    string | string[] | null;
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

      {/* 3 módulos en columnas iguales */}
      <div className="grid grid-cols-3 gap-3">
        <RotationModule axis="pitch" rate={pitchRate} shipColor={shipColor} glbUrl={glbUrl} />
        <RotationModule axis="yaw"   rate={yawRate}   shipColor={shipColor} glbUrl={glbUrl} />
        <RotationModule axis="roll"  rate={rollRate}  shipColor={shipColor} glbUrl={glbUrl} />
      </div>

    </div>
  );
}
