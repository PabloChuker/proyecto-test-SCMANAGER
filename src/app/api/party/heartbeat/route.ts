// =============================================================================
// SC LABS — /api/party/heartbeat
//
// Pingea `parties.last_seen_at = NOW()` mientras el usuario tiene la pestaña
// abierta.  Sirve de complemento a `/api/party/leave`: si el browser crashea
// o se pierde la red antes de disparar el beacon, el barrido de staleness en
// las queries (`/party` y `WorkOrderCalculator`) va a ver la party como
// obsoleta y no la va a precargar.
//
// Contrato:
//   POST /api/party/heartbeat
//   body: { party_id: string }
//
// Requiere que el caller sea miembro de la party (chequeo de membresía).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, reason: "no-session" });
    }

    let party_id: string | undefined;
    try {
      const body = await request.json();
      party_id = body?.party_id;
    } catch {
      /* ignore */
    }
    if (!party_id) {
      return NextResponse.json({ ok: false, reason: "missing-party-id" });
    }

    // Confirmar membresía antes de pingear
    const { data: membership } = await supabase
      .from("party_members")
      .select("user_id")
      .eq("party_id", party_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ ok: false, reason: "not-a-member" });
    }

    await supabase
      .from("parties")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", party_id)
      .eq("status", "active");

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[/api/party/heartbeat] error:", e?.message ?? e);
    return NextResponse.json({ ok: false, reason: "internal-error" });
  }
}
