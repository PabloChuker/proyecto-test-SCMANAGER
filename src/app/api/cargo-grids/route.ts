export const dynamic = "force-dynamic";
// =============================================================================
// SC LABS — /api/cargo-grids
// Returns all cargo grids with valid positive dimensions and SCU capacity.
// Used by the 3D Cargo Grid Visualizer module.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { secureHeaders } from "@/lib/api-security";

export const revalidate = 300;

export async function GET(_request: NextRequest) {
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, class_name, name, scu_capacity, dimensions
      FROM cargo_grids
      WHERE scu_capacity > 0
        AND dimensions IS NOT NULL
        AND dimensions != '{}'::jsonb
        AND COALESCE((dimensions->>'x')::float, 0) > 0
        AND COALESCE((dimensions->>'y')::float, 0) > 0
        AND COALESCE((dimensions->>'z')::float, 0) > 0
      ORDER BY class_name ASC
    `);

    return NextResponse.json(
      {
        data: rows.map((r) => ({
          id: String(r.id),
          className: String(r.class_name),
          name: String(r.name),
          scuCapacity: Number(r.scu_capacity),
          dimensions: r.dimensions as { x: number; y: number; z: number },
        })),
      },
      { headers: secureHeaders() },
    );
  } catch (error) {
    console.error("[API /cargo-grids]", error);
    return NextResponse.json(
      { error: "Error fetching cargo grids" },
      { status: 500, headers: secureHeaders() },
    );
  }
}
