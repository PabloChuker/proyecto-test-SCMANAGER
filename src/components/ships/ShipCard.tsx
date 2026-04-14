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
  inGameOnly?: boolean;
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
  "Crusader Industries", "Musashi",
  // "C.O." must come before "CO" so "C.O. HoverQuad" is stripped correctly.
  "C.O.", "CO",
];

// Explicit overrides for ships whose generated slug doesn't match any file in
// /public/ships/. Keyed by regex matched against the RAW ship name.
const THUMB_OVERRIDES: Array<[RegExp, string]> = [
  // ATLS paint/color variants all share the base ATLS mech image.
  [/^atls\b.*\b(color|line|edition|paint|variant)\b/i, "/ships/atls.webp"],
  [/^atls\s+(cool\s+metal|orange|snowland|ocean)/i,    "/ships/atls.webp"],
];

// Wikelo exclusive variants — each ship gets its own thumbnail in /public/ships/wikelo/.
// Order matters: more specific patterns (e.g. "F8C Military") MUST come before the
// generic fallback (e.g. "F8C"). First regex match wins.
const WIKELO_THUMBS: Array<[RegExp, string]> = [
  // Variants with qualifier first
  [/f8c.*stealth|stealth.*f8c/i,           "/ships/wikelo/Wikelo_F8C_Stealth.jpeg"],
  [/f8c.*(military|mil)|(?:military|mil).*f8c/i, "/ships/wikelo/Wikelo_F8C_Military.jpeg"],
  [/wolf.*stealth|stealth.*wolf/i,         "/ships/wikelo/Wikelo_Wolf_stealth.jpeg"],
  [/wolf.*(military|mil)|(?:military|mil).*wolf/i, "/ships/wikelo/Wikelo_Wolf_Military.jpeg"],
  [/guardian.*mx|mx.*guardian/i,           "/ships/wikelo/Wikelo_GuardianMX.png"],
  [/guardian.*qi|qi.*guardian/i,           "/ships/wikelo/Wikelo_GuardianQI.jpeg"],
  [/starlancer.*max|max.*starlancer/i,     "/ships/wikelo/Wikelo_StarlancerMAX.png"],
  [/starlancer.*tac|tac.*starlancer/i,     "/ships/wikelo/Wikelo_StarlancerTAC.png"],
  [/zeus.*cl|cl.*zeus/i,                   "/ships/wikelo/Wikelo_ZeusCL.png"],
  [/zeus.*es|es.*zeus/i,                   "/ships/wikelo/Wikelo_ZeusES.png"],
  [/prowler.*utility|utility.*prowler/i,   "/ships/wikelo/Wikelo_ProwlerUtility.jpeg"],
  [/apollo.*triage|triage.*apollo/i,       "/ships/wikelo/Wikelo_ApoloTriage.jpeg"],
  [/terrapin.*medic|medic.*terrapin/i,     "/ships/wikelo/Wikelo_TerraminMedic.png"],
  [/ursa.*medivac|medivac.*ursa/i,         "/ships/wikelo/Wikelo_UrsaMedivac.png"],
  [/super\s*hornet.*(mk\s*ii|mk2|mkii)|(?:mk\s*ii|mk2|mkii).*super\s*hornet/i, "/ships/wikelo/Wikelo_SuperHornetMk2.jpeg"],
  // Wikelo variant is stored as "F7 Hornet Mk Wikelo" — no "Super", no "II".
  [/f7\s*hornet.*\bmk\b|\bhornet\s*mk\b/i, "/ships/wikelo/Wikelo_SuperHornetMk2.jpeg"],
  [/idris[-\s]*p/i,                        "/ships/wikelo/Wikelo_IdrisP.jpeg"],
  [/c1.*spirit|spirit.*c1/i,               "/ships/wikelo/Wikelo_C1Spirit.png"],
  // Generic names
  [/\ba2\b/i,             "/ships/wikelo/Wikelo_A2.png"],
  [/asgard/i,             "/ships/wikelo/Wikelo_Asgard.jpeg"],
  [/firebird/i,           "/ships/wikelo/Wikelo_Firebird.png"],
  [/fortune/i,            "/ships/wikelo/Wikelo_Fortune.jpeg"],
  [/golem/i,              "/ships/wikelo/Wikelo_Golem.jpeg"],
  [/guardian/i,           "/ships/wikelo/Wikelo_Guardian.png"],
  [/\bion\b/i,            "/ships/wikelo/Wikelo_ION.jpeg"],
  [/inferno/i,            "/ships/wikelo/Wikelo_Inferno.jpeg"],
  [/intrepid/i,           "/ships/wikelo/Wikelo_Intrepid.png"],
  [/meteor/i,             "/ships/wikelo/Wikelo_Meteor.png"],
  [/\bnox\b/i,            "/ships/wikelo/Wikelo_Nox.png"],
  [/peregrine/i,          "/ships/wikelo/Wikelo_Peregrine.png"],
  [/polaris/i,            "/ships/wikelo/Wikelo_Polaris.jpeg"],
  [/prospector/i,         "/ships/wikelo/Wikelo_Prospector.png"],
  [/\bpulse\b/i,          "/ships/wikelo/Wikelo_Pulse.jpeg"],
  [/\braft\b/i,           "/ships/wikelo/Wikelo_Raft.png"],
  [/scorpius/i,           "/ships/wikelo/Wikelo_Scorpius.jpeg"],
  [/taurus/i,             "/ships/wikelo/Wikelo_Taurus.jpeg"],
];

function getShipThumbUrl(
  name: string,
  manufacturer?: string | null,
  opts?: { reference?: string | null; inGameOnly?: boolean },
): string {
  const raw = name || "";
  const ref = opts?.reference || "";
  const hay = `${raw} ${ref}`;

  // ── Explicit per-ship overrides (paint variants, etc.) ──
  for (const [rx, url] of THUMB_OVERRIDES) {
    if (rx.test(raw)) return url;
  }
  // ── Wikelo exclusive thumbnails ──
  // Trigger if name OR reference mentions "wikelo" (avoids misrouting PYAM /
  // Exec Hangar / Teach ships that share ship names like "Fortune" or "Guardian").
  const wikeloScope = /wikelo/i.test(hay);
  if (wikeloScope) {
    for (const [rx, url] of WIKELO_THUMBS) {
      if (rx.test(hay)) return url;
    }
    // Fall through to normal resolver if nothing matched (will try to reuse sister).
  }

  // ── Wikelo-exclusive qualifiers (no "Wikelo" in name) ──
  // The F8C Lightning and Wolf have Wikelo-only Military/Stealth variants.
  // If a ship is named "F8C ... Military/Stealth" or "Wolf ... Military/Stealth"
  // it's from Wikelo by definition — route to the Wikelo thumb even without the
  // "wikelo" keyword in name/reference.
  if (/f8c.*stealth|stealth.*f8c/i.test(hay))     return "/ships/wikelo/Wikelo_F8C_Stealth.jpeg";
  if (/f8c.*(military|mil)\b|\b(military|mil).*f8c/i.test(hay))
                                                    return "/ships/wikelo/Wikelo_F8C_Military.jpeg";
  if (/\bwolf\b.*stealth|stealth.*\bwolf\b/i.test(hay))
                                                    return "/ships/wikelo/Wikelo_Wolf_stealth.jpeg";
  if (/\bwolf\b.*(military|mil)\b|\b(military|mil).*\bwolf\b/i.test(hay))
                                                    return "/ships/wikelo/Wikelo_Wolf_Military.jpeg";
  let n = name || "";
  // Strip "Teach's Special" + "Wikelo's" variants so these ships reuse their sister's thumb
  // (when no explicit Wikelo override matched above).
  // Handles: straight quote, curly quote (’), no quote, prefix or suffix position.
  n = n
    .replace(/\s*[-–—]?\s*teach['’`]?s?\s+special\s*[-–—]?\s*/gi, " ")
    .replace(/\s*[-–—]?\s*wikelo['’`]?s?\s*[-–—]?\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (manufacturer) {
    const m = manufacturer.trim();
    if (n.startsWith(m + " ")) n = n.slice(m.length + 1);
  }
  for (const m of MFR_PREFIXES) {
    if (n.startsWith(m + " ")) { n = n.slice(m.length + 1); break; }
  }
  const slug = n
    .toLowerCase()
    .replace(/[''()]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    // Collapse stray dots coming from "C.O." / abbreviations.
    .replace(/\.+/g, "")
    .replace(/^-+|-+$/g, "");
  return `/ships/${slug}.webp`;
}

export function ShipCard({
  ship,
  onContextMenu,
}: {
  ship: ShipCardData;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const roleIndicator = getRoleIndicator(ship.ship?.role || ship.ship?.career);
  const roleColor = roleIndicator.color;
  const thumbUrl = getShipThumbUrl(ship.name, ship.manufacturer, {
    reference: ship.reference,
    inGameOnly: ship.inGameOnly,
  });

  return (
    <Link
      href={"/ships/" + ship.reference}
      className="group block"
      onContextMenu={onContextMenu}
    >
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
          {ship.inGameOnly ? (
            <div className="absolute top-2 left-2.5">
              <span className="text-[10px] font-mono font-medium text-cyan-300/90 bg-zinc-950/70 backdrop-blur-sm px-1.5 py-0.5 rounded-sm border border-cyan-500/30">
                IN-GAME ONLY
              </span>
            </div>
          ) : ship.msrpUsd != null && ship.msrpUsd > 0 ? (
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
          ) : null}
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
