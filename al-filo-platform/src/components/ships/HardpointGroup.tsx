// =============================================================================
// AL FILO — HardpointGroup Component
// Renderiza un grupo lógico de hardpoints (Ofensivos, Defensivos, etc.)
// con sus items equipados y una estadística clave por componente.
// =============================================================================

"use client";

import { HARDPOINT_COLORS } from "@/types/ships";
import type { HardpointWithEquipped } from "@/types/ships";

interface HardpointGroupProps {
  title: string;
  icon: string;
  hardpoints: HardpointWithEquipped[];
}

export function HardpointGroup({ title, icon, hardpoints }: HardpointGroupProps) {
  if (hardpoints.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Header del grupo */}
      <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/40">
        <span className="text-base opacity-50">{icon}</span>
        <h3 className="text-[11px] tracking-[0.18em] uppercase text-zinc-400 font-medium">
          {title}
        </h3>
        <span className="text-[10px] text-zinc-700 font-mono ml-auto">
          {hardpoints.length}x
        </span>
      </div>

      {/* Lista de hardpoints */}
      <div className="space-y-1">
        {hardpoints.map((hp) => (
          <HardpointRow key={hp.id} hardpoint={hp} />
        ))}
      </div>
    </div>
  );
}

// ── Fila individual de hardpoint ──
function HardpointRow({ hardpoint }: { hardpoint: HardpointWithEquipped }) {
  const hp = hardpoint;
  const equipped = hp.equippedItem;
  const stats = equipped?.componentStats;
  const catColor = HARDPOINT_COLORS[hp.category] || "#71717a";

  // Determinar la stat clave según la categoría del hardpoint
  const keyStat = getKeyStat(hp.category, stats);

  return (
    <div className="group flex items-center gap-3 py-2.5 px-3 rounded-sm bg-zinc-900/30 border border-transparent hover:bg-zinc-900/50 hover:border-zinc-800/50 transition-all duration-200">
      {/* ── Indicador de categoría ── */}
      <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
        <div
          className="w-1 h-6 rounded-full opacity-50 group-hover:opacity-80 transition-opacity"
          style={{ backgroundColor: catColor }}
        />
      </div>

      {/* ── Slot info ── */}
      <div className="flex-shrink-0 w-16 text-center">
        <div className="text-[10px] tracking-[0.12em] text-zinc-600 uppercase">
          {hp.isFixed ? "Fixed" : "Gimbal"}
        </div>
        <div className="font-mono text-sm text-zinc-400">
          S{hp.maxSize || "?"}
        </div>
      </div>

      {/* ── Separador vertical ── */}
      <div className="w-px h-8 bg-zinc-800/40 flex-shrink-0" />

      {/* ── Item equipado ── */}
      <div className="flex-1 min-w-0">
        {equipped ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-200 truncate">
                {equipped.localizedName || equipped.name}
              </span>
              {equipped.grade && (
                <GradeBadge grade={equipped.grade} />
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-zinc-600 tracking-wide">
                {equipped.manufacturer || "Unknown Mfr"}
              </span>
              {equipped.size != null && (
                <span className="text-[10px] text-zinc-700 font-mono">
                  Size {equipped.size}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-600 italic">Vacío</span>
            <span className="text-[10px] text-zinc-700 font-mono">
              S{hp.minSize}–S{hp.maxSize}
            </span>
          </div>
        )}
      </div>

      {/* ── Stat clave ── */}
      {keyStat && (
        <div className="flex-shrink-0 text-right pl-2">
          <div className="font-mono text-sm" style={{ color: catColor }}>
            {keyStat.value}
          </div>
          <div className="text-[9px] tracking-[0.12em] uppercase text-zinc-600">
            {keyStat.label}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Badge de grado (A, B, C, D) ──
function GradeBadge({ grade }: { grade: string }) {
  const gradeColors: Record<string, string> = {
    A: "text-amber-400 border-amber-400/30",
    B: "text-cyan-400 border-cyan-400/30",
    C: "text-zinc-400 border-zinc-500/30",
    D: "text-zinc-600 border-zinc-700/30",
  };

  const cls = gradeColors[grade.toUpperCase()] || "text-zinc-500 border-zinc-700/30";

  return (
    <span className={`text-[9px] font-mono font-bold tracking-wider px-1.5 py-px rounded-sm border ${cls}`}>
      {grade.toUpperCase()}
    </span>
  );
}

// ── Extraer la estadística más relevante según categoría ──
function getKeyStat(
  category: string,
  stats: HardpointWithEquipped["equippedItem"] extends { componentStats: infer T } ? T : null | undefined
): { value: string; label: string } | null {
  if (!stats) return null;

  switch (category) {
    case "WEAPON":
    case "TURRET":
      if (stats.dps) return { value: `${stats.dps.toFixed(1)}`, label: "DPS" };
      if (stats.alphaDamage) return { value: `${stats.alphaDamage.toFixed(0)}`, label: "Alpha" };
      break;

    case "MISSILE_RACK":
      if (stats.alphaDamage) return { value: `${stats.alphaDamage.toFixed(0)}`, label: "DMG" };
      break;

    case "SHIELD":
      if (stats.shieldHp || stats.maxHp) return { value: formatCompact(stats.shieldHp ?? stats.maxHp), label: "HP" };
      if (stats.pool_hp) return { value: formatCompact(stats.pool_hp), label: "HP" };
      break;

    case "POWER_PLANT":
      if (stats.powerOutput) return { value: formatCompact(stats.powerOutput), label: "Output" };
      break;

    case "COOLER":
      if (stats.coolingRate) return { value: formatCompact(stats.coolingRate), label: "Cool" };
      break;

    case "QUANTUM_DRIVE":
      if (stats.quantumSpeed) return { value: `${(stats.quantumSpeed / 1000000).toFixed(0)}M`, label: "m/s" };
      if (stats.quantumSpoolUp) return { value: `${stats.quantumSpoolUp.toFixed(1)}s`, label: "Spool" };
      break;

    default:
      if (stats.powerDraw) return { value: formatCompact(stats.powerDraw), label: "Power" };
  }

  return null;
}

function formatCompact(val: number): string {
  if (val >= 10000) return `${(val / 1000).toFixed(1)}k`;
  if (val >= 1000) return `${(val / 1000).toFixed(2)}k`;
  return val.toFixed(0);
}
