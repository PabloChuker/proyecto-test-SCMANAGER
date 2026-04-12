// =============================================================================
// SC LABS — /api/mining/commodity-prices
//
// GET — Fetch sell/buy locations for a commodity, or list all commodities
//   ?commodity=GOLD         → sell locations for GOLD sorted by price desc
//   ?commodity=GOLD&dir=sell → where to buy GOLD (station sells)
//   (no params)             → list of distinct commodity abbreviations
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const commodity = searchParams.get("commodity");
    const direction = searchParams.get("dir") || "buy"; // default: where station buys (player sells)

    if (!commodity) {
      // Return list of distinct commodities
      const { data, error } = await supabase
        .from("commodity_prices")
        .select("commodity_abbr")
        .order("commodity_abbr");

      if (error) throw error;

      const unique = Array.from(new Set((data || []).map((r: any) => r.commodity_abbr)));
      return NextResponse.json({ data: unique });
    }

    // Fetch prices for a specific commodity
    const { data, error } = await supabase
      .from("commodity_prices")
      .select("station, system, price, direction")
      .eq("commodity_abbr", commodity.toUpperCase())
      .eq("direction", direction)
      .order("price", { ascending: direction === "sell" }); // sell: cheapest first, buy: most expensive first

    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
