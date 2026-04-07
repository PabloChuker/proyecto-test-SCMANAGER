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
};

/**
 * Build a local ship thumbnail URL from the ship name.
 * Maps "Gladius" → "/ships/gladius.jpg", "Zeus Mk II ES" → "/ships/zeus-mk-ii-es.jpg"
 */
function getShipThumbUrl(shipName: string): string {
  if (!shipName) return "";
  const lower = shipName.toLowerCase().trim();

  // Check fixed mappings first
  if (SLUG_FIXES[lower]) return `/ships/${SLUG_FIXES[lower]}.jpg`;

  const slug = lower
    .replace(/[''()]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/-$/, "");
  return `/ships/${slug}.jpg`;
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
          <div className="absolute top-2 left-2 flex gap-1.5 z-10">
            {/* Category badge for non-ships */}
            {!isShip && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm ${catBadge.bg} ${catBadge.text} border ${catBadge.border}`}>
                {catBadge.label}
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
                {isShip ? "Pledge" : "Value"}
              </p>
              <p className="text-[14px] text-zinc-200 font-mono font-medium">
                ${ship.pledgePrice.toLocaleString()}
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
