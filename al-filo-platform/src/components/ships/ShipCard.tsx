// =============================================================================
// AL FILO — ShipCard Component
// Tarjeta individual de nave para la grilla. Estilo sci-fi con hover effects.
// =============================================================================

"use client";

import Link from "next/link";
import type { ShipListItem } from "@/types/ships";

// Mapeo de roles a iconos/indicadores visuales
const ROLE_INDICATORS: Record<string, { icon: string; color: string }> = {
  combat:     { icon: "⬡", color: "text-red-400" },
  fighter:    { icon: "⬡", color: "text-red-400" },
  mining:     { icon: "◇", color: "text-amber-400" },
  cargo:      { icon: "▣", color: "text-emerald-400" },
  transport:  { icon: "▣", color: "text-emerald-400" },
  freight:    { icon: "▣", color: "text-emerald-400" },
  exploration:{ icon: "◈", color: "text-cyan-400" },
  racing:     { icon: "△", color: "text-fuchsia-400" },
  medical:    { icon: "✚", color: "text-sky-400" },
  salvage:    { icon: "◎", color: "text-orange-400" },
  refueling:  { icon: "◉", color: "text-yellow-400" },
  repair:     { icon: "⚙", color: "text-teal-400" },
  stealth:    { icon: "◆", color: "text-violet-400" },
  military:   { icon: "⬡", color: "text-red-400" },
};

function getRoleIndicator(role?: string | null) {
  if (!role) return { icon: "◻", color: "text-zinc-500" };
  const key = role.toLowerCase();
  for (const [keyword, indicator] of Object.entries(ROLE_INDICATORS)) {
    if (key.includes(keyword)) return indicator;
  }
  return { icon: "◻", color: "text-zinc-500" };
}

export function ShipCard({ ship }: { ship: ShipListItem }) {
  const roleIndicator = getRoleIndicator(ship.ship?.role || ship.ship?.career);

  return (
    <Link href={`/ships/${ship.reference}`} className="group block">
      <article
        className="
          relative overflow-hidden rounded-sm
          bg-zinc-900/60 backdrop-blur-sm
          border border-zinc-800/70
          transition-all duration-300 ease-out
          hover:border-cyan-500/40
          hover:bg-zinc-900/80
          hover:shadow-[0_0_30px_-8px_rgba(6,182,212,0.15)]
        "
      >
        {/* ── Barra superior decorativa ── */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent
                        group-hover:via-cyan-500/60 transition-all duration-500" />

        <div className="p-5">
          {/* ── Header: Nombre + Manufacturer ── */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0 flex-1">
              <h3 className="
                font-medium tracking-wide text-zinc-100
                truncate text-[15px]
                group-hover:text-cyan-50 transition-colors duration-200
              ">
                {ship.localizedName || ship.name}
              </h3>
              <p className="text-[11px] tracking-[0.15em] uppercase text-zinc-500 mt-1
                            group-hover:text-zinc-400 transition-colors">
                {ship.manufacturer || "Unknown"}
              </p>
            </div>

            {/* Indicador de rol */}
            <span className={`
              text-lg ${roleIndicator.color} opacity-40
              group-hover:opacity-80 transition-opacity duration-300
            `}>
              {roleIndicator.icon}
            </span>
          </div>

          {/* ── Stats rápidos ── */}
          <div className="grid grid-cols-3 gap-1 mb-4">
            <StatChip label="SCM" value={formatSpeed(ship.ship?.maxSpeed)} />
            <StatChip label="CREW" value={ship.ship?.maxCrew?.toString() || "—"} />
            <StatChip label="SCU" value={formatCargo(ship.ship?.cargo)} />
          </div>

          {/* ── Footer: Rol + Versión ── */}
          <div className="flex items-center justify-between pt-3 border-t border-zinc-800/50">
            <span className="text-xs text-zinc-500 tracking-wide">
              {ship.ship?.role || ship.ship?.focus || ship.ship?.career || "Multi-role"}
            </span>
            <span className="
              text-[10px] text-zinc-600 font-mono
              px-1.5 py-0.5 rounded-sm bg-zinc-800/40
            ">
              v{ship.gameVersion}
            </span>
          </div>
        </div>

        {/* ── Efecto de esquina hover ── */}
        <div className="
          absolute bottom-0 right-0 w-8 h-8
          border-b border-r border-transparent
          group-hover:border-cyan-500/30
          transition-colors duration-500
        " />
        <div className="
          absolute top-0 left-0 w-8 h-8
          border-t border-l border-transparent
          group-hover:border-cyan-500/20
          transition-colors duration-500
        " />
      </article>
    </Link>
  );
}

// ── Chip de estadística ──
function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center py-1.5 rounded-sm bg-zinc-800/30">
      <div className="text-[10px] text-zinc-600 tracking-[0.12em] uppercase">{label}</div>
      <div className="text-[13px] text-zinc-300 font-mono mt-0.5">{value}</div>
    </div>
  );
}

// ── Formatters ──
function formatSpeed(speed?: number | null): string {
  if (!speed) return "—";
  return `${Math.round(speed)}`;
}

function formatCargo(cargo?: number | null): string {
  if (!cargo) return "—";
  if (cargo >= 1000) return `${(cargo / 1000).toFixed(1)}k`;
  return Math.round(cargo).toString();
}
