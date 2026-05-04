// =============================================================================
// SC LABS — GET /api/cron/rsi-sync (CB.6, 2026-05-04)
//
// Endpoint que sincroniza data fresca desde fuentes públicas de RSI.
//
// 2026-05-04 update: el cron automático de Vercel fue removido del vercel.json
// para ahorrar function invocations. La fuente PRIMARIA ahora es el pulsador
// "🔄 Refrescar ahora" en /sys (panel admin) que llama al server action
// `runRsiSyncAction` directamente. Este endpoint sigue vivo como BACKUP para:
//   - Invocación manual con curl/postman:
//       curl -H "Authorization: Bearer $CRON_SECRET" https://sclabs.space/api/cron/rsi-sync
//   - Reactivación del cron schedule en el futuro si se prefiere automático
//     (basta con agregar el `crons:` en vercel.json).
//
// Auth: header `Authorization: Bearer <CRON_SECRET>` (env var en Vercel).
//
// Response: summary del sync con ships nuevas detectadas, cambios de
// production_status y duración total.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { runRsiSync } from "@/lib/rsi-sync";

// Cron debe correr server-side y NUNCA cachearse (cada run es único)
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Vercel Pro: hasta 60s. Sync típico: ~3-8s.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  // Vercel Cron envía header `Authorization: Bearer ${CRON_SECRET}` automáticamente
  // si la env var está configurada en Vercel. También aceptamos query param
  // `?secret=` para invocaciones manuales de debug (CON cuidado — el secret
  // queda en logs).
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      {
        error: "CRON_SECRET no configurado",
        hint: "Setea env var CRON_SECRET en Vercel para autorizar este endpoint",
      },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const querySecret = request.nextUrl.searchParams.get("secret") ?? "";
  const providedSecret =
    authHeader.startsWith("Bearer ") ? authHeader.slice(7) : querySecret;

  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Run sync ────────────────────────────────────────────────────────────
  try {
    const result = await runRsiSync(sql);

    // Log resumen al stdout — Vercel los captura en Function Logs.
    console.log(
      `[cron/rsi-sync] OK ${result.durationMs}ms — matrix:${result.matrixFetched}, ` +
        `newShips:${result.newShips.length}, statusChanges:${result.statusChanges.length}, ` +
        `pricesBumped:${result.pricesCanonicalBumped}`,
    );
    if (result.newShips.length > 0) {
      console.log(`[cron/rsi-sync] NEW SHIPS detected: ${result.newShips.join(", ")}`);
    }
    if (result.statusChanges.length > 0) {
      for (const c of result.statusChanges) {
        console.log(
          `[cron/rsi-sync] STATUS: ${c.shipName} ${c.oldStatus ?? "?"} → ${c.newStatus}`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...result,
    });
  } catch (e: any) {
    console.error("[cron/rsi-sync] FAILED:", e?.message ?? e);
    return NextResponse.json(
      {
        ok: false,
        error: "rsi-sync failed",
        detail: e?.message ?? "unknown",
      },
      { status: 500 },
    );
  }
}
