"use client";
// =============================================================================
// SC LABS — RotationModule
//
// Módulo de un solo eje: header con label y rate, visor 3D animado,
// badge con el nombre del eje Three.js, descripción opcional.
//
// Props:
//   axis     — "pitch" | "yaw" | "roll"
//   rate     — velocidad en °/s (de la DB), opcional
//   shipColor — hex string para teñir la nave procedural (fallback)
//   glbUrl    — URL del modelo 3D real (opcional)
//   compact  — true → canvas más chico (para comparador), false → full
// =============================================================================

import { ShipViewer3D } from "./ShipViewer3D";
import type { RotationAxis } from "./ShipViewer3D";

type AxisKey = Exclude<RotationAxis, "free">;

interface AxisMeta {
  label: string;
  color: string;          // CSS hex color
  dimLabel: string;       // Three.js dimension label
  description: string;    // descripción visual del movimiento
}

const AXIS_META: Record<AxisKey, AxisMeta> = {
  pitch: {
    label:       "PITCH",
    color:       "#ef4444",
    dimLabel:    "rot X",
    description: "Nariz sube / baja",
  },
  yaw: {
    label:       "YAW",
    color:       "#22c55e",
    dimLabel:    "rot Y",
    description: "Nariz gira izq / der",
  },
  roll: {
    label:       "ROLL",
    color:       "#3b82f6",
    dimLabel:    "rot Z",
    description: "Alas se inclinan",
  },
};

export interface RotationModuleProps {
  axis: AxisKey;
  rate?: number | null;
  shipColor?: string;
  glbUrl?: string | null;
  compact?: boolean;
}

// Conversión °/s → rad/s. La rotación visual usa el dato real de la nave.
// Aplicamos un factor de 0.5 para que un ship tipo Gladius con roll 190°/s
// (~3.3 rad/s = una revolución cada ~1.9s) siga siendo legible sin marear.
const DEG2RAD = Math.PI / 180;
const VISUAL_SPEED_FACTOR = 0.5;
// Fallback si el rate viene null/0: mantenemos la velocidad visual anterior.
const FALLBACK_SPEED_RADS = 0.78;

export function RotationModule({
  axis,
  rate,
  shipColor,
  glbUrl,
  compact = false,
}: RotationModuleProps) {
  const meta    = AXIS_META[axis];
  const canvasH = compact ? "h-[110px]" : "h-[240px]";

  // Velocidad de animación derivada del rate real de la nave (°/s → rad/s)
  const animationSpeed =
    rate != null && rate > 0
      ? rate * DEG2RAD * VISUAL_SPEED_FACTOR
      : FALLBACK_SPEED_RADS;

  return (
    <div className="flex flex-col gap-1.5 min-w-0">

      {/* Header: label + rate */}
      <div className="flex items-center justify-between px-0.5">
        <span
          className="text-[9px] font-mono font-semibold tracking-widest uppercase"
          style={{ color: meta.color }}
        >
          {meta.label}
        </span>

        {rate != null && rate > 0 && (
          <span className="text-[9px] font-mono text-zinc-400 tabular-nums">
            {rate.toFixed(1)}°/s
          </span>
        )}
      </div>

      {/* Viewer 3D */}
      <div
        className={`relative w-full ${canvasH} rounded overflow-hidden`}
        style={{
          border:     `1px solid ${meta.color}28`,
          background: "#09090b",
        }}
      >
        <ShipViewer3D
          rotationAxis={axis}
          animate
          animationSpeed={animationSpeed}
          shipColor={shipColor}
          glbUrl={glbUrl}
        />

        {/* Badge del eje Three.js */}
        <div
          className="absolute bottom-1 right-1.5 px-1.5 py-0.5 rounded text-[7px] font-mono pointer-events-none"
          style={{
            color:           meta.color,
            backgroundColor: `${meta.color}14`,
          }}
        >
          {meta.dimLabel}
        </div>
      </div>

      {/* Descripción (solo en modo full) */}
      {!compact && (
        <p className="text-[8px] text-zinc-600 text-center font-mono leading-none">
          {meta.description}
        </p>
      )}
    </div>
  );
}
