export const dynamic = "force-dynamic";
// =============================================================================
// SC LABS — /api/mining/commodity-prices
//
// GET — Fetch locations for a commodity, player-centric.
//   ?commodity=GOLD            → (default) where the PLAYER can SELL GOLD,
//                                  direction='sell', ORDER BY price DESC
//                                  (best payout first — mining uses this path).
//   ?commodity=GOLD&side=buy   → where the PLAYER can BUY GOLD (cheapest first).
//   ?commodity=GOLD&side=sell  → explicit "player sells" — same as default.
//   (no params)                → distinct commodity abbreviations.
//
// Legacy compatibility: `?dir=…` is still accepted. The legacy callers were
// using `dir=buy` while meaning "where the player sells" (because the import
// script comments were worded station-centrically). We now normalise that to
// the player-centric convention internally so existing callers don't regress
// once they also flip to `side=sell`.
//
// Direction convention in `commodity_prices`:
//   row.direction='buy'  = player BUYS here (station is selling)   → ORDER ASC
//   row.direction='sell' = player SELLS here (station is buying)   → ORDER DESC
// (Confirmed cross-referencing /api/trade/routes, which joins
//  bp.direction='buy' ↔ sp.direction='sell' with sp.price > bp.price.)
//
// Uses the direct-SQL client (src/lib/db.ts) so this hits the same data
// /api/trade/routes already reads. The old Supabase-SDK path was silently
// blocked by RLS and returned [], which is why inventory rows showed 0 aUEC.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sanitizeString, secureHeaders } from "@/lib/api-security";

export const revalidate = 300;

/** Resolve the caller's intent to an actual table `direction` + sort order. */
function resolveIntent(
  raw: string | null,
): { direction: "buy" | "sell"; order: "ASC" | "DESC" } | null {
  const v = (raw || "sell").toLowerCase();
  if (v === "sell") return { direction: "sell", order: "DESC" }; // player sells — highest payout first
  if (v === "buy") return { direction: "buy", order: "ASC" }; // player buys — cheapest first
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawCommodity = searchParams.get("commodity");
    // `side` is the new, explicit name; `dir` kept for back-compat.
    const side = searchParams.get("side") ?? searchParams.get("dir");

    const intent = resolveIntent(side);
    if (!intent) {
      return NextResponse.json(
        { error: "Invalid side (expected 'buy' or 'sell')" },
        { status: 400, headers: secureHeaders() },
      );
    }

    if (!rawCommodity) {
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

    const rows: any[] = await sql.unsafe(
      `SELECT station, system, price, direction
       FROM commodity_prices
       WHERE commodity_abbr = $1
         AND direction = $2
         AND price > 0
         AND station IS NOT NULL
         AND system IS NOT NULL
       ORDER BY price ${intent.order}
       LIMIT 50`,
      [commodity, intent.direction],
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
