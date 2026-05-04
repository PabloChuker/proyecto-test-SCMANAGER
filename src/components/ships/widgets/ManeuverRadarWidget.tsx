// =============================================================================
// AL FILO — ManeuverRadarWidget  (G-Force Profile)
// Self-contained: reads shipInfo from the store directly.
// Only re-renders when the active ship changes.
// =============================================================================
"use client";

import { memo, useState } from "react";
import { useLoadoutStore } from "@/store/useLoadoutStore";

// ── 3-D isometric G-force chart ───────────────────────────────────────────────
const GForce3DChart = memo(function GForce3DChart({ shipData }: { shipData: any }) {
  const G = 9.81;
  const fwdG    = shipData.accelForwardG   ?? (shipData.accelForward   ?? 0) / G;
  const bwdG    = shipData.accelBackwardG  ?? (shipData.accelBackward  ?? 0) / G;
  const upG     = shipData.accelUpG        ?? (shipData.accelUp        ?? 0) / G;
  const downG   = shipData.accelDownG      ?? (shipData.accelDown      ?? 0) / G;
  const strafeG = shipData.accelStrafeG    ?? (shipData.accelStrafe    ?? 0) / G;

  const scmFwd   = shipData.scmSpeed           ?? 1;
  const boostFwd = shipData.boostSpeedForward  ?? scmFwd;
  const boostBwd = shipData.boostSpeedBackward ?? scmFwd;
  const boostRatio  = scmFwd > 0 ? Math.min(boostFwd / scmFwd, 3) : 1.5;
  const boostRatioB = scmFwd > 0 ? Math.min(boostBwd / scmFwd, 3) : 1.3;
  const boostMultUp     = shipData.boostMultUp     ?? 1.3;
  const boostMultStrafe = shipData.boostMultStrafe ?? 1.3;

  const afbFwdG    = fwdG    * boostRatio;
  const afbBwdG    = bwdG    * boostRatioB;
  const afbUpG     = upG     * boostMultUp;
  const afbDownG   = downG   * boostMultUp;
  const afbStrafeG = strafeG * boostMultStrafe;

  const W = 280, H = 280;
  const cx = W / 2, cy = H / 2 + 5;

  const allG   = [fwdG, bwdG, upG, downG, strafeG, afbFwdG, afbBwdG, afbUpG, afbDownG, afbStrafeG].filter(v => v > 0);
  const maxG   = Math.max(...allG, 3);
  const pixScale = 90 / maxG;

  const ix = { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };
  const iz = { x: -Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };
  const iy = { x: 0, y: -1 };

  const project = (x: number, y: number, z: number) => ({
    px: cx + (x * ix.x + z * iz.x + y * iy.x) * pixScale,
    py: cy + (x * ix.y + z * iz.y + y * iy.y) * pixScale,
  });

  const axLen = maxG * 1.05;
  const xPos  = project( axLen, 0, 0);
  const xNeg  = project(-axLen, 0, 0);
  const yPos  = project(0,  axLen, 0);
  const zPos  = project(0, 0,  axLen);
  const zNeg  = project(0, 0, -axLen);

  const scmPts = [
    project(strafeG, 0, 0), project(0, upG,    0), project(0, 0,  fwdG),
    project(-strafeG, 0, 0), project(0, -downG, 0), project(0, 0, -bwdG),
  ];
  const afbPts = [
    project(afbStrafeG, 0, 0), project(0, afbUpG,    0), project(0, 0,  afbFwdG),
    project(-afbStrafeG, 0, 0), project(0, -afbDownG, 0), project(0, 0, -afbBwdG),
  ];

  const edgePairs: [number, number][] = [
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
      {edgePairs.map(([a, b], i) => (
        <line key={`ae-${i}`} x1={afbPts[a].px} y1={afbPts[a].py} x2={afbPts[b].px} y2={afbPts[b].py}
          stroke={afbColor} strokeWidth={0.8} opacity={0.5} />
      ))}
      {edgePairs.map(([a, b], i) => (
        <line key={`se-${i}`} x1={scmPts[a].px} y1={scmPts[a].py} x2={scmPts[b].px} y2={scmPts[b].py}
          stroke={scmColor} strokeWidth={1.2} opacity={0.85} />
      ))}
      {scmPts.map((p, i) => <circle key={`sv-${i}`} cx={p.px} cy={p.py} r={2}   fill={scmColor} />)}
      {afbPts.map((p, i) => <circle key={`av-${i}`} cx={p.px} cy={p.py} r={1.5} fill={afbColor} opacity={0.5} />)}
    </svg>
  );
});

// ── Hex G-force radar ─────────────────────────────────────────────────────────
const GForceRadar = memo(function GForceRadar({ shipData }: { shipData: any }) {
  const fwdG    = shipData.accelForwardG  ?? 0;
  const bwdG    = shipData.accelBackwardG ?? 0;
  const upG     = shipData.accelUpG       ?? 0;
  const downG   = shipData.accelDownG     ?? 0;
  const strafeG = shipData.accelStrafeG   ?? 0;

  const scmSpd      = shipData.scmSpeed           ?? 1;
  const boostFwdSpd = shipData.boostSpeedForward  ?? scmSpd;
  const boostBwdSpd = shipData.boostSpeedBackward ?? scmSpd;
  const ratioF      = scmSpd > 0 ? Math.min(boostFwdSpd / scmSpd, 3) : 1.5;
  const ratioB      = scmSpd > 0 ? Math.min(boostBwdSpd / scmSpd, 3) : 1.3;
  const boostMultUp     = shipData.boostMultUp     ?? 1.3;
  const boostMultStrafe = shipData.boostMultStrafe ?? 1.3;

  const afbFwdG    = fwdG    * ratioF;
  const afbBwdG    = bwdG    * ratioB;
  const afbUpG     = upG     * boostMultUp;
  const afbDownG   = downG   * boostMultUp;
  const afbStrafeG = strafeG * boostMultStrafe;

  const axes = [
    { label: "Fwd",      scm: fwdG,    afb: afbFwdG    },
    { label: "Strafe R", scm: strafeG, afb: afbStrafeG  },
    { label: "Down",     scm: downG,   afb: afbDownG    },
    { label: "Bwd",      scm: bwdG,    afb: afbBwdG     },
    { label: "Strafe L", scm: strafeG, afb: afbStrafeG  },
    { label: "Up",       scm: upG,     afb: afbUpG      },
  ];

  const globalMax  = Math.max(...axes.map(a => Math.max(a.scm, a.afb)), 3);
  const size       = 280;
  const cx         = size / 2, cy = size / 2;
  const radius     = size * 0.32;
  const n          = 6;
  const step       = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;

  const gridMarks = Array.from({ length: Math.ceil(globalMax) }, (_, i) => i + 1)
    .filter(g => g <= globalMax);

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
      {gridMarks.filter(g => g % (globalMax > 6 ? 2 : 1) === 0).map(g => {
        const r    = (g / globalMax) * radius;
        const pts  = Array.from({ length: n }, (_, i) => ptAt(i, r));
        return <polygon key={`g-${g}`} points={pts.map(p => `${p.x},${p.y}`).join(" ")}
          fill="none" stroke="#3f3f46" strokeWidth={0.5} opacity={g % 2 === 0 ? 0.5 : 0.3} />;
      })}
      {axes.map((_, i) => {
        const p = ptAt(i, radius);
        return <line key={`ax-${i}`} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#3f3f46" strokeWidth={0.5} opacity={0.3} />;
      })}
      {/* G labels */}
      {gridMarks.filter(g => g % (globalMax > 6 ? 2 : 1) === 0).map(g => {
        const r = (g / globalMax) * radius;
        const p = ptAt(0, r);
        return <text key={`gv-${g}`} x={p.x + 4} y={p.y - 3}
          style={{ fontSize: "6.5px", fontFamily: "monospace", fill: "#52525b", fontWeight: 600 }}>{g}G</text>;
      })}
      {/* 9G human tolerance reference */}
      {globalMax > 7 && (() => {
        const r9   = (9 / globalMax) * radius;
        const pts9 = Array.from({ length: n }, (_, i) => ptAt(i, r9));
        return <polygon points={pts9.map(p => `${p.x},${p.y}`).join(" ")}
          fill="none" stroke="#dc2626" strokeWidth={0.5} strokeDasharray="2,3" opacity={0.4} />;
      })()}
      {/* AFB polygon */}
      <polygon points={polyPts(afbVals)} fill={afbColor} fillOpacity={0.06} stroke={afbColor} strokeWidth={1} strokeLinejoin="round" strokeDasharray="3,2" opacity={0.6} />
      {afbVals.map((v, i) => {
        const norm = globalMax > 0 ? Math.min(1, v / globalMax) : 0;
        const p    = ptAt(i, norm * radius);
        return v > 0 ? <circle key={`ab-${i}`} cx={p.x} cy={p.y} r={1.5} fill={afbColor} opacity={0.5} /> : null;
      })}
      {/* SCM polygon */}
      <polygon points={polyPts(scmVals)} fill={scmColor} fillOpacity={0.15} stroke={scmColor} strokeWidth={1.5} strokeLinejoin="round" />
      {scmVals.map((v, i) => {
        const norm = globalMax > 0 ? Math.min(1, v / globalMax) : 0;
        const p    = ptAt(i, norm * radius);
        return v > 0 ? <circle key={`sv-${i}`} cx={p.x} cy={p.y} r={2.5} fill={scmColor} stroke="#18181b" strokeWidth={0.6} /> : null;
      })}
      {/* Value labels */}
      {axes.map((a, i) => {
        if (a.scm <= 0 || (i === 4 && axes[1].scm === a.scm)) return null;
        const norm   = Math.min(1, a.scm / globalMax);
        const p      = ptAt(i, norm * radius);
        const labelX = p.x + (p.x > cx ? 6 : p.x < cx ? -32 : -14);
        const labelY = p.y + (p.y > cy ? 12 : p.y < cy ? -5 : 3);
        return (
          <g key={`sl-${i}`}>
            <rect x={labelX - 2} y={labelY - 8} width={32} height={11} rx={2} fill="#18181b" fillOpacity={0.85} />
            <text x={labelX} y={labelY} style={{ fontSize: "7.5px", fontFamily: "monospace", fill: scmColor, fontWeight: 700 }}>{a.scm.toFixed(1)}G</text>
          </g>
        );
      })}
      {/* Axis labels */}
      {axes.map((a, i) => {
        const labelR = radius + 14;
        const p      = ptAt(i, labelR);
        const anchor: "start" | "end" | "middle" = p.x > cx + 5 ? "start" : p.x < cx - 5 ? "end" : "middle";
        return <text key={`al-${i}`} x={p.x} y={p.y + 3} textAnchor={anchor}
          style={{ fontSize: "8px", fontFamily: "monospace", fill: "#a1a1aa", fontWeight: 600 }}>{a.label}</text>;
      })}
      {/* Legend */}
      <rect x={6}  y={size - 18} width={7} height={7} rx={1.5} fill={scmColor} opacity={0.85} />
      <text x={16} y={size - 11} style={{ fontSize: "7px", fontFamily: "monospace", fill: "#71717a" }}>SCM</text>
      <rect x={46} y={size - 18} width={7} height={7} rx={1.5} fill={afbColor} opacity={0.65} />
      <text x={56} y={size - 11} style={{ fontSize: "7px", fontFamily: "monospace", fill: "#71717a" }}>AFB</text>
    </svg>
  );
});

// ── Tab wrapper ───────────────────────────────────────────────────────────────
function GForceProfileTabs({ shipData }: { shipData: any }) {
  const [view, setView] = useState<"3d" | "radar">("3d");
  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px] font-mono text-zinc-500 tracking-[0.2em] uppercase">G-Force Profile</div>
        <div className="flex gap-0.5 bg-zinc-800/60 rounded p-0.5">
          <button onClick={() => setView("3d")}
            className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${view === "3d" ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"}`}>3D</button>
          <button onClick={() => setView("radar")}
            className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${view === "radar" ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"}`}>Radar</button>
        </div>
      </div>
      <div className="flex justify-center">
        {view === "3d" ? <GForce3DChart shipData={shipData} /> : <GForceRadar shipData={shipData} />}
      </div>
    </div>
  );
}

// ── Store-connected export ────────────────────────────────────────────────────
export const ManeuverRadarContent = memo(function ManeuverRadarContent() {
  const shipInfo = useLoadoutStore(s => s.shipInfo);
  if (!shipInfo) return null;
  return <GForceProfileTabs shipData={shipInfo as any} />;
});
