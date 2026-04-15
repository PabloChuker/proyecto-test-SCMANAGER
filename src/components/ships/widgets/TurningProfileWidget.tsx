// =============================================================================
// AL FILO — TurningProfileWidget
// Self-contained: reads shipInfo from the store directly.
// Only re-renders when the active ship changes.
// =============================================================================
"use client";

import { memo } from "react";
import { useLoadoutStore } from "@/store/useLoadoutStore";

// ── Dual-layer 3-axis radar (SCM + AFB) ──────────────────────────────────────
const TurningProfileRadar = memo(function TurningProfileRadar({ shipData }: { shipData: any }) {
  const pitch      = shipData.pitchRate    ?? 0;
  const yaw        = shipData.yawRate      ?? 0;
  const roll       = shipData.rollRate     ?? 0;
  const boostPitch = shipData.boostedPitch ?? pitch;
  const boostYaw   = shipData.boostedYaw   ?? yaw;
  const boostRoll  = shipData.boostedRoll  ?? roll;

  const globalMax = Math.max(pitch, yaw, roll, boostPitch, boostYaw, boostRoll, 50);

  const axes = [
    { label: "Pitch", scm: pitch, boost: boostPitch, max: globalMax },
    { label: "Yaw",   scm: yaw,   boost: boostYaw,   max: globalMax },
    { label: "Roll",  scm: roll,  boost: boostRoll,  max: globalMax },
  ];

  const size       = 260;
  const cx         = size / 2, cy = size / 2;
  const radius     = size * 0.30;
  const labelR     = size * 0.44;
  const n          = 3;
  const step       = (2 * Math.PI) / n;
  const start      = -Math.PI / 2;
  const gridLevels = 5;

  const normScm   = axes.map(a => a.max > 0 ? Math.min(1, a.scm   / a.max) : 0);
  const normBoost = axes.map(a => a.max > 0 ? Math.min(1, a.boost / a.max) : 0);

  const pts = (vals: number[]) => vals.map((v, i) => {
    const a = start + i * step;
    const r = v * radius;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(" ");

  const grids = Array.from({ length: gridLevels }, (_, i) => {
    const lv = (i + 1) / gridLevels;
    return axes.map((_, j) => {
      const a = start + j * step;
      const r = lv * radius;
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    }).join(" ");
  });

  const scmColor   = "#f59e0b";
  const boostColor = "#ef4444";

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, overflow: "hidden" }}>
      {grids.map((p, i) => <polygon key={i} points={p} fill="none" stroke="#3f3f46" strokeWidth={0.5} opacity={0.4} />)}
      {axes.map((_, i) => {
        const a = start + i * step;
        return <line key={i} x1={cx} y1={cy} x2={cx + radius * Math.cos(a)} y2={cy + radius * Math.sin(a)} stroke="#3f3f46" strokeWidth={0.5} opacity={0.3} />;
      })}

      {/* AFB layer (dashed, behind) */}
      <polygon points={pts(normBoost)} fill={boostColor} fillOpacity={0.08} stroke={boostColor} strokeWidth={1} strokeLinejoin="round" strokeDasharray="3,2" opacity={0.7} />
      {normBoost.map((v, i) => {
        const a = start + i * step;
        const r = v * radius;
        return v > 0 ? <circle key={`b${i}`} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={1.5} fill={boostColor} stroke="#18181b" strokeWidth={0.5} opacity={0.6} /> : null;
      })}

      {/* SCM layer (solid, front) */}
      <polygon points={pts(normScm)} fill={scmColor} fillOpacity={0.15} stroke={scmColor} strokeWidth={1.5} strokeLinejoin="round" />
      {normScm.map((v, i) => {
        const a = start + i * step;
        const r = v * radius;
        return <circle key={`s${i}`} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={2.5} fill={scmColor} stroke="#18181b" strokeWidth={0.8} />;
      })}

      {/* Labels */}
      {axes.map((ax, i) => {
        const a = start + i * step;
        const lx = cx + labelR * Math.cos(a);
        const ly = cy + labelR * Math.sin(a);
        let anchor: "middle" | "start" | "end" = "middle";
        if (Math.cos(a) > 0.3)       anchor = "start";
        else if (Math.cos(a) < -0.3) anchor = "end";
        const hasBoost = ax.boost > ax.scm;
        return (
          <g key={`l-${i}`}>
            <text x={lx} y={ly - (hasBoost ? 8 : 4)} textAnchor={anchor} dominantBaseline="middle"
              className="fill-zinc-400" style={{ fontSize: "9px", fontFamily: "monospace", fontWeight: 600 }}>{ax.label}</text>
            <text x={lx} y={ly + 5} textAnchor={anchor} dominantBaseline="middle"
              style={{ fontSize: "10px", fontFamily: "monospace", fill: scmColor, fontWeight: 600 }}>
              {ax.scm > 0 ? `${Math.round(ax.scm)}°/s` : "—"}
            </text>
            {hasBoost && (
              <text x={lx} y={ly + 17} textAnchor={anchor} dominantBaseline="middle"
                style={{ fontSize: "8.5px", fontFamily: "monospace", fill: boostColor, fontWeight: 500, opacity: 0.8 }}>
                {Math.round(ax.boost)}°/s
              </text>
            )}
          </g>
        );
      })}

      {/* Legend */}
      <rect x={4}  y={size - 16} width={6} height={6} rx={1} fill={scmColor}   opacity={0.8} />
      <text x={13} y={size - 10} className="fill-zinc-500" style={{ fontSize: "6px", fontFamily: "monospace" }}>SCM</text>
      <rect x={40} y={size - 16} width={6} height={6} rx={1} fill={boostColor} opacity={0.6} />
      <text x={49} y={size - 10} className="fill-zinc-500" style={{ fontSize: "6px", fontFamily: "monospace" }}>AFB</text>
    </svg>
  );
});

// ── Store-connected export ────────────────────────────────────────────────────
export const TurningProfileContent = memo(function TurningProfileContent() {
  const shipInfo = useLoadoutStore(s => s.shipInfo);
  if (!shipInfo) return null;
  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-3">
      <div className="flex justify-center">
        <TurningProfileRadar shipData={shipInfo as any} />
      </div>
    </div>
  );
});
