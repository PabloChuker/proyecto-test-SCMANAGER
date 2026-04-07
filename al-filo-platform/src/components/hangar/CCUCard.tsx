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
  "a.t.l.s.": "atls",
  "mustang alpha": "mustang-alpha",
  "vanduul blade": "blade",
  "ursa rover": "ursa",
  "hull b": "hull-b",
};

function getShipThumbUrl(shipName: string): string {
  if (!shipName) return "";
  const lower = shipName.toLowerCase().trim();
  if (SLUG_FIXES[lower]) return `/ships/${SLUG_FIXES[lower]}.jpg`;
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
