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
        m.name          AS manufacturer,
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
      LEFT JOIN manufacturers m ON m.id = s.manufacturer_id
      WHERE cg.scu_capacity > 0
        AND cg.instance_count > 0
        AND cg.dimensions IS NOT NULL
        AND cg.dimensions != '{}'::jsonb
        AND COALESCE((cg.dimensions->>'x')::float, 0) > 0
        AND COALESCE((cg.dimensions->>'y')::float, 0) > 0
        AND COALESCE((cg.dimensions->>'z')::float, 0) > 0
      GROUP BY s.id, s.name, m.name, s.cargo_capacity
      ORDER BY s.name ASC
    `;

    // Fase W.5 (2026-05-02): fallback de SCU calculado desde dimensiones del
    // grid según VerseTools (SCU = floor(W/1.25) × floor(L/1.25) × floor(H/1.25)).
    // Si la BD no tiene cargo_capacity poblado para la nave (caso típico:
    // ships agregadas a mano por add_missing_ships_4_7_x sin satellites),
    // usamos el computed para no mostrar 0. Si tampoco hay dimensions
    // válidas, queda en 0.
    const SCU_UNIT_M = 1.25;
    const computeGridScu = (dims: { x?: number; y?: number; z?: number }, instances: number): number => {
      const x = Number(dims?.x ?? 0);
      const y = Number(dims?.y ?? 0);
      const z = Number(dims?.z ?? 0);
      if (x <= 0 || y <= 0 || z <= 0) return 0;
      const per = Math.floor(x / SCU_UNIT_M) * Math.floor(y / SCU_UNIT_M) * Math.floor(z / SCU_UNIT_M);
      return per * Math.max(1, instances);
    };

    const data = rows.map((r) => {
      const grids = (r.grids as Array<{
        id: string;
        className: string;
        scuCapacity: number;
        dimensions: { x: number; y: number; z: number };
        instanceCount: number;
        displayOrder: number;
      }>).map((g) => {
        const dims = g.dimensions ?? { x: 0, y: 0, z: 0 };
        const dbScu = Number(g.scuCapacity ?? 0);
        const computed = computeGridScu(dims, Number(g.instanceCount ?? 1));
        return {
          id:            String(g.id),
          className:     String(g.className),
          // scuCapacity = lo que la BD indica si está, sino el computed.
          scuCapacity:   dbScu > 0 ? dbScu : computed,
          scuCapacityListed: dbScu, // por si en UI queremos mostrar diff
          scuCapacityComputed: computed,
          dimensions:    dims,
          instanceCount: Number(g.instanceCount ?? 1),
          displayOrder:  Number(g.displayOrder ?? 0),
        };
      });

      const dbTotal = Number(r.cargo_capacity ?? 0);
      const computedTotal = grids.reduce((acc, g) => acc + g.scuCapacity, 0);
      return {
        id:           String(r.ship_id),
        name:         String(r.ship_name),
        manufacturer: String(r.manufacturer ?? ""),
        totalSCU:     dbTotal > 0 ? dbTotal : computedTotal,
        totalSCUListed:   dbTotal,
        totalSCUComputed: computedTotal,
        grids,
      };
    });

    return NextResponse.json({ data }, { headers: secureHeaders() });
  } catch (error) {
    console.error("[API /cargo-grids]", error);
    return NextResponse.json(
      { error: "Error fetching cargo grids" },
      { status: 500, headers: secureHeaders() },
    );
  }
}
