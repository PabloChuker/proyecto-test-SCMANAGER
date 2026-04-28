// =============================================================================
// SC Labs — GET /api/game-versions
//
// Devuelve qué versiones del juego están cargadas en BD, separadas por branch
// LIVE / PTU. El header del frontend usa esto para poblar el toggle.
//
// DETECCIÓN DE BRANCH (basado en datos reales 2026-04-28):
//   - "4.7.0-LIVE.11518367"     → LIVE
//   - "4.7.3-PTU.123"           → PTU
//   - "4.7.2"                   → LIVE (default si no hay sufijo)
//
// El "current" para cada branch es el más reciente. Criterios de prioridad:
//   1. is_current = true (si la columna existe)
//   2. applied_at más nuevo (si existe)
//   3. version string lexicográficamente mayor
//
// NUNCA devuelve 500 para no romper el header del frontend.
// =============================================================================

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const revalidate = 60;

interface GameVersionRow {
  version: string;
  is_current?: boolean | null;
  applied_at?: string | null;
}

function detectBranch(version: string): "LIVE" | "PTU" {
  const v = version.toUpperCase();
  if (v.includes("PTU")) return "PTU";
  return "LIVE";
}

/**
 * Solo aceptamos versions con formato "X.Y[.Z]..." — descartamos strings
 * raros tipo "concept" o "test" que pueden vivir en la tabla por otros usos.
 */
function isValidVersionString(s: unknown): boolean {
  if (typeof s !== "string") return false;
  return /^\d+\.\d+/.test(s.trim());
}

export async function GET() {
  try {
    let rows: GameVersionRow[] = [];

    // Intentar query rica (con is_current/applied_at). Si esas columnas no
    // existen, fallback a query simple.
    try {
      rows = await sql.unsafe(`
        SELECT version, is_current, applied_at
        FROM game_versions
        ORDER BY applied_at DESC NULLS LAST, version DESC
      `, []) as any;
    } catch {
      try {
        rows = await sql.unsafe(`
          SELECT version FROM game_versions ORDER BY version DESC
        `, []) as any;
      } catch (e) {
        console.warn("[game-versions] query failed:", (e as any)?.message);
        rows = [];
      }
    }

    // Filtrar entries que no son versions reales del juego
    const valid = rows.filter((r) => r?.version && isValidVersionString(r.version));

    // Separar por branch
    const live = valid.filter((r) => detectBranch(r.version) === "LIVE");
    const ptu = valid.filter((r) => detectBranch(r.version) === "PTU");

    const pickCurrent = (arr: GameVersionRow[]): GameVersionRow | null => {
      if (arr.length === 0) return null;
      const explicit = arr.find((r) => r.is_current === true);
      return explicit ?? arr[0]; // ya viene ordenado por applied_at desc
    };

    const liveCurrent = pickCurrent(live);
    const ptuCurrent = pickCurrent(ptu);

    return NextResponse.json(
      {
        live: liveCurrent ? {
          version: liveCurrent.version,
          branch: "LIVE",
          label: liveCurrent.version,
        } : null,
        ptu: ptuCurrent ? {
          version: ptuCurrent.version,
          branch: "PTU",
          label: ptuCurrent.version,
        } : null,
        all: { live: live.map((r) => r.version), ptu: ptu.map((r) => r.version) },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (err: any) {
    // NUNCA 500 — el header no debe romperse por esto.
    console.error("[API /game-versions] Error:", err?.message || err);
    return NextResponse.json(
      { live: null, ptu: null, error: err?.message ?? "Unknown" },
      { status: 200 },
    );
  }
}
