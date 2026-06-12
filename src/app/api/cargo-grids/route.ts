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
    // Sitio.12 (2026-06-12): el join cg.ship_id = s.id SIN game_version producía
    // fan-out cartesiano (PK compuesta (id, game_version) en ambas tablas → cada
    // nave salía 2-6 veces con SCU contradictorios) y los grids de la GV 4.8 son
    // entidades *_Template con scu falso (los reales solo existen en 4.7.x — gap
    // del datadumper pendiente). Fix INTERINO: emparejar SIEMPRE cg.game_version
    // con s.game_version y deduplicar en 2 niveles — por class_name eligiendo el
    // MEJOR grid (no-Template de la GV más alta que cumpla), y luego por nombre
    // visible (variantes como DRAK_Caterpillar_Boarded comparten display name)
    // prefiriendo la variante base. Una fila por nave en el selector.
    const rows = await sql`
      WITH ship_grids AS (
        SELECT
          s.id            AS ship_id,
          s.class_name    AS ship_class,
          s.name          AS ship_name,
          s.game_version  AS game_version,
          m.name          AS manufacturer,
          s.cargo_capacity,
          bool_or(cg.class_name ~* '_template') AS has_template,
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
        JOIN cargo_grids cg
          ON cg.ship_id = s.id
         AND cg.game_version = s.game_version
        LEFT JOIN manufacturers m ON m.id = s.manufacturer_id
        WHERE cg.scu_capacity > 0
          AND cg.instance_count > 0
          AND cg.dimensions IS NOT NULL
          AND cg.dimensions != '{}'::jsonb
          AND COALESCE((cg.dimensions->>'x')::float, 0) > 0
          AND COALESCE((cg.dimensions->>'y')::float, 0) > 0
          AND COALESCE((cg.dimensions->>'z')::float, 0) > 0
        GROUP BY s.id, s.class_name, s.name, s.game_version, m.name, s.cargo_capacity
      ),
      best_per_class AS (
        SELECT DISTINCT ON (ship_class) *
        FROM ship_grids
        ORDER BY ship_class,
                 has_template ASC,
                 (CASE WHEN split_part(game_version, '-', 1) ~ '^[0-9.]+$'
                       THEN string_to_array(split_part(game_version, '-', 1), '.')::int[]
                       ELSE ARRAY[-1] END) DESC,
                 game_version DESC
      ),
      best_per_name AS (
        SELECT DISTINCT ON (ship_name) *
        FROM best_per_class
        ORDER BY ship_name,
                 has_template ASC,
                 length(ship_class) ASC,
                 ship_class ASC
      )
      SELECT ship_id, ship_name, manufacturer, cargo_capacity, grids
      FROM best_per_name
      ORDER BY ship_name ASC
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
