// =============================================================================
// AL FILO — GET /api/crafting/materials
//
// Returns all unique resources used across blueprints with usage stats.
// =============================================================================

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get distinct resources with usage counts
    const rows: any[] = await sql.unsafe(`
      SELECT
        bm.resource_uuid,
        bm.resource_name,
        COUNT(DISTINCT bm.blueprint_uuid) AS blueprint_count,
        SUM(bm.quantity_scu) AS total_scu_used
      FROM blueprint_materials bm
      GROUP BY bm.resource_uuid, bm.resource_name
      ORDER BY bm.resource_name
    `, []);

    const materials = rows.map((r) => ({
      resourceUuid: String(r.resource_uuid),
      resourceName: r.resource_name || "",
      blueprintCount: Number(r.blueprint_count) || 0,
      totalScuUsed: Number(r.total_scu_used) || 0,
    }));

    return NextResponse.json({
      materials,
      meta: { totalResources: materials.length },
    });
  } catch (error: any) {
    console.error("[API /crafting/materials] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to load materials", detail: error?.message || "Unknown" },
      { status: 500 },
    );
  }
}
