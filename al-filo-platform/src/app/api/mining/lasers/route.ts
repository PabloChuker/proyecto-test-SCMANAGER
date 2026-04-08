// =============================================================================
// AL FILO — GET /api/mining/lasers
//
// Returns all mining lasers from the mining_lasers table.
// Used by the Mining Loadout Calculator.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 300;

export async function GET(request: NextRequest) {
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        id,
        name,
        manufacturer,
        size,
        mining_power   AS "miningPower",
        resistance,
        instability,
        optimal_range  AS "optimalRange",
        max_range      AS "maxRange",
        throttle_rate  AS "throttleRate",
        throttle_min   AS "throttleMin",
        heat_output    AS "heatOutput",
        shatter_damage AS "shatterDamage",
        module_slots   AS "moduleSlots"
      FROM mining_lasers
      ORDER BY size ASC, name ASC
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
