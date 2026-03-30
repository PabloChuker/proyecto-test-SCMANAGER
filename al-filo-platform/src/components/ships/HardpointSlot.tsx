// =============================================================================
// AL FILO — HardpointSlot v6
// Pure display component. Receives data via props (from store).
// No internal state, no math, no fetch.
// =============================================================================

"use client";

import type { EquippedItem, ResolvedHardpoint } from "@/store/useLoadoutStore";
import { CAT_COLORS, getKeyStat } from "./loadout-utils";

interface HardpointSlotProps {
  hp: ResolvedHardpoint;
  item: EquippedItem | null;
  isOverridden: boolean;
  onClick: () => void;
}

export function HardpointSlot({ hp, item, isOverridden, onClick }: HardpointSlotProps) {
  const catColor = CAT_COLORS[hp.resolvedCategory] || "#71717a";
  const stat = item ? getKeyStat(hp.resolvedCategory, item.componentStats) : null;
  const nameClass = isOverridden ? "text-[13px] truncate text-cyan-200" : "text-[13px] truncate text-zinc-300";

  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/20 transition-colors group">
      <div className="w-0.5 h-6 rounded-full flex-shrink-0 opacity-40 group-hover:opacity-70 transition-opacity" style={{ backgroundColor: catColor }} />
      <div className="flex-shrink-0 w-12 text-center">
        <div className="text-[8px] text-zinc-700 uppercase">{hp.isFixed ? "Fixed" : "Gimbal"}</div>
        <div className="text-[11px] font-mono text-zinc-500">S{hp.maxSize || "?"}</div>
      </div>
      <div className="w-px h-5 bg-zinc-800/30 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        {item ? (
          <>
            <div className="flex items-center gap-1">
              <span className={nameClass}>{item.localizedName || item.name}</span>
              {item.grade && <span className="text-[9px] font-mono text-zinc-600 px-1 border border-zinc-800/40 rounded-sm">{item.grade}</span>}
              {isOverridden && <span className="text-[8px] text-cyan-600 tracking-wider">MOD</span>}
            </div>
            <div className="text-[10px] text-zinc-600">{item.manufacturer || "Unknown"}</div>
          </>
        ) : (
          <span className="text-[12px] text-zinc-700 italic">Empty — {hp.resolvedCategory}</span>
        )}
      </div>
      {stat && (
        <div className="flex-shrink-0 text-right">
          <div className="text-[12px] font-mono" style={{ color: catColor }}>{stat.v}</div>
          <div className="text-[8px] text-zinc-700 uppercase">{stat.l}</div>
        </div>
      )}
      <div className="flex-shrink-0 text-zinc-800 group-hover:text-zinc-500 transition-colors">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
      </div>
    </button>
  );
}
