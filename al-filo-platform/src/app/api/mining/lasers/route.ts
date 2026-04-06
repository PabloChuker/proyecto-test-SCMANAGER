// =============================================================================
// AL FILO — GET /api/mining/lasers
//
// Returns all mining lasers with their stats joined from mining_stats table.
// Used by the Mining Loadout Calculator.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 300;

export async function GET(request: NextRequest) {
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        i.id,
        i.name,
        i.reference,
        i.class_name,
        i.size,
        i.grade,
        i.manufacturer,
        ms.mining_power   AS "miningPower",
        ms.resistance,
        ms.instability,
        ms.optimal_range  AS "optimalRange",
        ms.max_range      AS "maxRange",
        ms.throttle_rate  AS "throttleRate",
        ms.power_draw     AS "powerDraw",
        ms.thermal_output AS "thermalOutput"
      FROM items i
      LEFT JOIN mining_stats ms ON ms.item_id = i.id
      WHERE i.type = 'MINING_LASER'
      ORDER BY i.size ASC, i.name ASC
    `);

    // Convert BigInt/Decimal to number for JSON serialization
    const data = rows.map((r: any) => {
      const obj: any = {};
      for (const [k, v] of Object.entries(r)) {
        obj[k] = typeof v === "bigint" ? Number(v) : v;
      }
      return obj;
    });

    return NextResponse.json(
      { data, total: data.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err: any) {
    console.error("Mining lasers API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch mining lasers", detail: err.message },
      { status: 500 }
    );
  }
}
