"use client";

import { useState } from "react";
import { useHangarStore, type HangarCCU } from "@/store/useHangarStore";
import { EditCCUModal } from "./EditCCUModal";

const LOCATION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  hangar: { bg: "bg-cyan-500/20", text: "text-cyan-400", border: "border-cyan-500/30" },
  buyback: { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30" },
};

// Common name corrections for image slugs
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
  "hawk": "hawk",
  "hawk iii": "hawk",
  "hawk ii": "hawk",
  "f7c m super hornet": "f7c-m-super-hornet-mk-ii",
  "f7c-m super hornet": "f7c-m-super-hornet-mk-ii",
  "f7c hornet": "f7c-hornet-mk-ii",
  "f7c-r hornet tracker": "f7c-r-hornet-tracker-mk-ii",
  "f7c-s hornet ghost": "f7c-s-hornet-ghost-mk-ii",
  "prowler": "prowler",
  "prowler utility": "prowler-utility",
  "ranger rc": "ranger-rc",
  "ranger cv": "ranger-cv",
  "ranger tr": "ranger-tr",
  "razor": "razor",
  "razor ex": "razor-ex",
  "razor lx": "razor-lx",
  "srv": "srv",
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

  for (const mfr of MFR_PREFIXES) {
    if (cleaned.toLowerCase().startsWith(mfr.toLowerCase() + " ")) {
      cleaned = cleaned.slice(mfr.length + 1).trim();
      break;
    }
  }

  return cleaned;
}

function getShipThumbUrl(shipName: string): string {
  if (!shipName) return "";
  const cleaned = cleanShipName(shipName);
  const lower = cleaned.toLowerCase().trim();

  if (SLUG_FIXES[lower]) return `/ships/${SLUG_FIXES[lower]}.jpg`;

  const originalLower = shipName.toLowerCase().trim();
  if (SLUG_FIXES[originalLower]) return `/ships/${SLUG_FIXES[originalLower]}.jpg`;

  const slug = lower
    .replace(/[''()]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/-$/, "");
  return `/ships/${slug}.jpg`;
}

export function CCUCard({ ccu }: { ccu: HangarCCU }) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [imgError, setImgError] = useState(false);
  const removeCCU = useHangarStore((state) => state.removeCCU);

  const locationColor = LOCATION_COLORS[ccu.location];
  const toShipThumb = getShipThumbUrl(ccu.toShip);

  const handleDelete = () => {
    removeCCU(ccu.id);
    setShowDeleteConfirm(false);
  };

  return (
    <>
      <article className="relative overflow-hidden rounded-sm bg-zinc-900/60 backdrop-blur-sm border border-zinc-800/50 transition-all duration-300 hover:border-cyan-500/40 hover:bg-zinc-900/80 hover:shadow-[0_0_30px_-8px_rgba(6,182,212,0.15)] group">
        {/* ── Image Area — "to" ship ── */}
        <div className="relative h-24 overflow-hidden bg-zinc-900">
          {!imgError && toShipThumb ? (
            <img
              src={toShipThumb}
              alt={ccu.toShip}
              className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-70 group-hover:scale-105 transition-all duration-500"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl opacity-30">⬆️</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/60 to-transparent" />
          {/* Badges */}
          <div className="absolute top-2 left-2 flex gap-1.5 z-10">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm ${locationColor.bg} ${locationColor.text} border ${locationColor.border}`}>
              {ccu.location === "hangar" ? "Hangar" : "Buyback"}
            </span>
            {ccu.isWarbond && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm bg-amber-500/20 text-amber-400 border border-amber-500/30">
                Warbond
              </span>
            )}
          </div>
        </div>

        <div className="relative z-10">
          <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent group-hover:via-cyan-500/60 transition-all duration-500" />
          <div className="p-4">
            {/* Header with delete button */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium tracking-wide text-zinc-100 text-[13px] group-hover:text-cyan-50 transition-colors">
                  {ccu.fromShip}
                </h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <svg className="w-3 h-3 text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <p className="text-[12px] text-zinc-400 truncate">{ccu.toShip}</p>
                </div>
              </div>
              {showDeleteConfirm ? (
                <button
                  onClick={handleDelete}
                  className="text-[11px] px-1.5 py-0.5 bg-red-500/30 border border-red-500/50 rounded-sm text-red-400 hover:bg-red-500/40 transition-all duration-300 flex-shrink-0"
                >
                  Confirm
                </button>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-xs text-zinc-400 hover:text-red-400 transition-colors duration-300 opacity-0 group-hover:opacity-100 flex-shrink-0"
                  title="Delete CCU"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Standard badge if not warbond */}
            {!ccu.isWarbond && (
              <div className="mb-3">
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-zinc-700/30 text-zinc-400 border-zinc-600/30">
                  Standard
                </span>
              </div>
            )}

            {/* Price */}
            <div className="mb-3 p-2 bg-zinc-800/30 rounded-sm">
              <p className="text-[11px] text-zinc-500 tracking-[0.12em] uppercase">Price Paid</p>
              <p className="text-[13px] text-zinc-300 font-mono mt-0.5">${ccu.pricePaid.toLocaleString()}</p>
            </div>

            {/* Notes preview */}
            {ccu.notes && (
              <div className="mb-3 p-2 bg-zinc-800/20 rounded-sm border border-zinc-800/30">
                <p className="text-[10px] text-zinc-400 line-clamp-2">{ccu.notes}</p>
              </div>
            )}

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-3 border-t border-zinc-800/50">
              <span className="text-xs text-zinc-500">
                {ccu.fromShipReference} → {ccu.toShipReference}
              </span>
              <button
                onClick={() => setShowEditModal(true)}
                className="text-xs text-zinc-500 hover:text-amber-400 transition-colors duration-300"
              >
                Edit
              </button>
            </div>
          </div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b border-r border-transparent group-hover:border-cyan-500/30 transition-colors duration-500" />
          <div className="absolute top-0 left-0 w-8 h-8 border-t border-l border-transparent group-hover:border-cyan-500/20 transition-colors duration-500" />
        </div>
      </article>

      {/* Edit Modal */}
      {showEditModal && <EditCCUModal ccu={ccu} onClose={() => setShowEditModal(false)} />}
    </>
  );
}
