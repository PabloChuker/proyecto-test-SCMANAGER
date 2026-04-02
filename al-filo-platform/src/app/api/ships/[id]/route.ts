// =============================================================================
// AL FILO — GET /api/ships/[id] v7 (Recursive Hardpoints)
//
// Includes 2 levels of hardpoint depth so turret child weapons are loaded.
// flatHardpoints now includes children[] for each turret/rack parent.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 300;

const STATS_INCLUDE = {
  weaponStats: true, shieldStats: true, powerStats: true,
  coolingStats: true, quantumStats: true, miningStats: true,
  missileStats: true, thrusterStats: true,
} as const;

// 2 levels deep: ship → hardpoints → equippedItem → hardpoints → equippedItem
const HARDPOINT_INCLUDE = {
  equippedItem: {
    include: {
      ...STATS_INCLUDE,
      hardpoints: {
        include: {
          equippedItem: { include: STATS_INCLUDE },
        },
        orderBy: [{ maxSize: "desc" as const }, { hardpointName: "asc" as const }],
      },
    },
  },
} as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const ship = await prisma.item.findFirst({
      where: { OR: [{ id }, { reference: id }, { className: id }], type: { in: ["SHIP", "VEHICLE"] } },
      include: {
        ship: true,
        hardpoints: {
          include: HARDPOINT_INCLUDE,
          orderBy: [{ category: "asc" }, { maxSize: "desc" }, { hardpointName: "asc" }],
        },
      },
    });

    if (!ship) return NextResponse.json({ error: "Nave no encontrada" }, { status: 404 });

    const flatHardpoints = buildFlatHardpoints(ship.hardpoints);

    const { rawData: _r, ...shipClean } = ship;
    const cleanHardpoints = cleanHps(ship.hardpoints);

    return NextResponse.json(
      { data: { ...shipClean, hardpoints: cleanHardpoints }, flatHardpoints },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (error) {
    console.error("[API /ships/[id]] Error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// =============================================================================
// Clean rawData recursively
// =============================================================================

function cleanHps(hardpoints: any[]): any[] {
  if (!hardpoints || !Array.isArray(hardpoints)) return [];
  return hardpoints.map((hp: any) => {
    if (!hp.equippedItem) return hp;
    const { rawData: _ir, ...itemClean } = hp.equippedItem;
    const childHps = itemClean.hardpoints ? cleanHps(itemClean.hardpoints) : [];
    return { ...hp, equippedItem: { ...itemClean, hardpoints: childHps } };
  });
}

// =============================================================================
// Merge stats tables into componentStats
// =============================================================================

function mergeStats(equipped: any): Record<string, any> | null {
  if (!equipped) return null;
  const tables = [equipped.weaponStats, equipped.shieldStats, equipped.powerStats, equipped.coolingStats, equipped.quantumStats, equipped.miningStats, equipped.missileStats, equipped.thrusterStats];
  const merged: Record<string, any> = {};
  let hasAny = false;
  for (const table of tables) {
    if (!table || typeof table !== "object") continue;
    hasAny = true;
    for (const [key, val] of Object.entries(table)) {
      if (key === "id" || key === "itemId") continue;
      if (val !== null && val !== undefined) merged[key] = val;
    }
  }
  if (merged.maxHp !== undefined && !merged.shieldHp) merged.shieldHp = merged.maxHp;
  if (merged.regenRate !== undefined && !merged.shieldRegen) merged.shieldRegen = merged.regenRate;
  if (merged.damage !== undefined && !merged.alphaDamage) merged.alphaDamage = merged.damage;
  if (!merged.dps && merged.alphaDamage && merged.fireRate) {
    const a = Number(merged.alphaDamage), fr = Number(merged.fireRate);
    if (a > 0 && fr > 0) merged.dps = Math.round(a * (fr / 60) * 100) / 100;
  }
  return hasAny ? merged : null;
}

// =============================================================================
// Build flat hardpoints with children for turrets/racks
// =============================================================================

interface FlatChild {
  id: string; hardpointName: string; category: string;
  minSize: number; maxSize: number; isFixed: boolean;
  equippedItem: FlatItem | null;
}

interface FlatItem {
  id: string; reference: string; name: string; localizedName: string | null;
  className: string | null; type: string; size: number | null;
  grade: string | null; manufacturer: string | null;
  componentStats: Record<string, any> | null;
}

interface FlatHardpoint {
  id: string; hardpointName: string; category: string;
  minSize: number; maxSize: number; isFixed: boolean;
  isManned: boolean; isInternal: boolean;
  equippedItem: FlatItem | null;
  children: FlatChild[];
}

function flattenItem(eq: any): FlatItem | null {
  if (!eq) return null;
  return {
    id: eq.id, reference: eq.reference, name: eq.name,
    localizedName: eq.localizedName ?? null, className: eq.className ?? null,
    type: eq.type, size: eq.size ?? null, grade: eq.grade ?? null,
    manufacturer: eq.manufacturer ?? null, componentStats: mergeStats(eq),
  };
}

function buildFlatHardpoints(hardpoints: any[]): FlatHardpoint[] {
  if (!hardpoints || !Array.isArray(hardpoints)) return [];

  // Collect all child hardpoint IDs so we can exclude them from the root list
  const childIds = new Set<string>();
  for (const hp of hardpoints) {
    const childHps = hp.equippedItem?.hardpoints;
    if (Array.isArray(childHps)) {
      for (const ch of childHps) childIds.add(ch.id);
    }
  }

  return hardpoints
    .filter((hp) => !childIds.has(hp.id)) // Exclude children from root
    .map((hp) => {
      const eq = hp.equippedItem;
      const children: FlatChild[] = [];

      // If this item has child hardpoints (turret guns, rack missiles)
      if (eq?.hardpoints && Array.isArray(eq.hardpoints)) {
        for (const ch of eq.hardpoints) {
          children.push({
            id: ch.id, hardpointName: ch.hardpointName, category: ch.category,
            minSize: ch.minSize, maxSize: ch.maxSize, isFixed: ch.isFixed,
            equippedItem: flattenItem(ch.equippedItem),
          });
        }
      }

      return {
        id: hp.id, hardpointName: hp.hardpointName, category: hp.category,
        minSize: hp.minSize, maxSize: hp.maxSize, isFixed: hp.isFixed,
        isManned: hp.isManned, isInternal: hp.isInternal,
        equippedItem: flattenItem(eq),
        children,
      };
    });
}
