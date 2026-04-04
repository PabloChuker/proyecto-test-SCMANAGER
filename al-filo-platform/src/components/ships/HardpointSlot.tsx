// =============================================================================
// AL FILO — HardpointSlot v10 (Recursive Children from API)
// Renders child weapons/missiles below turrets/racks with indent
// =============================================================================

"use client";

import type { EquippedItem, ResolvedHardpoint, ResolvedChild } from "@/store/useLoadoutStore";
import { CAT_COLORS, getKeyStat } from "./loadout-utils";

interface HardpointSlotProps {
  hp: ResolvedHardpoint;
  item: EquippedItem | null;
  isOverridden: boolean;
  isOn: boolean;
  onClick: () => void;
  onTogglePower: () => void;
  // Children support
  childSlots?: ResolvedChild[];
  isComponentOn?: (name: string) => boolean;
  toggleComponent?: (name: string) => void;
}

export function HardpointSlot({ hp, item, isOverridden, isOn, onClick, onTogglePower, childSlots, isComponentOn, toggleComponent }: HardpointSlotProps) {
  const catColor = CAT_COLORS[hp.resolvedCategory] || "#52525b";
  const stat = item && isOn ? getKeyStat(hp.resolvedCategory, item.componentStats) : null;
  const displaySize = hp.maxSize > 0 ? hp.maxSize : (item?.size ?? 0);
  const hasChildren = childSlots && childSlots.length > 0;

  return (
    <>
      <Row catColor={catColor} size={displaySize} item={item} stat={stat} isOn={isOn} isOverridden={isOverridden} onClick={onClick} onTogglePower={onTogglePower} hasChildren={hasChildren} depth={0} />
      {/* Render turret/rack children */}
      {hasChildren && isOn && childSlots!.map(ch => {
        const chOn = isComponentOn ? isComponentOn(ch.hardpointName) : true;
        const chColor = CAT_COLORS[ch.category] || catColor;
        const chStat = ch.equippedItem && chOn ? getKeyStat(ch.category || "WEAPON", ch.equippedItem.componentStats) : null;
        const chSize = ch.maxSize > 0 ? ch.maxSize : (ch.equippedItem?.size ?? 0);
        return (
          <Row key={ch.id} catColor={chColor} size={chSize} item={ch.equippedItem} stat={chStat} isOn={chOn} isOverridden={false} onClick={() => {}} onTogglePower={() => toggleComponent?.(ch.hardpointName)} hasChildren={false} depth={1} />
        );
      })}
    </>
  );
}

// Shared row renderer for both parent and child
function Row({ catColor, size, item, stat, isOn, isOverridden, onClick, onTogglePower, hasChildren, depth }: {
  catColor: string; size: number; item: EquippedItem | null;
  stat: { v: string; l: string } | null; isOn: boolean; isOverridden: boolean;
  onClick: () => void; onTogglePower: () => void; hasChildren?: boolean; depth: number;
}) {
  const indent = depth > 0;
  return (
    <div className={"flex items-center h-8 border-b border-zinc-800/50 last:border-b-0 transition-opacity duration-150 " + (isOn ? "" : "opacity-30") + (indent ? " ml-5 border-l-2 border-l-zinc-700/40" : "")}>
      <button onClick={(e) => { e.stopPropagation(); onTogglePower(); }} className={"w-6 h-full flex items-center justify-center flex-shrink-0 transition-colors " + (isOn ? "text-yellow-500/70 hover:text-yellow-400" : "text-zinc-700 hover:text-yellow-600")}>
        <div className={"w-1.5 h-1.5 rounded-full " + (isOn ? "bg-yellow-500/80" : "bg-zinc-700")} />
      </button>
      <div className="w-7 flex-shrink-0 text-center">
        <span className="text-[10px] font-mono font-bold" style={{ color: catColor }}>{size > 0 ? "S" + size : "--"}</span>
      </div>
      <div className="w-px h-4 flex-shrink-0 mr-1.5" style={{ backgroundColor: catColor, opacity: isOn ? 0.5 : 0.15 }} />
      <button onClick={onClick} className="flex-1 flex items-center gap-1.5 h-full min-w-0 text-left hover:bg-yellow-500/5 transition-colors px-1">
        {item ? (
          <>
            <span className={"text-[11px] truncate flex-1 min-w-0 " + (isOn ? (isOverridden ? "text-yellow-200/90" : "text-zinc-300") : "text-zinc-600")}>{item.localizedName || item.name}</span>
            {item.grade && isOn && <span className="text-[8px] font-mono text-zinc-500 px-0.5 border border-zinc-800/60 rounded-[2px] flex-shrink-0">{item.grade}</span>}
            {!isOn && <span className="text-[7px] text-amber-600/80 tracking-widest uppercase flex-shrink-0">OFF</span>}
            {isOverridden && isOn && <span className="text-[7px] text-yellow-500/70 tracking-wider flex-shrink-0">MOD</span>}
            {hasChildren && isOn && <span className="text-[7px] text-cyan-500/60 tracking-wider flex-shrink-0">+{(item as any)?.children?.length ?? ""}SUB</span>}
          </>
        ) : (
          <span className="text-[10px] text-zinc-700 italic flex-1">— empty —</span>
        )}
        {stat && (
          <div className="flex items-baseline gap-0.5 flex-shrink-0">
            <span className="text-[10px] font-mono font-medium" style={{ color: catColor }}>{stat.v}</span>
            <span className="text-[7px] text-zinc-600 uppercase">{stat.l}</span>
          </div>
        )}
        {!indent && <svg className="w-2.5 h-2.5 text-zinc-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
      </button>
    </div>
  );
}

const SKIP_CATEGORIES = new Set(["OTHER", "ARMOR", "FUEL_TANK", "FUEL_INTAKE", "AVIONICS", "THRUSTER_MAIN", "THRUSTER_MANEUVERING"]);

export function isUsefulSlot(hp: ResolvedHardpoint, item: EquippedItem | null): boolean {
  if (item) return true;
  if (hp.maxSize > 0) return true;
  if (SKIP_CATEGORIES.has(hp.resolvedCategory)) return false;
  return true;
}
