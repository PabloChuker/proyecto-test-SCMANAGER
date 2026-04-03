export const dynamic = 'force-dynamic';
// =============================================================================
// SC LABS — GET /api/ships/compare
// Returns detailed data for up to 3 ships for side-by-side comparison.
// Query: ?ids=uuid1,uuid2,uuid3
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");

    if (!idsParam) {
      return NextResponse.json({ error: "Missing ids parameter" }, { status: 400 });
    }

    const ids = idsParam.split(",").slice(0, 3).map((s) => s.trim()).filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ error: "No valid ids provided" }, { status: 400 });
    }

    const ships = await prisma.item.findMany({
      where: {
        id: { in: ids },
        type: { in: ["SHIP", "VEHICLE"] },
      },
      select: {
        id: true,
        reference: true,
        name: true,
        localizedName: true,
        type: true,
        size: true,
        manufacturer: true,
        gameVersion: true,
        ship: {
          select: {
            maxCrew: true,
            cargo: true,
            scmSpeed: true,
            afterburnerSpeed: true,
            pitchRate: true,
            yawRate: true,
            rollRate: true,
            maxAccelMain: true,
            maxAccelRetro: true,
            hydrogenFuelCap: true,
            quantumFuelCap: true,
            lengthMeters: true,
            beamMeters: true,
            heightMeters: true,
            role: true,
            focus: true,
            career: true,
            baseEmSignature: true,
            baseIrSignature: true,
            baseCsSignature: true,
          },
        },
        hardpoints: {
          select: {
            id: true,
            hardpointName: true,
            category: true,
            minSize: true,
            maxSize: true,
            equippedItem: {
              select: {
                id: true,
                name: true,
                type: true,
                size: true,
                weaponStats: { select: { dps: true, alphaDamage: true, fireRate: true, range: true } },
                shieldStats: { select: { maxHp: true, regenRate: true, downedDelay: true } },
                powerStats: { select: { powerOutput: true } },
                coolingStats: { select: { coolingRate: true } },
                quantumStats: { select: { maxSpeed: true, maxRange: true, spoolUpTime: true } },
                missileStats: { select: { damage: true, lockTime: true, lockRange: true } },
              },
            },
          },
        },
      },
    });

    // Compute aggregated stats for each ship
    const result = ships.map((ship) => {
      let totalDps = 0;
      let totalAlpha = 0;
      let totalShieldHp = 0;
      let totalShieldRegen = 0;
      let totalPowerOutput = 0;
      let totalCooling = 0;
      let totalMissileDmg = 0;
      let weaponCount = 0;
      let missileCount = 0;
      let shieldCount = 0;
      let quantumSpeed: number | null = null;
      let quantumRange: number | null = null;
      let quantumSpool: number | null = null;

      for (const hp of ship.hardpoints) {
        const eq = hp.equippedItem;
        if (!eq) continue;

        if (hp.category === "WEAPON" || hp.category === "TURRET") {
          weaponCount++;
          if (eq.weaponStats) {
            totalDps += eq.weaponStats.dps || 0;
            totalAlpha += eq.weaponStats.alphaDamage || 0;
          }
        }
        if (hp.category === "MISSILE_RACK" && eq.missileStats) {
          missileCount++;
          totalMissileDmg += eq.missileStats.damage || 0;
        }
        if (hp.category === "SHIELD" && eq.shieldStats) {
          shieldCount++;
          totalShieldHp += eq.shieldStats.maxHp || 0;
          totalShieldRegen += eq.shieldStats.regenRate || 0;
        }
        if (hp.category === "POWER_PLANT" && eq.powerStats) {
          totalPowerOutput += eq.powerStats.powerOutput || 0;
        }
        if (hp.category === "COOLER" && eq.coolingStats) {
          totalCooling += eq.coolingStats.coolingRate || 0;
        }
        if (hp.category === "QUANTUM_DRIVE" && eq.quantumStats) {
          quantumSpeed = eq.quantumStats.maxSpeed;
          quantumRange = eq.quantumStats.maxRange;
          quantumSpool = eq.quantumStats.spoolUpTime;
        }
      }

      return {
        id: ship.id,
        name: ship.name,
        localizedName: ship.localizedName,
        manufacturer: ship.manufacturer,
        type: ship.type,
        size: ship.size,
        gameVersion: ship.gameVersion,
        ship: ship.ship,
        computed: {
          totalDps,
          totalAlpha,
          totalShieldHp,
          totalShieldRegen,
          totalPowerOutput,
          totalCooling,
          totalMissileDmg,
          weaponCount,
          missileCount,
          shieldCount,
          quantumSpeed,
          quantumRange,
          quantumSpool,
        },
      };
    });

    // Reorder to match input ids order
    const ordered = ids.map((id) => result.find((r) => r.id === id)).filter(Boolean);

    return NextResponse.json({ data: ordered }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("[API /ships/compare] Error:", error);
    return NextResponse.json({ error: "Error comparing ships" }, { status: 500 });
  }
}
