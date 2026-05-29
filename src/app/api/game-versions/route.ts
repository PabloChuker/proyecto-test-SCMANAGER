// =============================================================================
// SC Labs — GET /api/game-versions
//
// Devuelve qué versiones del juego están DISPONIBLES (online) en BD, separadas
// por branch LIVE / PTU. El header del frontend usa esto para poblar el toggle.
//
// FUENTE DE VERDAD ÚNICA (fix 2026-05-29):
//   Antes este endpoint consultaba la tabla con columnas `is_current` y
//   `applied_at` que NO EXISTEN en `game_versions` (solo hay: version, source,
//   processedAt, notes, online). Esa query fallaba SIEMPRE y caía a un fallback
//   con `ORDER BY version DESC` lexicográfico — incorrecto para semver/build y
//   desincronizado con el resto de la app. Resultado: el header podía marcar
//   como "actual" una versión distinta de la que servían los endpoints de datos.
//
//   Ahora reusamos `getOnlineVersionsCache()` (mismo cache que usan todos los
//   endpoints) que ya devuelve las versions online ordenadas de MÁS NUEVA a más
//   vieja con un comparador semver+build correcto. Así header y datos comparten
//   exactamente la misma noción de "versión actual".
//
// DETECCIÓN DE BRANCH:
//   - "4.7.0-LIVE.11518367" / "4.7.2"  → LIVE
//   - "4.7.3-PTU.123"                  → PTU
//
// NUNCA devuelve 500 para no romper el header del frontend.
// =============================================================================

import { NextResponse } from "next/server";
import { getOnlineVersionsCache, parseGameVersion } from "@/lib/onlineVersions";

export const revalidate = 60;

/**
 * Solo aceptamos versions con formato "X.Y[.Z]..." — descartamos strings
 * raros tipo "CONCEPT" o "test" que pueden vivir en la tabla por otros usos.
 */
function isValidVersionString(s: unknown): boolean {
  if (typeof s !== "string") return false;
  return /^\d+\.\d+/.test(s.trim());
}

export async function GET() {
  try {
    // `array` viene ordenado de MÁS NUEVA a más vieja (processedAt DESC, con
    // desempate por comparador semver+build). Solo contiene versions online.
    const { array } = await getOnlineVersionsCache();

    const valid = array.filter((v) => isValidVersionString(v));

    const live = valid.filter((v) => parseGameVersion(v).branch === "LIVE");
    const ptu = valid.filter((v) => parseGameVersion(v).branch === "PTU");

    // "current" = el primero de cada branch (ya están ordenados newest-first).
    const liveCurrent = live[0] ?? null;
    const ptuCurrent = ptu[0] ?? null;

    return NextResponse.json(
      {
        live: liveCurrent
          ? { version: liveCurrent, branch: "LIVE", label: liveCurrent }
          : null,
        ptu: ptuCurrent
          ? { version: ptuCurrent, branch: "PTU", label: ptuCurrent }
          : null,
        all: { live, ptu },
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
      { live: null, ptu: null, all: { live: [], ptu: [] }, error: err?.message ?? "Unknown" },
      { status: 200 },
    );
  }
}
