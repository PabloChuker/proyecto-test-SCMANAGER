// =============================================================================
// AL FILO — GET /api/ccu/ships
//
// Returns all ships eligible for CCU chains, with MSRP data.
// Used by the CCU Calculator UI for ship selection dropdowns.
// Sorted by MSRP ascending (cheapest first).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const revalidate = 300; // Cache for 5 minutes

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const minPrice = parseFloat(searchParams.get("minPrice") || "0");
    const maxPrice = parseFloat(searchParams.get("maxPrice") || "99999");

    // CB.8b (2026-05-04): hay 20+ ships con precio en `ship_prices_canonical`
    // (wiki) pero `ship_price.msrp_usd` NULL — caso típico Greycat UTV ($40 LTI),
    // Cyclone variants, Tumbril Ranger CV, etc. Antes el endpoint los filtraba
    // por el WHERE de ship_price → quedaban afuera del catálogo y rompían el
    // matching del Inventario en /hangar/chain-board.
    //
    // Fix: COALESCE entre las 2 fuentes. ship_price gana cuando existe (es la
    // tabla canónica del módulo CCU), sino caemos al wiki cache.
    //
    // 2026-05-12 (CCU.17): segundo LEFT JOIN por nombre con strip de manufacturer
    // prefix. Caso típico: Anvil Spartan en BD se llama "Anvil Spartan" pero el
    // wiki canonical solo dice "Spartan" → load_rsi_prices_canonical.mjs deja
    // `ship_id` NULL → join por id no matchea → la nave no aparece en el
    // dropdown aunque tenga pledge_usd $80 en SPC. Solución: si el join por
    // ship_id no trajo precio, intentamos un match por nombre normalizado
    // (lower + strip "Aegis|Anvil|Drake|RSI|..." prefix). Esto cubre el gap
    // hasta que se corra de nuevo el script de matching.
    let query = `
      SELECT s.id, s.class_name AS reference, s.name, m.name AS manufacturer,
             COALESCE(sp.msrp_usd, spc.pledge_usd, spc_name.pledge_usd) AS msrp_usd,
             COALESCE(sp.warbond_usd, spc.warbond_usd, spc_name.warbond_usd) AS warbond_usd,
             COALESCE(sp.is_ccu_eligible, true) AS is_ccu_eligible,
             COALESCE(sp.is_limited, false) AS is_limited,
             COALESCE(s.flight_status, 'flight_ready') AS flight_status,
             s.size, s.role
      FROM ships s
      LEFT JOIN ship_price sp ON sp.id = s.id
      LEFT JOIN ship_prices_canonical spc ON spc.ship_id = s.id
      LEFT JOIN ship_prices_canonical spc_name
        ON spc.ship_id IS NULL
       AND spc_name.ship_id IS NULL
       AND LOWER(spc_name.ship_name) = LOWER(REGEXP_REPLACE(
             s.name,
             '^(Aegis|Anvil|Drake|RSI|Origin|MISC|Crusader|Esperia|Banu|Tumbril|Argo|Greycat|Kruger|Mirai|Vanduul|Aopoa|Consolidated Outland|Gatac|CNOU)\\s+',
             '', 'i'))
      LEFT JOIN manufacturers m ON m.id = s.manufacturer_id
      WHERE COALESCE(sp.msrp_usd, spc.pledge_usd, spc_name.pledge_usd) IS NOT NULL
        AND COALESCE(sp.msrp_usd, spc.pledge_usd, spc_name.pledge_usd) > 0
        AND COALESCE(sp.msrp_usd, spc.pledge_usd, spc_name.pledge_usd) >= $1
        AND COALESCE(sp.msrp_usd, spc.pledge_usd, spc_name.pledge_usd) <= $2
    `;
    const params: any[] = [minPrice, maxPrice];
    let paramIdx = 3;

    if (search) {
      query += ` AND (s.name ILIKE $${paramIdx} OR s.class_name ILIKE $${paramIdx} OR m.name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    query += ` ORDER BY COALESCE(sp.msrp_usd, spc.pledge_usd, spc_name.pledge_usd) ASC, s.name ASC`;

    const rows: any[] = await sql.unsafe(query, params);

    const ships = rows.map((row) => ({
      id: String(row.id),
      reference: row.reference,
      name: row.name,
      manufacturer: row.manufacturer,
      msrpUsd: Number(row.msrp_usd) || 0,
      warbondUsd: row.warbond_usd ? Number(row.warbond_usd) : null,
      isCcuEligible: row.is_ccu_eligible !== false,
      isLimited: row.is_limited === true,
      flightStatus: row.flight_status || "flight_ready",
      size: row.size,
      role: row.role,
    }));

    return NextResponse.json(
      { ships, total: ships.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error: any) {
    console.error("[API /ccu/ships] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to load ships", detail: error?.message },
      { status: 500 },
    );
  }
}
