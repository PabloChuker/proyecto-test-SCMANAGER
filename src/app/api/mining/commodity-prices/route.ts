export const dynamic = "force-dynamic";
// =============================================================================
// SC LABS — /api/mining/commodity-prices
//
// GET — Fetch sell/buy locations for a commodity, or list all commodities.
//   ?commodity=GOLD          → where a player can sell GOLD (direction=buy)
//                              sorted by price DESC (best payout first).
//   ?commodity=GOLD&dir=sell → where to buy GOLD as a player (direction=sell)
//                              sorted by price ASC (cheapest first).
//   (no params)              → list of distinct commodity abbreviations.
//
// Uses the direct-SQL client (src/lib/db.ts) instead of the Supabase browser
// SDK. `commodity_prices` is a read-only reference table populated nightly
// from UEX; the Supabase anon role has no RLS policy on it and silently
// returns an empty list, which is why inventory items were showing
// "0 aUEC/SCU". This is the same client `/api/trade/*` already uses to drive
// the Trade Routes tab, so now Mining sees the exact same data.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sanitizeString, secureHeaders } from "@/lib/api-security";

export const revalidate = 300;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawCommodity = searchParams.get("commodity");
    const direction = (searchParams.get("dir") || "buy").toLowerCase();

    // Only two valid directions in the UEX dataset.
    if (direction !== "buy" && direction !== "sell") {
      return NextResponse.json(
        { error: "Invalid dir (expected 'buy' or 'sell')" },
        { status: 400, headers: secureHeaders() },
      );
    }

    if (!rawCommodity) {
      // List distinct commodity abbreviations.
      const rows: { commodity_abbr: string }[] = await sql.unsafe(
        `SELECT DISTINCT commodity_abbr
         FROM commodity_prices
         WHERE commodity_abbr IS NOT NULL
         ORDER BY commodity_abbr ASC`,
        [],
      );
      return NextResponse.json(
        { data: rows.map((r) => r.commodity_abbr) },
        { headers: secureHeaders() },
      );
    }

    const commodity = sanitizeString(rawCommodity, 20).toUpperCase();
    if (!commodity) {
      return NextResponse.json(
        { error: "Invalid commodity code" },
        { status: 400, headers: secureHeaders() },
      );
    }

    // ORDER BY semantics:
    //   direction=buy  → station is buying from the player (player SELLS here).
    //                    Best for the player = highest price, so DESC.
    //   direction=sell → station is selling to the player (player BUYS here).
    //                    Best for the player = lowest price, so ASC.
    const order = direction === "buy" ? "DESC" : "ASC";

    const rows: any[] = await sql.unsafe(
      `SELECT station, system, price, direction
       FROM commodity_prices
       WHERE commodity_abbr = $1
         AND direction = $2
         AND price > 0
         AND station IS NOT NULL
         AND system IS NOT NULL
       ORDER BY price ${order}`,
      [commodity, direction],
    );

    return NextResponse.json(
      {
        data: rows.map((r) => ({
          station: r.station,
          system: r.system,
          price: Number(r.price),
          direction: r.direction,
        })),
      },
      { headers: secureHeaders() },
    );
  } catch (e: any) {
    console.error("[/api/mining/commodity-prices]", e);
    return NextResponse.json(
      { error: e?.message || "Unexpected error" },
      { status: 500, headers: secureHeaders() },
    );
  }
}
