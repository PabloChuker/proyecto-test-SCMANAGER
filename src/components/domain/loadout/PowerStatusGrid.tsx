"use client";

// =============================================================================
// SC LABS — PowerStatusGrid (Erkul-style power/component status widget)
//
// Compact visual showing component health states as colored blocks,
// power balance indicator, shield regen, and stealth meter.
// =============================================================================

import { useLoadoutStore, type ComputedStats } from "@/store/useLoadoutStore";

const fmt = (v: number) => {
  if (Math.abs(v) >= 10000) return (v / 1000).toFixed(1) + "k";
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(2) + "k";
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(1);
};

interface PowerStatusGridProps {
  stats: ComputedStats;
}

export function PowerStatusGrid({ stats }: PowerStatusGridProps) {
  const { hardpoints, getEffectiveItem, isComponentOn } = useLoadoutStore();

  // Group hardpoints by category for the visual grid
  const weapons = hardpoints.filter(hp => ["WEAPON", "TURRET"].includes(hp.resolvedCategory));
  const missiles = hardpoints.filter(hp => hp.resolvedCategory === "MISSILE_RACK");
  const shields = hardpoints.filter(hp => hp.resolvedCategory === "SHIELD");
  const powerPlants = hardpoints.filter(hp => hp.resolvedCategory === "POWER_PLANT");
  const coolers = hardpoints.filter(hp => hp.resolvedCategory === "COOLER");
  const quantumDrives = hardpoints.filter(hp => hp.resolvedCategory === "QUANTUM_DRIVE");

  const powerPct = stats.powerOutput > 0
    ? Math.round((stats.powerDraw / stats.powerOutput) * 100)
    : 0;
  const powerColor = stats.powerBalance >= 0 ? "#22c55e" : "#ef4444";
  const isOverloaded = stats.powerBalance < 0;

  const thermalPct = stats.coolingRate > 0
    ? Math.round((stats.thermalOutput / stats.coolingRate) * 100)
    : 0;

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/60 p-3 space-y-3">
      {/* ── Component Block Grid ── */}
      <div className="space-y-1.5">
        {/* Weapons row */}
        {weapons.length > 0 && (
          <ComponentRow
            blocks={weapons}
            icon="▪"
            label="WPN"
            color="#eab308"
            getEffectiveItem={getEffectiveItem}
            isComponentOn={isComponentOn}
          />
        )}

        {/* Missiles row */}
        {missiles.length > 0 && (
          <ComponentRow
            blocks={missiles}
            icon="◆"
            label="MSL"
            color="#f97316"
            getEffectiveItem={getEffectiveItem}
            isComponentOn={isComponentOn}
          />
        )}

        {/* Shields row */}
        {shields.length > 0 && (
          <ComponentRow
            blocks={shields}
            icon="◇"
            label="SHD"
            color="#3b82f6"
            getEffectiveItem={getEffectiveItem}
            isComponentOn={isComponentOn}
          />
        )}

        {/* Power + Coolers row */}
        <div className="flex items-center gap-2">
          {powerPlants.length > 0 && (
            <ComponentRow
              blocks={powerPlants}
              icon="⚡"
              label="PWR"
              color="#22c55e"
              getEffectiveItem={getEffectiveItem}
              isComponentOn={isComponentOn}
              compact
            />
          )}
          {coolers.length > 0 && (
            <ComponentRow
              blocks={coolers}
              icon="❄"
              label="CLR"
              color="#06b6d4"
              getEffectiveItem={getEffectiveItem}
              isComponentOn={isComponentOn}
              compact
            />
          )}
          {quantumDrives.length > 0 && (
            <ComponentRow
              blocks={quantumDrives}
              icon="◈"
              label="QDR"
              color="#a855f7"
              getEffectiveItem={getEffectiveItem}
              isComponentOn={isComponentOn}
              compact
            />
          )}
        </div>
      </div>

      {/* ── Power Balance Indicator ── */}
      <div className="flex items-center gap-3">
        {/* Power */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={powerColor} strokeWidth={2}>
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[9px] font-mono text-zinc-500 tracking-wider">PWR</span>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="text-lg font-mono font-bold tabular-nums" style={{ color: powerColor }}>
                {stats.powerBalance >= 0 ? "+" : ""}{fmt(stats.powerBalance)}
              </span>
              <span className="text-[8px] font-mono text-zinc-600">
                /{fmt(stats.powerOutput)}
              </span>
              {isOverloaded && (
                <span className="text-[9px] text-red-500 ml-1">⚠</span>
              )}
            </div>
          </div>
          <PowerBar pct={powerPct} color={powerColor} />
        </div>

        {/* Shield Regen */}
        <div className="w-px h-8 bg-zinc-800/60" />
        <div className="text-center">
          <div className="flex items-center gap-1 justify-center">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth={2}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="text-sm font-mono font-bold tabular-nums text-blue-400">
              {fmt(stats.shieldRegen)}
            </span>
            <span className="text-[8px] font-mono text-zinc-600">
              /{fmt(stats.shieldHp / 1000)}k
            </span>
          </div>
          <span className="text-[7px] font-mono text-zinc-600 tracking-wider">REGEN</span>
        </div>
      </div>

      {/* ── Thermal / Stealth Meter ── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span className="text-[9px] font-mono text-zinc-500 tracking-wider">THERMAL</span>
          </div>
          <span className="text-[10px] font-mono tabular-nums" style={{ color: stats.thermalBalance >= 0 ? "#06b6d4" : "#ef4444" }}>
            {thermalPct}%
          </span>
        </div>
        <ThermalBar pct={thermalPct} />
      </div>

      {/* ── Component percentage row ── */}
      <div className="flex items-center justify-between text-[8px] font-mono text-zinc-600 border-t border-zinc-800/40 pt-2">
        {weapons.length > 0 && <span>{Math.round((weapons.filter(w => isComponentOn(w.hardpointName)).length / weapons.length) * 100)}%</span>}
        {missiles.length > 0 && <span>{Math.round((missiles.filter(m => isComponentOn(m.hardpointName)).length / missiles.length) * 100)}%</span>}
        {shields.length > 0 && <span>{Math.round((shields.filter(s => isComponentOn(s.hardpointName)).length / shields.length) * 100)}%</span>}
        <span className="ml-auto text-zinc-500">
          {stats.summary.activeComponents}/{stats.summary.totalComponents}
        </span>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ComponentRow({
  blocks, icon, label, color, getEffectiveItem, isComponentOn, compact,
}: {
  blocks: any[];
  icon: string;
  label: string;
  color: string;
  getEffectiveItem: (id: string) => any;
  isComponentOn: (name: string) => boolean;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[8px] font-mono text-zinc-600 w-6 tracking-wider">{label}</span>
      <div className="flex gap-0.5 flex-wrap">
        {blocks.map((hp) => {
          const item = getEffectiveItem(hp.id);
          const isOn = isComponentOn(hp.hardpointName);
          const hasItem = !!item;
          const blockSize = compact ? "w-3 h-3" : "w-4 h-4";

          return (
            <div
              key={hp.id}
              className={`${blockSize} rounded-[2px] transition-all duration-300 ${
                !hasItem
                  ? "bg-zinc-800/60 border border-zinc-700/30"
                  : isOn
                    ? "border border-transparent"
                    : "border border-zinc-600/40 opacity-40"
              }`}
              style={hasItem && isOn ? { backgroundColor: color, opacity: 0.85 } : hasItem ? { backgroundColor: color, opacity: 0.2 } : undefined}
              title={`${hp.hardpointName} S${hp.maxSize}${item ? ` — ${item.name}` : " — Empty"}`}
            >
              {hasItem && hp.maxSize > 0 && (
                <div className="w-full h-full flex items-center justify-center text-[6px] font-mono font-bold text-zinc-950/70">
                  {hp.maxSize}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PowerBar({ pct, color }: { pct: number; color: string }) {
  const clampedPct = Math.min(100, pct);
  const segments = 16;
  const filled = Math.round((clampedPct / 100) * segments);

  return (
    <div className="flex gap-px">
      {Array.from({ length: segments }, (_, i) => (
        <div
          key={i}
          className="flex-1 h-2 rounded-[1px] transition-all duration-300"
          style={{
            backgroundColor: i < filled ? color : "#27272a",
            opacity: i < filled ? (pct > 90 ? (i % 2 === 0 ? 0.9 : 0.5) : 0.7) : 0.4,
          }}
        />
      ))}
    </div>
  );
}

function ThermalBar({ pct }: { pct: number }) {
  const clampedPct = Math.min(100, pct);
  const segments = 20;
  const filled = Math.round((clampedPct / 100) * segments);

  return (
    <div className="flex gap-px">
      {Array.from({ length: segments }, (_, i) => {
        const segPct = (i / segments) * 100;
        let segColor = "#06b6d4"; // cool blue
        if (segPct > 80) segColor = "#ef4444"; // hot red
        else if (segPct > 60) segColor = "#f97316"; // warm orange
        else if (segPct > 40) segColor = "#eab308"; // yellow

        return (
          <div
            key={i}
            className="flex-1 h-1.5 rounded-[1px] transition-all duration-300"
            style={{
              backgroundColor: i < filled ? segColor : "#27272a",
              opacity: i < filled ? 0.7 : 0.3,
            }}
          />
        );
      })}
    </div>
  );
}
