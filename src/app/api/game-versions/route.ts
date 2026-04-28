// =============================================================================
// SC Labs — /api/game-versions (REVERTED 2026-04-28)
//
// Endpoint deshabilitado temporalmente — implementación original asumía
// schema de game_versions sin verificar y eso pudo contribuir al 500
// cascada del 28/04. Devuelve {live:null, ptu:null} con 200 para no romper
// nada que aún lo invoque.
//
// SEGURO BORRAR este archivo cuando hagamos el rediseño desde cero.
// =============================================================================

import { NextResponse } from "next/server";

export const revalidate = 60;

export async function GET() {
  return NextResponse.json(
    { live: null, ptu: null },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
