// =============================================================================
// AL FILO — HardpointSlot v12 (Recursive Children + Ammo Display)
// Renders child weapons/missiles below turrets/racks with indent.
// Ammo formula (energy weapons):
//   rounds = requestedAmmoLoad × (allocPips / maxPips) / regenCostPerBullet
// Ballistic weapons: fixed ammoCapacity (no pip dependency).
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
  // onClickChild recibe child + parentItem para que el picker pueda inferir
  // qué tipo de ordenanza acepta (ej: bomb rack CST-313 → solo bombas).
  onClickChild?: (child: ResolvedChild, parentItem: EquippedItem | null) => void;
  getEffectiveItem?: (id: string) => EquippedItem | null;
  /**
   * Distingue "el usuario hizo override (incluso clearSlot)" de "no hay info
   * en el store". Necesario para slots child sintéticos (ej. missile rack
   * children) donde el id no aparece en hardpoints[].children del store y
   * getEffectiveItem retorna null por default — sin esto los misiles
   * default del rack se renderizaban vacíos.
   */
  hasOverride?: (id: string) => boolean;
  // Weapon ammo props (energy capacitor system)
  weaponAllocatedPips?: number;
  weaponMaxPips?: number;
}

/** Check if an item is a turret/gimbal (has children) vs a direct weapon */
function isTurretOrRack(item: EquippedItem | null): boolean {
  if (!item) return false;
  const n = (item.name ?? "") + " " + (item.type ?? "");
  return /turret|gimbal|varipuck|rack/i.test(n);
}

/** Check if an item can host industrial children (mining laser + module slots,
 *  salvage head + tractor/scraper). Usado para que, aunque el user cambie el
 *  laser, los slots de módulos sigan ahí mientras sea un mining laser válido. */
function isIndustrialArm(item: EquippedItem | null): boolean {
  if (!item) return false;
  const n = (item.name ?? "") + " " + (item.type ?? "");
  return /mining|salvage|scraper|tractor/i.test(n);
}

/** Compute ammo info for a weapon item given current pip allocation.
 *  Energy weapons: rounds = min(requestedAmmoLoad, maxAmmoLoad × regenCostPerBullet) × pipRatio / regenCostPerBullet
 *    → el cap por maxAmmoLoad replica el límite game-accurate que muestra Erkul.
 *    Ej Panther: requestedAmmoLoad=18187, cost=48.5, maxAmmoLoad=75.
 *    Sin cap: 18187/48.5 = 375 (incorrecto). Con cap: min(18187, 3637.5)/48.5 = 75 (match game).
 *  Ballistic weapons: fixed ammoCapacity (no pip dependency).
 *
 *  Pipes a 0 en weapons → munición sostenible = 0 (game-accurate: sin power
 *  el capacitor no se recarga, así que después del primer burst el arma se
 *  agota). El store garantiza que `allocPips` siempre viene inicializado
 *  (auto-alloc corre al montar), así que NO hace falta el fallback "asumir
 *  full power" — ese fallback era el que hacía que al vaciar los pips la
 *  UI siguiera mostrando munición completa. */
function getAmmoInfo(
  cs: Record<string, any> | undefined,
  allocPips: number,
  maxPips: number,
): { rounds: number; label: string } | null {
  if (!cs) return null;

  // Energy weapon (capacitor-based)
  const reqAmmo = cs.requestedAmmoLoad;
  const costPerBullet = cs.regenCostPerBullet;
  if (reqAmmo > 0 && costPerBullet > 0 && maxPips > 0) {
    // pipRatio = allocación real del store / máximo. 0 pips → 0 ratio → 0 rounds.
    const pipRatio = Math.max(0, Math.min(1, allocPips / maxPips));
    // Cap requested pool at game-accurate maxAmmoLoad (if present).
    // maxAmmoLoad está en "rounds" → convertir a "energy units" multiplicando por costPerBullet.
    const maxAmmoLoad = cs.maxAmmoLoad;
    const requestedCapped = maxAmmoLoad > 0
      ? Math.min(reqAmmo, maxAmmoLoad * costPerBullet)
      : reqAmmo;
    const rounds = Math.round(requestedCapped * pipRatio / costPerBullet);
    return { rounds, label: "RND" };
  }

  // Ballistic weapon (fixed magazine)
  const ballistic = cs.ammoCapacity ?? cs.maxAmmoCount;
  if (ballistic != null && ballistic > 0) {
    return { rounds: Math.round(ballistic), label: "MAG" };
  }

  return null;
}

/** Format large round counts: 1234 → "1.2k" */
function fmtAmmo(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1) + "k";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

export const HardpointSlot = memo(function HardpointSlot({ hp, item, isOverridden, isOn, onClick, onTogglePower, childSlots, isComponentOn, toggleComponent, onClickChild, getEffectiveItem, hasOverride, weaponAllocatedPips, weaponMaxPips }: HardpointSlotProps) {
  const catColor = CAT_COLORS[hp.resolvedCategory] || "#52525b";
  const stat = item && isOn ? getKeyStat(hp.resolvedCategory, item.componentStats) : null;
  const displaySize = hp.maxSize > 0 ? hp.maxSize : (item?.size ?? 0);
  const parentIsTurret = (hp.resolvedCategory === "TURRET" || hp.resolvedCategory === "MISSILE_RACK")
    && (!isOverridden || isTurretOrRack(item));
  // MINING/SALVAGE también llevan children (module slots / tractor+scraper). Si
  // el user cambia el laser por otro laser, los slots siguen siendo válidos.
  const parentIsIndustrial = (hp.resolvedCategory === "MINING" || hp.resolvedCategory === "SALVAGE")
    && (!isOverridden || isIndustrialArm(item));
  const hasChildren = (parentIsTurret || parentIsIndustrial) && childSlots && childSlots.length > 0;
  const isWeapon = hp.resolvedCategory === "WEAPON" || hp.resolvedCategory === "TURRET";
  const ammo = isWeapon && item && isOn ? getAmmoInfo(item.componentStats, weaponAllocatedPips ?? 0, weaponMaxPips ?? 0) : null;

  return (
    <>
      <Row catColor={catColor} size={displaySize} item={item} stat={stat} isOn={isOn} isOverridden={isOverridden} onClick={onClick} onTogglePower={onTogglePower} hasChildren={hasChildren} depth={0} ammo={ammo} />
      {hasChildren && isOn && childSlots!.map(ch => {
        const chOn = isComponentOn ? isComponentOn(ch.hardpointName) : true;
        const chColor = CAT_COLORS[ch.category] || catColor;
        // Si el store tiene un override registrado para este child id (puede
        // ser null cuando el user vacía explícitamente), respetarlo. Sino,
        // caer al default del API (ch.equippedItem) — necesario para misiles
        // default de un rack porque sus IDs sintéticos no viven en
        // hardpoints[].children y getEffectiveItem retorna null.
        const childOverridden = hasOverride ? hasOverride(ch.id) : false;
        const effectiveItem = childOverridden && getEffectiveItem
          ? getEffectiveItem(ch.id)
          : ch.equippedItem;
        const chStat = effectiveItem && chOn ? getKeyStat(ch.category || "WEAPON", effectiveItem.componentStats) : null;
        const chSize = ch.maxSize > 0 ? ch.maxSize : (effectiveItem?.size ?? 0);
        const chOverridden = effectiveItem && ch.equippedItem
          ? effectiveItem.id !== ch.equippedItem.id
          : (effectiveItem !== ch.equippedItem);
        const chIsWeapon = (ch.category || "WEAPON") === "WEAPON";
        const chAmmo = chIsWeapon && effectiveItem && chOn ? getAmmoInfo(effectiveItem.componentStats, weaponAllocatedPips ?? 0, weaponMaxPips ?? 0) : null;
        return (
          <Row key={ch.id} catColor={chColor} size={chSize} item={effectiveItem} stat={chStat} isOn={chOn} isOverridden={chOverridden} onClick={() => onClickChild?.(ch, item)} onTogglePower={() => toggleComponent?.(ch.hardpointName)} hasChildren={false} depth={1} ammo={chAmmo} />
        );
      })}
    </>
  );
});

const Row = memo(function Row({ catColor, size, item, stat, isOn, isOverridden, onClick, onTogglePower, hasChildren, depth, ammo }: {
  catColor: string; size: number; item: EquippedItem | null;
  stat: { v: string; l: string } | null; isOn: boolean; isOverridden: boolean;
  onClick: () => void; onTogglePower: () => void; hasChildren?: boolean; depth: number;
  ammo?: { rounds: number; label: string } | null;
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
        {item?.componentStats?.penetrationDistance != null && item.componentStats.penetrationDistance > 0 && isOn && (
          <div className="flex items-baseline gap-0.5 flex-shrink-0 ml-0.5">
            <span className="text-[9px] font-mono font-medium text-emerald-400">{item.componentStats.penetrationDistance.toFixed(1)}</span>
            <span className="text-[7px] text-zinc-600 uppercase">PEN</span>
          </div>
        )}
        {ammo && isOn && (
          <div className="flex items-baseline gap-0.5 flex-shrink-0 ml-0.5">
            <span className="text-[9px] font-mono font-medium text-amber-400">{fmtAmmo(ammo.rounds)}</span>
            <span className="text-[7px] text-zinc-600 uppercase">{ammo.label}</span>
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
