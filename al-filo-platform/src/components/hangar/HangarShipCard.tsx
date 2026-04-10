"use client";

import { useState } from "react";
import Link from "next/link";
import { useHangarStore, type HangarShip, type ItemCategory } from "@/store/useHangarStore";
import { EditShipModal } from "./EditShipModal";

const INSURANCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  LTI: { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30" },
  "120_months": { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30" },
  "72_months": { bg: "bg-amber-400/20", text: "text-amber-300", border: "border-amber-400/30" },
  "48_months": { bg: "bg-orange-400/20", text: "text-orange-300", border: "border-orange-400/30" },
  "24_months": { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30" },
  "6_months": { bg: "bg-violet-500/20", text: "text-violet-400", border: "border-violet-500/30" },
  "3_months": { bg: "bg-rose-500/20", text: "text-rose-400", border: "border-rose-500/30" },
  unknown: { bg: "bg-zinc-500/20", text: "text-zinc-400", border: "border-zinc-500/30" },
};

const CATEGORY_ICONS: Record<ItemCategory, string> = {
  standalone_ship: "🚀",
  game_package: "📦",
  paint: "🎨",
  flair: "✨",
  gear: "🛡️",
  subscriber: "⭐",
  upgrade: "⬆️",
  other: "📋",
};

const CATEGORY_BADGE: Record<ItemCategory, { bg: string; text: string; border: string; label: string }> = {
  standalone_ship: { bg: "bg-cyan-500/20", text: "text-cyan-400", border: "border-cyan-500/30", label: "Ship" },
  game_package: { bg: "bg-indigo-500/20", text: "text-indigo-400", border: "border-indigo-500/30", label: "Package" },
  paint: { bg: "bg-pink-500/20", text: "text-pink-400", border: "border-pink-500/30", label: "Paint" },
  flair: { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30", label: "Flair" },
  gear: { bg: "bg-teal-500/20", text: "text-teal-400", border: "border-teal-500/30", label: "Gear" },
  subscriber: { bg: "bg-violet-500/20", text: "text-violet-400", border: "border-violet-500/30", label: "Sub" },
  upgrade: { bg: "bg-sky-500/20", text: "text-sky-400", border: "border-sky-500/30", label: "CCU" },
  other: { bg: "bg-zinc-500/20", text: "text-zinc-400", border: "border-zinc-500/30", label: "Other" },
};

const LOCATION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  hangar: { bg: "bg-cyan-500/20", text: "text-cyan-400", border: "border-cyan-500/30" },
  buyback: { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30" },
  ccu_chain: { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/30" },
};

const INSURANCE_LABELS: Record<string, string> = {
  LTI: "LTI",
  "120_months": "120m",
  "72_months": "72m",
  "48_months": "48m",
  "24_months": "24m",
  "6_months": "6m",
  "3_months": "3m",
  unknown: "—",
};

// Common name corrections: display name → image file slug
const SLUG_FIXES: Record<string, string> = {
  "gladiator": "t8c-gladiator",
  "c8r pisces": "c8r-pisces-rescue",
  "aurora mr": "aurora-mr",
  "aurora cl": "aurora-cl",
  "aurora ln": "aurora-ln",
  "aurora lx": "aurora-lx",
  "aurora es": "aurora-es",
  "aurora mk i mr": "aurora-mr",
  "aurora mk i cl": "aurora-cl",
  "aurora mk i ln": "aurora-ln",
  "aurora mk i lx": "aurora-lx",
  "aurora mk i es": "aurora-es",
  "a.t.l.s.": "atls",
  "mustang alpha": "mustang-alpha",
  "vanduul blade": "blade",
  "ursa rover": "ursa",
  "hull b": "hull-b",
  "c2 hercules": "hercules-starlifter-c2",
  "c2 hercules starlifter": "hercules-starlifter-c2",
  "m2 hercules": "m2-hercules-starlifter",
  "m2 hercules starlifter": "m2-hercules-starlifter",
  "a2 hercules": "a2-hercules-starlifter",
  "a2 hercules starlifter": "a2-hercules-starlifter",
  "f7c hornet mk ii": "f7c-hornet-mk-ii",
  "f7c hornet mk i": "f7c-hornet-mk-i",
  "f7a hornet mk ii": "f7a-hornet-mk-ii",
  "f7c-m super hornet mk ii": "f7c-m-super-hornet-mk-ii",
  "f7c-m super hornet mk i": "f7c-m-super-hornet-mk-i",
  "f7c-r hornet tracker mk ii": "f7c-r-hornet-tracker-mk-ii",
  "f7c-r hornet tracker mk i": "f7c-r-hornet-tracker-mk-i",
  "f7c-s hornet ghost mk ii": "f7c-s-hornet-ghost-mk-ii",
  "f7c-s hornet ghost mk i": "f7c-s-hornet-ghost-mk-i",
  "f7c-m super hornet heartseeker mk ii": "f7c-m-hornet-heartseeker-mk-ii",
  "f7c-m super hornet heartseeker mk i": "f7c-m-super-hornet-heartseeker-mk-i",
  "f8c lightning": "f8c-lightning",
  "super hornet mk ii": "f7c-m-super-hornet-mk-ii",
  "super hornet mk i": "f7c-m-super-hornet-mk-i",
  "hornet mk ii": "f7c-hornet-mk-ii",
  "hornet mk i": "f7c-hornet-mk-i",
  "ares inferno": "ares-star-fighter-inferno",
  "ares ion": "ares-star-fighter-ion",
  "ares star fighter inferno": "ares-star-fighter-inferno",
  "ares star fighter ion": "ares-star-fighter-ion",
  "mercury": "mercury-star-runner",
  "mercury star runner": "mercury-star-runner",
  "msr": "mercury-star-runner",
  "pisces": "c8x-pisces-expedition",
  "c8x pisces": "c8x-pisces-expedition",
  "c8x pisces expedition": "c8x-pisces-expedition",
  "p52 merlin": "p-52-merlin",
  "p-52 merlin": "p-52-merlin",
  "p72 archimedes": "p-72-archimedes",
  "p-72 archimedes": "p-72-archimedes",
  "cutlass black": "cutlass-black",
  "cutlass blue": "cutlass-blue",
  "cutlass red": "cutlass-red",
  "cutlass steel": "cutlass-steel",
  "dragonfly black": "dragonfly-black",
  "dragonfly yellowjacket": "dragonfly-yellowjacket",
  "reliant kore": "reliant-kore",
  "reliant mako": "reliant-mako",
  "reliant sen": "reliant-sen",
  "reliant tana": "reliant-tana",
  "santok yai": "santok.y-i",
  "san'tok.yāi": "santok.y-i",
  "san tok yai": "santok.y-i",
  "constellation andromeda": "constellation-andromeda",
  "constellation aquila": "constellation-aquila",
  "constellation phoenix": "constellation-phoenix",
  "constellation taurus": "constellation-taurus",
  "vanguard warden": "vanguard-warden",
  "vanguard sentinel": "vanguard-sentinel",
  "vanguard harbinger": "vanguard-harbinger",
  "vanguard hoplite": "vanguard-hoplite",
  "starfarer gemini": "starfarer-gemini",
  "hull a": "hull-a",
  "hull c": "hull-c",
  "hull d": "hull-d",
  "hull e": "hull-e",
  "890 jump": "890-jump",
  "genesis starliner": "genesis-starliner",
  "starlancer tac": "starlancer-tac",
  "starlancer max": "starlancer-max",
  "spirit a1": "a1-spirit",
  "spirit c1": "c1-spirit",
  "spirit e1": "e1-spirit",
  "a1 spirit": "a1-spirit",
  "c1 spirit": "c1-spirit",
  "e1 spirit": "e1-spirit",
  "scorpius antares": "scorpius-antares",
  "ironclad assault": "ironclad-assault",
  // Hawk variants
  "hawk": "hawk",
  "hawk iii": "hawk",
  "hawk ii": "hawk",
  // F7C-M without Mk suffix
  "f7c m super hornet": "f7c-m-super-hornet-mk-ii",
  "f7c-m super hornet": "f7c-m-super-hornet-mk-ii",
  "f7c hornet": "f7c-hornet-mk-ii",
  "f7c-r hornet tracker": "f7c-r-hornet-tracker-mk-ii",
  "f7c-s hornet ghost": "f7c-s-hornet-ghost-mk-ii",
  // Prowler
  "prowler": "prowler",
  "prowler utility": "prowler-utility",
  // Ranger
  "ranger rc": "ranger-rc",
  "ranger cv": "ranger-cv",
  "ranger tr": "ranger-tr",
  // Razor
  "razor": "razor",
  "razor ex": "razor-ex",
  "razor lx": "razor-lx",
  // SRV
  "srv": "srv",
  // Misc fixes
  "c8r pisces rescue": "c8r-pisces-rescue",
  "prospector": "prospector",
  "salvation": "salvation",
  "freelancer": "freelancer",
  "freelancer max": "freelancer-max",
  "freelancer mis": "freelancer-mis",
  "freelancer dur": "freelancer-dur",
  "caterpillar": "caterpillar",
  "vulture": "vulture",
  "vulcan": "vulcan",
  "reclaimer": "reclaimer",
  "retaliator bomber": "retaliator-bomber",
  "retaliator base": "retaliator-base",
  "sabre": "sabre",
  "sabre comet": "sabre-comet",
  "gladius": "gladius",
  "gladius valiant": "gladius-valiant",
  "harbinger": "vanguard-harbinger",
  "warden": "vanguard-warden",
  "sentinel": "vanguard-sentinel",
  "hoplite": "vanguard-hoplite",
  "andromeda": "constellation-andromeda",
  "aquila": "constellation-aquila",
  "phoenix": "constellation-phoenix",
  "taurus": "constellation-taurus",
  "carrack": "carrack",
  "carrack expedition": "carrack-expedition",
  "perseus": "perseus",
  "polaris": "polaris",
  "idris-m": "idris-m",
  "idris-p": "idris-p",
  "javelin": "javelin",
  "kraken": "kraken",
  "kraken privateer": "kraken-privateer",
  "pioneer": "pioneer",
  "endeavor": "endeavor",
  "orion": "orion",
  "bmm": "merchantman",
  "merchantman": "merchantman",
  "banu merchantman": "merchantman",
  "defender": "defender",
  "banu defender": "defender",
  "blade": "blade",
  "glaive": "glaive",
  "scythe": "scythe",
  "nox": "nox",
  "nox kue": "nox-kue",
  "khartu-al": "khartu-al",
  "santokyai": "santok.y-i",
};

// Manufacturer prefixes to strip from ship names when building image slugs
const MFR_PREFIXES = [
  "Aegis Dynamics", "Aegis", "Anvil Aerospace", "Anvil", "Argo Astronautics", "Argo",
  "Aopoa", "Banu", "BIRC", "C.O.", "CO", "Consolidated Outland",
  "Crusader Industries", "Crusader", "Drake Interplanetary", "Drake",
  "Esperia", "Gatac", "Greycat Industrial", "Greycat",
  "Kruger Intergalactic", "Kruger", "MISC", "Musashi Industrial",
  "Origin Jumpworks", "Origin", "Roberts Space Industries", "RSI",
  "Tumbril Land Systems", "Tumbril", "Vanduul", "mirai",
];

/**
 * Clean ship name by removing edition suffixes and manufacturer prefixes
 */
function cleanShipName(name: string): string {
  let cleaned = name
    .replace(/\s*[-–]?\s*(Standard|Warbond)\s*(Edition)?.*$/i, "")
    .replace(/\s*[-–]\s*(LTI|IAE|Invictus|BIS|Best in Show|Anniversary|Citizencon).*$/i, "")
    .trim();

  // Strip manufacturer prefix (case-insensitive)
  for (const mfr of MFR_PREFIXES) {
    if (cleaned.toLowerCase().startsWith(mfr.toLowerCase() + " ")) {
      cleaned = cleaned.slice(mfr.length + 1).trim();
      break;
    }
  }

  return cleaned;
}

/**
 * Build a local ship thumbnail URL from the ship name.
 * Maps "Gladius" → "/ships/gladius.jpg", "Anvil F7C Hornet Mk II" → "/ships/f7c-hornet-mk-ii.jpg"
 */
function getShipThumbUrl(shipName: string): string {
  if (!shipName) return "";
  const cleaned = cleanShipName(shipName);
  const lower = cleaned.toLowerCase().trim();

  // Check fixed mappings first (try with and without manufacturer)
  if (SLUG_FIXES[lower]) return `/ships/${SLUG_FIXES[lower]}.webp`;

  // Also try the original name lowercased (in case SLUG_FIXES has the full name)
  const originalLower = shipName.toLowerCase().trim();
  if (SLUG_FIXES[originalLower]) return `/ships/${SLUG_FIXES[originalLower]}.webp`;

  const slug = lower
    .replace(/[''()]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/-$/, "");
  return `/ships/${slug}.webp`;
}

export function HangarShipCard({ ship }: { ship: HangarShip }) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [imgError, setImgError] = useState(false);
  const removeShip = useHangarStore((state) => state.removeShip);
  const updateShip = useHangarStore((state) => state.updateShip);

  const handleMoveLocation = () => {
    const newLocation = ship.location === "hangar" ? "buyback" : "hangar";
    updateShip(ship.id, { location: newLocation });
  };

  // Resolve category — backward compat for items missing itemCategory
  const category: ItemCategory = ship.itemCategory || "standalone_ship";
  const isShip = category === "standalone_ship" || category === "game_package";
  const catBadge = CATEGORY_BADGE[category] || CATEGORY_BADGE.other;
  const catIcon = CATEGORY_ICONS[category] || "📋";

  // Resolve display name
  const displayName = resolveDisplayName(ship);
  const localThumb = isShip ? getShipThumbUrl(displayName) : "";
  // Resolve RSI CDN image — ensure absolute URL
  let fallbackImg = "";
  if (ship.imageUrl && !ship.imageUrl.includes("default-image")) {
    const raw = ship.imageUrl.trim();
    if (raw.startsWith("//")) fallbackImg = `https:${raw}`;
    else if (raw.startsWith("/")) fallbackImg = `https://robertsspaceindustries.com${raw}`;
    else fallbackImg = raw;
  }

  const insuranceColor = INSURANCE_COLORS[ship.insuranceType] || INSURANCE_COLORS.unknown;
  const locationColor = LOCATION_COLORS[ship.location];

  const handleDelete = () => {
    removeShip(ship.id);
    setShowDeleteConfirm(false);
  };

  return (
    <>
      <article className="relative overflow-hidden rounded-sm bg-zinc-900/60 backdrop-blur-sm border border-zinc-800/50 transition-all duration-300 hover:border-cyan-500/40 hover:bg-zinc-900/80 hover:shadow-[0_0_30px_-8px_rgba(6,182,212,0.15)] group">
        {/* ── Image / Icon Area ── */}
        <div className="relative h-36 overflow-hidden bg-zinc-900">
          {isShip && !imgError && localThumb ? (
            <img
              src={localThumb}
              alt={displayName}
              className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
              onError={() => setImgError(true)}
            />
          ) : fallbackImg && !imgError ? (
            <img
              src={fallbackImg}
              alt={displayName}
              className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-all duration-500"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl opacity-40">{catIcon}</span>
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/50 to-transparent" />

          {/* Badges overlaid on image */}
          <div className="absolute top-2 left-2 flex gap-1.5 z-10 flex-wrap max-w-[calc(100%-3rem)]">
            {/* Category badge for non-ships */}
            {!isShip && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm ${catBadge.bg} ${catBadge.text} border ${catBadge.border}`}>
                {catBadge.label}
              </span>
            )}
            {/* IN GAME badge — only for in-game purchases */}
            {ship.acquisitionType === "in_game" && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 tracking-wider"
                title="Comprada dentro del juego (aUEC)"
              >
                IN GAME
              </span>
            )}
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm ${insuranceColor.bg} ${insuranceColor.text} border ${insuranceColor.border}`}
            >
              {INSURANCE_LABELS[ship.insuranceType] || "—"}
            </span>
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm ${locationColor.bg} ${locationColor.text} border ${locationColor.border}`}
            >
              {ship.location === "hangar" ? "Hangar" : ship.location === "buyback" ? "Buyback" : "CCU"}
            </span>
          </div>

          {/* Delete button */}
          <div className="absolute top-2 right-2 z-10">
            {showDeleteConfirm ? (
              <button
                onClick={handleDelete}
                className="text-[11px] px-1.5 py-0.5 bg-red-500/30 backdrop-blur-sm border border-red-500/50 rounded-sm text-red-400 hover:bg-red-500/40 transition-all duration-300"
              >
                Confirm
              </button>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="text-xs text-zinc-400 hover:text-red-400 transition-colors duration-300 opacity-0 group-hover:opacity-100 bg-zinc-900/60 backdrop-blur-sm rounded-full w-6 h-6 flex items-center justify-center"
                title="Delete item"
              >
                ✕
              </button>
            )}
          </div>

          {/* Name overlaid at bottom of image */}
          <div className="absolute bottom-2 left-3 right-3 z-10">
            <p className="text-[13px] font-semibold text-white drop-shadow-lg truncate">
              {displayName}
            </p>
          </div>
        </div>

        {/* ── Card Body ── */}
        <div className="relative z-10 p-3 space-y-2.5">
          {/* Top line accent */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent group-hover:via-cyan-500/60 transition-all duration-500" />

          {/* Pledge name (if different from display name) */}
          {ship.pledgeName !== displayName && (
            <p className="text-[10px] text-zinc-500 truncate">{ship.pledgeName}</p>
          )}

          {/* Price */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-zinc-500 tracking-[0.12em] uppercase">
                {ship.acquisitionType === "in_game" ? "In-Game" : isShip ? "Pledge" : "Value"}
              </p>
              <p className="text-[14px] text-zinc-200 font-mono font-medium">
                {ship.acquisitionType === "in_game"
                  ? (ship.pledgePrice > 0 ? `${ship.pledgePrice.toLocaleString()} aUEC` : "—")
                  : `$${ship.pledgePrice.toLocaleString()}`}
              </p>
            </div>
            <div className="flex gap-1.5">
              {ship.isGiftable && (
                <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded text-[9px]">
                  Gift
                </span>
              )}
              {ship.isMeltable && (
                <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded text-[9px]">
                  Melt
                </span>
              )}
            </div>
          </div>

          {/* Notes */}
          {ship.notes && (
            <p className="text-[10px] text-zinc-500 line-clamp-1 bg-zinc-800/30 rounded px-2 py-1">
              {ship.notes}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800/50">
            {isShip && ship.shipReference ? (
              <Link
                href={`/ships/${ship.shipReference}`}
                className="text-[11px] text-zinc-500 hover:text-cyan-400 transition-colors duration-300"
              >
                View Details
              </Link>
            ) : (
              <span className={`text-[11px] ${catBadge.text} opacity-60`}>
                {catBadge.label}
              </span>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={handleMoveLocation}
                className={`text-[11px] transition-colors duration-300 ${
                  ship.location === "buyback"
                    ? "text-zinc-500 hover:text-cyan-400"
                    : "text-zinc-500 hover:text-orange-400"
                }`}
                title={ship.location === "buyback" ? "Move to My Fleet" : "Move to Buyback"}
              >
                {ship.location === "buyback" ? "→ Fleet" : "→ Buyback"}
              </button>
              <button
                onClick={() => setShowEditModal(true)}
                className="text-[11px] text-zinc-500 hover:text-amber-400 transition-colors duration-300"
              >
                Edit
              </button>
            </div>
          </div>
        </div>

        {/* Corner accents */}
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-transparent group-hover:border-cyan-500/30 transition-colors duration-500" />
        <div className="absolute top-0 left-0 w-6 h-6 border-t border-l border-transparent group-hover:border-cyan-500/20 transition-colors duration-500" />
      </article>

      {showEditModal && <EditShipModal ship={ship} onClose={() => setShowEditModal(false)} />}
    </>
  );
}

/**
 * Resolve the best display name for a ship, trying multiple sources
 */
function resolveDisplayName(ship: HangarShip): string {
  // 1. Explicit shipName field (from v2 import)
  if (ship.shipName) return ship.shipName;

  // 2. Notes field: "Ship: X (part of package)" or "Part of package: Y"
  if (ship.notes) {
    const shipMatch = ship.notes.match(/^Ship:\s*(.+?)(?:\s*\(|$)/);
    if (shipMatch) return shipMatch[1].trim();
    const partMatch = ship.notes.match(/^Part of package:\s*(.+)/);
    if (partMatch) {
      // notes say package name, extract from pledge
      return extractNameFromPledge(ship.pledgeName);
    }
  }

  // 3. Extract from pledge name
  return extractNameFromPledge(ship.pledgeName);
}

/**
 * Extract ship name from pledge name like "Standalone Ships - Perseus - 10 Year"
 */
function extractNameFromPledge(pledgeName: string): string {
  let name = pledgeName;
  const prefixes = ["Standalone Ships - ", "Package - "];
  for (const p of prefixes) {
    if (name.startsWith(p)) {
      name = name.slice(p.length);
      break;
    }
  }
  name = name.replace(
    /\s*-\s*(10 Year|Best in Show.*|upgraded|Warbond.*|Standard Edition.*|IAE.*|Invictus.*)$/i,
    ""
  );
  return name.trim();
}
