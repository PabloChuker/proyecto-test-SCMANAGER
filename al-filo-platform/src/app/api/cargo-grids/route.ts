export const dynamic = "force-dynamic";
// =============================================================================
// SC LABS — /api/cargo-grids
// Devuelve todos los cargo grids con dimensiones válidas y SCU > 0.
// Usa postgres.js (sql from @/lib/db) → Supabase PostgreSQL.
// =============================================================================

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { secureHeaders } from "@/lib/api-security";

export const revalidate = 300;

interface CargoGridRow {
  id: string;
  class_name: string;
  name: string;
  scu_capacity: number;
  dimensions: { x: number; y: number; z: number };
}

export async function GET() {
  try {
    const rows = await sql<CargoGridRow[]>`
      SELECT id, class_name, name, scu_capacity, dimensions
      FROM cargo_grids
      WHERE scu_capacity > 0
        AND dimensions IS NOT NULL
        AND dimensions != '{}'::jsonb
        AND COALESCE((dimensions->>'x')::float, 0) > 0
        AND COALESCE((dimensions->>'y')::float, 0) > 0
        AND COALESCE((dimensions->>'z')::float, 0) > 0
      ORDER BY class_name ASC
    `;

    return NextResponse.json(
      {
        data: rows.map((r) => ({
          id: String(r.id),
          className: String(r.class_name),
          name: String(r.name),
          scuCapacity: Number(r.scu_capacity),
          dimensions: r.dimensions,
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
