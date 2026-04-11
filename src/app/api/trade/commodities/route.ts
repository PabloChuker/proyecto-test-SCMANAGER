export const dynamic = "force-dynamic";
// =============================================================================
// AL FILO — /api/trade/commodities v1 (Raw SQL — actual DB schema)
//
// Lists all commodities from the trade_commodities table.
// Supports search, kind filter, raw/illegal filters, sorting, pagination.
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
  name: "tc.name",
  price_buy: "tc.price_buy",
  price_sell: "tc.price_sell",
  kind: "tc.kind",
};

interface CommoditiesQueryParams {
  search: string;
  kind: string;
  is_raw: number | null;
  is_illegal: number | null;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "ASC" | "DESC";
}

/**
 * Shared internal function for querying commodities.
 * Handles all business logic, security validation, and database queries.
 */
async function handleCommoditiesQuery(params: CommoditiesQueryParams) {
  try {
    // Sanitize string inputs
    const search = sanitizeString(params.search, 100);
    const kind = sanitizeString(params.kind, 100);

    // Validate and clamp integers
    const page = validateInt(params.page, 1, 1, 1000);
    const limit = validateInt(params.limit, 50, 1, 500);
    const is_raw = params.is_raw !== null ? validateInt(params.is_raw, 0, 0, 1) : null;
    const is_illegal = params.is_illegal !== null ? validateInt(params.is_illegal, 0, 0, 1) : null;

    // Validate sort column against whitelist and sort order
    const sortBy = validateSortColumn(params.sortBy, SORT_MAP, "name");
    const sortOrder = validateSortDir(params.sortOrder);
    const sortCol = SORT_MAP[sortBy] || "tc.name";

    // Build WHERE conditions
    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(`tc.name ILIKE $${paramIdx}`);
      queryParams.push(`%${search}%`);
      paramIdx++;
    }

    if (kind) {
      conditions.push(`tc.kind ILIKE $${paramIdx}`);
      queryParams.push(`%${kind}%`);
      paramIdx++;
    }

    if (is_raw !== null) {
      conditions.push(`tc.is_raw = $${paramIdx}`);
      queryParams.push(is_raw);
      paramIdx++;
    }

    if (is_illegal !== null) {
      conditions.push(`tc.is_illegal = $${paramIdx}`);
      queryParams.push(is_illegal);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    // Count total
    const countResult: any[] = await sql.unsafe(
      `SELECT COUNT(*)::int as total FROM trade_commodities tc ${whereClause}`,
      queryParams,
    );
    const total = countResult[0]?.total ?? 0;

    // Fetch commodities
    const offset = (page - 1) * limit;
    const commodities: any[] = await sql.unsafe(
      `SELECT tc.id, tc.name, tc.code, tc.kind, tc.price_buy, tc.price_sell, tc.is_raw, tc.is_illegal, tc.is_mineral, tc.is_refined, tc.is_harvestable, tc.is_buyable, tc.is_sellable, tc.weight_scu
       FROM trade_commodities tc
       ${whereClause}
       ORDER BY ${sortCol} ${sortOrder} NULLS LAST
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...queryParams, limit, offset],
    );

    // Get distinct kinds for filter dropdown
    const kinds: any[] = await sql.unsafe(
      `SELECT DISTINCT kind FROM trade_commodities WHERE kind IS NOT NULL ORDER BY kind ASC`,
      [],
    );

    // Map to expected format
    const data = commodities.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      kind: c.kind,
      weightScu: c.weight_scu != null ? Number(c.weight_scu) : null,
      priceBuy: c.price_buy != null ? Number(c.price_buy) : null,
      priceSell: c.price_sell != null ? Number(c.price_sell) : null,
      isRaw: c.is_raw === 1,
      isRefined: c.is_refined === 1,
      isMineral: c.is_mineral === 1,
      isHarvestable: c.is_harvestable === 1,
      isBuyable: c.is_buyable === 1,
      isSellable: c.is_sellable === 1,
      isIllegal: c.is_illegal === 1,
    }));

    return {
      commodities: data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      kinds: kinds.map((k) => k.kind).filter(Boolean),
    };
  } catch (error) {
    console.error("[API /trade/commodities] Query error:", error);
    throw error;
  }
}

/**
 * GET handler — query parameters for backward compatibility
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const params: CommoditiesQueryParams = {
      search: searchParams.get("search") || "",
      kind: searchParams.get("kind") || "",
      is_raw: searchParams.get("is_raw") ? parseInt(searchParams.get("is_raw")!, 10) : null,
      is_illegal: searchParams.get("is_illegal") ? parseInt(searchParams.get("is_illegal")!, 10) : null,
      page: parseInt(searchParams.get("page") || "1", 10),
      limit: parseInt(searchParams.get("limit") || "50", 10),
      sortBy: searchParams.get("sortBy") || "name",
      sortOrder: (searchParams.get("sortOrder") === "desc" ? "DESC" : "ASC") as "ASC" | "DESC",
    };

    const result = await handleCommoditiesQuery(params);

    return NextResponse.json(result, {
      headers: secureHeaders(),
    });
  } catch (error) {
    console.error("[API /trade/commodities GET] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener las mercancías" },
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

    const params: CommoditiesQueryParams = {
      search: body.search || "",
      kind: body.kind || "",
      is_raw: body.is_raw !== undefined ? body.is_raw : null,
      is_illegal: body.is_illegal !== undefined ? body.is_illegal : null,
      page: body.page || 1,
      limit: body.limit || 50,
      sortBy: body.sortBy || "name",
      sortOrder: (body.sortOrder === "DESC" ? "DESC" : "ASC") as "ASC" | "DESC",
    };

    const result = await handleCommoditiesQuery(params);

    return NextResponse.json(result, {
      headers: secureHeaders(),
    });
  } catch (error) {
    console.error("[API /trade/commodities POST] Error:", error);
    return NextResponse.json(
      { error: "Error al obtener las mercancías" },
      { status: 500, headers: secureHeaders() },
    );
  }
}
