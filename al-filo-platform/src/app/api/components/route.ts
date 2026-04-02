export const dynamic = 'force-dynamic';
// =============================================================================
// AL FILO â€” GET /api/components
//
// Busca componentes compatibles para un hardpoint.
// ParÃ¡metros:
//   ?type=WEAPON&maxSize=3              â†’ armas de tamaÃ±o â‰¤ 3
//   ?type=SHIELD&maxSize=2&search=shimm â†’ escudos S2 que matcheen "shimm"
//   ?type=POWER_PLANT&minSize=1&maxSize=2&manufacturer=AEG
//   ?limit=50                           â†’ mÃ¡ximo de resultados
//
// Devuelve items con sus componentStats para mostrar en el selector.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const revalidate = 300;

// Mapeo de categorÃ­a de hardpoint â†’ tipos de item compatibles.
// Un hardpoint WEAPON acepta items de tipo WEAPON.
// Un hardpoint TURRET acepta items de tipo TURRET.
// Esto permite que el selector muestre solo items que realmente caben.
const CATEGORY_TO_ITEM_TYPES: Record<string, string[]> = {
  WEAPON:       ["WEAPON"],
  TURRET:       ["TURRET", "WEAPON"],
  MISSILE_RACK: ["MISSILE"],
  SHIELD:       ["SHIELD"],
  POWER_PLANT:  ["POWER_PLANT"],
  COOLER:       ["COOLER"],
  QUANTUM_DRIVE:["QUANTUM_DRIVE"],
  MINING:       ["MINING_LASER"],
  RADAR:        ["RADAR"],
  AVIONICS:     ["AVIONICS"],
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const type         = searchParams.get("type")?.trim();
    const category     = searchParams.get("category")?.trim();
    const minSize      = parseInt(searchParams.get("minSize") || "0", 10);
    const maxSize      = parseInt(searchParams.get("maxSize") || "99", 10);
    const search       = searchParams.get("search")?.trim() || undefined;
    const manufacturer = searchParams.get("manufacturer")?.trim() || undefined;
    const grade        = searchParams.get("grade")?.trim() || undefined;
    const limit        = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

    // â”€â”€ Determinar quÃ© tipos de item buscar â”€â”€
    let itemTypes: string[] = [];

    if (type) {
      // Tipo explÃ­cito pasado por el frontend
      itemTypes = [type];
    } else if (category) {
      // Derivar del tipo de hardpoint
      itemTypes = CATEGORY_TO_ITEM_TYPES[category] || [];
    }

    if (itemTypes.length === 0) {
      return NextResponse.json(
        { error: "Se requiere 'type' o 'category' como parÃ¡metro" },
        { status: 400 }
      );
    }

    // â”€â”€ Construir WHERE â”€â”€
    const where: Prisma.ItemWhereInput = {
      type: { in: itemTypes as any },
    };

    // Filtro de tamaÃ±o: el item debe caber en el hardpoint
    // Un hardpoint S3 acepta items de tamaÃ±o â‰¤ 3
    if (maxSize < 99) {
      where.size = { lte: maxSize, gte: minSize > 0 ? minSize : undefined };
    }

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

    if (grade) {
      where.grade = { equals: grade, mode: "insensitive" };
    }

    // â”€â”€ Query â”€â”€
    const [components, total] = await Promise.all([
      prisma.item.findMany({
        where,
        select: {
          id:            true,
          reference:     true,
          name:          true,
          localizedName: true,
          className:     true,
          type:          true,
          size:          true,
          grade:         true,
          manufacturer:  true,
          componentStats: {
            select: {
              dps:             true,
              alphaDamage:     true,
              fireRate:        true,
              range:           true,
              speed:           true,
              ammoCount:       true,
              damageType:      true,
              shieldHp:        true,
              shieldRegen:     true,
              shieldDownDelay: true,
              powerOutput:     true,
              coolingRate:     true,
              quantumSpeed:    true,
              quantumRange:    true,
              quantumCooldown: true,
              quantumSpoolUp:  true,
              powerDraw:       true,
              thermalOutput:   true,
              emSignature:     true,
              irSignature:     true,
            },
          },
        },
        orderBy: [
          { size: "desc" },
          { name: "asc" },
        ],
        take: limit,
      }),

      prisma.item.count({ where }),
    ]);

    return NextResponse.json(
      {
        data: components,
        meta: { total, limit },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("[API /components] Error:", error);
    return NextResponse.json(
      { error: "Error al buscar componentes" },
      { status: 500 }
    );
  }
}

