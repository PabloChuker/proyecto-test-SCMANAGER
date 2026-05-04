// =============================================================================
// SC LABS — GET /api/ccu/store-snapshot
//
// CB.3 (2026-05-04): Devuelve naves que están "en venta hoy" en la RSI Store
// segun ship_prices_canonical.pledge_availability. La columna del Chain Board
// la consume.
//
// Categorías que incluye (in-store):
//   - 'Always available'      → siempre en venta
//   - 'Time-limited sales'    → en venta durante eventos (IAE, Invictus...)
//   - 'Quantity-limited sales'→ stock limitado
//
// Excluye:
//   - 'Limited edition*' (sold out)
//   - 'Reward - Not available for sale'
//   - 'Out of production'
//   - 'No longer available'
//   - 'Promotion only'
//
// Cuando esté listo el scraper RSI activo (CB.6) este endpoint cambia su
// fuente a `rsi_store_snapshot` (tabla nueva poblada por el cron) sin
// tocar la UI de la columna.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const revalidate = 600; // 10 minutos

const ELIGIBLE_AVAILABILITY = [
  "Always available",
  "Time-limited sales",
  "Time Limited",            // variante sin guión que aparece en BD
  "Quantity-limited sales",
];

export async function GET(_request: NextRequest) {
  try {
    // Join ships → ship_prices_canonical (donde está pledge_availability + synced_at).
    // Filtramos solo las naves que están actualmente a la venta.
    const rows: any[] = await sql.unsafe(
      `SELECT s.id, s.class_name AS reference, s.name, m.name AS manufacturer,
              spc.pledge_usd AS msrp_usd, spc.warbond_usd,
              spc.pledge_availability,
              spc.production_state,
              spc.synced_at,
              s.size, s.role,
              COALESCE(s.flight_status, 'flight_ready') AS flight_status
         FROM ship_prices_canonical spc
         JOIN ships s ON s.id = spc.ship_id
         LEFT JOIN manufacturers m ON m.id = s.manufacturer_id
        WHERE spc.pledge_availability = ANY($1::text[])
          AND spc.pledge_usd IS NOT NULL
          AND spc.pledge_usd > 0
        ORDER BY spc.pledge_usd ASC, s.name ASC`,
      [ELIGIBLE_AVAILABILITY],
    );

    // Última fecha de sync (timestamp más reciente de cualquier fila)
    const lastSyncedRow: any[] = await sql.unsafe(
      `SELECT MAX(synced_at) AS last_synced FROM ship_prices_canonical`,
      [],
    );
    const lastSynced = lastSyncedRow[0]?.last_synced ?? null;

    const ships = rows.map((row) => ({
      id: String(row.id),
      reference: row.reference,
      name: row.name,
      manufacturer: row.manufacturer,
      msrpUsd: Number(row.msrp_usd) || 0,
      warbondUsd: row.warbond_usd ? Number(row.warbond_usd) : null,
      pledgeAvailability: row.pledge_availability,
      productionState: row.production_state,
      flightStatus: row.flight_status,
      size: row.size,
      role: row.role,
    }));

    return NextResponse.json(
      {
        ships,
        total: ships.length,
        lastSynced: lastSynced ? new Date(lastSynced).toISOString() : null,
        source: "ship_prices_canonical (Wiki)",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=600, stale-while-revalidate=900",
        },
      },
    );
  } catch (error: any) {
    console.error("[API /ccu/store-snapshot] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to load store snapshot", detail: error?.message },
      { status: 500 },
    );
  }
}
