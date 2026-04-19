// =============================================================================
// SC LABS — GET /api/hangar-executive
//
// Devuelve los parametros del ciclo del "Hangar Ejecutivo" de Star Citizen
// (evento ingame que abre y cierra en ciclos fijos). El cliente los usa para
// calcular `isOpen` y el countdown en tiempo real sin round-trips al servidor.
//
// Fuente: tabla hangar_executive_schedule (migracion 049).
// Si la tabla no existe aun, se devuelven los parametros derivados 2026-04-19
// de gstool.org como fallback — la feature sigue funcional hasta que el seed
// llegue a prod.
// =============================================================================

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const revalidate = 300; // 5 min

const FALLBACK = {
  intervalMinutes: 185,
  openDurationMinutes: 65,
  anchorUtc: "2026-04-19T11:59:00.000Z",
  anchorCycleNumber: 192,
  gameVersion: "4.7.1-live",
  source: "gstool.org (DOM-derived, fallback)",
};

export async function GET() {
  try {
    const rows: any[] = await sql.unsafe(
      `
      SELECT
        interval_minutes        AS "intervalMinutes",
        open_duration_minutes   AS "openDurationMinutes",
        anchor_utc              AS "anchorUtc",
        anchor_cycle_number     AS "anchorCycleNumber",
        game_version            AS "gameVersion",
        source,
        notes,
        effective_from          AS "effectiveFrom"
      FROM hangar_executive_schedule
      WHERE superseded_at IS NULL
      ORDER BY effective_from DESC
      LIMIT 1
      `,
      [],
    );

    if (rows.length === 0) {
      return NextResponse.json({ data: FALLBACK, source: "fallback" });
    }

    const row = rows[0];
    return NextResponse.json({
      data: {
        intervalMinutes: Number(row.intervalMinutes),
        openDurationMinutes: Number(row.openDurationMinutes),
        anchorUtc: new Date(row.anchorUtc).toISOString(),
        anchorCycleNumber: row.anchorCycleNumber ? Number(row.anchorCycleNumber) : null,
        gameVersion: row.gameVersion,
        source: row.source,
        notes: row.notes,
      },
      source: "db",
    });
  } catch (e: any) {
    // Si la tabla no existe (migracion 049 no aplicada) devolvemos fallback
    // para que la feature funcione igual hasta que el equipo la corra.
    if (/relation.*does not exist/i.test(String(e?.message || e))) {
      return NextResponse.json({ data: FALLBACK, source: "fallback-no-table" });
    }
    return NextResponse.json({ error: e?.message ?? "internal" }, { status: 500 });
  }
}
