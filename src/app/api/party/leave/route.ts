// =============================================================================
// SC LABS — /api/party/leave
//
// Endpoint disparado por `navigator.sendBeacon()` cuando el usuario cierra la
// pestaña con una party abierta (beforeunload / pagehide).  También se puede
// llamar manualmente desde el botón "Salir" / "Disolver" en `/party/page.tsx`.
//
// Contrato:
//   POST /api/party/leave
//   body: { party_id: string }  (JSON o Blob text/plain con JSON.stringify)
//
// Comportamiento:
//   1. Auth via cookie (sendBeacon manda las cookies de sesión automáticamente
//      para same-origin).  Si no hay sesión → 401 silencioso (igual devolvemos
//      200 al beacon para no meter ruido en logs del browser).
//   2. DELETE del row `party_members` del usuario.
//   3. Si quedaba como líder y todavía hay miembros → transferir liderazgo al
//      siguiente miembro (preserva el flujo que ya existía en `/party/page.tsx`
//      `leaveParty`).
//   4. Si era el último miembro → NO borrar la party (como hacía antes): marcar
//      `status='ended', ended_at=NOW()` para conservar el historial que los
//      stats de actividades necesitan.
//
// sendBeacon particularities:
//   - El body llega como `application/json` (cuando mandamos Blob con type
//     "application/json") o como `text/plain` (cuando mandamos string sin
//     type).  Aceptamos ambos con un fallback JSON.parse.
//   - No podemos responder nada útil al cliente (sendBeacon ignora la response)
//     pero devolvemos algo para hacer el endpoint también útil desde fetch().
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function readPayload(request: NextRequest): Promise<{ party_id?: string }> {
  // Intentamos JSON parse robusto (sendBeacon puede enviar como text/plain).
  try {
    const text = await request.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Devolvemos 200 para que el beacon no marque error en la consola del
      // browser cuando la sesión ya expiró mientras se cerraba la pestaña.
      return NextResponse.json({ ok: false, reason: "no-session" });
    }

    const { party_id } = await readPayload(request);
    if (!party_id) {
      return NextResponse.json({ ok: false, reason: "missing-party-id" });
    }

    // 1. Verificar que el usuario sea miembro de esta party
    const { data: myMembership } = await supabase
      .from("party_members")
      .select("user_id, role")
      .eq("party_id", party_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!myMembership) {
      return NextResponse.json({ ok: true, reason: "not-a-member" });
    }

    const wasLeader = myMembership.role === "leader";

    // 2. Borrar el row del usuario
    await supabase
      .from("party_members")
      .delete()
      .eq("party_id", party_id)
      .eq("user_id", user.id);

    // 3. Contar miembros restantes
    const { count } = await supabase
      .from("party_members")
      .select("*", { count: "exact", head: true })
      .eq("party_id", party_id);

    const remaining = count ?? 0;

    if (remaining === 0) {
      // 4a. Era el último → marcar party ended (preservar historial)
      await supabase
        .from("parties")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", party_id);

      // 4a-bis. Auto-cerrar mining_sessions linked a esta party.
      //
      // Sin esto, `/mining` queda con sesiones fantasma: party ended pero
      // mining_session still 'active' → `PartyMiningDashboard` auto-selecciona
      // la sesión vieja y precarga su crew. Fix aplicado junto con migración
      // 055 que hizo el backfill one-shot. Mismo criterio que party: no
      // borramos la fila (se conserva el historial de WOs / inventory).
      await supabase
        .from("mining_sessions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("party_id", party_id)
        .eq("status", "active");

      return NextResponse.json({ ok: true, state: "ended" });
    }

    if (wasLeader) {
      // 4b. Transferir liderazgo al primer miembro restante
      const { data: next } = await supabase
        .from("party_members")
        .select("user_id")
        .eq("party_id", party_id)
        .limit(1)
        .maybeSingle();

      if (next) {
        await supabase
          .from("parties")
          .update({ leader_id: next.user_id, last_seen_at: new Date().toISOString() })
          .eq("id", party_id);

        await supabase
          .from("party_members")
          .update({ role: "leader" })
          .eq("party_id", party_id)
          .eq("user_id", next.user_id);
      }
    } else {
      // Refrescar last_seen_at para que la party no se marque stale.
      await supabase
        .from("parties")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", party_id);
    }

    return NextResponse.json({ ok: true, state: "active", remaining });
  } catch (e: any) {
    // Nunca tiramos 500 al beacon: lo loggeamos y devolvemos 200 opaco.
    console.error("[/api/party/leave] error:", e?.message ?? e);
    return NextResponse.json({ ok: false, reason: "internal-error" });
  }
}
