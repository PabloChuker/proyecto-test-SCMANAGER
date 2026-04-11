// =============================================================================
// SC LABS — /api/loaners
//
// Returns the loaner ships granted by owning a given pledge ship, based on
// the official RSI Loaner Ship Matrix stored in the ship_loaners table.
//
// GET /api/loaners?ship=<shipName>
//   → { pledgedName, loaners: [{ name, note? }, ...] }
//
// GET /api/loaners  (no query)
//   → { matrix: [{ pledgedName, loaners: [...] }, ...] }  (full matrix)
//
// Matching is done by comparing the normalized ship name against the
// `pledged_name_normalized` column. Normalization rules match the client
// helper in `src/lib/loaners.ts`: lowercase, strip manufacturer prefix,
// strip punctuation, collapse whitespace.
// =============================================================================

export const dynamic = "force-dynamic";
export const revalidate = 3600;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { normalizeShipName } from "@/lib/loaners";
import { secureHeaders } from "@/lib/api-security";

interface LoanerRow {
  pledged_name: string;
  pledged_name_normalized: string;
  loaner_name: string;
  loaner_name_normalized: string;
  sort_order: number;
  note: string | null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shipParam = searchParams.get("ship");

    if (shipParam) {
      const normalized = normalizeShipName(shipParam);
      const rows = (await sql`
        SELECT pledged_name, pledged_name_normalized, loaner_name,
               loaner_name_normalized, sort_order, note
        FROM ship_loaners
        WHERE pledged_name_normalized = ${normalized}
        ORDER BY sort_order ASC
      `) as unknown as LoanerRow[];

      return NextResponse.json(
        {
          query: shipParam,
          normalized,
          pledgedName: rows[0]?.pledged_name ?? null,
          loaners: rows.map((r) => ({
            name: r.loaner_name,
            normalized: r.loaner_name_normalized,
            note: r.note,
          })),
        },
        { headers: secureHeaders() },
      );
    }

    // No filter — return the full matrix grouped by pledged ship.
    const rows = (await sql`
      SELECT pledged_name, pledged_name_normalized, loaner_name,
             loaner_name_normalized, sort_order, note
      FROM ship_loaners
      ORDER BY pledged_name ASC, sort_order ASC
    `) as unknown as LoanerRow[];

    // Group by pledged_name_normalized
    const grouped = new Map<
      string,
      { pledgedName: string; loaners: { name: string; normalized: string; note: string | null }[] }
    >();
    for (const r of rows) {
      const key = r.pledged_name_normalized;
      if (!grouped.has(key)) {
        grouped.set(key, { pledgedName: r.pledged_name, loaners: [] });
      }
      grouped.get(key)!.loaners.push({
        name: r.loaner_name,
        normalized: r.loaner_name_normalized,
        note: r.note,
      });
    }

    return NextResponse.json(
      { matrix: Array.from(grouped.values()) },
      { headers: secureHeaders() },
    );
  } catch (err) {
    console.error("[/api/loaners] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch loaner matrix" },
      { status: 500, headers: secureHeaders() },
    );
  }
}
