"use client";

import { useLoadoutStore } from "@/store/useLoadoutStore";

/* ── Helpers ── */
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

  return (
    <div className="space-y-3">
      {/* ── Title ── */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-[9px] font-mono text-zinc-600 tracking-[0.2em] uppercase">
          Live Stats
        </span>
        <div className="flex-1 h-px bg-zinc-800/40" />
        <span className="text-[9px] font-mono text-amber-500/50 tracking-wider">
          {shipInfo.name}
        </span>
      </div>

      {/* ── Stat cards grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatCard
          label="Total DPS"
          value={fmt(stats.totalDps)}
          sub={`Alpha: ${fmt(stats.totalAlpha)}`}
          color="#ef4444"
          pct={Math.min(100, (stats.totalDps / 2000) * 100)}
          locked={flightMode === "NAV"}
        />
        <StatCard
          label="Shield HP"
          value={fmt(stats.shieldHp)}
          sub={`Regen: ${fmt(stats.shieldRegen)}/s`}
          color="#3b82f6"
          pct={Math.min(100, (stats.shieldHp / 50000) * 100)}
        />
        <StatCard
          label="Power Balance"
          value={(stats.powerBalance >= 0 ? "+" : "") + fmt(stats.powerBalance)}
          sub={`${fmt(stats.powerOutput)} out / ${fmt(stats.powerDraw)} draw`}
          color={stats.powerBalance >= 0 ? "#22c55e" : "#ef4444"}
          pct={stats.powerOutput > 0 ? Math.min(100, (stats.powerDraw / stats.powerOutput) * 100) : 0}
          inverted
        />
        <StatCard
          label="Thermal"
          value={(stats.thermalBalance >= 0 ? "+" : "") + fmt(stats.thermalBalance)}
          sub={`${fmt(stats.coolingRate)} cool / ${fmt(stats.thermalOutput)} heat`}
          color={stats.thermalBalance >= 0 ? "#06b6d4" : "#ef4444"}
          pct={stats.coolingRate > 0 ? Math.min(100, (stats.thermalOutput / stats.coolingRate) * 100) : 0}
          inverted
        />
        <StatCard
          label="EM Signature"
          value={fmt(stats.emSignature)}
          sub="Electromagnetic"
          color="#a855f7"
          pct={Math.min(100, (stats.emSignature / 15000) * 100)}
        />
        <StatCard
          label="IR Signature"
          value={fmt(stats.irSignature)}
          sub="Infrared"
          color="#f97316"
          pct={Math.min(100, (stats.irSignature / 15000) * 100)}
        />
      </div>

      {/* ── Bar graphs ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {/* Combat output breakdown */}
        <div className="bg-zinc-900/60 border border-zinc-800/50 p-3">
          <div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase mb-3">
            Combat Output
          </div>
          <div className="space-y-2">
            <HBar label="DPS" value={stats.totalDps} max={2000} color="#ef4444" />
            <HBar label="Alpha" value={stats.totalAlpha} max={5000} color="#f97316" />
            <HBar label="Shield HP" value={stats.shieldHp} max={100000} color="#3b82f6" />
            <HBar label="Shield Regen" value={stats.shieldRegen} max={3000} color="#60a5fa" />
          </div>
        </div>

        {/* Power & Thermal */}
        <div className="bg-zinc-900/60 border border-zinc-800/50 p-3">
          <div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase mb-3">
            Power & Thermal
          </div>
          <div className="space-y-2">
            <DualBar label="Power" pos={stats.powerOutput} neg={stats.powerDraw} posColor="#22c55e" negColor="#ef4444" />
            <DualBar label="Thermal" pos={stats.coolingRate} neg={stats.thermalOutput} posColor="#06b6d4" negColor="#ef4444" />
            <HBar label="EM Signature" value={stats.emSignature} max={20000} color="#a855f7" />
            <HBar label="IR Signature" value={stats.irSignature} max={20000} color="#f97316" />
          </div>
        </div>
      </div>

      {/* ── Component summary ── */}
      <div className="bg-zinc-900/60 border border-zinc-800/50 p-3">
        <div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase mb-3">
          Component Summary
        </div>
        <div className="flex flex-wrap gap-3">
          <CompBadge label="Weapons" count={stats.summary.weapons} color="#eab308" />
          <CompBadge label="Missiles" count={stats.summary.missiles} color="#f97316" />
          <CompBadge label="Shields" count={stats.summary.shields} color="#3b82f6" />
          <CompBadge label="Power Plants" count={stats.summary.powerPlants} color="#22c55e" />
          <CompBadge label="Coolers" count={stats.summary.coolers} color="#06b6d4" />
          <CompBadge label="QT Drives" count={stats.summary.quantumDrives} color="#a855f7" />
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-zinc-600">
              {stats.summary.activeComponents}/{stats.summary.totalComponents}
            </span>
            <span className="text-[8px] font-mono text-zinc-700 uppercase tracking-wider">active</span>
          </div>
        </div>
      </div>

      {/* ── Speed & Flight ── */}
      {shipInfo && (
        <div className="bg-zinc-900/60 border border-zinc-800/50 p-3">
          <div className="text-[9px] font-mono text-zinc-500 tracking-[0.2em] uppercase mb-3">
            Flight Characteristics
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <FlightStat label="SCM" value={shipInfo.scmSpeed} unit="m/s" />
            <FlightStat label="NAV" value={shipInfo.afterburnerSpeed} unit="m/s" />
            <FlightStat label="Pitch" value={shipInfo.pitchRate} unit="deg/s" />
            <FlightStat label="Yaw" value={shipInfo.yawRate} unit="deg/s" />
            <FlightStat label="Roll" value={shipInfo.rollRate} unit="deg/s" />
            <FlightStat label="Cargo" value={shipInfo.cargo} unit="SCU" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function StatCard({
  label, value, sub, color, pct, inverted, locked,
}: {
  label: string; value: string; sub: string; color: string;
  pct: number; inverted?: boolean; locked?: boolean;
}) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800/50 p-3 relative overflow-hidden">
      {locked && (
        <div className="absolute inset-0 bg-zinc-950/60 z-10 flex items-center justify-center">
          <span className="text-[8px] font-mono text-zinc-600 tracking-wider uppercase">NAV MODE</span>
        </div>
      )}
      <div className="text-[8px] font-mono text-zinc-600 tracking-[0.15em] uppercase mb-1">{label}</div>
      <div className="text-xl font-mono font-medium tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[9px] font-mono text-zinc-600 mt-0.5">{sub}</div>
      {/* Mini bar */}
      <div className="mt-2 h-1 w-full bg-zinc-800/60 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: inverted
              ? (pct > 90 ? "#ef4444" : pct > 70 ? "#eab308" : color)
              : color,
            opacity: 0.7,
          }}
        />
      </div>
    </div>
  );
}

function HBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-0.5">
        <span className="text-[8px] font-mono text-zinc-600 tracking-wider uppercase">{label}</span>
        <span className="text-[10px] font-mono tabular-nums" style={{ color }}>{fmt(value)}</span>
      </div>
      <div className="h-1.5 w-full bg-zinc-800/60 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }} />
      </div>
    </div>
  );
}

function DualBar({ label, pos, neg, posColor, negColor }: { label: string; pos: number; neg: number; posColor: string; negColor: string }) {
  const max = Math.max(pos, neg, 1);
  const posPct = (pos / max) * 100;
  const negPct = (neg / max) * 100;
  const balance = pos - neg;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-0.5">
        <span className="text-[8px] font-mono text-zinc-600 tracking-wider uppercase">{label}</span>
        <span className="text-[10px] font-mono tabular-nums" style={{ color: balance >= 0 ? posColor : negColor }}>
          {balance >= 0 ? "+" : ""}{fmt(balance)}
        </span>
      </div>
      <div className="flex gap-0.5">
        <div className="flex-1 h-1.5 bg-zinc-800/60 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${posPct}%`, backgroundColor: posColor, opacity: 0.6 }} />
        </div>
        <div className="flex-1 h-1.5 bg-zinc-800/60 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${negPct}%`, backgroundColor: negColor, opacity: 0.6 }} />
        </div>
      </div>
      <div className="flex justify-between text-[7px] font-mono text-zinc-700 mt-0.5">
        <span>{fmt(pos)} out</span>
        <span>{fmt(neg)} draw</span>
      </div>
    </div>
  );
}

function CompBadge({ label, count, color }: { label: string; count: number; color: string }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-800/30 border border-zinc-800/50 rounded-sm">
      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, opacity: 0.7 }} />
      <span className="text-[9px] font-mono text-zinc-400">{count}x</span>
      <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function FlightStat({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="text-center py-1.5 bg-zinc-800/20 rounded-sm">
      <div className="text-[7px] font-mono text-zinc-600 tracking-wider uppercase">{label}</div>
      <div className="text-[12px] font-mono text-zinc-300 tabular-nums">
        {value != null ? Math.round(value) : "—"}
        <span className="text-[8px] text-zinc-600"> {unit}</span>
      </div>
    </div>
  );
}
