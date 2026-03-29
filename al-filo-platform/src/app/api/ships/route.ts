// =============================================================================
// AL FILO — GET /api/ships
//
// Lista paginada de naves con filtrado y ordenamiento.
// Soporta: ?search=gladius&manufacturer=Aegis&role=Combat&page=1&limit=20
//          &sortBy=name&sortOrder=asc
//
// Estrategia de caché: usamos Next.js revalidate para cachear la respuesta
// durante 5 minutos. Los datos solo cambian cuando corremos el pipeline
// de datamining (cada parche), así que un TTL de 5 min es más que suficiente
// para desarrollo y evita queries innecesarias a Postgres.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { ShipListResponse } from "@/types/ships";

// Caché de 5 minutos en el edge
export const revalidate = 300;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // ── Parsear parámetros de query ──
    const search       = searchParams.get("search")?.trim() || undefined;
    const manufacturer = searchParams.get("manufacturer")?.trim() || undefined;
    const role         = searchParams.get("role")?.trim() || undefined;
    const career       = searchParams.get("career")?.trim() || undefined;
    const page         = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit        = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
    const sortBy       = searchParams.get("sortBy") || "name";
    const sortOrder    = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";

    // ── Construir filtro WHERE ──
    const where: Prisma.ItemWhereInput = {
      type: { in: ["SHIP", "VEHICLE"] },
    };

    if (search) {
      where.OR = [
        { name:          { contains: search, mode: "insensitive" } },
        { localizedName: { contains: search, mode: "insensitive" } },
        { className:     { contains: search, mode: "insensitive" } },
        { manufacturer:  { contains: search, mode: "insensitive" } },
      ];
    }

    if (manufacturer) {
      where.manufacturer = { equals: manufacturer, mode: "insensitive" };
    }

    if (role || career) {
      where.ship = {};
      if (role)   (where.ship as Prisma.ShipWhereInput).role   = { contains: role, mode: "insensitive" };
      if (career) (where.ship as Prisma.ShipWhereInput).career = { contains: career, mode: "insensitive" };
    }

    // ── Construir ORDER BY ──
    // Para campos que están en la tabla Ship (anidados), usamos orderBy especial
    const shipSortFields = ["maxSpeed", "cargo", "maxCrew"];
    let orderBy: Prisma.ItemOrderByWithRelationInput;

    if (shipSortFields.includes(sortBy)) {
      orderBy = { ship: { [sortBy]: { sort: sortOrder, nulls: "last" } } };
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    // ── Ejecutar queries en paralelo (count + data) ──
    const [total, ships, manufacturerList] = await Promise.all([
      // Total para paginación
      prisma.item.count({ where }),

      // Datos paginados
      prisma.item.findMany({
        where,
        select: {
          id:            true,
          reference:     true,
          name:          true,
          localizedName: true,
          type:          true,
          size:          true,
          manufacturer:  true,
          gameVersion:   true,
          ship: {
            select: {
              maxCrew:       true,
              cargo:         true,
              maxSpeed:      true,
              role:          true,
              focus:         true,
              career:        true,
              lengthMeters:  true,
              beamMeters:    true,
              heightMeters:  true,
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),

      // Lista de fabricantes para filtros del UI (cacheada)
      prisma.item.findMany({
        where: { type: { in: ["SHIP", "VEHICLE"] }, manufacturer: { not: null } },
        select: { manufacturer: true },
        distinct: ["manufacturer"],
        orderBy: { manufacturer: "asc" },
      }),
    ]);

    // ── Armar respuesta ──
    const response: ShipListResponse = {
      data: ships,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        manufacturers: manufacturerList
          .map((m) => m.manufacturer)
          .filter((m): m is string => m !== null),
      },
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[API /ships] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener las naves" },
      { status: 500 }
    );
  }
}
