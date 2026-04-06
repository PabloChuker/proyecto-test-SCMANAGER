"use client";

import { useState } from "react";
import Link from "next/link";
import { useHangarStore, type HangarShip } from "@/store/useHangarStore";
import { EditShipModal } from "./EditShipModal";

const INSURANCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  LTI: { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30" },
  "120_months": { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30" },
  "72_months": { bg: "bg-amber-400/20", text: "text-amber-300", border: "border-amber-400/30" },
  "48_months": { bg: "bg-orange-400/20", text: "text-orange-300", border: "border-orange-400/30" },
  "24_months": { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30" },
  "6_months": { bg: "bg-violet-500/20", text: "text-violet-400", border: "border-violet-500/30" },
  "3_months": { bg: "bg-rose-500/20", text: "text-rose-400", border: "border-rose-500/30" },
  "unknown": { bg: "bg-zinc-500/20", text: "text-zinc-400", border: "border-zinc-500/30" },
};

const LOCATION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  hangar: { bg: "bg-cyan-500/20", text: "text-cyan-400", border: "border-cyan-500/30" },
  buyback: { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30" },
  ccu_chain: { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/30" },
};

function getShipThumbUrl(name: string): string {
  let n = name || "";
  const MFR_PREFIXES = [
    "Aegis", "RSI", "Drake", "MISC", "Anvil", "Origin", "Crusader", "Argo",
    "Aopoa", "Consolidated Outland", "Esperia", "Gatac", "Greycat", "Kruger",
    "Musashi Industrial", "Tumbril", "Banu", "Vanduul", "Roberts Space Industries",
    "Crusader Industries", "Musashi", "CO",
  ];
  for (const m of MFR_PREFIXES) {
    if (n.startsWith(m + " ")) { n = n.slice(m.length + 1); break; }
  }
  const slug = n.toLowerCase().replace(/[''()]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/-$/, "");
  return `/ships/${slug}.jpg`;
}

export function HangarShipCard({ ship }: { ship: HangarShip }) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const removeShip = useHangarStore((state) => state.removeShip);

  const thumbUrl = getShipThumbUrl(ship.pledgeName);
  const insuranceColor = INSURANCE_COLORS[ship.insuranceType] || INSURANCE_COLORS.unknown;
  const locationColor = LOCATION_COLORS[ship.location];

  const handleDelete = () => {
    removeShip(ship.id);
    setShowDeleteConfirm(false);
  };

  return (
    <>
      <article className="relative overflow-hidden rounded-sm bg-zinc-900/60 backdrop-blur-sm border border-zinc-800/50 transition-all duration-300 hover:border-cyan-500/40 hover:bg-zinc-900/80 hover:shadow-[0_0_30px_-8px_rgba(6,182,212,0.15)] group">
        {/* Background ship image */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.22] group-hover:opacity-[0.35] transition-opacity duration-500 pointer-events-none"
          style={{ backgroundImage: `url(${thumbUrl})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/80 to-zinc-900/40 pointer-events-none" />
        <div className="relative z-10">
          <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent group-hover:via-cyan-500/60 transition-all duration-500" />
          <div className="p-4">
            {/* Header with delete button */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <Link href={`/ships/${ship.shipReference}`} className="flex-1 min-w-0 group/link hover:opacity-80 transition-opacity">
                <h3 className="font-medium tracking-wide text-zinc-100 truncate text-[14px] group-hover/link:text-cyan-50 transition-colors">
                  {ship.pledgeName}
                </h3>
              </Link>
              {showDeleteConfirm ? (
                <button
                  onClick={handleDelete}
                  className="text-[11px] px-1.5 py-0.5 bg-red-500/30 border border-red-500/50 rounded-sm text-red-400 hover:bg-red-500/40 transition-all duration-300"
                >
                  Confirm
                </button>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-xs text-zinc-400 hover:text-red-400 transition-colors duration-300 opacity-0 group-hover:opacity-100"
                  title="Delete ship"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Insurance Badge */}
            <div className="mb-3 flex flex-wrap gap-2">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${insuranceColor.bg} ${insuranceColor.text} border ${insuranceColor.border}`}>
                {ship.insuranceType === "LTI" ? "LTI" : ship.insuranceType === "120_months" ? "120m" : ship.insuranceType === "72_months" ? "72m" : ship.insuranceType === "48_months" ? "48m" : ship.insuranceType === "24_months" ? "24m" : ship.insuranceType === "6_months" ? "6m" : ship.insuranceType === "3_months" ? "3m" : "Unknown"}
              </span>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${locationColor.bg} ${locationColor.text} border ${locationColor.border}`}>
                {ship.location === "hangar" ? "Hangar" : ship.location === "buyback" ? "Buyback" : "CCU"}
              </span>
            </div>

            {/* Price */}
            <div className="mb-3 p-2 bg-zinc-800/30 rounded-sm">
              <p className="text-[11px] text-zinc-500 tracking-[0.12em] uppercase">Pledge Price</p>
              <p className="text-[13px] text-zinc-300 font-mono mt-0.5">${ship.pledgePrice.toLocaleString()}</p>
            </div>

            {/* Giftable/Meltable indicators */}
            {(ship.isGiftable || ship.isMeltable) && (
              <div className="mb-3 flex gap-2 text-[10px]">
                {ship.isGiftable && <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-sm">Giftable</span>}
                {ship.isMeltable && <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-sm">Meltable</span>}
              </div>
            )}

            {/* Notes preview */}
            {ship.notes && (
              <div className="mb-3 p-2 bg-zinc-800/20 rounded-sm border border-zinc-800/30">
                <p className="text-[10px] text-zinc-400 line-clamp-2">{ship.notes}</p>
              </div>
            )}

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-3 border-t border-zinc-800/50">
              <Link
                href={`/ships/${ship.shipReference}`}
                className="text-xs text-zinc-500 hover:text-cyan-400 transition-colors duration-300"
              >
                View Details
              </Link>
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
      {showEditModal && <EditShipModal ship={ship} onClose={() => setShowEditModal(false)} />}
    </>
  );
}
