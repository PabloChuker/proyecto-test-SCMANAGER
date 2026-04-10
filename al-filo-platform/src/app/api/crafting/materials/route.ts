// =============================================================================
// AL FILO — GET /api/crafting/materials
//
// Returns every resource that is actually used as a crafting input, enriched
// with its canonical metadata from the `resources` table and the container
// sizes in which it is produced/sold (`resources_box_sizes`).
//
// Response shape:
//   {
//     materials: ResourceInfo[],
//     meta: { totalResources, totalUniqueBoxSizes }
//   }
//
// Source tables (all populated in Supabase):
//   - resources              → canonical name, key, description, refining chain
//   - resources_box_sizes    → list of SCU box sizes available per resource
//   - blueprint_materials    → usage stats (blueprint count + total SCU used)
// =============================================================================

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows: any[] = await sql.unsafe(
      `
      SELECT
        r.uuid                                   AS resource_uuid,
        r.key                                    AS resource_key,
        r.name                                   AS resource_name,
        r.description                            AS description,
        r.refined_uuid                           AS refined_uuid,
        r.refined_name                           AS refined_name,
        usage.blueprint_count                    AS blueprint_count,
        usage.total_scu_used                     AS total_scu_used,
        COALESCE(bs.sizes, '{}'::numeric[])      AS box_sizes
      FROM resources r
      INNER JOIN (
        SELECT
          resource_uuid,
          COUNT(DISTINCT blueprint_uuid)::int          AS blueprint_count,
          COALESCE(SUM(quantity_scu), 0)::numeric      AS total_scu_used
        FROM blueprint_materials
        GROUP BY resource_uuid
      ) usage ON usage.resource_uuid = r.uuid
      LEFT JOIN LATERAL (
        SELECT array_agg(box_size ORDER BY box_size)::numeric[] AS sizes
        FROM resources_box_sizes
        WHERE resource_uuid = r.uuid
      ) bs ON TRUE
      ORDER BY r.name
      `,
      [],
    );

    const materials = rows.map((r) => ({
      resourceUuid: String(r.resource_uuid),
      resourceKey: r.resource_key || "",
      resourceName: r.resource_name || "",
      description: r.description || "",
      refinedUuid: r.refined_uuid ? String(r.refined_uuid) : null,
      refinedName: r.refined_name || null,
      blueprintCount: Number(r.blueprint_count) || 0,
      totalScuUsed: Number(r.total_scu_used) || 0,
      boxSizes: Array.isArray(r.box_sizes)
        ? r.box_sizes.map((s: any) => Number(s)).filter((n: number) => !Number.isNaN(n))
        : [],
    }));

    const allBoxSizes = new Set<number>();
    for (const m of materials) for (const s of m.boxSizes) allBoxSizes.add(s);

    return NextResponse.json({
      materials,
      meta: {
        totalResources: materials.length,
        totalUniqueBoxSizes: allBoxSizes.size,
      },
    });
  } catch (error: any) {
    console.error("[API /crafting/materials] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to load materials", detail: error?.message || "Unknown" },
      { status: 500 },
    );
  }
}
