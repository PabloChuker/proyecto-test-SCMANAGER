// =============================================================================
// AL FILO — /api/ccu/prices
//
// GET  — Fetch CCU prices (all or filtered by from/to ship)
// POST — Bulk upsert warbond prices (for scraping/admin updates)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 300;

// ─── GET: Fetch CCU prices ──────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fromShipId = searchParams.get("fromShipId");
    const toShipId = searchParams.get("toShipId");
    const warbondOnly = searchParams.get("warbondOnly") === "true";

    let query = `
      SELECT
        cp.id,
        cp.from_ship_id, s1.name AS from_ship_name, s1.reference AS from_ship_ref,
        s1.msrp_usd AS from_msrp,
        cp.to_ship_id, s2.name AS to_ship_name, s2.reference AS to_ship_ref,
        s2.msrp_usd AS to_msrp,
        cp.standard_price, cp.warbond_price,
        cp.is_available, cp.is_warbond_available, cp.is_limited,
        cp.source, cp.last_verified
      FROM ccu_prices cp
      JOIN ships s1 ON s1.id = cp.from_ship_id
      JOIN ships s2 ON s2.id = cp.to_ship_id
      WHERE cp.is_available = true
    `;
    const params: any[] = [];
    let paramIdx = 1;

    if (fromShipId) {
      query += ` AND cp.from_ship_id = $${paramIdx}::uuid`;
      params.push(fromShipId);
      paramIdx++;
    }

    if (toShipId) {
      query += ` AND cp.to_ship_id = $${paramIdx}::uuid`;
      params.push(toShipId);
      paramIdx++;
    }

    if (warbondOnly) {
      query += ` AND cp.warbond_price IS NOT NULL AND cp.is_warbond_available = true`;
    }

    query += ` ORDER BY cp.standard_price ASC LIMIT 500`;

    const rows: any[] = await prisma.$queryRawUnsafe(query, ...params);

    const prices = rows.map((row) => ({
      id: row.id,
      fromShipId: String(row.from_ship_id),
      fromShipName: row.from_ship_name,
      fromShipRef: row.from_ship_ref,
      fromMsrp: Number(row.from_msrp),
      toShipId: String(row.to_ship_id),
      toShipName: row.to_ship_name,
      toShipRef: row.to_ship_ref,
      toMsrp: Number(row.to_msrp),
      standardPrice: Number(row.standard_price),
      warbondPrice: row.warbond_price ? Number(row.warbond_price) : null,
      isAvailable: row.is_available,
      isWarbondAvailable: row.is_warbond_available,
      isLimited: row.is_limited,
      source: row.source,
      lastVerified: row.last_verified,
    }));

    return NextResponse.json({ prices, total: prices.length });
  } catch (error: any) {
    console.error("[API /ccu/prices GET] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to load prices", detail: error?.message },
      { status: 500 },
    );
  }
}

// ─── POST: Bulk upsert warbond prices ───────────────────────────────────────
// Body: { updates: [{ fromShipRef, toShipRef, warbondPrice, isAvailable }] }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { updates } = body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "updates array is required" },
        { status: 400 },
      );
    }

    let updated = 0;
    let errors: string[] = [];

    for (const item of updates) {
      try {
        const { fromShipRef, toShipRef, warbondPrice, isWarbondAvailable = true } = item;

        if (!fromShipRef || !toShipRef) {
          errors.push(`Missing ship references: ${JSON.stringify(item)}`);
          continue;
        }

        // Find ship IDs by reference
        const result: any[] = await prisma.$queryRawUnsafe(`
          UPDATE ccu_prices
          SET warbond_price = $1,
              is_warbond_available = $2,
              source = 'scraped',
              last_verified = NOW(),
              updated_at = NOW()
          WHERE from_ship_id = (SELECT id FROM ships WHERE reference ILIKE $3 LIMIT 1)
            AND to_ship_id = (SELECT id FROM ships WHERE reference ILIKE $4 LIMIT 1)
          RETURNING id
        `, warbondPrice, isWarbondAvailable, fromShipRef, toShipRef);

        if (result.length > 0) {
          updated++;
        } else {
          errors.push(`No CCU found: ${fromShipRef} → ${toShipRef}`);
        }
      } catch (e: any) {
        errors.push(`Error updating ${item.fromShipRef} → ${item.toShipRef}: ${e.message}`);
      }
    }

    return NextResponse.json({
      updated,
      total: updates.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("[API /ccu/prices POST] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to update prices", detail: error?.message },
      { status: 500 },
    );
  }
}
