// =============================================================================
// AL FILO — GET /api/ships/[id] (v2 — CORREGIDO)
//
// Cambios respecto a v1:
//   1. Prisma include ahora baja 2 niveles de profundidad: un turret/gimbal
//      tiene hardpoints HIJOS que contienen las armas reales. Necesitamos
//      traer equippedItem → hardpoints (del turret) → equippedItem → stats.
//   2. computeLoadoutStats ahora es recursivo: si un equippedItem es un
//      turret/gimbal (type TURRET), busca las armas montadas dentro de él.
//   3. La respuesta incluye un `flatHardpoints` aplanado para que el
//      frontend no tenga que lidiar con la recursión.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Prisma include reutilizable — 2 niveles de profundidad
// ─────────────────────────────────────────────────────────────────────────────

// Nivel más profundo: el item real (arma dentro de turret)
const equippedItemInclude = {
  componentStats: true,
} as const;

// Un hardpoint con su item equipado
const hardpointInclude = {
  equippedItem: {
    include: {
      ...equippedItemInclude,
      // Si el item equipado es un turret/gimbal, tiene sus PROPIOS hardpoints
      // donde están montadas las armas reales
      hardpoints: {
        include: {
          equippedItem: {
            include: equippedItemInclude,
          },
        },
      },
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// GET handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const ship = await prisma.item.findFirst({
      where: {
        OR: [
          { id: id },
          { reference: id },
          { className: id },
        ],
        type: { in: ["SHIP", "VEHICLE"] },
      },
      include: {
        ship: true,
        hardpoints: {
          include: hardpointInclude,
          orderBy: [
            { category: "asc" },
            { maxSize: "desc" },
            { hardpointName: "asc" },
          ],
        },
      },
    });

    if (!ship) {
      return NextResponse.json(
        { error: "Nave no encontrada" },
        { status: 404 }
      );
    }

    // ── Aplanar hardpoints (resolver turrets → armas internas) ──
    const flatHardpoints = flattenHardpoints(ship.hardpoints);

    // ── Computar stats sobre los hardpoints aplanados ──
    const computed = computeLoadoutStats(flatHardpoints);

    // Limpiar rawData de la respuesta
    const { rawData, ...shipWithoutRaw } = ship;

    // Limpiar rawData de items equipados también (anidados)
    const cleanedHardpoints = ship.hardpoints.map((hp: any) => {
      const { equippedItem, ...hpRest } = hp;
      if (!equippedItem) return hp;

      const { rawData: _raw, hardpoints: childHps, ...itemRest } = equippedItem;

      // Si tiene hijos (es turret), limpiar rawData de los hijos también
      const cleanedChildren = childHps?.map((childHp: any) => {
        if (!childHp.equippedItem) return childHp;
        const { rawData: _childRaw, ...childItemRest } = childHp.equippedItem;
        return { ...childHp, equippedItem: childItemRest };
      });

      return {
        ...hpRest,
        equippedItem: {
          ...itemRest,
          ...(cleanedChildren ? { hardpoints: cleanedChildren } : {}),
        },
      };
    });

    return NextResponse.json(
      {
        data: { ...shipWithoutRaw, hardpoints: cleanedHardpoints },
        flatHardpoints,
        computed,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("[API /ships/[id]] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener la nave" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Flatten: resuelve turrets/gimbals a sus armas internas
// ─────────────────────────────────────────────────────────────────────────────

interface FlatHardpoint {
  id: string;
  hardpointName: string;
  category: string;
  minSize: number;
  maxSize: number;
  isFixed: boolean;
  isManned: boolean;
  isInternal: boolean;
  /** El item montado directamente en este slot */
  equippedItem: EquippedItemFlat | null;
  /** Si es turret/gimbal: las armas montadas dentro */
  childWeapons: {
    hardpointName: string;
    maxSize: number;
    equippedItem: EquippedItemFlat | null;
  }[];
  /** Marcador para el UI: este hardpoint tiene hijos con armas */
  isTurretOrGimbal: boolean;
}

interface EquippedItemFlat {
  id: string;
  reference: string;
  name: string;
  localizedName: string | null;
  className: string | null;
  type: string;
  size: number | null;
  grade: string | null;
  manufacturer: string | null;
  componentStats: {
    dps: number | null;
    alphaDamage: number | null;
    fireRate: number | null;
    range: number | null;
    speed: number | null;
    ammoCount: number | null;
    damageType: string | null;
    shieldHp: number | null;
    shieldRegen: number | null;
    shieldDownDelay: number | null;
    powerOutput: number | null;
    coolingRate: number | null;
    quantumSpeed: number | null;
    quantumRange: number | null;
    quantumCooldown: number | null;
    quantumSpoolUp: number | null;
    powerDraw: number | null;
    thermalOutput: number | null;
    emSignature: number | null;
    irSignature: number | null;
  } | null;
}

function flattenHardpoints(hardpoints: any[]): FlatHardpoint[] {
  return hardpoints.map((hp) => {
    const equipped = hp.equippedItem;

    // Detectar si el item equipado es un turret/gimbal que contiene armas
    const isTurretOrGimbal =
      equipped &&
      (equipped.type === "TURRET" || equipped.type === "WEAPON") &&
      Array.isArray(equipped.hardpoints) &&
      equipped.hardpoints.length > 0;

    // Extraer armas hijas si es turret
    const childWeapons: FlatHardpoint["childWeapons"] = [];
    if (isTurretOrGimbal && equipped.hardpoints) {
      for (const childHp of equipped.hardpoints) {
        childWeapons.push({
          hardpointName: childHp.hardpointName,
          maxSize: childHp.maxSize,
          equippedItem: childHp.equippedItem
            ? flattenEquippedItem(childHp.equippedItem)
            : null,
        });
      }
    }

    return {
      id: hp.id,
      hardpointName: hp.hardpointName,
      category: hp.category,
      minSize: hp.minSize,
      maxSize: hp.maxSize,
      isFixed: hp.isFixed,
      isManned: hp.isManned,
      isInternal: hp.isInternal,
      equippedItem: equipped ? flattenEquippedItem(equipped) : null,
      childWeapons,
      isTurretOrGimbal: !!isTurretOrGimbal,
    };
  });
}

function flattenEquippedItem(item: any): EquippedItemFlat {
  return {
    id: item.id,
    reference: item.reference,
    name: item.name,
    localizedName: item.localizedName,
    className: item.className,
    type: item.type,
    size: item.size,
    grade: item.grade,
    manufacturer: item.manufacturer,
    componentStats: item.componentStats || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute stats — ahora con resolución recursiva de turrets
// ─────────────────────────────────────────────────────────────────────────────

function computeLoadoutStats(flatHardpoints: FlatHardpoint[]) {
  let totalDps = 0;
  let totalAlphaDamage = 0;
  let totalShieldHp = 0;
  let totalShieldRegen = 0;
  let totalPowerDraw = 0;
  let totalPowerOutput = 0;
  let totalCooling = 0;
  let totalThermalOutput = 0;

  const hardpointSummary = {
    weapons: 0,
    missiles: 0,
    shields: 0,
    coolers: 0,
    powerPlants: 0,
    quantumDrives: 0,
  };

  for (const hp of flatHardpoints) {
    const equipped = hp.equippedItem;
    const stats = equipped?.componentStats;

    // ── Contar por categoría ──
    switch (hp.category) {
      case "WEAPON":
      case "TURRET":
        hardpointSummary.weapons++;
        break;
      case "MISSILE_RACK":
        hardpointSummary.missiles++;
        break;
      case "SHIELD":
        hardpointSummary.shields++;
        break;
      case "COOLER":
        hardpointSummary.coolers++;
        break;
      case "POWER_PLANT":
        hardpointSummary.powerPlants++;
        break;
      case "QUANTUM_DRIVE":
        hardpointSummary.quantumDrives++;
        break;
    }

    // ── Sumar stats del item directo ──
    if (stats) {
      // Para items que NO son turrets, sumar su DPS directamente
      if (!hp.isTurretOrGimbal) {
        totalDps += stats.dps || 0;
        totalAlphaDamage += stats.alphaDamage || 0;
      }

      totalShieldHp += stats.shieldHp || 0;
      totalShieldRegen += stats.shieldRegen || 0;
      totalPowerDraw += stats.powerDraw || 0;
      totalPowerOutput += stats.powerOutput || 0;
      totalCooling += stats.coolingRate || 0;
      totalThermalOutput += stats.thermalOutput || 0;
    }

    // ── Si es turret/gimbal, sumar DPS de las armas hijas ──
    if (hp.isTurretOrGimbal) {
      for (const child of hp.childWeapons) {
        const childStats = child.equippedItem?.componentStats;
        if (!childStats) continue;

        totalDps += childStats.dps || 0;
        totalAlphaDamage += childStats.alphaDamage || 0;

        // Las armas hijas también consumen energía y generan calor
        totalPowerDraw += childStats.powerDraw || 0;
        totalThermalOutput += childStats.thermalOutput || 0;
      }
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    totalDps:          round2(totalDps),
    totalAlphaDamage:  round2(totalAlphaDamage),
    totalShieldHp:     round2(totalShieldHp),
    totalShieldRegen:  round2(totalShieldRegen),
    totalPowerDraw:    round2(totalPowerDraw),
    totalPowerOutput:  round2(totalPowerOutput),
    totalCooling:      round2(totalCooling),
    totalThermalOutput: round2(totalThermalOutput),
    powerBalance:      round2(totalPowerOutput - totalPowerDraw),
    thermalBalance:    round2(totalCooling - totalThermalOutput),
    hardpointSummary,
  };
}
