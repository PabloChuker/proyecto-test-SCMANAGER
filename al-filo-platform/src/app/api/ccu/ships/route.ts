// =============================================================================
// AL FILO — GET /api/ccu/ships
//
// Returns all ships eligible for CCU chains, with MSRP data.
// Used by the CCU Calculator UI for ship selection dropdowns.
// Sorted by MSRP ascending (cheapest first).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 300; // Cache for 5 minutes

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const minPrice = parseFloat(searchParams.get("minPrice") || "0");
    const maxPrice = parseFloat(searchParams.get("maxPrice") || "99999");

    let query = `
      SELECT id, reference, name, manufacturer, msrp_usd, warbond_usd,
             COALESCE(is_ccu_eligible, true) AS is_ccu_eligible,
             COALESCE(is_limited, false) AS is_limited,
             COALESCE(flight_status, 'flight_ready') AS flight_status,
             size, role
      FROM ships
      WHERE msrp_usd IS NOT NULL
        AND msrp_usd > 0
        AND msrp_usd >= $1
        AND msrp_usd <= $2
    `;
    const params: any[] = [minPrice, maxPrice];
    let paramIdx = 3;

    if (search) {
      query += ` AND (name ILIKE $${paramIdx} OR reference ILIKE $${paramIdx} OR manufacturer ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    query += ` ORDER BY msrp_usd ASC, name ASC`;

    const rows: any[] = await prisma.$queryRawUnsafe(query, ...params);

    const ships = rows.map((row) => ({
      id: String(row.id),
      reference: row.reference,
      name: row.name,
      manufacturer: row.manufacturer,
      msrpUsd: Number(row.msrp_usd) || 0,
      warbondUsd: row.warbond_usd ? Number(row.warbond_usd) : null,
      isCcuEligible: row.is_ccu_eligible !== false,
      isLimited: row.is_limited === true,
      flightStatus: row.flight_status || "flight_ready",
      size: row.size,
      role: row.role,
    }));

    return NextResponse.json(
      { ships, total: ships.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error: any) {
    console.error("[API /ccu/ships] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to load ships", detail: error?.message },
      { status: 500 },
    );
  }
}
