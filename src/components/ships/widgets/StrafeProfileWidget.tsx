// =============================================================================
// AL FILO — StrafeProfileWidget
// Self-contained: reads shipInfo from the store directly.
// Only re-renders when the active ship changes (not on equip/flightMode).
// =============================================================================
"use client";

import { memo, useState } from "react";
import { useLoadoutStore } from "@/store/useLoadoutStore";

// ── 3-D isometric chart ───────────────────────────────────────────────────────
const StrafeProfile3D = memo(function StrafeProfile3D({ shipData }: { shipData: any }) {
  const fwd    = shipData.accelForward   ?? 0;
  const bwd    = shipData.accelBackward  ?? 0;
  const up     = shipData.accelUp        ?? 0;
  const down   = shipData.accelDown      ?? 0;
  const strafe = shipData.accelStrafe    ?? 0;

  const scmSpd     = shipData.scmSpeed          ?? 1;
  const boostFwdSpd = shipData.boostSpeedForward ?? scmSpd;
  const boostBwdSpd = shipData.boostSpeedBackward ?? scmSpd;
  const ratioF      = scmSpd > 0 ? Math.min(boostFwdSpd / scmSpd, 3) : 1.5;
  const ratioB      = scmSpd > 0 ? Math.min(boostBwdSpd / scmSpd, 3) : 1.3;
  const boostMultUp     = shipData.boostMultUp     ?? 1.3;
  const boostMultStrafe = shipData.boostMultStrafe ?? 1.3;

  const afbFwd    = fwd    * ratioF;
  const afbBwd    = bwd    * ratioB;
  const afbUp     = up     * boostMultUp;
  const afbDown   = down   * boostMultUp;
  const afbStrafe = strafe * boostMultStrafe;

  const W = 280, H = 280;
  const cx = W / 2, cy = H / 2 + 5;

  const allVals = [fwd, bwd, up, down, strafe, afbFwd, afbBwd, afbUp, afbDown, afbStrafe].filter(v => v > 0);
  const maxVal  = Math.max(...allVals, 30);
  const pixScale = 90 / maxVal;

  const ix = { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };
  const iz = { x: -Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };
  const iy = { x: 0, y: -1 };

  const project = (x: number, y: number, z: number) => ({
    px: cx + (x * ix.x + z * iz.x + y * iy.x) * pixScale,
    py: cy + (x * ix.y + z * iz.y + y * iy.y) * pixScale,
  });

  const axLen = maxVal * 1.05;
  const xPos  = project( axLen, 0, 0);
  const xNeg  = project(-axLen, 0, 0);
  const yPos  = project(0,  axLen, 0);
  const zPos  = project(0, 0,  axLen);
  const zNeg  = project(0, 0, -axLen);

  const scmPts = [
    project(strafe, 0, 0), project(0, up,    0), project(0, 0, fwd),
    project(-strafe, 0, 0), project(0, -down, 0), project(0, 0, -bwd),
  ];
  const afbPts = [
    project(afbStrafe, 0, 0), project(0, afbUp,    0), project(0, 0, afbFwd),
    project(-afbStrafe, 0, 0), project(0, -afbDown, 0), project(0, 0, -afbBwd),
  ];

  const edges: [number, number][] = [
    [0,1],[0,2],[0,4],[0,5],[1,2],[1,3],[1,5],[2,4],[3,4],[3,5],[2,3],[4,5],
  ];

  const scmColor = "#f59e0b";
  const afbColor = "#ef4444";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, overflow: "hidden" }}>
      <line x1={xNeg.px} y1={xNeg.py} x2={xPos.px} y2={xPos.py} stroke="#3f3f46" strokeWidth={0.5} />
      <line x1={cx} y1={project(0, axLen, 0).py} x2={cx} y2={project(0, -axLen * 0.6, 0).py} stroke="#3f3f46" strokeWidth={0.5} />
      <line x1={zNeg.px} y1={zNeg.py} x2={zPos.px} y2={zPos.py} stroke="#3f3f46" strokeWidth={0.5} />
      {[
        { p: xPos, text: "Strafe", dx: 4, dy: 3 },
        { p: zPos, text: "Fwd",    dx: -8, dy: 12 },
        { p: zNeg, text: "Bwd",    dx: 2, dy: -4 },
        { p: yPos, text: "Up",     dx: 4, dy: 2 },
      ].map((item, i) => (
        <text key={`al-${i}`} x={item.p.px + item.dx} y={item.p.py + item.dy}
          style={{ fontSize: "7px", fontFamily: "monospace", fill: "#52525b" }}>{item.text}</text>
      ))}
      {edges.map(([a, b], i) => (
        <line key={`ae-${i}`} x1={afbPts[a].px} y1={afbPts[a].py} x2={afbPts[b].px} y2={afbPts[b].py}
          stroke={afbColor} strokeWidth={0.8} opacity={0.5} />
      ))}
      {edges.map(([a, b], i) => (
        <line key={`se-${i}`} x1={scmPts[a].px} y1={scmPts[a].py} x2={scmPts[b].px} y2={scmPts[b].py}
          stroke={scmColor} strokeWidth={1.2} opacity={0.85} />
      ))}
      {scmPts.map((p, i) => <circle key={`sv-${i}`} cx={p.px} cy={p.py} r={2}   fill={scmColor} />)}
      {afbPts.map((p, i) => <circle key={`av-${i}`} cx={p.px} cy={p.py} r={1.5} fill={afbColor} opacity={0.5} />)}
    </svg>
  );
});

// ── Hex radar ─────────────────────────────────────────────────────────────────
const StrafeProfileRadar = memo(function StrafeProfileRadar({ shipData }: { shipData: any }) {
  const fwd    = shipData.accelForward   ?? 0;
  const bwd    = shipData.accelBackward  ?? 0;
  const up     = shipData.accelUp        ?? 0;
  const down   = shipData.accelDown      ?? 0;
  const strafe = shipData.accelStrafe    ?? 0;

  const scmSpd      = shipData.scmSpeed           ?? 1;
  const boostFwdSpd = shipData.boostSpeedForward  ?? scmSpd;
  const boostBwdSpd = shipData.boostSpeedBackward ?? scmSpd;
  const ratioF      = scmSpd > 0 ? Math.min(boostFwdSpd / scmSpd, 3) : 1.5;
  const ratioB      = scmSpd > 0 ? Math.min(boostBwdSpd / scmSpd, 3) : 1.3;
  const boostMultUp     = shipData.boostMultUp     ?? 1.3;
  const boostMultStrafe = shipData.boostMultStrafe ?? 1.3;

  const afbFwd    = fwd    * ratioF;
  const afbBwd    = bwd    * ratioB;
  const afbUp     = up     * boostMultUp;
  const afbDown   = down   * boostMultUp;
  const afbStrafe = strafe * boostMultStrafe;

  const axes = [
    { label: "Fwd",      scm: fwd,    afb: afbFwd    },
    { label: "Strafe R", scm: strafe, afb: afbStrafe  },
    { label: "Down",     scm: down,   afb: afbDown    },
    { label: "Bwd",      scm: bwd,    afb: afbBwd     },
    { label: "Strafe L", scm: strafe, afb: afbStrafe  },
    { label: "Up",       scm: up,     afb: afbUp      },
  ];

  const globalMax  = Math.max(...axes.map(a => Math.max(a.scm, a.afb)), 30);
  const size       = 300;
  const cx         = size / 2, cy = size / 2;
  const radius     = size * 0.32;
  const n          = 6;
  const step       = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;
  const gridLevels = 5;

  const gridStep   = globalMax <= 50 ? 10 : globalMax <= 150 ? 25 : globalMax <= 500 ? 50 : 100;
  const gridValues = Array.from({ length: gridLevels }, (_, i) =>
    Math.round(((i + 1) / gridLevels) * globalMax / gridStep) * gridStep
  ).filter(v => v > 0 && v <= globalMax);

  const ptAt = (i: number, r: number) => {
    const a = startAngle + i * step;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const polyPts = (vals: number[]) => vals.map((v, i) => {
    const norm = globalMax > 0 ? Math.min(1, v / globalMax) : 0;
    const p    = ptAt(i, norm * radius);
    return `${p.x},${p.y}`;
  }).join(" ");

  const scmVals  = axes.map(a => a.scm);
  const afbVals  = axes.map(a => a.afb);
  const scmColor = "#f59e0b";
  const afbColor = "#ef4444";

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, overflow: "hidden" }}>
      {/* Grid rings */}
      {gridValues.map(g => {
        const r    = (g / globalMax) * radius;
        const ring = Array.from({ length: n }, (_, i) => ptAt(i, r));
        return (
          <g key={`gr-${g}`}>
            <polygon points={ring.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#3f3f46" strokeWidth={0.5} opacity={0.4} />
            <text x={ptAt(0, r).x + 3} y={ptAt(0, r).y - 3}
              style={{ fontSize: "6px", fontFamily: "monospace", fill: "#52525b" }}>{g}</text>
          </g>
        );
      })}
      {/* Axis spokes */}
      {axes.map((_, i) => {
        const p = ptAt(i, radius);
        return <line key={`ax-${i}`} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#3f3f46" strokeWidth={0.5} opacity={0.3} />;
      })}
      {/* AFB polygon */}
      <polygon points={polyPts(afbVals)} fill={afbColor} fillOpacity={0.06} stroke={afbColor} strokeWidth={1} strokeLinejoin="round" strokeDasharray="3,2" opacity={0.6} />
      {afbVals.map((v, i) => {
        const norm = globalMax > 0 ? Math.min(1, v / globalMax) : 0;
        const p = ptAt(i, norm * radius);
        return v > 0 ? <circle key={`ab-${i}`} cx={p.x} cy={p.y} r={1.5} fill={afbColor} opacity={0.5} /> : null;
      })}
      {/* SCM polygon */}
      <polygon points={polyPts(scmVals)} fill={scmColor} fillOpacity={0.15} stroke={scmColor} strokeWidth={1.5} strokeLinejoin="round" />
      {scmVals.map((v, i) => {
        const norm = globalMax > 0 ? Math.min(1, v / globalMax) : 0;
        const p = ptAt(i, norm * radius);
        return <circle key={`sv-${i}`} cx={p.x} cy={p.y} r={2.5} fill={scmColor} stroke="#18181b" strokeWidth={0.6} />;
      })}
      {/* Axis labels */}
      {axes.map((ax, i) => {
        const labelR = radius + 16;
        const p      = ptAt(i, labelR);
        const anchor = p.x > cx + 5 ? "start" : p.x < cx - 5 ? "end" : "middle";
        return (
          <g key={`al-${i}`}>
            <text x={p.x} y={p.y - 3} textAnchor={anchor}
              style={{ fontSize: "8px", fontFamily: "monospace", fill: "#a1a1aa", fontWeight: 600 }}>{ax.label}</text>
            <text x={p.x} y={p.y + 9} textAnchor={anchor}
              style={{ fontSize: "7.5px", fontFamily: "monospace", fill: scmColor }}>{ax.scm > 0 ? Math.round(ax.scm) : "—"}</text>
          </g>
        );
      })}
      {/* Legend */}
      <rect x={4} y={size - 16} width={6} height={6} rx={1} fill={scmColor} opacity={0.8} />
      <text x={13} y={size - 10} style={{ fontSize: "6px", fontFamily: "monospace", fill: "#71717a" }}>SCM</text>
      <rect x={36} y={size - 16} width={6} height={6} rx={1} fill={afbColor} opacity={0.6} />
      <text x={45} y={size - 10} style={{ fontSize: "6px", fontFamily: "monospace", fill: "#71717a" }}>AFB</text>
    </svg>
  );
});

// ── Tab wrapper ───────────────────────────────────────────────────────────────
function StrafeProfileTabs({ shipData }: { shipData: any }) {
  const [view, setView] = useState<"3d" | "radar">("3d");
  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-3">
      <div className="flex justify-end mb-1">
        <div className="flex gap-0.5 bg-zinc-800/60 rounded p-0.5">
          <button onClick={() => setView("3d")}
            className={`px-2 py-0.5 text-[8px] font-mono rounded transition-colors ${view === "3d" ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"}`}>3D</button>
          <button onClick={() => setView("radar")}
            className={`px-2 py-0.5 text-[8px] font-mono rounded transition-colors ${view === "radar" ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"}`}>Radar</button>
        </div>
      </div>
      <div className="flex justify-center">
        {view === "3d" ? <StrafeProfile3D shipData={shipData} /> : <StrafeProfileRadar shipData={shipData} />}
      </div>
    </div>
  );
}

// ── Store-connected export ────────────────────────────────────────────────────
// memo() with no changing props → skips re-render unless shipInfo changes.
export const StrafeProfileContent = memo(function StrafeProfileContent() {
  const shipInfo = useLoadoutStore(s => s.shipInfo);
  if (!shipInfo) return null;
  return <StrafeProfileTabs shipData={shipInfo as any} />;
});
