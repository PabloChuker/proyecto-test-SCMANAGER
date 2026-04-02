export const dynamic = 'force-dynamic';
// =============================================================================
// AL FILO â€” GET /api/ships (v2 â€” schema v2 compatible)
//
// Changes from v1:
//   - ship.maxSpeed â†’ ship.scmSpeed
//   - ship.afterburnerSpeed added to select
//   - sortBy "maxSpeed" renamed to "scmSpeed" internally
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const revalidate = 300;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const search       = searchParams.get("search")?.trim() || undefined;
    const manufacturer = searchParams.get("manufacturer")?.trim() || undefined;
    const role         = searchParams.get("role")?.trim() || undefined;
    const career       = searchParams.get("career")?.trim() || undefined;
    const page         = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit        = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
    const sortByRaw    = searchParams.get("sortBy") || "name";
    const sortOrder    = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";

    // Map frontend sort keys to actual schema fields
    const SORT_ALIAS: Record<string, string> = {
      maxSpeed: "scmSpeed",
      scmSpeed: "scmSpeed",
      cargo: "cargo",
      maxCrew: "maxCrew",
    };
    const sortBy = SORT_ALIAS[sortByRaw] || sortByRaw;

    // WHERE
    const where: Prisma.ItemWhereInput = {
      type: { in: ["SHIP", "VEHICLE"] },
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { localizedName: { contains: search, mode: "insensitive" } },
        { className: { contains: search, mode: "insensitive" } },
        { manufacturer: { contains: search, mode: "insensitive" } },
      ];
    }

    if (manufacturer) {
      where.manufacturer = { equals: manufacturer, mode: "insensitive" };
    }

    if (role || career) {
      where.ship = {};
      if (role) (where.ship as Prisma.ShipWhereInput).role = { contains: role, mode: "insensitive" };
      if (career) (where.ship as Prisma.ShipWhereInput).career = { contains: career, mode: "insensitive" };
    }

    // ORDER BY
    const shipSortFields = ["scmSpeed", "cargo", "maxCrew", "afterburnerSpeed"];
    let orderBy: Prisma.ItemOrderByWithRelationInput;

    if (shipSortFields.includes(sortBy)) {
      orderBy = { ship: { [sortBy]: { sort: sortOrder, nulls: "last" } } };
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    // QUERIES
    const [total, ships, manufacturerList] = await Promise.all([
      prisma.item.count({ where }),

      prisma.item.findMany({
        where,
        select: {
          id: true,
          reference: true,
          name: true,
          localizedName: true,
          type: true,
          size: true,
          manufacturer: true,
          gameVersion: true,
          ship: {
            select: {
              maxCrew: true,
              cargo: true,
              scmSpeed: true,
              afterburnerSpeed: true,
              role: true,
              focus: true,
              career: true,
              lengthMeters: true,
              beamMeters: true,
              heightMeters: true,
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),

      prisma.item.findMany({
        where: { type: { in: ["SHIP", "VEHICLE"] }, manufacturer: { not: null } },
        select: { manufacturer: true },
        distinct: ["manufacturer"],
        orderBy: { manufacturer: "asc" },
      }),
    ]);

    return NextResponse.json(
      {
        data: ships,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          manufacturers: manufacturerList.map((m) => m.manufacturer).filter((m): m is string => m !== null),
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (error) {
    console.error("[API /ships] Error:", error);
    return NextResponse.json({ error: "Error al obtener las naves" }, { status: 500 });
  }
}

