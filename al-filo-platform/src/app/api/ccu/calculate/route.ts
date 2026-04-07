// =============================================================================
// AL FILO — POST /api/ccu/calculate
//
// Calculates the cheapest CCU chain between two ships.
// Loads all ships + CCU prices from DB, merges user's owned CCUs,
// then runs Dijkstra's pathfinding algorithm.
//
// Request body:
//   { fromShipId, toShipId, ownedCCUs?, preferWarbond?, maxSteps? }
//
// Response:
//   { chain: ChainResult, alternatives: ChainResult[] }
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  findCheapestChain,
  findAlternativeChains,
  mergeUserInventory,
  type ShipNode,
  type CCUEdge,
  type UserOwnedCCU,
  type CalculateOptions,
} from "@/lib/ccu-engine";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      fromShipId,
      toShipId,
      ownedCCUs = [],
      preferWarbond = true,
      hasBuybackToken = false,
      onlyAvailable = true,
      maxSteps = 15,
      excludeShipIds = [],
      includeAlternatives = true,
    } = body;

    if (!fromShipId || !toShipId) {
      return NextResponse.json(
        { error: "fromShipId and toShipId are required" },
        { status: 400 },
      );
    }

    // ── 1. Load all ships with MSRP ──
    const shipRows: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, reference, name, manufacturer, msrp_usd, warbond_usd,
             COALESCE(is_ccu_eligible, true) AS is_ccu_eligible,
             COALESCE(is_limited, false) AS is_limited,
             COALESCE(flight_status, 'flight_ready') AS flight_status
      FROM ships
      WHERE msrp_usd IS NOT NULL AND msrp_usd > 0
      ORDER BY msrp_usd ASC
    `);

    const ships = new Map<string, ShipNode>();
    for (const row of shipRows) {
      ships.set(String(row.id), {
        id: String(row.id),
        reference: row.reference || "",
        name: row.name || "",
        manufacturer: row.manufacturer || null,
        msrpUsd: Number(row.msrp_usd) || 0,
        warbondUsd: row.warbond_usd ? Number(row.warbond_usd) : null,
        isCcuEligible: row.is_ccu_eligible !== false,
        isLimited: row.is_limited === true,
        flightStatus: row.flight_status || "flight_ready",
      });
    }

    // Verify start and target ships exist
    if (!ships.has(String(fromShipId)) || !ships.has(String(toShipId))) {
      return NextResponse.json(
        { error: "One or both ships not found or missing MSRP data" },
        { status: 404 },
      );
    }

    // ── 2. Load CCU prices ──
    // If onlyAvailable=false ("Esperar y Ahorrar"), load ALL CCU prices including unavailable
    const ccuQuery = onlyAvailable
      ? `SELECT from_ship_id, to_ship_id, standard_price, warbond_price,
               is_available, is_warbond_available, is_limited
         FROM ccu_prices WHERE is_available = true`
      : `SELECT from_ship_id, to_ship_id, standard_price, warbond_price,
               is_available, is_warbond_available, is_limited
         FROM ccu_prices`;
    const ccuRows: any[] = await prisma.$queryRawUnsafe(ccuQuery);

    let edges: CCUEdge[] = ccuRows.map((row) => ({
      fromShipId: String(row.from_ship_id),
      toShipId: String(row.to_ship_id),
      standardPrice: Number(row.standard_price) || 0,
      warbondPrice: row.warbond_price ? Number(row.warbond_price) : null,
      isWarbondAvailable: row.is_warbond_available === true,
      isOwned: false,
      ownedLocation: null,
      ownedPricePaid: 0,
      isLimited: row.is_limited === true,
    }));

    // ── 3. Merge user's owned CCUs ──
    if (ownedCCUs && ownedCCUs.length > 0) {
      edges = mergeUserInventory(
        edges,
        ships,
        ownedCCUs as UserOwnedCCU[],
      );
    }

    // ── 4. Run pathfinding ──
    const options: Partial<CalculateOptions> = {
      preferWarbond,
      includeOwned: true,
      hasBuybackToken,
      maxSteps,
      excludeShipIds: excludeShipIds.map(String),
      onlyAvailable,
    };

    const chain = findCheapestChain(
      String(fromShipId),
      String(toShipId),
      ships,
      edges,
      options,
    );

    // ── 5. Find alternatives ──
    let alternatives: any[] = [];
    if (includeAlternatives && chain) {
      alternatives = findAlternativeChains(
        String(fromShipId),
        String(toShipId),
        ships,
        edges,
        options,
        3,
      );
      // Remove the first result (same as main chain)
      if (alternatives.length > 0) {
        alternatives = alternatives.slice(1);
      }
    }

    // ── 6. Response ──
    return NextResponse.json({
      chain,
      alternatives,
      meta: {
        totalShips: ships.size,
        totalEdges: edges.length,
        ownedCCUsMatched: edges.filter(e => e.isOwned).length,
      },
    });
  } catch (error: any) {
    console.error("[API /ccu/calculate] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Calculation failed", detail: error?.message || "Unknown" },
      { status: 500 },
    );
  }
}
