// =============================================================================
// AL FILO — GET /api/catalog
//
// Universal item catalog endpoint. One route to query everything.
//
// Query params:
//   type       — ItemType filter (WEAPON, SHIELD, SHIP, etc.)
//   types      — comma-separated list of types (type=WEAPON,TURRET)
//   size       — exact size match
//   minSize    — minimum size
//   maxSize    — maximum size
//   grade      — grade filter (A, B, C, D)
//   manufacturer — manufacturer name (case-insensitive)
//   search     — text search across name, localizedName, className, manufacturer
//   shopId     — only items sold at this shop
//   minPrice   — minimum buy price
//   maxPrice   — maximum buy price
//   sortBy     — field to sort (name, size, manufacturer, dps, shieldHp, powerOutput, price)
//   sortOrder  — asc or desc
//   page       — page number (default 1)
//   limit      — items per page (default 50, max 200)
//   include    — comma-separated: stats,shops,ship (controls what's included)
//
// The `include` param controls which Prisma relations are fetched.
// By default, it includes the type-appropriate stats table.
// Pass include=stats,shops to also get shop prices.
//
// Examples:
//   /api/catalog?type=WEAPON&maxSize=3&sortBy=dps&sortOrder=desc
//   /api/catalog?type=SHIELD&grade=A&include=stats,shops
//   /api/catalog?types=POWER_PLANT,COOLER&search=aegis
//   /api/catalog?type=SHIP&include=ship&sortBy=name
//   /api/catalog?shopId=abc-123&type=WEAPON
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, ItemType } from "@prisma/client";

export const revalidate = 300;

// Map ItemType → which stats relation to include
const TYPE_STATS_MAP: Record<string, string> = {
  WEAPON: "weaponStats",
  TURRET: "weaponStats",
  MISSILE: "missileStats",
  TORPEDO: "missileStats",
  SHIELD: "shieldStats",
  POWER_PLANT: "powerStats",
  COOLER: "coolingStats",
  QUANTUM_DRIVE: "quantumStats",
  MINING_LASER: "miningStats",
  THRUSTER: "thrusterStats",
};

// Valid sort fields and their Prisma paths
const SORT_MAP: Record<string, any> = {
  name: { name: "placeholder" },
  size: { size: "placeholder" },
  manufacturer: { manufacturer: "placeholder" },
  grade: { grade: "placeholder" },
};

// Stats-based sort fields require knowing the stats table
const STATS_SORT_MAP: Record<string, { table: string; field: string }> = {
  dps: { table: "weaponStats", field: "dps" },
  alpha: { table: "weaponStats", field: "alphaDamage" },
  fireRate: { table: "weaponStats", field: "fireRate" },
  range: { table: "weaponStats", field: "range" },
  shieldHp: { table: "shieldStats", field: "maxHp" },
  shieldRegen: { table: "shieldStats", field: "regenRate" },
  powerOutput: { table: "powerStats", field: "powerOutput" },
  coolingRate: { table: "coolingStats", field: "coolingRate" },
  quantumSpeed: { table: "quantumStats", field: "maxSpeed" },
  spoolUp: { table: "quantumStats", field: "spoolUpTime" },
  miningPower: { table: "miningStats", field: "miningPower" },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // ── Parse params ──
    const typeParam = searchParams.get("type")?.trim();
    const typesParam = searchParams.get("types")?.trim();
    const size = searchParams.get("size") ? parseInt(searchParams.get("size")!, 10) : undefined;
    const minSize = searchParams.get("minSize") ? parseInt(searchParams.get("minSize")!, 10) : undefined;
    const maxSize = searchParams.get("maxSize") ? parseInt(searchParams.get("maxSize")!, 10) : undefined;
    const grade = searchParams.get("grade")?.trim() || undefined;
    const manufacturer = searchParams.get("manufacturer")?.trim() || undefined;
    const search = searchParams.get("search")?.trim() || undefined;
    const shopId = searchParams.get("shopId")?.trim() || undefined;
    const minPrice = searchParams.get("minPrice") ? parseFloat(searchParams.get("minPrice")!) : undefined;
    const maxPrice = searchParams.get("maxPrice") ? parseFloat(searchParams.get("maxPrice")!) : undefined;
    const sortBy = searchParams.get("sortBy")?.trim() || "name";
    const sortOrder = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const includeParam = searchParams.get("include")?.trim() || "stats";
    const includeSet = new Set(includeParam.split(",").map((s) => s.trim()));

    // ── Resolve types ──
    let types: string[] = [];
    if (typeParam) types = [typeParam];
    else if (typesParam) types = typesParam.split(",").map((t) => t.trim());

    // ── Build WHERE ──
    const where: Prisma.ItemWhereInput = {};

    if (types.length === 1) {
      where.type = types[0] as ItemType;
    } else if (types.length > 1) {
      where.type = { in: types as ItemType[] };
    }

    if (size !== undefined) where.size = size;
    else if (minSize !== undefined || maxSize !== undefined) {
      where.size = {};
      if (minSize !== undefined) (where.size as any).gte = minSize;
      if (maxSize !== undefined) (where.size as any).lte = maxSize;
    }

    if (grade) where.grade = { equals: grade, mode: "insensitive" };
    if (manufacturer) where.manufacturer = { contains: manufacturer, mode: "insensitive" };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { localizedName: { contains: search, mode: "insensitive" } },
        { className: { contains: search, mode: "insensitive" } },
        { manufacturer: { contains: search, mode: "insensitive" } },
      ];
    }

    if (shopId) {
      where.shopInventory = { some: { shopId } };
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      const priceFilter: any = {};
      if (minPrice !== undefined) priceFilter.gte = minPrice;
      if (maxPrice !== undefined) priceFilter.lte = maxPrice;
      where.shopInventory = {
        ...((where.shopInventory as any) || {}),
        some: {
          ...((where.shopInventory as any)?.some || {}),
          priceBuy: priceFilter,
        },
      };
    }

    // ── Build INCLUDE (dynamic based on type and include param) ──
    const include: Record<string, any> = {};

    if (includeSet.has("stats")) {
      // Include the appropriate stats table for the queried type(s)
      const statsToInclude = new Set<string>();

      if (types.length > 0) {
        for (const t of types) {
          const statsTable = TYPE_STATS_MAP[t];
          if (statsTable) statsToInclude.add(statsTable);
        }
      } else {
        // No type filter: include all stats tables (expensive but complete)
        for (const table of Object.values(TYPE_STATS_MAP)) {
          statsToInclude.add(table);
        }
      }

      for (const table of statsToInclude) {
        include[table] = true;
      }
    }

    if (includeSet.has("shops")) {
      include.shopInventory = {
        include: {
          shop: {
            include: { location: true },
          },
        },
      };
    }

    if (includeSet.has("ship")) {
      include.ship = true;
    }

    if (includeSet.has("hardpoints")) {
      include.hardpoints = {
        include: {
          equippedItem: {
            include: buildStatsInclude(types),
          },
        },
        orderBy: [
          { category: "asc" as const },
          { maxSize: "desc" as const },
        ],
      };
    }

    // ── Build ORDER BY ──
    let orderBy: any;

    if (sortBy === "price") {
      // Sort by price requires a special approach
      orderBy = { name: sortOrder };
    } else if (SORT_MAP[sortBy]) {
      orderBy = { [sortBy]: sortOrder };
    } else if (STATS_SORT_MAP[sortBy]) {
      const { table, field } = STATS_SORT_MAP[sortBy];
      orderBy = { [table]: { [field]: { sort: sortOrder, nulls: "last" } } };
    } else {
      orderBy = { name: "asc" };
    }

    // ── Execute queries ──
    const [items, total] = await Promise.all([
      prisma.item.findMany({
        where,
        include: Object.keys(include).length > 0 ? include : undefined,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.item.count({ where }),
    ]);

    // ── Strip rawData from response ──
    const cleaned = items.map((item: any) => {
      const { rawData, ...rest } = item;
      return rest;
    });

    return NextResponse.json(
      {
        data: cleaned,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          types: types.length > 0 ? types : undefined,
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("[API /catalog] Error:", error);
    return NextResponse.json(
      { error: "Error en el catálogo" },
      { status: 500 }
    );
  }
}

// Helper: build stats include for equipped items based on queried types
function buildStatsInclude(types: string[]): Record<string, boolean> {
  const include: Record<string, boolean> = {};
  if (types.length === 0) {
    // Include all stats tables
    for (const table of new Set(Object.values(TYPE_STATS_MAP))) {
      include[table] = true;
    }
  } else {
    for (const t of types) {
      const table = TYPE_STATS_MAP[t];
      if (table) include[table] = true;
    }
    // For ships, always include weapon/shield/power stats for equipped items
    if (types.includes("SHIP") || types.includes("VEHICLE")) {
      include.weaponStats = true;
      include.shieldStats = true;
      include.powerStats = true;
      include.coolingStats = true;
      include.quantumStats = true;
    }
  }
  return include;
}
