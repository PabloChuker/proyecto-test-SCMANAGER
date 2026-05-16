// =============================================================================
// AL FILO — GET /api/ccu/ships
//
// Returns all ships eligible for CCU chains, with MSRP data.
// Used by the CCU Calculator UI for ship selection dropdowns.
// Sorted by MSRP ascending (cheapest first).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getOnlineVersionsArray } from "@/lib/onlineVersions";

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
    // 2026-05-13 (CCU.25): INVERTIDA la prioridad del COALESCE. Antes ship_price
    // ganaba sobre wiki canonical, lo cual rompía las actualizaciones de precio:
    // si una nave aumentó de $400 a $450 en RSI (Drake Ironclad caso real), el
    // wiki canonical se actualiza con $450 al correr el scraper, pero
    // ship_price.msrp_usd se quedaba en $400 hasta que alguien corra populate_prices.
    // El COALESCE devolvía $400 (no NULL) → endpoint mostraba precio viejo.
    // Solución: spc.pledge_usd (más reciente) gana, ship_price es fallback histórico.
    //
    // 2026-05-12 (CCU.17): segundo LEFT JOIN por nombre con strip de manufacturer
    // prefix. Caso típico: Anvil Spartan en BD se llama "Anvil Spartan" pero el
    // wiki canonical solo dice "Spartan" → load_rsi_prices_canonical.mjs deja
    // `ship_id` NULL → join por id no matchea → la nave no aparece en el
    // dropdown aunque tenga pledge_usd $80 en SPC. Solución: si el join por
    // ship_id no trajo precio, intentamos un match por nombre normalizado
    // (lower + strip "Aegis|Anvil|Drake|RSI|..." prefix). Esto cubre el gap
    // hasta que se corra de nuevo el script de matching.
    // 2026-05-12 (CCU.18): DISTINCT ON (class_name) para deduplicar naves
    // que están N veces en la tabla `ships` (caso típico: Garnok importó
    // 4.7.2 LIVE + PTU → MRAI_Pulse aparece 2-4 veces, una por game_version).
    // Sin esto, el dropdown mostraba "Mirai Pulse" repetido 4 veces.
    // Tomamos la entrada con mayor msrp (proxy de "live más reciente"), y
    // ante empate, la más nueva por id (ordering descendente).
    let query = `
      SELECT DISTINCT ON (s.class_name)
             s.id, s.class_name AS reference, s.name, m.name AS manufacturer,
             COALESCE(spc.pledge_usd, spc_name.pledge_usd, sp.msrp_usd) AS msrp_usd,
             COALESCE(spc.warbond_usd, spc_name.warbond_usd, sp.warbond_usd) AS warbond_usd,
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
      WHERE COALESCE(spc.pledge_usd, spc_name.pledge_usd, sp.msrp_usd) IS NOT NULL
        AND COALESCE(spc.pledge_usd, spc_name.pledge_usd, sp.msrp_usd) > 0
        AND COALESCE(spc.pledge_usd, spc_name.pledge_usd, sp.msrp_usd) >= $1
        AND COALESCE(spc.pledge_usd, spc_name.pledge_usd, sp.msrp_usd) <= $2
    `;
    const params: any[] = [minPrice, maxPrice];
    let paramIdx = 3;

    if (search) {
      query += ` AND (s.name ILIKE $${paramIdx} OR s.class_name ILIKE $${paramIdx} OR m.name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    // Fase GV-Online: filtrar naves a versions online
    const onlineList = await getOnlineVersionsArray();
    if (onlineList && onlineList.length > 0) {
      query += ` AND s.game_version = ANY($${paramIdx}::text[])`;
      params.push(onlineList);
      paramIdx++;
    }

    // DISTINCT ON requiere que el primer ORDER BY columna sea la misma del
    // DISTINCT (class_name), después podemos usar el orden lógico que queramos.
    // El SELECT final lo re-ordenamos en JS por msrp ASC.
    query += ` ORDER BY s.class_name, COALESCE(spc.pledge_usd, spc_name.pledge_usd, sp.msrp_usd) DESC NULLS LAST, s.id DESC`;

    const rows: any[] = await sql.unsafe(query, params);

    const ships = rows
      .map((row) => ({
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
      }))
      // Re-orden final por msrp asc (el SQL ordenó por class_name para el
      // DISTINCT). Tie-breaker por name ASC para estabilidad visual.
      .sort((a, b) => {
        if (a.msrpUsd !== b.msrpUsd) return a.msrpUsd - b.msrpUsd;
        return a.name.localeCompare(b.name);
      });

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
