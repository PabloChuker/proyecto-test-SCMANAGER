"use client";

// =============================================================================
// SC LABS — StatsPanel v2 (Erkul-inspired with Radar Charts)
//
// Replaces bar charts with SVG radar/spider charts for:
//   - Acceleration profile (8-axis)
//   - Angular rates / maneuverability (3-axis triangle)
// Plus compact combat stats and signatures.
// =============================================================================

import { useLoadoutStore } from "@/store/useLoadoutStore";
import { RadarChart } from "@/components/shared/charts/RadarChart";
import { PowerStatusGrid } from "./PowerStatusGrid";

const fmt = (v: number) => {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 10_000) return (v / 1_000).toFixed(1) + "K";
  if (v >= 1_000) return (v / 1_000).toFixed(2) + "K";
  return v.toFixed(v % 1 === 0 ? 0 : 1);
};

export function StatsPanel() {
  const { shipInfo, getStats, flightMode } = useLoadoutStore();
  const stats = getStats();

  if (!shipInfo) return null;

  // Ship extended data from the API (may include extra fields)
  const shipData = (shipInfo as any);

  // ── Acceleration radar axes ──
  const accelAxes = [
    { label: "Forward", value: shipData.accelForward ?? 0, max: 30, displayValue: fmtAccel(shipData.accelForward) },
    { label: "Up", value: shipData.accelUp ?? 0, max: 25 },
    { label: "Strafe", value: shipData.accelStrafe ?? 0, max: 25 },
    { label: "Down", value: shipData.accelDown ?? 0, max: 25 },
    { label: "Backward", value: shipData.accelBackward ?? 0, max: 30 },
    { label: "Roll Accel.", value: shipData.rollAccel ?? (shipInfo.rollRate ? shipInfo.rollRate * 0.5 : 0), max: 150 },
    { label: "Yaw Accel.", value: shipData.yawAccel ?? (shipInfo.yawRate ? shipInfo.yawRate * 0.3 : 0), max: 50 },
    { label: "Pitch Accel.", value: shipData.pitchAccel ?? (shipInfo.pitchRate ? shipInfo.pitchRate * 0.3 : 0), max: 50 },
  ];

  // ── Angular rates radar axes (triangle) ──
  const angularAxes = [
    { label: "Pitch", value: shipInfo.pitchRate ?? 0, max: 120, displayValue: `${Math.round(shipInfo.pitchRate ?? 0)}` },
    { label: "Yaw", value: shipInfo.yawRate ?? 0, max: 120, displayValue: `${Math.round(shipInfo.yawRate ?? 0)}` },
    { label: "Roll", value: shipInfo.rollRate ?? 0, max: 250, displayValue: `${Math.round(shipInfo.rollRate ?? 0)}` },
  ];

  // ── Combat stats for compact display ──
  const combatStats = [
    { label: "BURST DPS", value: stats.burstDps, color: "#ef4444", locked: flightMode === "NAV" },
    { label: "SUSTAINED", value: stats.sustainedDps, color: "#fb923c", locked: flightMode === "NAV" },
    { label: "ALPHA", value: stats.totalAlpha, color: "#f97316", locked: flightMode === "NAV" },
    { label: "SHIELD HP", value: stats.shieldHp, color: "#3b82f6" },
    { label: "SH REGEN", value: stats.shieldRegen, color: "#60a5fa" },
  ];

  return (
    <div className="space-y-3">
      {/* ── Power Status Grid (Erkul-style) ── */}
      <PowerStatusGrid stats={stats} />

      {/* ── Radar Charts Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* Acceleration Profile */}
        <div className="bg-zinc-900/80 border border-zinc-800/60 p-4">
          <div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase mb-2 text-center">
            Acceleration Profile
          </div>
          <div className="flex justify-center">
            <RadarChart
              axes={accelAxes}
              size={240}
              color="#f59e0b"
              fillOpacity={0.12}
              gridLevels={5}
            />
          </div>
        </div>

        {/* Angular Rates (Maneuverability Triangle) */}
        <div className="bg-zinc-900/80 border border-zinc-800/60 p-4">
          <div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase mb-2 text-center">
            Maneuverability
          </div>
          <div className="flex justify-center">
            <RadarChart
              axes={angularAxes}
              size={240}
              color="#3b82f6"
              fillOpacity={0.15}
              strokeWidth={2.5}
              gridLevels={4}
            />
          </div>
        </div>
      </div>

      {/* ── Compact Combat + Signature Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {combatStats.map((s) => (
          <CompactStat
            key={s.label}
            label={s.label}
            value={fmt(s.value)}
            color={s.locked ? "#52525b" : s.color}
            locked={s.locked}
          />
        ))}
      </div>

      {/* ── Signatures & Flight ──
          Fase W.10 (2026-05-02): agregamos CS (Cross-Section, VerseTools §5.3)
          al lado de EM/IR. Si el valor es estimado (no hay base hull validado),
          se muestra con sufijo "EST" en gris. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <SignatureStat label="EM" value={stats.emSignature} max={20000} color="#a855f7" />
        <SignatureStat label="IR" value={stats.irSignature} max={20000} color="#f97316" />
        <SignatureStat
          label={stats.csIsEstimate ? "CS·EST" : "CS"}
          value={stats.csSignature}
          max={50000}
          color="#10b981"
        />
        <FlightStat label="SCM" value={shipInfo.scmSpeed} unit="m/s" />
        <FlightStat label="NAV" value={shipInfo.afterburnerSpeed} unit="m/s" />
      </div>

      {/* ── Hull Resistances (Erkul-style damage multipliers) ── */}
      {shipInfo.resistances && (
        <div className="bg-zinc-900/80 border border-zinc-800/60 p-3">
          <div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase mb-2 flex items-center justify-between">
            <span>Hull &amp; Resistances</span>
            {shipInfo.resistances.armorHp != null && (
              <span className="text-zinc-300 font-bold">
                ARMOR HP: <span className="text-amber-400">{fmt(shipInfo.resistances.armorHp)}</span>
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <ResistanceStat
              label="PHYSICAL"
              mult={shipInfo.resistances.dmgMultPhysical}
              color="#84cc16"
            />
            <ResistanceStat
              label="ENERGY"
              mult={shipInfo.resistances.dmgMultEnergy}
              color="#06b6d4"
            />
            <ResistanceStat
              label="DISTORTION"
              mult={shipInfo.resistances.dmgMultDistortion}
              color="#a855f7"
            />
          </div>
          {(shipInfo.resistances.crossSectionX != null ||
            shipInfo.resistances.baseEmSignature != null) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 pt-2 border-t border-zinc-800/60">
              {shipInfo.resistances.baseEmSignature != null && (
                <MiniStat label="BASE EM" value={fmt(shipInfo.resistances.baseEmSignature)} color="#a855f7" />
              )}
              {shipInfo.resistances.baseIrSignature != null && (
                <MiniStat label="BASE IR" value={fmt(shipInfo.resistances.baseIrSignature)} color="#f97316" />
              )}
              {shipInfo.resistances.crossSectionX != null &&
               shipInfo.resistances.crossSectionY != null &&
               shipInfo.resistances.crossSectionZ != null && (
                <MiniStat
                  label="CROSS-SECTION"
                  value={
                    `${Math.round(shipInfo.resistances.crossSectionX / 1000)}/${Math.round(shipInfo.resistances.crossSectionY / 1000)}/${Math.round(shipInfo.resistances.crossSectionZ / 1000)}k`
                  }
                  color="#94a3b8"
                />
              )}
              {shipInfo.resistances.sigMultElectromagnetic != null &&
                shipInfo.resistances.sigMultElectromagnetic !== 1 && (
                <MiniStat
                  label="SIG MULT"
                  value={`×${shipInfo.resistances.sigMultElectromagnetic.toFixed(2)}`}
                  color={shipInfo.resistances.sigMultElectromagnetic < 1 ? "#22c55e" : "#ef4444"}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtAccel(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  return v.toFixed(1) + "g";
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function CompactStat({ label, value, color, locked }: { label: string; value: string; color: string; locked?: boolean }) {
  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-2.5 relative overflow-hidden">
      {locked && (
        <div className="absolute inset-0 bg-zinc-950/50 z-10 flex items-center justify-center">
          <span className="text-[7px] font-mono text-zinc-600 tracking-wider uppercase">NAV</span>
        </div>
      )}
      <div className="text-[7px] font-mono text-zinc-600 tracking-[0.15em] uppercase">{label}</div>
      <div className="text-lg font-mono font-bold tabular-nums mt-0.5" style={{ color }}>{value}</div>
    </div>
  );
}

function SignatureStat({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const segments = 12;
  const filled = Math.round((pct / 100) * segments);

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-2.5">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[7px] font-mono text-zinc-600 tracking-[0.15em] uppercase">{label} SIG</span>
        <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color }}>{fmt(value)}</span>
      </div>
      <div className="flex gap-px">
        {Array.from({ length: segments }, (_, i) => (
          <div
            key={i}
            className="flex-1 h-1 rounded-[1px] transition-all duration-300"
            style={{
              backgroundColor: i < filled ? color : "#27272a",
              opacity: i < filled ? 0.6 : 0.3,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function FlightStat({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-2.5">
      <div className="text-[7px] font-mono text-zinc-600 tracking-[0.15em] uppercase">{label}</div>
      <div className="text-lg font-mono font-bold tabular-nums text-zinc-300 mt-0.5">
        {value != null && value > 0 ? Math.round(value) : "—"}
        <span className="text-[9px] text-zinc-600 font-normal"> {unit}</span>
      </div>
    </div>
  );
}

/** Damage multiplier. 1.0 = neutral, <1 = resistance, >1 = weakness.
 *  Displayed as "% reduction" (e.g. mult=0.75 → "25%") for readability. */
function ResistanceStat({ label, mult, color }: { label: string; mult: number | null; color: string }) {
  if (mult == null) {
    return (
      <div className="bg-zinc-950/60 border border-zinc-800/40 p-2">
        <div className="text-[7px] font-mono text-zinc-600 tracking-[0.15em] uppercase">{label}</div>
        <div className="text-sm font-mono text-zinc-600 mt-0.5">—</div>
      </div>
    );
  }
  const reductionPct = Math.round((1 - mult) * 100);
  const isResist = reductionPct > 0;
  const isWeak = reductionPct < 0;
  const displayColor = isResist ? color : isWeak ? "#ef4444" : "#52525b";
  const sign = isWeak ? "+" : "";
  return (
    <div className="bg-zinc-950/60 border border-zinc-800/40 p-2">
      <div className="text-[7px] font-mono text-zinc-600 tracking-[0.15em] uppercase">{label}</div>
      <div className="text-sm font-mono font-bold tabular-nums mt-0.5" style={{ color: displayColor }}>
        {reductionPct === 0 ? "0%" : `${sign}${Math.abs(reductionPct)}%`}
        <span className="text-[8px] text-zinc-600 font-normal ml-1">
          (×{mult.toFixed(2)})
        </span>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-zinc-950/60 border border-zinc-800/40 p-2">
      <div className="text-[7px] font-mono text-zinc-600 tracking-[0.15em] uppercase">{label}</div>
      <div className="text-xs font-mono font-bold tabular-nums mt-0.5" style={{ color }}>{value}</div>
    </div>
  );
}

const fmt2 = (v: number) => {
  if (v === 0) return "0";
  if (v >= 1000) return (v / 1000).toFixed(1) + "k";
  return v.toFixed(1);
};
