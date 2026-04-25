"use client";

// =============================================================================
// CCUList — vista lista de CCUs / Upgrades (Fase T)
// =============================================================================

import { useState } from "react";
import { useHangarStore, type HangarCCU } from "@/store/useHangarStore";
import { EditCCUModal } from "./EditCCUModal";
import { LOCATION_COLORS } from "./hangar-style";

interface CCUListProps {
  ccus: HangarCCU[];
}

export function CCUList({ ccus }: CCUListProps) {
  if (ccus.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 border border-zinc-800/50 rounded-sm bg-zinc-900/30">
        <div className="text-center">
          <p className="text-zinc-400 text-sm">No CCUs in your inventory</p>
          <p className="text-zinc-500 text-xs mt-1">Add a CCU to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-sm border border-zinc-800/60 bg-zinc-900/40">
      <div className="hidden md:flex items-center gap-3 px-3 py-2 border-b border-zinc-800/60 bg-zinc-900/60 text-[9px] tracking-[0.15em] uppercase text-zinc-500 font-mono">
        <div className="flex-1">From → To</div>
        <div className="w-20 text-right">Paid</div>
        <div className="w-16 text-center">Type</div>
        <div className="w-24 text-center">Location</div>
        <div className="flex-1 max-w-[260px]">Notes</div>
        <div className="w-24 text-right">Actions</div>
      </div>
      <div className="divide-y divide-zinc-800/40">
        {ccus.map((ccu) => (
          <CCURow key={ccu.id} ccu={ccu} />
        ))}
      </div>
    </div>
  );
}

function CCURow({ ccu }: { ccu: HangarCCU }) {
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const removeCCU = useHangarStore((s) => s.removeCCU);
  const location = LOCATION_COLORS[ccu.location];

  return (
    <div className="group flex items-center gap-3 px-3 py-2 hover:bg-zinc-800/30 transition-colors text-[12px]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 truncate">
          <span className="text-zinc-300">{ccu.fromShip}</span>
          <span className="text-zinc-600">→</span>
          <span className="text-cyan-300">{ccu.toShip}</span>
        </div>
      </div>

      <div className="w-20 text-right hidden md:block font-mono tabular-nums text-amber-300/80">
        ${ccu.pricePaid.toLocaleString()}
      </div>

      <div className="w-16 text-center hidden md:block">
        {ccu.isWarbond ? (
          <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">WB</span>
        ) : (
          <span className="text-[9px] font-mono text-zinc-600">Std</span>
        )}
      </div>

      <div className="w-24 text-center hidden md:block">
        <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] border ${location?.bg ?? ""} ${location?.text ?? ""} ${location?.border ?? ""}`}>
          {ccu.location}
        </span>
      </div>

      <div className="flex-1 max-w-[260px] hidden md:block text-[10px] text-zinc-500 truncate">
        {ccu.notes || "—"}
      </div>

      <div className="w-24 flex justify-end gap-1 flex-shrink-0">
        <button
          onClick={() => setShowEdit(true)}
          className="text-[10px] px-2 py-1 text-zinc-400 hover:text-amber-300 border border-zinc-800/60 hover:border-amber-500/40 rounded-[2px] transition-colors"
          title="Edit"
        >
          Edit
        </button>
        {showDeleteConfirm ? (
          <button
            onClick={() => { removeCCU(ccu.id); setShowDeleteConfirm(false); }}
            className="text-[10px] px-2 py-1 text-rose-400 bg-rose-500/10 border border-rose-500/40 rounded-[2px]"
          >
            Confirm
          </button>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-[10px] px-2 py-1 text-zinc-500 hover:text-rose-400 border border-zinc-800/60 hover:border-rose-500/40 rounded-[2px] transition-colors"
            title="Delete"
          >
            ✕
          </button>
        )}
      </div>

      {showEdit && <EditCCUModal ccu={ccu} onClose={() => setShowEdit(false)} />}
    </div>
  );
}
