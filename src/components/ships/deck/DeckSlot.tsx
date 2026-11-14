"use client";
// =============================================================================
// SC LABS — DeckSlot + DeckHpGroup (Loadout.20, 2026-11-14)
//
// Tarjeta de componente en formato denso: tamaño, grado, nombre, fabricante,
// la cifra principal bien grande y una fila de datos secundarios. Reemplaza a
// la fila de una línea (HardpointSlot.Row) del layout anterior, que solo
// mostraba un número por componente.
//
// DeckHpGroup conserva TODA la lógica de slots hijos del HpGroup anterior
// (racks de misiles según el rack equipado, módulos de láser minero, torretas
// con armas) — solo cambia cómo se dibuja.
// =============================================================================

import { memo, useCallback } from "react";
import { Lock, Power } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useLoadoutStore } from "@/store/useLoadoutStore";
import type { EquippedItem, ResolvedChild, ResolvedHardpoint } from "@/store/useLoadoutStore";
import { CAT_COLORS, getKeyStat } from "../loadout-utils";
import {
  fmtAmmo,
  getAmmoInfo,
  isGhostItem,
  isIndustrialArm,
  isTurretOrRack,
} from "../HardpointSlot";
import { fmtInt, fmtSmall } from "./DeckCard";

// ─── Missile rack helpers (Loadout.2, 2026-05-03) ──────────────────────────
// Parser canónico del nombre del rack: MSD-XYZ / CST-XYZ / similar.
//   X = tamaño del rack (anclaje)
//   Y = cantidad de misiles/bombas (# slots)
//   Z = tamaño de cada misil/bomba
// Ej: MSD-322 → S3, 2 misiles S2. CST-313 → S3, 1 bomba S3. MSD-441 → 4 misiles S1.
//
// PRIORIDAD: name-parse PRIMERO, componentStats fallback.
// Motivo: la BD (missile_launchers.missile_count + ports.length) viene del
// extractor scunpacked y para algunos racks chicos cuenta puertos físicos del
// modelo 3D en lugar de slots lógicos del juego — ej. MSD-212 / MSD-313
// salen como `missilePorts=2` cuando deberían ser 1. El nombre del rack es
// la fuente más confiable porque CIG lo define con la convención XYZ.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseMissileRackSpec(rack: any | null | undefined): { slots: number; portSize: number } {
  if (!rack) return { slots: 0, portSize: 0 };
  const nameForParse = rack.localizedName || rack.name || "";
  const match = String(nameForParse).match(/-(\d)(\d)(\d)(?:\b|[^0-9])/);
  if (match) {
    return {
      slots: Number(match[2]),
      portSize: Number(match[3]),
    };
  }
  // Fallback: para racks con naming no-estándar (raros).
  return {
    slots: Number(rack.componentStats?.missilePorts ?? 0),
    portSize: Number(
      rack.componentStats?.maxMissileSize
        ?? rack.componentStats?.minMissileSize
        ?? 0
    ),
  };
}

// ─── Qué mostrar de cada componente ─────────────────────────────────────────

interface SubStat { l: string; v: string }
interface ItemSummary {
  headline: { v: string; l: string } | null;
  subs: SubStat[];
}

function num(cs: Record<string, unknown> | null | undefined, ...keys: string[]): number | null {
  if (!cs) return null;
  for (const k of keys) {
    const raw = cs[k];
    if (raw == null) continue;
    const n = Number(raw);
    if (!isNaN(n) && n !== 0) return n;
  }
  return null;
}

/** El fabricante a veces llega como UUID crudo de la BD: en ese caso no se muestra. */
function cleanManufacturer(m: string | null | undefined): string | null {
  if (!m) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(m)) return null;
  return m;
}

const TYPE_LABEL: Record<string, string> = {
  WEAPON: "Weapon", TURRET: "Mount", MISSILE_RACK: "Missile rack", MISSILE: "Ordnance",
  SHIELD: "Shield", POWER_PLANT: "Power plant", COOLER: "Cooler",
  QUANTUM_DRIVE: "Quantum drive", JUMP_DRIVE: "Jump drive", RADAR: "Radar",
  MINING: "Mining", MINING_MODULE: "Module", SALVAGE: "Salvage",
  UTILITY: "Utility", QIG: "Interdiction",
};

function damageType(cs: Record<string, unknown> | null | undefined): string | null {
  const p = num(cs, "alphaPhysical") ?? 0;
  const e = num(cs, "alphaEnergy") ?? 0;
  const d = num(cs, "alphaDistortion") ?? 0;
  const max = Math.max(p, e, d);
  if (max <= 0) return null;
  return max === e ? "Energy" : max === p ? "Ballistic" : "Distortion";
}

function summarize(
  category: string,
  item: EquippedItem,
  count: number,
  ammo: { rounds: number; label: string } | null,
  capacity: { slots: number; size: number } | null = null,
): ItemSummary {
  const cs = item.componentStats as Record<string, unknown> | null;
  const subs: SubStat[] = [];
  const push = (l: string, v: string | null) => { if (v) subs.push({ l, v }); };
  const val = (n: number | null, unit = "", dec = 1) => (n == null ? null : fmtSmall(n, dec) + unit);

  // ── Armas (también las que cuelgan de una torreta) ──
  const dps = num(cs, "dps");
  const alpha = num(cs, "alphaDamage", "damage");
  const isMissile = category === "MISSILE" || (num(cs, "lockTime", "lockRangeMax") != null && dps == null);

  if (isMissile && alpha != null) {
    push("track", typeof cs?.trackingType === "string" ? (cs.trackingType as string) : null);
    const lMin = num(cs, "lockRangeMin");
    const lMax = num(cs, "lockRangeMax");
    if (lMax != null) push("lock", `${fmtSmall((lMin ?? 0) / 1000)}–${fmtSmall(lMax / 1000)} km`);
    push("lock time", val(num(cs, "lockTime"), " s"));
    push("speed", val(num(cs, "linearSpeed"), " m/s", 0));
    if (count > 1) push("total", fmtInt(alpha * count));
    return { headline: { v: fmtInt(alpha), l: "dmg" }, subs };
  }

  if (dps != null || (alpha != null && (category === "WEAPON" || category === "TURRET"))) {
    push("alpha", val(alpha));
    push("rate", val(num(cs, "fireRate"), " rpm", 0));
    push("range", val(num(cs, "effectiveRange"), " m", 0));
    push("vel", val(num(cs, "ammoSpeed"), " m/s", 0));
    push("pen", val(num(cs, "penetrationDistance"), " m", 2));
    const sust = num(cs, "sustainedDps");
    if (sust != null && dps != null && Math.abs(sust - dps) > 0.5) push("sust", fmtSmall(sust));
    if (ammo) push(ammo.label.toLowerCase(), fmtAmmo(ammo.rounds));
    return {
      headline: dps != null ? { v: fmtSmall(dps), l: "dps" } : { v: fmtSmall(alpha), l: "alpha" },
      subs,
    };
  }

  switch (category) {
    case "MISSILE_RACK": {
      const ports = num(cs, "missilePorts");
      const size = num(cs, "maxMissileSize", "minMissileSize");
      // Si el grupo ya resolvió los slots reales (children del API o nombre
      // del rack), esa es la cifra que se muestra: así el "16×S3" del rack
      // coincide siempre con los misiles que aparecen al lado.
      const spec = parseMissileRackSpec(item);
      const n = capacity?.slots || spec.slots || ports;
      const s = capacity?.size || spec.portSize || size;
      return { headline: n && s ? { v: `${n}×S${s}`, l: "capacity" } : null, subs };
    }
    case "SHIELD": {
      push("regen", val(num(cs, "shieldRegen", "regenRate"), " hp/s", 0));
      push("full charge", val(num(cs, "regenTime"), " s"));
      push("dmg delay", val(num(cs, "damagedDelay"), " s"));
      push("down delay", val(num(cs, "downedDelay"), " s"));
      const hp = num(cs, "shieldHp", "maxHp");
      return { headline: hp != null ? { v: fmtInt(hp), l: "shield hp" } : null, subs };
    }
    case "POWER_PLANT": {
      push("em", val(num(cs, "emSignature"), "", 0));
      push("health", val(num(cs, "health"), "", 0));
      const out = num(cs, "powerOutput");
      return { headline: out != null ? { v: fmtSmall(out), l: "power" } : null, subs };
    }
    case "COOLER": {
      push("em", val(num(cs, "emSignature"), "", 0));
      push("ir", val(num(cs, "irSignature"), "", 0));
      push("draw", val(num(cs, "powerDraw"), " pwr", 0));
      const rate = num(cs, "coolingRate");
      return { headline: rate != null ? { v: fmtSmall(rate), l: "cooling" } : null, subs };
    }
    case "QUANTUM_DRIVE": {
      push("spool", val(num(cs, "spoolUpTime", "quantumSpoolUp"), " s"));
      push("cooldown", val(num(cs, "cooldownTime"), " s"));
      push("fuel", val(num(cs, "fuelRate"), "", 4));
      push("em", val(num(cs, "emSignature"), "", 0));
      const speed = num(cs, "maxSpeed");
      return {
        headline: speed != null ? { v: fmtSmall(speed / 1_000_000, 0), l: "Mm/s" } : null,
        subs,
      };
    }
    case "JUMP_DRIVE": {
      push("tuning", val(num(cs, "tuningRate"), "/s", 2));
      push("fuel eff", val(num(cs, "fuelEfficiencyMultiplier"), "×", 2));
      const align = num(cs, "alignmentRate");
      return { headline: align != null ? { v: fmtSmall(align, 2), l: "align /s" } : null, subs };
    }
    case "RADAR": {
      push("piercing", val(num(cs, "piercing"), "", 2));
      push("em", val(num(cs, "emSignature"), "", 0));
      push("draw", val(num(cs, "powerDraw"), " pwr", 0));
      const sens = num(cs, "sensitivity");
      return { headline: sens != null ? { v: fmtSmall(sens, 2), l: "sensitivity" } : null, subs };
    }
    default: {
      const k = getKeyStat(category, cs);
      return { headline: k ? { v: k.v, l: k.l.toLowerCase() } : null, subs };
    }
  }
}

// ─── Tarjeta de un slot ─────────────────────────────────────────────────────

interface SlotCardProps {
  category: string;
  size: number;
  item: EquippedItem | null;
  isOn: boolean;
  isOverridden: boolean;
  /** Slot fijo: no abre el selector. */
  locked?: boolean;
  /** Varios ítems idénticos agrupados (ej. 16 misiles del mismo rack). */
  count?: number;
  /** Versión baja para montajes/torretas que solo sostienen armas. */
  compact?: boolean;
  ammo?: { rounds: number; label: string } | null;
  /** Racks: cantidad y tamaño REAL de los slots que se muestran al lado. */
  capacity?: { slots: number; size: number } | null;
  onClick: () => void;
  onTogglePower?: () => void;
}

export const SlotCard = memo(function SlotCard({
  category, size, item, isOn, isOverridden, locked = false, count = 1, compact = false,
  ammo = null, capacity = null, onClick, onTogglePower,
}: SlotCardProps) {
  const color = CAT_COLORS[category] || CAT_COLORS.OTHER;
  const summary = item && isOn ? summarize(category, item, count, ammo, capacity) : { headline: null, subs: [] };
  const mfr = cleanManufacturer(item?.manufacturer);
  const typeLabel = TYPE_LABEL[category] ?? null;
  const dmg = item && (category === "WEAPON" || category === "TURRET") ? damageType(item.componentStats) : null;
  const meta = [mfr, dmg ?? typeLabel].filter(Boolean).join(" · ");

  return (
    <div
      className={
        "group flex items-stretch min-w-0 rounded-md border overflow-hidden transition-colors " +
        (isOn
          ? "border-zinc-800/80 bg-zinc-900/70 hover:border-amber-500/50"
          : "border-zinc-800/50 bg-zinc-900/30")
      }
    >
      <span
        aria-hidden
        className="w-[3px] shrink-0"
        style={{ backgroundColor: color, opacity: isOn ? 0.9 : 0.25 }}
      />
      <button
        type="button"
        onClick={onClick}
        disabled={locked}
        title={locked ? "Fixed slot" : item ? "Change component" : "Equip component"}
        className={
          "flex-1 min-w-0 text-left px-2.5 " + (compact ? "py-1.5" : "py-2") +
          (locked ? " cursor-default" : " cursor-pointer hover:bg-amber-500/[0.04]")
        }
      >
        <div className="flex items-start gap-2">
          <span
            className="shrink-0 mt-px inline-flex items-center justify-center h-[22px] min-w-[26px] px-1 rounded text-[11px] font-mono font-bold tabular-nums"
            style={{ color, backgroundColor: color + "22", boxShadow: `inset 0 0 0 1px ${color}55` }}
          >
            {size > 0 ? `S${size}` : "—"}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              {count > 1 && (
                <span className="shrink-0 text-[11px] font-mono font-bold text-amber-400 tabular-nums">{count}×</span>
              )}
              {item ? (
                <span
                  className={
                    "truncate text-[13px] font-semibold leading-tight " +
                    (isOn ? (isOverridden ? "text-amber-200" : "text-zinc-100") : "text-zinc-500")
                  }
                >
                  {item.localizedName || item.name}
                </span>
              ) : (
                <span className="truncate text-[12px] italic text-zinc-600">Empty slot</span>
              )}
              {item?.grade && (
                <span className="shrink-0 rounded-sm border border-zinc-700/70 px-1 text-[9px] font-mono font-semibold text-zinc-400 leading-[14px]">
                  {item.grade}
                </span>
              )}
              {isOverridden && item && (
                <span className="shrink-0 text-[8px] font-mono font-bold tracking-wider text-amber-500/80">MOD</span>
              )}
              {locked && <Lock size={10} aria-hidden className="shrink-0 text-zinc-600" />}
            </div>
            {(meta || !isOn) && (
              <div className="mt-0.5 truncate text-[10px] text-zinc-500">
                {!isOn ? <span className="font-mono tracking-widest text-amber-600/80">OFF</span> : meta}
              </div>
            )}
          </div>
          {summary.headline && (
            <div className="shrink-0 text-right pl-1">
              <div
                className={"font-mono font-bold tabular-nums leading-none " + (compact ? "text-[15px]" : "text-[19px]")}
                style={{ color }}
              >
                {summary.headline.v}
              </div>
              <div className="mt-1 text-[8px] font-mono uppercase tracking-[0.14em] text-zinc-500">
                {summary.headline.l}
              </div>
            </div>
          )}
        </div>
        {summary.subs.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono leading-tight">
            {summary.subs.map((s) => (
              <span key={s.l} className="whitespace-nowrap">
                <span className="text-zinc-600">{s.l} </span>
                <span className="text-zinc-300 tabular-nums">{s.v}</span>
              </span>
            ))}
          </div>
        )}
      </button>
      {onTogglePower && (
        <button
          type="button"
          onClick={onTogglePower}
          aria-pressed={isOn}
          aria-label={isOn ? "Power off" : "Power on"}
          title={isOn ? "Power off" : "Power on"}
          className={
            "w-7 shrink-0 flex items-center justify-center border-l border-zinc-800/60 transition-colors " +
            (isOn
              ? "text-emerald-500/80 hover:text-emerald-300 hover:bg-emerald-500/10"
              : "text-zinc-600 hover:text-amber-400 hover:bg-amber-500/10")
          }
        >
          <Power size={12} aria-hidden />
        </button>
      )}
    </div>
  );
});

// ─── Grupo de hardpoints (con sus hijos) ────────────────────────────────────

export function DeckHpGroup({
  hps,
  onClickHp,
  weaponAllocatedPips,
  weaponMaxPips,
  wide = false,
}: {
  hps: ResolvedHardpoint[];
  onClickHp: (hp: ResolvedHardpoint, parentItem?: EquippedItem | null) => void;
  weaponAllocatedPips?: number;
  weaponMaxPips?: number;
  /** Tarjeta de doble ancho: el montaje va a la izquierda y sus armas a la derecha. */
  wide?: boolean;
}) {
  const { getEffectiveItem, hasOverride, overrides, isComponentOn, toggleComponent } = useLoadoutStore(
    useShallow((s) => ({
      getEffectiveItem: s.getEffectiveItem,
      hasOverride: s.hasOverride,
      overrides: s.overrides,
      isComponentOn: s.isComponentOn,
      toggleComponent: s.toggleComponent,
    }))
  );

  // Convert a ResolvedChild into a synthetic ResolvedHardpoint so the picker can open for it.
  // parentItem se usa para que el picker sepa qué tipo de ordenanza acepta el
  // rack contenedor (ej: CST-313 Castillo → solo bombas, no misiles).
  const handleClickChild = useCallback((child: ResolvedChild, parentItem: EquippedItem | null) => {
    const synthetic: ResolvedHardpoint = {
      id: child.id,
      hardpointName: child.hardpointName,
      originalCategory: child.category,
      resolvedCategory: child.category || "WEAPON",
      minSize: child.minSize,
      maxSize: child.maxSize,
      isFixed: child.isFixed,
      defaultItem: child.equippedItem,
      children: [],
    };
    onClickHp(synthetic, parentItem);
  }, [onClickHp]);

  // Resuelve los slots hijos de un hardpoint padre según el ITEM EQUIPADO,
  // no según la data del ship loadout original. Esto es clave para dos casos:
  //
  //   a) MINING: los brazos mineros aceptan N módulos según el `moduleSlots`
  //      del láser equipado (Helix I=2, Arbor MH1=1, Klein-S1=0, Impact II=3).
  //
  //   b) MISSILE_RACK: los racks tienen N ports de tamaño fijo según el
  //      nombre (MSD-313 = 1 misil S3, MSD-322 = 2 misiles S2, MSD-441 = 4
  //      misiles S1…). Si cambiás el rack, el N y el tamaño de cada slot se
  //      actualizan automáticamente.
  //
  // IDs estables (parentId:missile:i) → preserva el ítem equipado cuando el
  // nuevo rack tiene el mismo nº de slots. Si baja el count, los overrides
  // sobrantes quedan huérfanos en el store (no molestan, no se renderizan).
  const resolveChildSlots = useCallback(
    (hp: ResolvedHardpoint): ResolvedChild[] => {
      if (hp.resolvedCategory === "MINING") {
        // Loadout.18 (2026-06-12): dos shapes posibles.
        //  a) Brazo sintético (Prospector/Golem): el item top-level ES el láser
        //     (trae moduleSlots) → solo slots de módulos.
        //  b) Torreta minera real (MOLE): el item top-level es la TORRETA y el
        //     láser viene como child del API → [cabeza minera, ...sus módulos].
        const topItem = getEffectiveItem(hp.id);
        const laserChild = hp.children.find(
          (c) => c.category === "MINING" || c.equippedItem?.componentStats?.moduleSlots != null,
        );
        const laser = laserChild
          ? (getEffectiveItem(laserChild.id) ?? laserChild.equippedItem)
          : topItem;
        const n = Number(laser?.componentStats?.moduleSlots ?? 0);
        const slots: ResolvedChild[] = [];
        if (laserChild) slots.push(laserChild);
        if (!n || n <= 0) return slots;
        for (let i = 1; i <= n; i++) {
          slots.push({
            id: `${hp.id}:module:${i}`,
            hardpointName: `${hp.hardpointName}_module_${i}`,
            category: "MINING_MODULE",
            minSize: 0,
            maxSize: 0,
            isFixed: false,
            equippedItem: null,
          });
        }
        return slots;
      }
      if (hp.resolvedCategory === "MISSILE_RACK") {
        const rack = getEffectiveItem(hp.id);
        if (!rack) return hp.children;

        // Loadout.16 (2026-06-12): si el rack equipado es el DEFAULT del barco
        // y el API trae children reales, esos children son la fuente canónica
        // de cantidad y misil default. Cubre racks custom por nave que rompen
        // la convención del nombre (MRCK_S04_AEGS_Redeemer se llama "MSD-442"
        // pero tiene 8 ports reales).
        if (!overrides.has(hp.id) && hp.children.length > 0) {
          return hp.children.map((ch, i) => ({
            id: `${hp.id}:missile:${i + 1}`,
            hardpointName: `${hp.hardpointName}_missile_${i + 1}`,
            category: "MISSILE",
            minSize: ch.maxSize || hp.maxSize || 1,
            maxSize: ch.maxSize || hp.maxSize || 1,
            isFixed: false,
            equippedItem: ch.equippedItem ?? null,
          }));
        }

        const spec = parseMissileRackSpec(rack);
        const n = spec.slots;
        let portSize = spec.portSize;

        // Fallback final: si ni el nombre ni componentStats dieron datos,
        // caer al ship loadout original (no romper la UI).
        if (!n || n <= 0) return hp.children;
        if (!portSize) portSize = hp.maxSize || 1;

        const slots: ResolvedChild[] = [];
        for (let i = 1; i <= n; i++) {
          slots.push({
            id: `${hp.id}:missile:${i}`,
            hardpointName: `${hp.hardpointName}_missile_${i}`,
            category: "MISSILE",
            minSize: portSize,
            maxSize: portSize,
            isFixed: false,
            // Heredar el default del ship loadout solo si el nº de slots
            // coincide (mismo rack equipado = preservar orden).
            equippedItem: hp.children.length === n ? hp.children[i - 1]?.equippedItem ?? null : null,
          });
        }
        return slots;
      }
      return hp.children;
    },
    [getEffectiveItem, overrides],
  );

  if (hps.length === 0) return null;
  const allocPips = weaponAllocatedPips ?? 0;
  const maxPips = weaponMaxPips ?? 0;

  return (
    <div className="flex flex-col gap-2">
      {hps.map((hp) => {
        const rawItem = getEffectiveItem(hp.id);
        // Loadout.8: placeholders fantasma de scunpacked ("WEAPONS", "HEAT") = vacío.
        const item = isGhostItem(rawItem) ? null : rawItem;
        const isOn = isComponentOn(hp.hardpointName);
        const isOverridden = overrides.has(hp.id);
        const cat = hp.resolvedCategory;
        const size = hp.maxSize > 0 ? hp.maxSize : (item?.size ?? 0);
        const isWeapon = cat === "WEAPON" || cat === "TURRET";

        const parentIsTurret = (cat === "TURRET" || cat === "MISSILE_RACK")
          && (!isOverridden || isTurretOrRack(item));
        // MINING/SALVAGE también llevan children (módulos / tractor+scraper).
        const parentIsIndustrial = (cat === "MINING" || cat === "SALVAGE")
          && (!isOverridden || isIndustrialArm(item));
        const childSlots = (parentIsTurret || parentIsIndustrial) ? resolveChildSlots(hp) : [];
        const hasChildren = childSlots.length > 0;
        // Racks integrados al fuselaje: no se cambia el rack, solo los misiles.
        const locked = cat === "MISSILE_RACK" && hp.isFixed;

        const parentCard = (
          <SlotCard
            category={cat}
            size={size}
            item={item}
            isOn={isOn}
            isOverridden={isOverridden}
            locked={locked}
            compact={hasChildren}
            capacity={cat === "MISSILE_RACK" && hasChildren ? { slots: childSlots.length, size: childSlots[0].maxSize } : null}
            ammo={isWeapon && item && isOn && !hasChildren ? getAmmoInfo(item.componentStats ?? undefined, allocPips, maxPips) : null}
            onClick={() => onClickHp(hp)}
            onTogglePower={() => toggleComponent(hp.hardpointName)}
          />
        );

        if (!hasChildren || !isOn) return <div key={hp.id}>{parentCard}</div>;

        // ── Hijos: resolver el ítem efectivo de cada uno ──
        const resolved = childSlots.map((ch) => {
          // Si el store tiene un override para este child (puede ser null si el
          // user lo vació), respetarlo; si no, el default del API.
          const overridden = hasOverride(ch.id);
          const effective = overridden ? getEffectiveItem(ch.id) : ch.equippedItem;
          const changed = effective && ch.equippedItem
            ? effective.id !== ch.equippedItem.id
            : effective !== ch.equippedItem;
          return { ch, effective, changed };
        });

        // Un rack lleva un solo tipo de ordenanza (Fase O.2): si todos los
        // slots tienen el mismo misil, se muestra UNA tarjeta con "16×".
        const allMissiles = resolved.every((r) => r.ch.category === "MISSILE");
        const firstId = resolved[0]?.effective?.id ?? null;
        const groupable = allMissiles && resolved.length > 1
          && resolved.every((r) => (r.effective?.id ?? null) === firstId);

        const childCards = groupable ? (
          <SlotCard
            category="MISSILE"
            size={resolved[0].ch.maxSize > 0 ? resolved[0].ch.maxSize : (resolved[0].effective?.size ?? 0)}
            item={resolved[0].effective}
            isOn
            isOverridden={!!resolved[0].changed}
            count={resolved.length}
            onClick={() => handleClickChild(resolved[0].ch, item)}
          />
        ) : (
          resolved.map(({ ch, effective, changed }, idx) => {
            const chCat = ch.category || "WEAPON";
            const chOn = isComponentOn(ch.hardpointName);
            const chSize = ch.maxSize > 0 ? ch.maxSize : (effective?.size ?? 0);
            return (
              <SlotCard
                // Algunos dumps repiten el id entre hijos: el índice desempata.
                key={`${ch.id}:${idx}`}
                category={chCat}
                size={chSize}
                item={effective}
                isOn={chOn}
                isOverridden={!!changed}
                ammo={chCat === "WEAPON" && effective && chOn ? getAmmoInfo(effective.componentStats ?? undefined, allocPips, maxPips) : null}
                onClick={() => handleClickChild(ch, item)}
                onTogglePower={() => toggleComponent(ch.hardpointName)}
              />
            );
          })
        );

        return (
          <div
            key={hp.id}
            className={
              wide
                ? "grid gap-2 grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] items-start"
                : "flex flex-col gap-1.5"
            }
          >
            {parentCard}
            <div
              className={
                "flex flex-col gap-1.5 min-w-0 " +
                (wide ? "" : "ml-3 pl-2 border-l border-zinc-800/70")
              }
            >
              {childCards}
            </div>
          </div>
        );
      })}
    </div>
  );
}
