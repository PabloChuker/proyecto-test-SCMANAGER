export const dynamic = "force-dynamic";
// =============================================================================
// AL FILO — /api/trade/routes v1 (Raw SQL — actual DB schema)
//
// Calculates and returns profitable trade routes.
// Finds buy/sell pairs for commodities across terminals and calculates profit metrics.
// Supports filtering, sorting, and pagination.
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
  profit: "profit",
  roi: "roi",
  profit_per_scu: "profit_per_scu",
};

interface TradeRoutesQueryParams {
  id_star_system: number | null;
  id_commodity: number | null;
  min_profit: number;
  cargo_scu: number;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "ASC" | "DESC";
}

/**
 * Shared internal function for querying trade routes.
 * Handles all business logic, security validation, and database queries.
 */
async function handleTradeRoutesQuery(params: TradeRoutesQueryParams) {
  try {
    // Validate and clamp integers
    const page = validateInt(params.page, 1, 1, 1000);
    const limit = validateInt(params.limit, 20, 1, 500);
    const cargo_scu = validateInt(params.cargo_scu, 100, 1, 1000000);
    const min_profit = Math.max(0, params.min_profit || 0);
    const id_star_system = params.id_star_system !== null ? validateInt(params.id_star_system, 0, 0, 999999) : null;
    const id_commodity = params.id_commodity !== null ? validateInt(params.id_commodity, 0, 0, 999999) : null;

    // Validate sort column against whitelist and sort order
    const sortBy = validateSortColumn(params.sortBy, SORT_MAP, "profit");
    const sortOrder = validateSortDir(params.sortOrder);
    const sortCol = SORT_MAP[sortBy] || "profit";

    // Build WHERE conditions for trade route calculation
    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIdx = 1;

    // Add filters for star system if provided
    if (id_star_system !== null && id_star_system > 0) {
      conditions.push(`buy_terminal.id_star_system = $${paramIdx}`);
      queryParams.push(id_star_system);
      paramIdx++;
    }

    // Add filters for commodity if provided
    if (id_commodity !== null && id_commodity > 0) {
      conditions.push(`tc.id = $${paramIdx}`);
      queryParams.push(id_commodity);
      paramIdx++;
    }

    // Build the base query that finds buy/sell pairs
    let whereClause = "";
    if (conditions.length > 0) {
      whereClause = "WHERE " + conditions.join(" AND ");
    }

    // Build the WHERE clause combining base conditions with optional filters
    const baseConditions = [
      "bp.price_buy > 0",
      "sp.price_sell > 0",
      "bp.status_buy > 0",
      "sp.status_sell > 0",
      "bp.id_terminal != sp.id_terminal",
    ];
    const allConditions = [...baseConditions, ...conditions];
    const fullWhere = "WHERE " + allConditions.join(" AND ");

    // Cargo SCU params
    queryParams.push(cargo_scu, cargo_scu, cargo_scu);
    const cargoIdx1 = paramIdx;
    const cargoIdx2 = paramIdx + 1;
    const cargoIdx3 = paramIdx + 2;

    const allRoutes: any[] = await sql.unsafe(
      `SELECT
        tc.id as commodity_id,
        tc.name as commodity_name,
        tc.kind as commodity_kind,
        buy_terminal.id as buy_terminal_id,
        buy_terminal.name as buy_terminal_name,
        buy_terminal.star_system_name as buy_star_system_name,
        buy_terminal.planet_name as buy_planet_name,
        sell_terminal.id as sell_terminal_id,
        sell_terminal.name as sell_terminal_name,
        sell_terminal.star_system_name as sell_star_system_name,
        sell_terminal.planet_name as sell_planet_name,
        bp.price_buy as price_buy,
        sp.price_sell as price_sell,
        (sp.price_sell * $${cargoIdx1} - bp.price_buy * $${cargoIdx1}) as profit,
        CASE WHEN bp.price_buy > 0 THEN ((sp.price_sell - bp.price_buy)::float / bp.price_buy) * 100 ELSE 0 END as roi,
        (sp.price_sell - bp.price_buy) as profit_per_scu
       FROM trade_commodities tc
       JOIN trade_prices bp ON bp.id_commodity = tc.id
       JOIN trade_terminals buy_terminal ON buy_terminal.id = bp.id_terminal
       JOIN trade_prices sp ON sp.id_commodity = tc.id
       JOIN trade_terminals sell_terminal ON sell_terminal.id = sp.id_terminal
       ${fullWhere}
       ORDER BY profit DESC
       LIMIT 5000`,
      queryParams,
    );

    // Filter by minimum profit threshold
    const filteredRoutes = allRoutes.filter((route) => route.profit >= min_profit);

    // Sort the filtered routes
    let sortedRoutes = filteredRoutes;
    if (sortCol === "profit") {
      sortedRoutes.sort((a, b) => (sortOrder === "DESC" ? b.profit - a.profit : a.profit - b.profit));
    } else if (sortCol === "roi") {
      sortedRoutes.sort((a, b) => (sortOrder === "DESC" ? b.roi - a.roi : a.roi - b.roi));
    } else if (sortCol === "profit_per_scu") {
      sortedRoutes.sort((a, b) =>
        sortOrder === "DESC" ? b.profit_per_scu - a.profit_per_scu : a.profit_per_scu - b.profit_per_scu,
      );
    }

    const total = sortedRoutes.length;
    const offset = (page - 1) * limit;
    const paginatedRoutes = sortedRoutes.slice(offset, offset + limit);

    // Map to expected format
    const data = paginatedRoutes.map((route) => ({
      commodity: {
        id: route.commodity_id,
        name: route.commodity_name,
        kind: route.commodity_kind,
      },
      buyTerminal: {
        id: route.buy_terminal_id,
        name: route.buy_terminal_name,
        starSystemName: route.buy_star_system_name,
        planetName: route.buy_planet_name,
      },
      sellTerminal: {
        id: route.sell_terminal_id,
        name: route.sell_terminal_name,
        starSystemName: route.sell_star_system_name,
        planetName: route.sell_planet_name,
      },
      priceBuy: route.price_buy != null ? Number(route.price_buy) : 0,
      priceSell: route.price_sell != null ? Number(route.price_sell) : 0,
      profitPerScu: route.profit_per_scu != null ? Number(route.profit_per_scu) : 0,
      totalProfit: route.profit != null ? Number(route.profit) : 0,
      roi: route.roi != null ? Number(route.roi) : 0,
      investment: cargo_scu * (route.price_buy != null ? Number(route.price_buy) : 0),
    }));

    return {
      routes: data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      cargoScu: cargo_scu,
      minProfit: min_profit,
    };
  } catch (error) {
    console.error("[API /trade/routes] Query error:", error);
    throw error;
  }
}

/**
 * GET handler — query parameters for backward compatibility
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const params: TradeRoutesQueryParams = {
      id_star_system: searchParams.get("id_star_system") ? parseInt(searchParams.get("id_star_system")!, 10) : null,
      id_commodity: searchParams.get("id_commodity") ? parseInt(searchParams.get("id_commodity")!, 10) : null,
      min_profit: searchParams.get("min_profit") ? parseFloat(searchParams.get("min_profit")!) : 0,
      cargo_scu: parseInt(searchParams.get("cargo_scu") || "100", 10),
      page: parseInt(searchParams.get("page") || "1", 10),
      limit: parseInt(searchParams.get("limit") || "20", 10),
      sortBy: searchParams.get("sortBy") || "profit",
      sortOrder: (searchParams.get("sortOrder") === "asc" ? "ASC" : "DESC") as "ASC" | "DESC",
    };

    const result = await handleTradeRoutesQuery(params);

    return NextResponse.json(result, {
      headers: secureHeaders(),
    });
  } catch (error) {
    console.error("[API /trade/routes GET] Error:", error);
    return NextResponse.json(
      { error: "Error al calcular las rutas comerciales" },
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

    const params: TradeRoutesQueryParams = {
      id_star_system: body.id_star_system !== undefined ? body.id_star_system : null,
      id_commodity: body.id_commodity !== undefined ? body.id_commodity : null,
      min_profit: body.min_profit || 0,
      cargo_scu: body.cargo_scu || 100,
      page: body.page || 1,
      limit: body.limit || 20,
      sortBy: body.sortBy || "profit",
      sortOrder: (body.sortOrder === "ASC" ? "ASC" : "DESC") as "ASC" | "DESC",
    };

    const result = await handleTradeRoutesQuery(params);

    return NextResponse.json(result, {
      headers: secureHeaders(),
    });
  } catch (error) {
    console.error("[API /trade/routes POST] Error:", error);
    return NextResponse.json(
      { error: "Error al calcular las rutas comerciales" },
      { status: 500, headers: secureHeaders() },
    );
  }
}
