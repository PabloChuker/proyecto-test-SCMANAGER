// =============================================================================
// AL FILO — ShipCard v3
// Enhanced image visibility, MSRP + warbond prices
// =============================================================================

"use client";

import Link from "next/link";

interface ShipCardData {
  id: string;
  reference: string;
  name: string;
  localizedName: string | null;
  manufacturer: string | null;
  gameVersion: string;
  msrpUsd?: number | null;
  warbondUsd?: number | null;
  ship: {
    maxCrew: number | null;
    cargo: number | null;
    scmSpeed: number | null;
    afterburnerSpeed: number | null;
    role: string | null;
    focus: string | null;
    career: string | null;
  } | null;
}

const ROLE_INDICATORS: Record<string, { icon: string; color: string }> = {
  combat: { icon: "\u2B21", color: "text-red-400" },
  fighter: { icon: "\u2B21", color: "text-red-400" },
  mining: { icon: "\u25C7", color: "text-amber-400" },
  cargo: { icon: "\u25A3", color: "text-emerald-400" },
  transport: { icon: "\u25A3", color: "text-emerald-400" },
  freight: { icon: "\u25A3", color: "text-emerald-400" },
  exploration: { icon: "\u25C8", color: "text-cyan-400" },
  racing: { icon: "\u25B3", color: "text-fuchsia-400" },
  medical: { icon: "\u271A", color: "text-sky-400" },
  salvage: { icon: "\u25CE", color: "text-orange-400" },
  refueling: { icon: "\u25C9", color: "text-yellow-400" },
  repair: { icon: "\u2699", color: "text-teal-400" },
  stealth: { icon: "\u25C6", color: "text-violet-400" },
  military: { icon: "\u2B21", color: "text-red-400" },
};

function getRoleIndicator(role?: string | null) {
  if (!role) return { icon: "\u25FB", color: "text-zinc-500" };
  const key = role.toLowerCase();
  for (const [keyword, indicator] of Object.entries(ROLE_INDICATORS)) {
    if (key.includes(keyword)) return indicator;
  }
  return { icon: "\u25FB", color: "text-zinc-500" };
}

// ── Ship thumbnail URL helper ──
const MFR_PREFIXES = [
  "Aegis", "RSI", "Drake", "MISC", "Anvil", "Origin", "Crusader", "Argo",
  "Aopoa", "Consolidated Outland", "Esperia", "Gatac", "Greycat", "Kruger",
  "Musashi Industrial", "Tumbril", "Banu", "Vanduul", "Roberts Space Industries",
  "Crusader Industries", "Musashi", "CO",
];
function getShipThumbUrl(name: string, manufacturer?: string | null): string {
  let n = name || "";
  if (manufacturer) {
    const m = manufacturer.trim();
    if (n.startsWith(m + " ")) n = n.slice(m.length + 1);
  }
  for (const m of MFR_PREFIXES) {
    if (n.startsWith(m + " ")) { n = n.slice(m.length + 1); break; }
  }
  const slug = n.toLowerCase().replace(/[''()]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/-$/, "");
  return `/ships/${slug}.jpg`;
}

export function ShipCard({ ship }: { ship: ShipCardData }) {
  const roleIndicator = getRoleIndicator(ship.ship?.role || ship.ship?.career);
  const roleColor = roleIndicator.color;
  const thumbUrl = getShipThumbUrl(ship.name, ship.manufacturer);

  return (
    <Link href={"/ships/" + ship.reference} className="group block">
      <article className="relative overflow-hidden rounded-sm border border-zinc-800/70 transition-all duration-300 ease-out hover:border-cyan-500/40 hover:shadow-[0_0_30px_-8px_rgba(6,182,212,0.15)]">
        {/* Ship image — top half, more visible */}
        <div className="relative h-[110px] overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
            style={{ backgroundImage: `url(${thumbUrl})` }}
          />
          {/* Gradient fade into card body */}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/30 to-transparent" />
          {/* Role icon */}
          <span className={"absolute top-2 right-2.5 text-sm opacity-50 group-hover:opacity-90 transition-opacity duration-300 " + roleColor}>
            {roleIndicator.icon}
          </span>
          {/* Price badge */}
          {ship.msrpUsd != null && ship.msrpUsd > 0 && (
            <div className="absolute top-2 left-2.5 flex items-center gap-1.5">
              <span className="text-[10px] font-mono font-medium text-amber-400/90 bg-zinc-950/70 backdrop-blur-sm px-1.5 py-0.5 rounded-sm">
                ${ship.msrpUsd}
              </span>
              {ship.warbondUsd != null && ship.warbondUsd > 0 && ship.warbondUsd !== ship.msrpUsd && (
                <span className="text-[10px] font-mono text-emerald-400/80 bg-zinc-950/70 backdrop-blur-sm px-1.5 py-0.5 rounded-sm">
                  WB ${ship.warbondUsd}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Card body */}
        <div className="relative bg-zinc-900/80 backdrop-blur-sm">
          <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent group-hover:via-cyan-500/60 transition-all duration-500" />
          <div className="px-4 pt-3 pb-3">
            {/* Ship name + manufacturer */}
            <div className="mb-3">
              <h3 className="font-medium tracking-wide text-zinc-100 truncate text-[14px] group-hover:text-cyan-50 transition-colors duration-200">
                {ship.localizedName || ship.name}
              </h3>
              <p className="text-[10px] tracking-[0.15em] uppercase text-zinc-500 mt-0.5 group-hover:text-zinc-400 transition-colors">
                {ship.manufacturer || "Unknown"}
              </p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-1 mb-3">
              <StatChip label="SCM" value={fmtSpeed(ship.ship?.scmSpeed)} />
              <StatChip label="CREW" value={ship.ship?.maxCrew?.toString() || "\u2014"} />
              <StatChip label="SCU" value={fmtCargo(ship.ship?.cargo)} />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800/50">
              <span className="text-[11px] text-zinc-500 tracking-wide">
                {ship.ship?.role || ship.ship?.focus || ship.ship?.career || "Multi-role"}
              </span>
              <span className="text-[10px] text-zinc-600 font-mono px-1.5 py-0.5 rounded-sm bg-zinc-800/40">
                v{ship.gameVersion}
              </span>
            </div>
          </div>
        </div>

        {/* Corner accents */}
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b border-r border-transparent group-hover:border-cyan-500/30 transition-colors duration-500" />
        <div className="absolute top-0 left-0 w-8 h-8 border-t border-l border-transparent group-hover:border-cyan-500/20 transition-colors duration-500" />
      </article>
    </Link>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center py-1.5 rounded-sm bg-zinc-800/30">
      <div className="text-[10px] text-zinc-600 tracking-[0.12em] uppercase">{label}</div>
      <div className="text-[13px] text-zinc-300 font-mono mt-0.5">{value}</div>
    </div>
  );
}

function fmtSpeed(speed?: number | null): string {
  if (!speed) return "\u2014";
  return Math.round(speed).toString();
}

function fmtCargo(cargo?: number | null): string {
  if (!cargo) return "\u2014";
  if (cargo >= 1000) return (cargo / 1000).toFixed(1) + "k";
  return Math.round(cargo).toString();
}
