export const dynamic = "force-dynamic";
// =============================================================================
// SC LABS — /api/mining/commodity-prices
//
// GET — Fetch locations for a commodity, player-centric.
//   ?commodity=GOLD            → (default) where the PLAYER can SELL GOLD,
//                                  highest payout first (mining uses this path).
//   ?commodity=GOLD&side=buy   → where the PLAYER can BUY GOLD (cheapest first).
//   ?commodity=GOLD&side=sell  → explicit "player sells" — same as default.
//   (no params)                → distinct commodity codes.
//
// Legacy compatibility: `?dir=…` is still accepted.
//
// ⚠️ Historical note: this endpoint used to query a `commodity_prices` table
// that doesn't exist in production (the migration `039_create_commodity_prices`
// was never applied to Supabase). The real price data lives in the original
// UEX-style schema that `/api/trade/*` already consumes:
//
//   trade_commodities  (id, code, name)
//   trade_terminals    (id, name, star_system_name, is_available)
//   trade_prices       (id_commodity, id_terminal, price_sell_avg, price_buy_avg)
//
// We JOIN those three, aggregate duplicates (multiple raw/refined rows per
// code share the same abbreviation → we pick MAX so the caller sees the best
// available payout), and return the same shape the previous endpoint did
// so no client changes are needed.
//
// Uses the direct-SQL client (src/lib/db.ts) so this hits the same data
// /api/trade/routes already reads.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sanitizeString, secureHeaders } from "@/lib/api-security";

export const revalidate = 300;

type Side = "buy" | "sell";

function resolveSide(raw: string | null): Side | null {
  const v = (raw || "sell").toLowerCase();
  if (v === "sell" || v === "buy") return v;
  return null;
}

// scunpacked uses different short ids than UEX for some ores. We translate
// them server-side so legacy WOs (created with the scunpacked code) and
// any future caller both work without each having to know the override map.
// Mirror of src/data/mining/mineral-commodity-map.ts OVERRIDES.
const CODE_ALIASES: Record<string, string> = {
  BORS: "BORA",   // Borase
  OURA: "OURAT",  // Ouratite
  ASLA: "ASLAR",  // Aslarite
  JACL: "JACO",   // Jaclium
  SALDN: "SALD",  // Saldynium
  DOLV: "DOLI",   // Dolivine
  BERL: "BERY",   // Beryl
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawCommodity = searchParams.get("commodity");
    // `side` is the new, explicit name; `dir` kept for back-compat.
    const side = resolveSide(searchParams.get("side") ?? searchParams.get("dir"));

    if (!side) {
      return NextResponse.json(
        { error: "Invalid side (expected 'buy' or 'sell')" },
        { status: 400, headers: secureHeaders() },
      );
    }

    // Column and sort direction depend on which side the player is on:
    //   player sells → we want HIGH price_sell_avg first
    //   player buys  → we want LOW price_buy_avg first (but > 0)
    const priceCol = side === "sell" ? "price_sell_avg" : "price_buy_avg";
    const order = side === "sell" ? "DESC" : "ASC";

    // ── List mode: distinct commodity codes available on the chosen side ──
    if (!rawCommodity) {
      const rows: { code: string }[] = await sql.unsafe(
        `SELECT DISTINCT tc.code
         FROM trade_commodities tc
         JOIN trade_prices tp ON tp.id_commodity = tc.id
         WHERE tc.code IS NOT NULL
           AND tp.${priceCol} > 0
         ORDER BY tc.code ASC`,
        [],
      );
      return NextResponse.json(
        { data: rows.map((r) => r.code) },
        { headers: secureHeaders() },
      );
    }

    const commodityRaw = sanitizeString(rawCommodity, 20).toUpperCase();
    if (!commodityRaw) {
      return NextResponse.json(
        { error: "Invalid commodity code" },
        { status: 400, headers: secureHeaders() },
      );
    }
    // Translate scunpacked ids (e.g. "BORS") to the UEX code (e.g. "BORA")
    // before we query the DB.
    const commodity = CODE_ALIASES[commodityRaw] ?? commodityRaw;

    // ── Fetch rows ─────────────────────────────────────────────────────────
    // Many minerals appear twice in trade_commodities (raw + refined) with
    // the SAME code. We aggregate over terminals so the caller gets one row
    // per station with the best price observed across both variants.
    const rows: Array<{ station: string; system: string; price: number }> =
      await sql.unsafe(
        `SELECT tt.name                 AS station,
                tt.star_system_name     AS system,
                MAX(tp.${priceCol})::numeric AS price
         FROM trade_commodities tc
         JOIN trade_prices      tp ON tp.id_commodity = tc.id
         JOIN trade_terminals   tt ON tt.id           = tp.id_terminal
         WHERE tc.code            = $1
           AND tp.${priceCol}     > 0
           AND (tt.is_available IS NULL OR tt.is_available = 1)
           AND tt.name IS NOT NULL
           AND tt.star_system_name IS NOT NULL
         GROUP BY tt.name, tt.star_system_name
         ORDER BY price ${order}
         LIMIT 50`,
        [commodity],
      );

    return NextResponse.json(
      {
        data: rows.map((r) => ({
          station: r.station,
          system: r.system,
          price: Number(r.price) || 0,
          direction: side,
        })),
      },
      { headers: secureHeaders() },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[/api/mining/commodity-prices]", e);
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: secureHeaders() },
    );
  }
}
