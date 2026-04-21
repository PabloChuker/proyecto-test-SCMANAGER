// =============================================================================
// AL FILO — FlightDynamicsWidget  (Fase G.1)
//
// Merge de los 3 widgets anteriores (Strafe / Turning / G-Forces) en una sola
// tarjeta de 2 columnas de ancho, con un selector de vista compartido:
//
//   - 3D    — proyección isométrica (strafe + g-force); turning fallback radar
//   - Radar — hex radar 6-ejes (strafe/g) + tri radar 3-ejes (turning)
//   - Bars  — barras verticales pareadas (SCM vs AFB) por eje. Nuevo.
//             Pedido por Pablo (20k+ horas): ayuda a comparar magnitudes de un
//             vistazo sin tener que leer polígonos.
//
// Los 3 sub-paneles se renderizan lado a lado (CSS grid 3 cols) y comparten
// la vista seleccionada. Se mantiene SCM color ámbar #f59e0b, AFB color rojo
// #ef4444 en todas las visualizaciones.
//
// Responsive: los SVG usan `viewBox` + `width: 100%` así que la tarjeta se
// adapta a la columna sin sobresalir (UNIT del grid va de 240 a 390 px).
// =============================================================================
"use client";

import { memo, useState } from "react";
import { useLoadoutStore } from "@/store/useLoadoutStore";

type View = "3d" | "radar" | "bars";

const SCM_COLOR = "#f59e0b";
const AFB_COLOR = "#ef4444";

// ─── Helpers: extract strafe / g-force / turning values ──────────────────────
function getStrafeVals(s: any) {
  const fwd = s.accelForward ?? 0, bwd = s.accelBackward ?? 0;
  const up = s.accelUp ?? 0, down = s.accelDown ?? 0;
  const strafe = s.accelStrafe ?? 0;
  const scmSpd = s.scmSpeed ?? 1;
  const bFwd = s.boostSpeedForward ?? scmSpd;
  const bBwd = s.boostSpeedBackward ?? scmSpd;
  const rF = scmSpd > 0 ? Math.min(bFwd / scmSpd, 3) : 1.5;
  const rB = scmSpd > 0 ? Math.min(bBwd / scmSpd, 3) : 1.3;
  const mU = s.boostMultUp ?? 1.3;
  const mS = s.boostMultStrafe ?? 1.3;
  return {
    scm: { fwd, bwd, up, down, strafe },
    afb: { fwd: fwd * rF, bwd: bwd * rB, up: up * mU, down: down * mU, strafe: strafe * mS },
  };
}
function getGForceVals(s: any) {
  const G = 9.81;
  const fwd = s.accelForwardG ?? (s.accelForward ?? 0) / G;
  const bwd = s.accelBackwardG ?? (s.accelBackward ?? 0) / G;
  const up = s.accelUpG ?? (s.accelUp ?? 0) / G;
  const down = s.accelDownG ?? (s.accelDown ?? 0) / G;
  const strafe = s.accelStrafeG ?? (s.accelStrafe ?? 0) / G;
  const scmSpd = s.scmSpeed ?? 1;
  const bFwd = s.boostSpeedForward ?? scmSpd;
  const bBwd = s.boostSpeedBackward ?? scmSpd;
  const rF = scmSpd > 0 ? Math.min(bFwd / scmSpd, 3) : 1.5;
  const rB = scmSpd > 0 ? Math.min(bBwd / scmSpd, 3) : 1.3;
  const mU = s.boostMultUp ?? 1.3;
  const mS = s.boostMultStrafe ?? 1.3;
  return {
    scm: { fwd, bwd, up, down, strafe },
    afb: { fwd: fwd * rF, bwd: bwd * rB, up: up * mU, down: down * mU, strafe: strafe * mS },
  };
}
function getTurningVals(s: any) {
  return {
    scm: { pitch: s.pitchRate ?? 0, yaw: s.yawRate ?? 0, roll: s.rollRate ?? 0 },
    afb: {
      pitch: s.boostedPitch ?? s.pitchRate ?? 0,
      yaw:   s.boostedYaw   ?? s.yawRate   ?? 0,
      roll:  s.boostedRoll  ?? s.rollRate  ?? 0,
    },
  };
}

type StrafeTriple = { fwd: number; bwd: number; up: number; down: number; strafe: number };
type TurningTriple = { pitch: number; yaw: number; roll: number };

// =============================================================================
// Sub-chart: Isometric 3D (6-axis — strafe / g-force)
// =============================================================================
function Isometric3D({ scm, afb }: { scm: StrafeTriple; afb: StrafeTriple }) {
  const W = 220, H = 220;
  const cx = W / 2, cy = H / 2 + 4;

  const allVals = [
    scm.fwd, scm.bwd, scm.up, scm.down, scm.strafe,
    afb.fwd, afb.bwd, afb.up, afb.down, afb.strafe,
  ].filter(v => v > 0);
  const maxVal = Math.max(...allVals, 1);
  const pixScale = 70 / maxVal;

  const ix = { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };
  const iz = { x: -Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };
  const iy = { x: 0, y: -1 };

  const project = (x: number, y: number, z: number) => ({
    px: cx + (x * ix.x + z * iz.x + y * iy.x) * pixScale,
    py: cy + (x * ix.y + z * iz.y + y * iy.y) * pixScale,
  });

  const axLen = maxVal * 1.05;
  const xPos = project( axLen, 0, 0);
  const xNeg = project(-axLen, 0, 0);
  const yPos = project(0,  axLen, 0);
  const zPos = project(0, 0,  axLen);
  const zNeg = project(0, 0, -axLen);

  const scmPts = [
    project(scm.strafe, 0, 0), project(0, scm.up,    0), project(0, 0,  scm.fwd),
    project(-scm.strafe, 0, 0), project(0, -scm.down, 0), project(0, 0, -scm.bwd),
  ];
  const afbPts = [
    project(afb.strafe, 0, 0), project(0, afb.up,    0), project(0, 0,  afb.fwd),
    project(-afb.strafe, 0, 0), project(0, -afb.down, 0), project(0, 0, -afb.bwd),
  ];

  const edges: [number, number][] = [
    [0,1],[0,2],[0,4],[0,5],[1,2],[1,3],[1,5],[2,4],[3,4],[3,5],[2,3],[4,5],
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", overflow: "hidden" }}>
      <line x1={xNeg.px} y1={xNeg.py} x2={xPos.px} y2={xPos.py} stroke="#3f3f46" strokeWidth={0.5} />
      <line x1={cx} y1={project(0, axLen, 0).py} x2={cx} y2={project(0, -axLen * 0.6, 0).py} stroke="#3f3f46" strokeWidth={0.5} />
      <line x1={zNeg.px} y1={zNeg.py} x2={zPos.px} y2={zPos.py} stroke="#3f3f46" strokeWidth={0.5} />
      {[
        { p: xPos, text: "Strafe", dx: 3, dy: 3 },
        { p: zPos, text: "Fwd",    dx: -7, dy: 10 },
        { p: zNeg, text: "Bwd",    dx: 2, dy: -3 },
        { p: yPos, text: "Up",     dx: 3, dy: 2 },
      ].map((item, i) => (
        <text key={`al-${i}`} x={item.p.px + item.dx} y={item.p.py + item.dy}
          style={{ fontSize: "6.5px", fontFamily: "monospace", fill: "#52525b" }}>{item.text}</text>
      ))}
      {edges.map(([a, b], i) => (
        <line key={`ae-${i}`} x1={afbPts[a].px} y1={afbPts[a].py} x2={afbPts[b].px} y2={afbPts[b].py}
          stroke={AFB_COLOR} strokeWidth={0.8} opacity={0.5} />
      ))}
      {edges.map(([a, b], i) => (
        <line key={`se-${i}`} x1={scmPts[a].px} y1={scmPts[a].py} x2={scmPts[b].px} y2={scmPts[b].py}
          stroke={SCM_COLOR} strokeWidth={1.2} opacity={0.85} />
      ))}
      {scmPts.map((p, i) => <circle key={`sv-${i}`} cx={p.px} cy={p.py} r={1.8} fill={SCM_COLOR} />)}
      {afbPts.map((p, i) => <circle key={`av-${i}`} cx={p.px} cy={p.py} r={1.3} fill={AFB_COLOR} opacity={0.5} />)}
    </svg>
  );
}

// =============================================================================
// Sub-chart: Hex radar (6-axis — strafe / g-force)
// =============================================================================
function HexRadar({ scm, afb, unit = "" }: { scm: StrafeTriple; afb: StrafeTriple; unit?: string }) {
  const axes = [
    { label: "Fwd",      scm: scm.fwd,    afb: afb.fwd    },
    { label: "Strafe R", scm: scm.strafe, afb: afb.strafe },
    { label: "Down",     scm: scm.down,   afb: afb.down   },
    { label: "Bwd",      scm: scm.bwd,    afb: afb.bwd    },
    { label: "Strafe L", scm: scm.strafe, afb: afb.strafe },
    { label: "Up",       scm: scm.up,     afb: afb.up     },
  ];
  const globalMax = Math.max(...axes.map(a => Math.max(a.scm, a.afb)), 1);
  const size = 220;
  const cx = size / 2, cy = size / 2;
  const radius = size * 0.30;
  const n = 6;
  const step = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;
  const gridLevels = 4;

  const ptAt = (i: number, r: number) => {
    const a = startAngle + i * step;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const polyPts = (vals: number[]) => vals.map((v, i) => {
    const norm = globalMax > 0 ? Math.min(1, v / globalMax) : 0;
    const p = ptAt(i, norm * radius);
    return `${p.x},${p.y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: "100%", height: "auto", overflow: "hidden" }}>
      {Array.from({ length: gridLevels }, (_, i) => {
        const lv = (i + 1) / gridLevels;
        const ring = Array.from({ length: n }, (_, j) => ptAt(j, lv * radius));
        return <polygon key={`g-${i}`} points={ring.map(p => `${p.x},${p.y}`).join(" ")}
          fill="none" stroke="#3f3f46" strokeWidth={0.5} opacity={0.35} />;
      })}
      {axes.map((_, i) => {
        const p = ptAt(i, radius);
        return <line key={`ax-${i}`} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#3f3f46" strokeWidth={0.5} opacity={0.25} />;
      })}
      <polygon points={polyPts(axes.map(a => a.afb))} fill={AFB_COLOR} fillOpacity={0.06}
        stroke={AFB_COLOR} strokeWidth={1} strokeLinejoin="round" strokeDasharray="3,2" opacity={0.6} />
      <polygon points={polyPts(axes.map(a => a.scm))} fill={SCM_COLOR} fillOpacity={0.15}
        stroke={SCM_COLOR} strokeWidth={1.4} strokeLinejoin="round" />
      {axes.map((a, i) => {
        const norm = globalMax > 0 ? Math.min(1, a.scm / globalMax) : 0;
        const p = ptAt(i, norm * radius);
        return a.scm > 0 ? <circle key={`sv-${i}`} cx={p.x} cy={p.y} r={2} fill={SCM_COLOR} stroke="#18181b" strokeWidth={0.5} /> : null;
      })}
      {axes.map((a, i) => {
        const labelR = radius + 14;
        const p = ptAt(i, labelR);
        const anchor = p.x > cx + 5 ? "start" : p.x < cx - 5 ? "end" : "middle";
        return (
          <g key={`al-${i}`}>
            <text x={p.x} y={p.y - 2} textAnchor={anchor}
              style={{ fontSize: "7px", fontFamily: "monospace", fill: "#a1a1aa", fontWeight: 600 }}>{a.label}</text>
            <text x={p.x} y={p.y + 7} textAnchor={anchor}
              style={{ fontSize: "6.5px", fontFamily: "monospace", fill: SCM_COLOR }}>
              {a.scm > 0 ? `${a.scm >= 10 ? Math.round(a.scm) : a.scm.toFixed(1)}${unit}` : "—"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// =============================================================================
// Sub-chart: Tri radar (3-axis — turning: pitch / yaw / roll)
// =============================================================================
function TriRadar({ scm, afb }: { scm: TurningTriple; afb: TurningTriple }) {
  const axes = [
    { label: "Pitch", scm: scm.pitch, afb: afb.pitch },
    { label: "Yaw",   scm: scm.yaw,   afb: afb.yaw   },
    { label: "Roll",  scm: scm.roll,  afb: afb.roll  },
  ];
  const globalMax = Math.max(...axes.map(a => Math.max(a.scm, a.afb)), 1);
  const size = 220;
  const cx = size / 2, cy = size / 2;
  const radius = size * 0.28;
  const labelR = size * 0.42;
  const step = (2 * Math.PI) / 3;
  const start = -Math.PI / 2;
  const gridLevels = 4;

  const normScm = axes.map(a => Math.min(1, a.scm / globalMax));
  const normAfb = axes.map(a => Math.min(1, a.afb / globalMax));

  const pts = (vals: number[]) => vals.map((v, i) => {
    const a = start + i * step;
    const r = v * radius;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: "100%", height: "auto", overflow: "hidden" }}>
      {Array.from({ length: gridLevels }, (_, i) => {
        const lv = (i + 1) / gridLevels;
        const p = axes.map((_, j) => {
          const a = start + j * step;
          const r = lv * radius;
          return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
        }).join(" ");
        return <polygon key={`g-${i}`} points={p} fill="none" stroke="#3f3f46" strokeWidth={0.5} opacity={0.35} />;
      })}
      {axes.map((_, i) => {
        const a = start + i * step;
        return <line key={`ax-${i}`} x1={cx} y1={cy} x2={cx + radius * Math.cos(a)} y2={cy + radius * Math.sin(a)}
          stroke="#3f3f46" strokeWidth={0.5} opacity={0.25} />;
      })}
      <polygon points={pts(normAfb)} fill={AFB_COLOR} fillOpacity={0.08} stroke={AFB_COLOR}
        strokeWidth={1} strokeLinejoin="round" strokeDasharray="3,2" opacity={0.65} />
      <polygon points={pts(normScm)} fill={SCM_COLOR} fillOpacity={0.15} stroke={SCM_COLOR}
        strokeWidth={1.4} strokeLinejoin="round" />
      {normScm.map((v, i) => {
        const a = start + i * step;
        const r = v * radius;
        return <circle key={`sv-${i}`} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={2}
          fill={SCM_COLOR} stroke="#18181b" strokeWidth={0.6} />;
      })}
      {axes.map((ax, i) => {
        const a = start + i * step;
        const lx = cx + labelR * Math.cos(a);
        const ly = cy + labelR * Math.sin(a);
        const anchor: "start" | "end" | "middle" =
          Math.cos(a) > 0.3 ? "start" : Math.cos(a) < -0.3 ? "end" : "middle";
        const hasBoost = ax.afb > ax.scm;
        return (
          <g key={`l-${i}`}>
            <text x={lx} y={ly - (hasBoost ? 7 : 3)} textAnchor={anchor} dominantBaseline="middle"
              style={{ fontSize: "8px", fontFamily: "monospace", fill: "#a1a1aa", fontWeight: 600 }}>{ax.label}</text>
            <text x={lx} y={ly + 4} textAnchor={anchor} dominantBaseline="middle"
              style={{ fontSize: "8px", fontFamily: "monospace", fill: SCM_COLOR, fontWeight: 600 }}>
              {ax.scm > 0 ? `${Math.round(ax.scm)}°/s` : "—"}
            </text>
            {hasBoost && (
              <text x={lx} y={ly + 13} textAnchor={anchor} dominantBaseline="middle"
                style={{ fontSize: "7.5px", fontFamily: "monospace", fill: AFB_COLOR, fontWeight: 500, opacity: 0.85 }}>
                {Math.round(ax.afb)}°/s
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// =============================================================================
// Sub-chart: Vertical Bars — NUEVA vista (Fase G.1)
//   Barras verticales pareadas SCM vs AFB por eje. Comparación directa de
//   magnitudes — pedido por Pablo como vista rápida.
// =============================================================================
function VerticalBars({
  axes,
  unit = "",
  valueFmt,
}: {
  axes: { label: string; scm: number; afb: number }[];
  unit?: string;
  valueFmt?: (v: number) => string;
}) {
  const W = 220, H = 210;
  const padL = 22, padR = 6, padT = 18, padB = 24;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxVal = Math.max(...axes.flatMap(a => [a.scm, a.afb]), 1) * 1.08;

  const nAxes = axes.length;
  const groupW = chartW / nAxes;
  const barW = Math.min(13, groupW * 0.32);
  const gap = 2;

  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (i / tickCount) * maxVal);

  const fmt = valueFmt ?? ((v: number) => (v >= 10 ? String(Math.round(v)) : v.toFixed(1)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", overflow: "hidden" }}>
      {/* Grid + Y tick labels */}
      {ticks.map((t, i) => {
        const y = padT + chartH - (t / maxVal) * chartH;
        return (
          <g key={`t-${i}`}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#3f3f46" strokeWidth={0.5} opacity={0.3} />
            <text x={padL - 2} y={y + 2.2} textAnchor="end"
              style={{ fontSize: "6px", fontFamily: "monospace", fill: "#52525b" }}>
              {Math.round(t)}{unit}
            </text>
          </g>
        );
      })}
      <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH} stroke="#52525b" strokeWidth={0.7} />
      {/* Bars + labels */}
      {axes.map((a, i) => {
        const center = padL + i * groupW + groupW / 2;
        const xScm = center - (barW + gap / 2);
        const xAfb = center + gap / 2;
        const hScm = (a.scm / maxVal) * chartH;
        const hAfb = (a.afb / maxVal) * chartH;
        const yBase = padT + chartH;
        return (
          <g key={`b-${i}`}>
            <rect x={xScm} y={yBase - hScm} width={barW} height={hScm} fill={SCM_COLOR} opacity={0.85} />
            <rect x={xAfb} y={yBase - hAfb} width={barW} height={hAfb} fill={AFB_COLOR} opacity={0.55} />
            {a.scm > 0 && (
              <text x={xScm + barW / 2} y={yBase - hScm - 2} textAnchor="middle"
                style={{ fontSize: "6px", fontFamily: "monospace", fill: SCM_COLOR, fontWeight: 700 }}>
                {fmt(a.scm)}
              </text>
            )}
            {a.afb > 0 && a.afb !== a.scm && (
              <text x={xAfb + barW / 2} y={yBase - hAfb - 2} textAnchor="middle"
                style={{ fontSize: "6px", fontFamily: "monospace", fill: AFB_COLOR, fontWeight: 600, opacity: 0.9 }}>
                {fmt(a.afb)}
              </text>
            )}
            <text x={center} y={yBase + 9} textAnchor="middle"
              style={{ fontSize: "7px", fontFamily: "monospace", fill: "#a1a1aa", fontWeight: 600 }}>
              {a.label}
            </text>
          </g>
        );
      })}
      {/* Legend (top-left) */}
      <rect x={padL} y={3} width={5} height={5} rx={1} fill={SCM_COLOR} opacity={0.85} />
      <text x={padL + 8} y={8} style={{ fontSize: "6.5px", fontFamily: "monospace", fill: "#71717a" }}>SCM</text>
      <rect x={padL + 28} y={3} width={5} height={5} rx={1} fill={AFB_COLOR} opacity={0.55} />
      <text x={padL + 36} y={8} style={{ fontSize: "6.5px", fontFamily: "monospace", fill: "#71717a" }}>AFB</text>
    </svg>
  );
}

// =============================================================================
// Sub-panel renderers per view
// =============================================================================
function StrafePanel({ view, shipData }: { view: View; shipData: any }) {
  const vals = getStrafeVals(shipData);
  if (view === "3d")    return <Isometric3D scm={vals.scm} afb={vals.afb} />;
  if (view === "radar") return <HexRadar scm={vals.scm} afb={vals.afb} />;
  return (
    <VerticalBars
      axes={[
        { label: "Fwd",    scm: vals.scm.fwd,    afb: vals.afb.fwd    },
        { label: "Bwd",    scm: vals.scm.bwd,    afb: vals.afb.bwd    },
        { label: "Up",     scm: vals.scm.up,     afb: vals.afb.up     },
        { label: "Down",   scm: vals.scm.down,   afb: vals.afb.down   },
        { label: "Strafe", scm: vals.scm.strafe, afb: vals.afb.strafe },
      ]}
    />
  );
}

function TurningPanel({ view, shipData }: { view: View; shipData: any }) {
  const vals = getTurningVals(shipData);
  if (view === "bars") {
    return (
      <VerticalBars
        axes={[
          { label: "Pitch", scm: vals.scm.pitch, afb: vals.afb.pitch },
          { label: "Yaw",   scm: vals.scm.yaw,   afb: vals.afb.yaw   },
          { label: "Roll",  scm: vals.scm.roll,  afb: vals.afb.roll  },
        ]}
        unit="°"
        valueFmt={(v) => String(Math.round(v))}
      />
    );
  }
  // 3D no tiene sentido para 3 ejes puros — mostramos el mismo tri-radar tanto
  // para "3d" como para "radar" (es la única vista nativa de turning).
  return <TriRadar scm={vals.scm} afb={vals.afb} />;
}

function GForcePanel({ view, shipData }: { view: View; shipData: any }) {
  const vals = getGForceVals(shipData);
  if (view === "3d")    return <Isometric3D scm={vals.scm} afb={vals.afb} />;
  if (view === "radar") return <HexRadar scm={vals.scm} afb={vals.afb} unit="G" />;
  return (
    <VerticalBars
      axes={[
        { label: "Fwd",    scm: vals.scm.fwd,    afb: vals.afb.fwd    },
        { label: "Bwd",    scm: vals.scm.bwd,    afb: vals.afb.bwd    },
        { label: "Up",     scm: vals.scm.up,     afb: vals.afb.up     },
        { label: "Down",   scm: vals.scm.down,   afb: vals.afb.down   },
        { label: "Strafe", scm: vals.scm.strafe, afb: vals.afb.strafe },
      ]}
      unit="G"
      valueFmt={(v) => (v >= 10 ? String(Math.round(v)) : v.toFixed(1))}
    />
  );
}

// =============================================================================
// View toggle + 3-col layout
// =============================================================================
function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[8px] font-mono rounded transition-colors ${
        active ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"
      }`}
    >
      {children}
    </button>
  );
}

function SubPanelHeader({ title }: { title: string }) {
  return (
    <div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase text-center pb-1">
      {title}
    </div>
  );
}

function FlightDynamicsTabs({ shipData }: { shipData: any }) {
  const [view, setView] = useState<View>("radar");
  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-3">
      {/* View toggle (compartido entre los 3 sub-paneles) */}
      <div className="flex justify-end mb-2">
        <div className="flex gap-0.5 bg-zinc-800/60 rounded p-0.5">
          <ToggleButton active={view === "3d"}    onClick={() => setView("3d")}>3D</ToggleButton>
          <ToggleButton active={view === "radar"} onClick={() => setView("radar")}>Radar</ToggleButton>
          <ToggleButton active={view === "bars"}  onClick={() => setView("bars")}>Bars</ToggleButton>
        </div>
      </div>

      {/* 3 sub-paneles en columnas iguales */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col">
          <SubPanelHeader title="Strafe" />
          <div className="flex items-center justify-center">
            <StrafePanel view={view} shipData={shipData} />
          </div>
        </div>
        <div className="flex flex-col">
          <SubPanelHeader title="Turning" />
          <div className="flex items-center justify-center">
            <TurningPanel view={view} shipData={shipData} />
          </div>
        </div>
        <div className="flex flex-col">
          <SubPanelHeader title="G-Forces" />
          <div className="flex items-center justify-center">
            <GForcePanel view={view} shipData={shipData} />
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Store-connected export
// =============================================================================
export const FlightDynamicsContent = memo(function FlightDynamicsContent() {
  const shipInfo = useLoadoutStore(s => s.shipInfo);
  if (!shipInfo) return null;
  return <FlightDynamicsTabs shipData={shipInfo as any} />;
});
