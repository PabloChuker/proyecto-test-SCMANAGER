// =============================================================================
// SC Labs — GET /api/referral/random
//
// Devuelve UN código de referral elegido al azar entre los activos, ponderado
// por `priority_weight`. Es la fuente del rotador del header.
//
// Algoritmo: weighted reservoir sampling vía SQL — `ORDER BY -ln(random()) /
// weight LIMIT 1` distribuye proporcionalmente al peso. Más simple y correcto
// que generar un cumulative array en Node.
//
// Ejemplo de output:
//   { code: "STAR-NX5M-LHLQ", ownerLabel: "chuker",
//     enlistUrl: "https://www.robertsspaceindustries.com/enlist?referral=STAR-NX5M-LHLQ" }
//
// Cache-Control: 5s — corto para que la rotación visible se sienta "viva"
// pero amortigua el load si muchos clientes piden a la vez.
// =============================================================================

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const ENLIST_BASE = "https://www.robertsspaceindustries.com/enlist?referral=";

export async function GET() {
  try {
    const rows: any[] = await sql.unsafe(
      `SELECT code, owner_label, is_dev, priority_weight
         FROM referral_codes
        WHERE is_active = true
        ORDER BY (-ln(random()) / GREATEST(priority_weight, 0.0001)) ASC
        LIMIT 1`,
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "no active referral codes" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const r = rows[0];
    return NextResponse.json(
      {
        code: r.code,
        ownerLabel: r.owner_label ?? null,
        isDev: !!r.is_dev,
        enlistUrl: ENLIST_BASE + r.code,
      },
      {
        headers: {
          // Bajo TTL para que la rotación cliente-side no se "congele" pero sin
          // golpear la BD en cada request; el rotador del header normalmente
          // pide 1 vez por sesión + 1 cada vez que el user toca "next".
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
        },
      },
    );
  } catch (err: any) {
    console.error("[referral/random] error:", err);
    return NextResponse.json(
      { error: "failed to fetch random referral", detail: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}
