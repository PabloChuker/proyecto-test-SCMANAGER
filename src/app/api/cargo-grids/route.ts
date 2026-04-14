export const dynamic = "force-dynamic";
// =============================================================================
// SC LABS — /api/cargo-grids
// Devuelve naves con sus cargo grids agrupados.
// Cada nave incluye el array de grids con dimensiones, SCU e instancias.
// =============================================================================

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { secureHeaders } from "@/lib/api-security";

export const revalidate = 300;

export async function GET() {
  try {
    const rows = await sql`
      SELECT
        s.id            AS ship_id,
        s.name          AS ship_name,
        s.manufacturer,
        s.cargo_capacity,
        json_agg(
          json_build_object(
            'id',            cg.id,
            'className',     cg.class_name,
            'scuCapacity',   cg.scu_capacity,
            'dimensions',    cg.dimensions,
            'instanceCount', cg.instance_count,
            'displayOrder',  cg.display_order
          )
          ORDER BY cg.display_order
        ) AS grids
      FROM ships s
      JOIN cargo_grids cg ON cg.ship_id = s.id
      WHERE cg.scu_capacity > 0
        AND cg.dimensions IS NOT NULL
        AND cg.dimensions != '{}'::jsonb
        AND COALESCE((cg.dimensions->>'x')::float, 0) > 0
        AND COALESCE((cg.dimensions->>'y')::float, 0) > 0
        AND COALESCE((cg.dimensions->>'z')::float, 0) > 0
      GROUP BY s.id, s.name, s.manufacturer, s.cargo_capacity
      ORDER BY s.name ASC
    `;

    const data = rows.map((r) => ({
      id:           String(r.ship_id),
      name:         String(r.ship_name),
      manufacturer: String(r.manufacturer ?? ""),
      totalSCU:     Number(r.cargo_capacity ?? 0),
      grids:        (r.grids as Array<{
        id: string;
        className: string;
        scuCapacity: number;
        dimensions: { x: number; y: number; z: number };
        instanceCount: number;
        displayOrder: number;
      }>).map((g) => ({
        id:            String(g.id),
        className:     String(g.className),
        scuCapacity:   Number(g.scuCapacity),
        dimensions:    g.dimensions,
        instanceCount: Number(g.instanceCount ?? 1),
        displayOrder:  Number(g.displayOrder ?? 0),
      })),
    }));

    return NextResponse.json({ data }, { headers: secureHeaders() });
  } catch (error) {
    console.error("[API /cargo-grids]", error);
    return NextResponse.json(
      { error: "Error fetching cargo grids" },
      { status: 500, headers: secureHeaders() },
    );
  }
}
