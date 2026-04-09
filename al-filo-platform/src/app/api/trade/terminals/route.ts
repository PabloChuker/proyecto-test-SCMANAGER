export const dynamic = "force-dynamic";
// =============================================================================
// AL FILO — /api/trade/terminals v1 (Raw SQL — actual DB schema)
//
// Lists all terminals from the trade_terminals table.
// Supports search, star system filter, terminal type filter, amenity filter, sorting, pagination.
//
// GET: Query parameters (backward compatible)
// POST: JSON body with same parameters
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
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
const SORT_MAP: Record<string, string> = {
  name: "tt.name",
  star_system_name: "tt.star_system_name",
  planet_name: "tt.planet_name",
};

interface TerminalsQueryParams {
  search: string;
  id_star_system: number | null;
  type: string;
  has_amenity: string;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "ASC" | "DESC";
}

/**
 * Shared internal function for querying terminals.
 * Handles all business logic, security validation, and database queries.
 */
async function handleTerminalsQuery(params: TerminalsQueryParams) {
  try {
    // Sanitize string inputs
    const search = sanitizeString(params.search, 100);
    const type = sanitizeString(params.type, 50);
    const has_amenity = sanitizeString(params.has_amenity, 50);

    // Validate and clamp integers
    const page = validateInt(params.page, 1, 1, 1000);
    const limit = validateInt(params.limit, 50, 1, 500);
    const id_star_system = params.id_star_system !== null ? validateInt(params.id_star_system, 0, 0, 999999) : null;

    // Validate sort column against whitelist and sort order
    const sortBy = validateSortColumn(params.sortBy, SORT_MAP, "name");
    const sortOrder = validateSortDir(params.sortOrder);
    const sortCol = SORT_MAP[sortBy] || "tt.name";

    // Build WHERE conditions
    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(
        `(tt.name ILIKE $${paramIdx} OR tt.star_system_name ILIKE $${paramIdx} OR tt.planet_name ILIKE $${paramIdx})`,
      );
      queryParams.push(`%${search}%`);
      paramIdx++;
    }

    if (id_star_system !== null && id_star_system > 0) {
      conditions.push(`tt.id_star_system = $${paramIdx}`);
      queryParams.push(id_star_system);
      paramIdx++;
    }

    if (type) {
      conditions.push(`tt.type ILIKE $${paramIdx}`);
      queryParams.push(`%${type}%`);
      paramIdx++;
    }

    // Map amenity filter to actual boolean columns
    const AMENITY_COL_MAP: Record<string, string> = {
      isRefuel: "is_refuel", isRepair: "is_repair", isMedical: "is_medical",
      isFood: "is_food", isHabitation: "is_habitation", isAutoLoad: "is_auto_load",
      isCargoCenter: "is_cargo_center", isRefinery: "is_refinery",
    };
    if (has_amenity && AMENITY_COL_MAP[has_amenity]) {
      conditions.push(`tt.${AMENITY_COL_MAP[has_amenity]} = 1`);
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    // Count total
    const countResult: any[] = await sql.unsafe(
      `SELECT COUNT(*)::int as total FROM trade_terminals tt ${whereClause}`,
      queryParams,
    );
    const total = countResult[0]?.total ?? 0;

    // Fetch terminals
    const offset = (page - 1) * limit;
    const terminals: any[] = await sql.unsafe(
      `SELECT tt.id, tt.name, tt.nickname, tt.code, tt.type, tt.star_system_name, tt.planet_name, tt.orbit_name, tt.moon_name, tt.space_station_name, tt.outpost_name, tt.city_name, tt.faction_name, tt.company_name, tt.id_star_system, tt.max_container_size, tt.is_habitation, tt.is_refinery, tt.is_cargo_center, tt.is_medical, tt.is_food, tt.is_refuel, tt.is_repair, tt.is_nqa, tt.is_auto_load, tt.has_loading_dock, tt.has_freight_elevator
       FROM trade_terminals tt
       ${whereClause}
       ORDER BY ${sortCol} ${sortOrder} NULLS LAST
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...queryParams, limit, offset],
    );

    // Get distinct star systems for filter dropdown
    const systems: any[] = await sql.unsafe(
      `SELECT DISTINCT id_star_system, star_system_name FROM trade_terminals WHERE id_star_system IS NOT NULL ORDER BY star_system_name ASC`,
      [],
    );

    // Get distinct terminal types for filter dropdown
    const types: any[] = await sql.unsafe(
      `SELECT DISTINCT type FROM trade_terminals WHERE type IS NOT NULL ORDER BY type ASC`,
      [],
    );

    // Map to expected format
    const data = terminals.map((t) => ({
      id: t.id,
      name: t.name,
      nickname: t.nickname || "",
      code: t.code || "",
      type: t.type,
      starSystemName: t.star_system_name || "",
      planetName: t.planet_name || "",
      orbitName: t.orbit_name || "",
      moonName: t.moon_name,
      spaceStationName: t.space_station_name,
      outpostName: t.outpost_name,
      cityName: t.city_name,
      factionName: t.faction_name || "",
      companyName: t.company_name || "",
      maxContainerSize: t.max_container_size || 32,
      isHabitation: t.is_habitation === 1,
      isRefinery: t.is_refinery === 1,
      isCargoCenter: t.is_cargo_center === 1,
      isMedical: t.is_medical === 1,
      isFood: t.is_food === 1,
      isRefuel: t.is_refuel === 1,
      isRepair: t.is_repair === 1,
      isNqa: t.is_nqa === 1,
      isAutoLoad: t.is_auto_load === 1,
      hasLoadingDock: t.has_loading_dock === 1,
      hasFreightElevator: t.has_freight_elevator === 1,
    }));

    return {
      terminals: data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      starSystems: systems.map((s) => ({ id: s.id_star_system, name: s.star_system_name })),
      types: types.map((t) => t.type).filter(Boolean),
    };
  } catch (error) {
    console.error("[API /trade/terminals] Query error:", error);
    throw error;
  }
}

/**
 * GET handler — query parameters for backward compatibility
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const params: TerminalsQueryParams = {
      search: searchParams.get("search") || "",
      id_star_system: searchParams.get("id_star_system") ? parseInt(searchParams.get("id_star_system")!, 10) : null,
      type: searchParams.get("type") || "",
      has_amenity: searchParams.get("has_amenity") || "",
      page: parseInt(searchParams.get("page") || "1", 10),
      limit: parseInt(searchParams.get("limit") || "50", 10),
      sortBy: searchParams.get("sortBy") || "name",
      sortOrder: (searchParams.get("sortOrder") === "desc" ? "DESC" : "ASC") as "ASC" | "DESC",
    };

    const result = await handleTerminalsQuery(params);

    return NextResponse.json(result, {
      headers: secureHeaders(),
    });
  } catch (error) {
    console.error("[API /trade/terminals GET] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener los terminales" },
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

    const params: TerminalsQueryParams = {
      search: body.search || "",
      id_star_system: body.id_star_system !== undefined ? body.id_star_system : null,
      type: body.type || "",
      has_amenity: body.has_amenity || "",
      page: body.page || 1,
      limit: body.limit || 50,
      sortBy: body.sortBy || "name",
      sortOrder: (body.sortOrder === "DESC" ? "DESC" : "ASC") as "ASC" | "DESC",
    };

    const result = await handleTerminalsQuery(params);

    return NextResponse.json(result, {
      headers: secureHeaders(),
    });
  } catch (error) {
    console.error("[API /trade/terminals POST] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener los terminales" },
      { status: 500, headers: secureHeaders() },
    );
  }
}
