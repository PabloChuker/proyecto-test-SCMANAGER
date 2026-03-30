// =============================================================================
// AL FILO — GET /api/ships/[id] (v5 — Mega Schema v2 compatible)
//
// Fix: componentStats no longer exists as a single table.
// Stats are now split into weaponStats, shieldStats, powerStats, etc.
// The Prisma include fetches ALL stats tables for each equippedItem.
// The flatten function merges whichever one is non-null into a unified
// `componentStats` object so the frontend (Zustand store, LoadoutBuilder)
// doesn't need to change.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 300;

// All stats tables to include on equipped items
const STATS_INCLUDE = {
  weaponStats: true,
  shieldStats: true,
  powerStats: true,
  coolingStats: true,
  quantumStats: true,
  miningStats: true,
  missileStats: true,
  thrusterStats: true,
} as const;

const USEFUL_CATS = new Set([
  "WEAPON", "TURRET", "MISSILE_RACK",
  "SHIELD", "POWER_PLANT", "COOLER",
  "QUANTUM_DRIVE", "MINING",
]);

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
          include: {
            equippedItem: {
              include: STATS_INCLUDE,
            },
          },
          orderBy: [
            { category: "asc" },
            { maxSize: "desc" },
            { hardpointName: "asc" },
          ],
        },
      },
    });

    if (!ship) {
      return NextResponse.json({ error: "Nave no encontrada" }, { status: 404 });
    }

    const flatHardpoints = buildFlatHardpoints(ship.hardpoints);
    const computed = computeLoadoutStats(flatHardpoints);

    const { rawData: _shipRaw, ...shipClean } = ship;
    const cleanHardpoints = ship.hardpoints.map((hp: any) => {
      if (!hp.equippedItem) return hp;
      const { rawData: _r, ...itemClean } = hp.equippedItem;
      return { ...hp, equippedItem: itemClean };
    });

    return NextResponse.json(
      {
        data: { ...shipClean, hardpoints: cleanHardpoints },
        flatHardpoints,
        computed,
      },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (error) {
    console.error("[API /ships/[id]] Error:", error);
    return NextResponse.json({ error: "Error interno al obtener la nave" }, { status: 500 });
  }
}

// =============================================================================
// Merge stats: take whichever stats table is non-null and flatten into one object
// =============================================================================

function mergeStats(equipped: any): Record<string, any> | null {
  if (!equipped) return null;

  // Try each stats table; the first non-null one is the source
  const tables = [
    equipped.weaponStats,
    equipped.shieldStats,
    equipped.powerStats,
    equipped.coolingStats,
    equipped.quantumStats,
    equipped.miningStats,
    equipped.missileStats,
    equipped.thrusterStats,
  ];

  // Merge all non-null tables into one flat object
  // (an item should only have one, but merging handles edge cases)
  const merged: Record<string, any> = {};
  let hasAny = false;

  for (const table of tables) {
    if (!table || typeof table !== "object") continue;
    hasAny = true;
    for (const [key, val] of Object.entries(table)) {
      // Skip Prisma internal fields
      if (key === "id" || key === "itemId") continue;
      if (val !== null && val !== undefined) {
        merged[key] = val;
      }
    }
  }

  // Map v2 field names to v1 names the frontend expects
  if (merged.maxHp !== undefined && merged.shieldHp === undefined) merged.shieldHp = merged.maxHp;
  if (merged.regenRate !== undefined && merged.shieldRegen === undefined) merged.shieldRegen = merged.regenRate;
  if (merged.downedDelay !== undefined && merged.shieldDownDelay === undefined) merged.shieldDownDelay = merged.downedDelay;
  if (merged.spoolUpTime !== undefined && merged.quantumSpoolUp === undefined) merged.quantumSpoolUp = merged.spoolUpTime;
  if (merged.cooldownTime !== undefined && merged.quantumCooldown === undefined) merged.quantumCooldown = merged.cooldownTime;
  if (merged.maxSpeed !== undefined && merged.quantumSpeed === undefined) merged.quantumSpeed = merged.maxSpeed;
  if (merged.maxRange !== undefined && merged.quantumRange === undefined) merged.quantumRange = merged.maxRange;
  if (merged.damage !== undefined && merged.alphaDamage === undefined) merged.alphaDamage = merged.damage;

  return hasAny ? merged : null;
}

// =============================================================================
// Build flat hardpoints
// =============================================================================

interface FlatHardpoint {
  id: string;
  hardpointName: string;
  category: string;
  minSize: number;
  maxSize: number;
  isFixed: boolean;
  isManned: boolean;
  isInternal: boolean;
  equippedItem: EquippedItemFlat | null;
  childWeapons: any[];
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
  componentStats: Record<string, any> | null;
}

function buildFlatHardpoints(hardpoints: any[]): FlatHardpoint[] {
  if (!hardpoints || !Array.isArray(hardpoints)) return [];

  return hardpoints.map((hp) => {
    const equipped = hp.equippedItem;
    const isTurretOrGimbal = !!(equipped && equipped.type === "TURRET");

    let flatItem: EquippedItemFlat | null = null;
    if (equipped) {
      flatItem = {
        id: equipped.id,
        reference: equipped.reference,
        name: equipped.name,
        localizedName: equipped.localizedName ?? null,
        className: equipped.className ?? null,
        type: equipped.type,
        size: equipped.size ?? null,
        grade: equipped.grade ?? null,
        manufacturer: equipped.manufacturer ?? null,
        componentStats: mergeStats(equipped),
      };
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
      equippedItem: flatItem,
      childWeapons: [],
      isTurretOrGimbal,
    };
  });
}

// =============================================================================
// Compute stats
// =============================================================================

function nn(val: any): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function computeLoadoutStats(flatHardpoints: FlatHardpoint[]) {
  let totalDps = 0, totalAlphaDamage = 0, totalShieldHp = 0, totalShieldRegen = 0;
  let totalPowerDraw = 0, totalPowerOutput = 0, totalCooling = 0, totalThermalOutput = 0;
  let totalEmSignature = 0, totalIrSignature = 0;

  const hardpointSummary = {
    weapons: 0, missiles: 0, shields: 0,
    coolers: 0, powerPlants: 0, quantumDrives: 0,
  };

  for (const hp of flatHardpoints) {
    if (!USEFUL_CATS.has(hp.category)) continue;

    switch (hp.category) {
      case "WEAPON": case "TURRET": hardpointSummary.weapons++; break;
      case "MISSILE_RACK": hardpointSummary.missiles++; break;
      case "SHIELD": hardpointSummary.shields++; break;
      case "COOLER": hardpointSummary.coolers++; break;
      case "POWER_PLANT": hardpointSummary.powerPlants++; break;
      case "QUANTUM_DRIVE": hardpointSummary.quantumDrives++; break;
    }

    const s = hp.equippedItem?.componentStats;
    if (!s || typeof s !== "object") continue;

    totalDps += nn(s.dps);
    totalAlphaDamage += nn(s.alphaDamage);
    totalShieldHp += nn(s.shieldHp);
    totalShieldRegen += nn(s.shieldRegen);
    totalPowerDraw += nn(s.powerDraw);
    totalPowerOutput += nn(s.powerOutput);
    totalCooling += nn(s.coolingRate);
    totalThermalOutput += nn(s.thermalOutput);
    totalEmSignature += nn(s.emSignature);
    totalIrSignature += nn(s.irSignature);
  }

  const r = (v: number) => Math.round(v * 100) / 100;

  return {
    totalDps: r(totalDps), totalAlphaDamage: r(totalAlphaDamage),
    totalShieldHp: r(totalShieldHp), totalShieldRegen: r(totalShieldRegen),
    totalPowerDraw: r(totalPowerDraw), totalPowerOutput: r(totalPowerOutput),
    totalCooling: r(totalCooling), totalThermalOutput: r(totalThermalOutput),
    powerBalance: r(totalPowerOutput - totalPowerDraw),
    thermalBalance: r(totalCooling - totalThermalOutput),
    totalEmSignature: r(totalEmSignature), totalIrSignature: r(totalIrSignature),
    hardpointSummary,
  };
}
