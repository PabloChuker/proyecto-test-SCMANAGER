// =============================================================================
// AL FILO — GET /api/ships/[id]
//
// Detalle completo de una nave con todo su loadout:
//   → Item base (nombre, fabricante, etc.)
//   → Ship extendido (stats de vuelo)
//   → Hardpoints con items equipados y sus ComponentStats
//   → Stats computadas (DPS total, balance de energía, etc.)
//
// El [id] puede ser el UUID interno o el reference de CIG.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ShipDetailResponse, HardpointWithEquipped } from "@/types/ships";

export const revalidate = 300;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Buscar por ID interno o por reference de CIG (más flexible)
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
              include: {
                componentStats: true,
              },
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
      return NextResponse.json(
        { error: "Nave no encontrada" },
        { status: 404 }
      );
    }

    // ── Computar estadísticas agregadas del loadout ──
    const computed = computeLoadoutStats(
      ship.hardpoints as HardpointWithEquipped[]
    );

    // Excluir rawData del response (es muy pesado y solo sirve para debug)
    const { rawData, ...shipWithoutRaw } = ship;

    const response: ShipDetailResponse = {
      data: shipWithoutRaw as ShipDetailResponse["data"],
      computed,
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[API /ships/[id]] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener la nave" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cálculos derivados del loadout
// ─────────────────────────────────────────────────────────────────────────────

function computeLoadoutStats(hardpoints: HardpointWithEquipped[]) {
  let totalDps = 0;
  let totalShieldHp = 0;
  let totalPowerDraw = 0;
  let totalPowerOutput = 0;
  let totalCooling = 0;

  const hardpointSummary = {
    weapons: 0,
    missiles: 0,
    shields: 0,
    coolers: 0,
    powerPlants: 0,
    quantumDrives: 0,
  };

  for (const hp of hardpoints) {
    // Contar hardpoints por categoría
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

    // Sumar stats del item equipado
    const stats = hp.equippedItem?.componentStats;
    if (!stats) continue;

    if (stats.dps)         totalDps += stats.dps;
    if (stats.shieldHp)    totalShieldHp += stats.shieldHp;
    if (stats.powerDraw)   totalPowerDraw += stats.powerDraw;
    if (stats.powerOutput) totalPowerOutput += stats.powerOutput;
    if (stats.coolingRate) totalCooling += stats.coolingRate;
  }

  return {
    totalDps:        Math.round(totalDps * 100) / 100,
    totalShieldHp:   Math.round(totalShieldHp * 100) / 100,
    totalPowerDraw:  Math.round(totalPowerDraw * 100) / 100,
    totalPowerOutput: Math.round(totalPowerOutput * 100) / 100,
    totalCooling:    Math.round(totalCooling * 100) / 100,
    powerBalance:    Math.round((totalPowerOutput - totalPowerDraw) * 100) / 100,
    hardpointSummary,
  };
}
