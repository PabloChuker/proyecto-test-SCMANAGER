export const dynamic = "force-dynamic";
// =============================================================================
// AL FILO — /api/ships v3 (Raw SQL — actual DB schema)
//
// Lists all ships from the ships table directly.
// Supports search, manufacturer filter, role filter, sorting, pagination.
//
// GET: Query parameters (backward compatible)
// POST: JSON body with same parameters
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sanitizeString,
  validateInt,
  validateSortColumn,
  validateSortDir,
  parsePostBody,
  secureHeaders,
} from "@/lib/api-security";

export const revalidate = 300;

// Map sort keys to actual columns
// Note: scm_speed and afterburner_speed are in ship_flight_stats, not ships
const SORT_MAP: Record<string, string> = {
  name: "s.name",
  scmSpeed: "fs.scm_speed",
  maxSpeed: "fs.max_speed",
  cargo: "s.cargo_capacity",
  maxCrew: "s.max_crew",
  afterburnerSpeed: "fs.max_speed",
  manufacturer: "s.manufacturer",
  size: "s.size",
  role: "s.role",
  mass: "s.mass",
  msrpUsd: "s.msrp_usd",
  price: "s.msrp_usd",
};

interface ShipsQueryParams {
  search: string;
  manufacturer: string;
  role: string;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "ASC" | "DESC";
}

/**
 * Shared internal function for querying ships.
 * Handles all business logic, security validation, and database queries.
 */
async function handleShipsQuery(params: ShipsQueryParams) {
  try {
    // Sanitize string inputs
    const search = sanitizeString(params.search, 100);
    const manufacturer = sanitizeString(params.manufacturer, 100);
    const role = sanitizeString(params.role, 100);

    // Validate and clamp integers
    const page = validateInt(params.page, 1, 1, 1000);
    const limit = validateInt(params.limit, 24, 1, 500);

    // Validate sort column against whitelist and sort order
    const sortBy = validateSortColumn(params.sortBy, SORT_MAP, "name");
    const sortOrder = validateSortDir(params.sortOrder);
    const sortCol = SORT_MAP[sortBy] || "s.name";

    // Build WHERE conditions
    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(
        `(s.name ILIKE $${paramIdx} OR s.reference ILIKE $${paramIdx} OR s.manufacturer ILIKE $${paramIdx})`,
      );
      queryParams.push(`%${search}%`);
      paramIdx++;
    }

    if (manufacturer) {
      conditions.push(`s.manufacturer ILIKE $${paramIdx}`);
      queryParams.push(`%${manufacturer}%`);
      paramIdx++;
    }

    if (role) {
      conditions.push(`s.role ILIKE $${paramIdx}`);
      queryParams.push(`%${role}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    // Count total
    const countResult: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as total FROM ships s ${whereClause}`,
      ...queryParams,
    );
    const total = countResult[0]?.total ?? 0;

    // Fetch ships with optional LEFT JOIN to flight_stats for speed data
    const offset = (page - 1) * limit;
    const joinClause = `LEFT JOIN ship_flight_stats fs ON fs.ship_id = s.id`;
    const ships: any[] = await prisma.$queryRawUnsafe(
      `SELECT s.id, s.reference, s.name, s.manufacturer, s.role, s.size,
              s.max_crew, s.mass, s.cargo_capacity, s.game_version,
              s.msrp_usd, s.warbond_usd,
              fs.scm_speed, fs.max_speed as afterburner_speed
       FROM ships s
       ${joinClause}
       ${whereClause}
       ORDER BY ${sortCol} ${sortOrder} NULLS LAST
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      ...queryParams,
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
      msrpUsd: s.msrp_usd != null ? Number(s.msrp_usd) : null,
      warbondUsd: s.warbond_usd != null ? Number(s.warbond_usd) : null,
      ship: {
        maxCrew: s.max_crew,
        mass: s.mass != null ? Number(s.mass) : null,
        cargo: s.cargo_capacity != null ? Number(s.cargo_capacity) : null,
        scmSpeed: s.scm_speed != null ? Number(s.scm_speed) : null,
        afterburnerSpeed: s.afterburner_speed != null ? Number(s.afterburner_speed) : null,
        role: s.role,
        focus: null,
        career: null,
      },
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        manufacturers: mfrs.map((m) => m.manufacturer).filter(Boolean),
      },
    };
  } catch (error) {
    console.error("[API /ships] Query error:", error);
    throw error;
  }
}

/**
 * GET handler — query parameters for backward compatibility
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const params: ShipsQueryParams = {
      search: searchParams.get("search") || "",
      manufacturer: searchParams.get("manufacturer") || "",
      role: searchParams.get("role") || "",
      page: parseInt(searchParams.get("page") || "1", 10),
      limit: parseInt(searchParams.get("limit") || "24", 10),
      sortBy: searchParams.get("sortBy") || "name",
      sortOrder: (searchParams.get("sortOrder") === "desc" ? "DESC" : "ASC") as "ASC" | "DESC",
    };

    const result = await handleShipsQuery(params);

    return NextResponse.json(result, {
      headers: secureHeaders(),
    });
  } catch (error) {
    console.error("[API /ships GET] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener las naves" },
      { status: 500, headers: secureHeaders() },
    );
  }
}

/**
 * POST handler — JSON body parameters
 */
export async function POST(request: NextRequest) {
  try {
    const body = await parsePostBody<Record<string, any>>(request);

    if (!body) {
      return NextResponse.json(
        { error: "Invalid request body or content type" },
        { status: 400, headers: secureHeaders() },
      );
    }

    const params: ShipsQueryParams = {
      search: body.search || "",
      manufacturer: body.manufacturer || "",
      role: body.role || "",
      page: body.page || 1,
      limit: body.limit || 24,
      sortBy: body.sortBy || "name",
      sortOrder: (body.sortOrder === "DESC" ? "DESC" : "ASC") as "ASC" | "DESC",
    };

    const result = await handleShipsQuery(params);

    return NextResponse.json(result, {
      headers: secureHeaders(),
    });
  } catch (error) {
    console.error("[API /ships POST] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener las naves" },
      { status: 500, headers: secureHeaders() },
    );
  }
}
