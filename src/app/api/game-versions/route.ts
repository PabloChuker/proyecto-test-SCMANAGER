// =============================================================================
// SC Labs — GET /api/game-versions
//
// Devuelve qué versiones del juego están cargadas en la BD, separadas por
// branch (LIVE / PTU). El header del frontend usa esto para poblar el
// toggle LIVE/PTU con los strings de versión correctos.
//
// CRITERIO DE DETECCIÓN
//
// La tabla `game_versions` tiene una columna `version` (PK) y opcionalmente
// otras columnas. Hasta que se confirme un schema rico, inferimos branch
// desde el sufijo del version string:
//
//   "4.7.2"        → LIVE
//   "4.7.2-PTU"    → PTU
//   "4.7.2-LIVE"   → LIVE
//
// La versión LIVE "vigente" es la más reciente sin sufijo PTU. La versión
// PTU vigente es la más reciente con sufijo PTU. Si hay varias entries del
// mismo branch, tomamos la que tenga `is_current=true` (si existe), sino la
// que tenga el `applied_at` más nuevo, sino la última lexicográficamente.
//
// CACHE
//
// 60s — cambia rara vez (cuando CIG saca nuevo patch).
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
  return "LIVE"; // default
}

/**
 * Filtra entries de game_versions que NO parecen versiones reales de SC.
 * La tabla puede tener strings sueltos tipo "concept" o "test" que no
 * deberían aparecer en el toggle del header.
 *
 * Versiones válidas: formato `N.M[.P[.Q]][-LIVE|-PTU][...]` (ej. "4.7.2",
 * "4.7.0-LIVE.11518367", "4.7.3-PTU"). Cualquier cosa que no arranque con
 * un dígito-punto-dígito queda fuera.
 */
function isValidVersionString(s: unknown): boolean {
  if (typeof s !== "string") return false;
  return /^\d+\.\d+(\.\d+)?/.test(s.trim());
}

export async function GET() {
  try {
    // Query defensiva: no asumimos qué columnas extras existen en game_versions.
    // Pedimos sólo `version` y opcionalmente lo más común para detectar el
    // "current"; si esas columnas no existen el catch las ignora.
    let rows: any[] = [];
    try {
      rows = await sql.unsafe(`
        SELECT
          version,
          is_current,
          applied_at
        FROM game_versions
        ORDER BY applied_at DESC NULLS LAST, version DESC
      `, []);
    } catch {
      // Fallback si las columnas extra no existen
      rows = await sql.unsafe(`
        SELECT version FROM game_versions ORDER BY version DESC
      `, []);
    }

    // Separar por branch — descartando entries que no parecen versiones reales
    // (caso "concept", "test", etc. que pueden vivir en la tabla por motivos
    // distintos a tracking de versions del juego).
    const live: GameVersionRow[] = [];
    const ptu: GameVersionRow[] = [];
    for (const row of rows as GameVersionRow[]) {
      if (!row?.version || !isValidVersionString(row.version)) continue;
      if (detectBranch(row.version) === "PTU") {
        ptu.push(row);
      } else {
        live.push(row);
      }
    }

    // Para cada branch, elegir el "current": is_current=true tiene prioridad,
    // sino el primero (que viene ordenado por applied_at desc).
    const pickCurrent = (arr: GameVersionRow[]): GameVersionRow | null => {
      if (arr.length === 0) return null;
      const explicit = arr.find((r) => r.is_current === true);
      return explicit ?? arr[0];
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
    console.error("[API /game-versions] Error:", err?.message || err);
    // Devolvemos 200 con null/null para no romper el header del frontend.
    // El toggle se va a mostrar como "Live —" y "PTU —".
    return NextResponse.json(
      { live: null, ptu: null, error: err?.message ?? "Unknown" },
      { status: 200 },
    );
  }
}
