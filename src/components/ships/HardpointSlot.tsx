// =============================================================================
// AL FILO — HardpointSlot v10 (Recursive Children from API)
// Renders child weapons/missiles below turrets/racks with indent
// =============================================================================

"use client";

import { memo } from "react";
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
  onClickChild?: (child: ResolvedChild) => void;
  getEffectiveItem?: (id: string) => EquippedItem | null;
  /** Weapon power ratio (0..1) from combined weapons pip allocation */
  weaponPowerRatio?: number;
}

/** Check if an item is a turret/gimbal (has children) vs a direct weapon */
function isTurretOrRack(item: EquippedItem | null): boolean {
  if (!item) return false;
  const n = (item.name ?? "") + " " + (item.type ?? "");
  return /turret|gimbal|varipuck|rack/i.test(n);
}

export const HardpointSlot = memo(function HardpointSlot({ hp, item, isOverridden, isOn, onClick, onTogglePower, childSlots, isComponentOn, toggleComponent, onClickChild, getEffectiveItem, weaponPowerRatio }: HardpointSlotProps) {
  const catColor = CAT_COLORS[hp.resolvedCategory] || "#52525b";
  const stat = item && isOn ? getKeyStat(hp.resolvedCategory, item.componentStats) : null;
  const displaySize = hp.maxSize > 0 ? hp.maxSize : (item?.size ?? 0);
  const parentIsTurret = (hp.resolvedCategory === "TURRET" || hp.resolvedCategory === "MISSILE_RACK")
    && (!isOverridden || isTurretOrRack(item));
  const hasChildren = parentIsTurret && childSlots && childSlots.length > 0;
  const isWeaponCat = hp.resolvedCategory === "WEAPON" || hp.resolvedCategory === "TURRET";

  return (
    <>
      <Row catColor={catColor} size={displaySize} item={item} stat={stat} isOn={isOn} isOverridden={isOverridden} onClick={onClick} onTogglePower={onTogglePower} hasChildren={hasChildren} depth={0} weaponPowerRatio={isWeaponCat ? weaponPowerRatio : undefined} />
      {hasChildren && isOn && childSlots!.map(ch => {
        const chOn = isComponentOn ? isComponentOn(ch.hardpointName) : true;
        const chColor = CAT_COLORS[ch.category] || catColor;
        const effectiveItem = getEffectiveItem ? getEffectiveItem(ch.id) : ch.equippedItem;
        const chStat = effectiveItem && chOn ? getKeyStat(ch.category || "WEAPON", effectiveItem.componentStats) : null;
        const chSize = ch.maxSize > 0 ? ch.maxSize : (effectiveItem?.size ?? 0);
        const chOverridden = effectiveItem && ch.equippedItem
          ? effectiveItem.id !== ch.equippedItem.id
          : (effectiveItem !== ch.equippedItem);
        return (
          <Row key={ch.id} catColor={chColor} size={chSize} item={effectiveItem} stat={chStat} isOn={chOn} isOverridden={chOverridden} onClick={() => onClickChild?.(ch)} onTogglePower={() => toggleComponent?.(ch.hardpointName)} hasChildren={false} depth={1} weaponPowerRatio={weaponPowerRatio} />
        );
      })}
    </>
  );
});

/** Format ammo count like the game: 4440, 1.2k, etc. */
function fmtAmmo(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(0) + "k";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return Math.round(n).toString();
}

/** Compute ammo info for weapon items based on power allocation */
function getAmmoInfo(stats: Record<string, any> | null, powerRatio?: number): { v: string; l: string; color: string } | null {
  if (!stats) return null;
  const weaponCap = stats.weaponCapacity ?? 0;
  const ammoCap = stats.ammoCapacity ?? 0;
  const alphaPhys = stats.alphaPhysical ?? 0;
  const alphaEnergy = stats.alphaEnergy ?? 0;

  if (weaponCap <= 0 && ammoCap <= 0) return null;

  const isEnergy = alphaEnergy > 0 && alphaPhys === 0;

  if (isEnergy) {
    // Energy weapon: weaponCapacity = capacitor pool (burst shots)
    // With power allocation, capacitor recharges → more sustained fire
    // At ratio=1 (max pips): effectively infinite (∞)
    // At partial pips: burst pool extended by recharge factor
    // At ratio=0: only the base capacitor pool
    if (weaponCap <= 0) return null;
    const ratio = powerRatio ?? 0;
    if (ratio >= 0.9) {
      return { v: "∞", l: "", color: "#22c55e" };
    } else if (ratio > 0) {
      const sustainFactor = 1 / (1 - ratio);
      const effectivePool = Math.round(Math.min(99999, weaponCap * sustainFactor));
      return { v: fmtAmmo(effectivePool), l: "", color: "#60a5fa" };
    } else {
      return { v: fmtAmmo(weaponCap), l: "", color: "#f59e0b" };
    }
  } else {
    // Ballistic weapon: fixed ammo count (doesn't change with pips)
    const totalAmmo = ammoCap > 0 ? ammoCap : weaponCap;
    if (totalAmmo <= 0) return null;
    return { v: fmtAmmo(totalAmmo), l: "", color: "#a3a3a3" };
  }
}

const Row = memo(function Row({ catColor, size, item, stat, isOn, isOverridden, onClick, onTogglePower, hasChildren, depth, weaponPowerRatio }: {
  catColor: string; size: number; item: EquippedItem | null;
  stat: { v: string; l: string } | null; isOn: boolean; isOverridden: boolean;
  onClick: () => void; onTogglePower: () => void; hasChildren?: boolean; depth: number;
  weaponPowerRatio?: number;
}) {
  const indent = depth > 0;
  const ammo = item && isOn ? getAmmoInfo(item.componentStats, weaponPowerRatio) : null;
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
        {ammo && (
          <div className="flex items-baseline gap-0.5 flex-shrink-0">
            <span className="text-[9px] font-mono font-medium" style={{ color: ammo.color }}>{ammo.v}</span>
            <span className="text-[7px] text-zinc-600 uppercase">{ammo.l}</span>
          </div>
        )}
        {stat && (
          <div className="flex items-baseline gap-0.5 flex-shrink-0">
            <span className="text-[10px] font-mono font-medium" style={{ color: catColor }}>{stat.v}</span>
            <span className="text-[7px] text-zinc-600 uppercase">{stat.l}</span>
          </div>
        )}
        {item?.componentStats?.penetrationDistance != null && item.componentStats.penetrationDistance > 0 && isOn && (
          <div className="flex items-baseline gap-0.5 flex-shrink-0 ml-0.5">
            <span className="text-[9px] font-mono font-medium text-emerald-400">{item.componentStats.penetrationDistance.toFixed(1)}</span>
            <span className="text-[7px] text-zinc-600 uppercase">PEN</span>
          </div>
        )}
        {!indent && <svg className="w-2.5 h-2.5 text-zinc-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
      </button>
    </div>
  );
});

const SKIP_CATEGORIES = new Set(["OTHER", "ARMOR", "FUEL_TANK", "FUEL_INTAKE", "AVIONICS", "THRUSTER_MAIN", "THRUSTER_MANEUVERING"]);

export function isUsefulSlot(hp: ResolvedHardpoint, item: EquippedItem | null): boolean {
  const n = hp.hardpointName.toLowerCase();
  if (!item && (n.includes("weapon_rack") || n.includes("weapon_regen_pool"))) return false;
  if (item) return true;
  if (hp.maxSize > 0) return true;
  if (SKIP_CATEGORIES.has(hp.resolvedCategory)) return false;
  return true;
}
