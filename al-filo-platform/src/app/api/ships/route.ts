export const dynamic = "force-dynamic";
// =============================================================================
// AL FILO — GET /api/ships v3 (Raw SQL — actual DB schema)
//
// Lists all ships from the ships table directly.
// Supports search, manufacturer filter, role filter, sorting, pagination.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 300;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const search       = searchParams.get("search")?.trim() || "";
    const manufacturer = searchParams.get("manufacturer")?.trim() || "";
    const role         = searchParams.get("role")?.trim() || "";
    const page         = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit        = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
    const sortByRaw    = searchParams.get("sortBy") || "name";
    const sortOrder    = searchParams.get("sortOrder") === "desc" ? "DESC" : "ASC";

    // Map sort keys to actual columns
    const SORT_MAP: Record<string, string> = {
      name: "s.name",
      scmSpeed: "s.scm_speed",
      maxSpeed: "s.scm_speed",
      cargo: "s.cargo_capacity",
      maxCrew: "s.max_crew",
      afterburnerSpeed: "s.afterburner_speed",
      manufacturer: "s.manufacturer",
      size: "s.size",
      role: "s.role",
    };
    const sortCol = SORT_MAP[sortByRaw] || "s.name";

    // Build WHERE conditions
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(
        `(s.name ILIKE $${paramIdx} OR s.reference ILIKE $${paramIdx} OR s.manufacturer ILIKE $${paramIdx})`,
      );
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (manufacturer) {
      conditions.push(`s.manufacturer ILIKE $${paramIdx}`);
      params.push(`%${manufacturer}%`);
      paramIdx++;
    }

    if (role) {
      conditions.push(`s.role ILIKE $${paramIdx}`);
      params.push(`%${role}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    // Count total
    const countResult: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as total FROM ships s ${whereClause}`,
      ...params,
    );
    const total = countResult[0]?.total ?? 0;

    // Fetch ships
    const offset = (page - 1) * limit;
    const ships: any[] = await prisma.$queryRawUnsafe(
      `SELECT s.id, s.reference, s.name, s.manufacturer, s.role, s.size,
              s.max_crew, s.scm_speed, s.afterburner_speed, s.cargo_capacity,
              s.game_version
       FROM ships s
       ${whereClause}
       ORDER BY ${sortCol} ${sortOrder} NULLS LAST
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      ...params,
      limit,
      offset,
    );

    // Get manufacturer list for filter dropdown
    const mfrs: any[] = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT manufacturer FROM ships WHERE manufacturer IS NOT NULL ORDER BY manufacturer ASC`,
    );

    // Map to expected format
    const data = ships.map((s) => ({
      id: s.id,
      reference: s.reference,
      name: s.name,
      localizedName: null,
      type: "SHIP",
      size: s.size,
      manufacturer: s.manufacturer,
      gameVersion: s.game_version,
      ship: {
        maxCrew: s.max_crew,
        cargo: s.cargo_capacity != null ? Number(s.cargo_capacity) : null,
        scmSpeed: s.scm_speed != null ? Number(s.scm_speed) : null,
        afterburnerSpeed: s.afterburner_speed != null ? Number(s.afterburner_speed) : null,
        role: s.role,
        focus: null,
        career: null,
        lengthMeters: null,
        beamMeters: null,
        heightMeters: null,
      },
    }));

    return NextResponse.json(
      {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          manufacturers: mfrs.map((m) => m.manufacturer).filter(Boolean),
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (error) {
    console.error("[API /ships] Error:", error);
    return NextResponse.json({ error: "Error al obtener las naves" }, { status: 500 });
  }
}
