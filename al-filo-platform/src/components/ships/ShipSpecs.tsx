// =============================================================================
// AL FILO — ShipSpecs Component
// Panel compacto con especificaciones de vuelo y dimensiones.
// =============================================================================

"use client";

import type { ShipDetail } from "@/types/ships";

interface ShipSpecsProps {
  ship: ShipDetail;
}

export function ShipSpecs({ ship }: ShipSpecsProps) {
  const s = ship.ship;
  if (!s) return null;

  const specs = [
    { label: "SCM Speed",      value: s.maxSpeed ? `${Math.round(s.maxSpeed)} m/s` : null },
    { label: "Afterburner",    value: s.afterburnerSpeed ? `${Math.round(s.afterburnerSpeed)} m/s` : null },
    { label: "Tripulación",    value: s.maxCrew?.toString() },
    { label: "Carga",          value: s.cargo ? `${s.cargo} SCU` : null },
    { label: "Pitch Rate",     value: s.pitchRate ? `${s.pitchRate.toFixed(1)}°/s` : null },
    { label: "Yaw Rate",       value: s.yawRate ? `${s.yawRate.toFixed(1)}°/s` : null },
    { label: "Roll Rate",      value: s.rollRate ? `${s.rollRate.toFixed(1)}°/s` : null },
    { label: "H₂ Fuel",        value: s.hydrogenFuelCap ? formatCompact(s.hydrogenFuelCap) : null },
    { label: "QT Fuel",        value: s.quantumFuelCap ? formatCompact(s.quantumFuelCap) : null },
    { label: "Largo",          value: s.lengthMeters ? `${s.lengthMeters.toFixed(1)} m` : null },
    { label: "Ancho",          value: s.beamMeters ? `${s.beamMeters.toFixed(1)} m` : null },
    { label: "Alto",           value: s.heightMeters ? `${s.heightMeters.toFixed(1)} m` : null },
  ].filter((spec) => spec.value != null);

  if (specs.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-[11px] tracking-[0.18em] uppercase text-zinc-400 font-medium pb-2 border-b border-zinc-800/40">
        Especificaciones
      </h3>

      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {specs.map((spec) => (
          <div key={spec.label} className="flex items-center justify-between py-1.5">
            <span className="text-[11px] text-zinc-600 tracking-wide">{spec.label}</span>
            <span className="text-[12px] font-mono text-zinc-300">{spec.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatCompact(val: number): string {
  if (val >= 10000) return `${(val / 1000).toFixed(0)}k`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
  return val.toFixed(0);
}
