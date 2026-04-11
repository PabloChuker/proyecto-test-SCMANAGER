"use client";
// =============================================================================
// SC LABS — ShipFlightDynamicsComparator
//
// Contenedor para la página de comparación de naves.
// Muestra una grilla: filas = naves, columnas = pitch / yaw / roll.
//
// Hasta 3 naves soportadas (igual que ShipComparator).
// Cada celda es un RotationModule compacto (canvas ~90px).
//
// Props:
//   ships     — array de hasta 3 entradas con datos de cada nave
//   className — clases extra para el div raíz
// =============================================================================

import { RotationModule } from "./RotationModule";

export interface ShipDynamicsEntry {
  shipName: string;
  color?:     string;
  pitchRate?: number | null;
  yawRate?:   number | null;
  rollRate?:  number | null;
  glbUrl?:    string | null;
}

export interface ShipFlightDynamicsComparatorProps {
  ships:     ShipDynamicsEntry[];
  className?: string;
}

export function ShipFlightDynamicsComparator({
  ships,
  className = "",
}: ShipFlightDynamicsComparatorProps) {
  const active = ships.filter((s) => s && s.shipName);
  if (!active.length) return null;

  return (
    <div className={className}>

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-500">
          Flight Dynamics 3D
        </span>
        <div className="flex-1 h-px bg-zinc-800/50" />
        <span className="text-[7px] font-mono text-zinc-700 tracking-widest">
          {active.length} {active.length === 1 ? "nave" : "naves"}
        </span>
      </div>

      {/* Grid: col 1 = nombre nave, col 2-4 = módulos pitch/yaw/roll */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: "520px" }}>

          {/* Cabeceras de columna */}
          <div
            className="grid items-center gap-3 mb-2 pr-1"
            style={{ gridTemplateColumns: "120px 1fr 1fr 1fr" }}
          >
            <div />
            {(["PITCH", "YAW", "ROLL"] as const).map((lbl) => (
              <div
                key={lbl}
                className="text-center text-[8px] font-mono uppercase tracking-widest text-zinc-600"
              >
                {lbl}
              </div>
            ))}
          </div>

          {/* Filas: una por nave */}
          <div className="space-y-3">
            {active.map((ship, i) => (
              <div
                key={`${ship.shipName}-${i}`}
                className="grid items-start gap-3"
                style={{ gridTemplateColumns: "120px 1fr 1fr 1fr" }}
              >
                {/* Nombre de la nave */}
                <div className="flex items-center pt-4 pr-2 min-w-0">
                  <span
                    className="text-[10px] font-mono leading-tight truncate"
                    style={{ color: ship.color || "#a1a1aa" }}
                    title={ship.shipName}
                  >
                    {ship.shipName}
                  </span>
                </div>

                <RotationModule axis="pitch" rate={ship.pitchRate} shipColor={ship.color} glbUrl={ship.glbUrl} compact />
                <RotationModule axis="yaw"   rate={ship.yawRate}   shipColor={ship.color} glbUrl={ship.glbUrl} compact />
                <RotationModule axis="roll"  rate={ship.rollRate}  shipColor={ship.color} glbUrl={ship.glbUrl} compact />
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
