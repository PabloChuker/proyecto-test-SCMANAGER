// =============================================================================
// SC LABS — POST /api/events/[slug]/raffle/winner-email
//
// El ganador del sorteo registra su email para que el equipo organizador le
// envie el premio. Solo puede actualizar su PROPIA fila — el RLS policy
// `event_raffle_winners_self_claim` lo enforce a nivel BD (matchea por
// registration_id => event_registrations.user_id == auth.uid()).
//
// Body: { winner_id: uuid, email: string }
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Email regex sencillo, suficiente para validar shape antes de pegarle a la BD.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const winnerId: string | undefined = body?.winner_id;
    const email: string = String(body?.email ?? "").trim();

    if (!winnerId) {
      return NextResponse.json({ error: "winner_id requerido" }, { status: 400 });
    }
    if (!EMAIL_RE.test(email) || email.length > 200) {
      return NextResponse.json({ error: "Email invalido." }, { status: 400 });
    }

    // Validar que el evento exista (para slug → id, defensivo).
    const { data: event } = await supabase
      .from("community_events")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!event) {
      return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
    }

    // El UPDATE va contra la tabla base — el RLS valida que el caller sea
    // el dueno de la registration asociada al winner_id. Si no lo es, el
    // update afecta 0 filas y devolvemos 403 explicito.
    const { data: updated, error } = await supabase
      .from("event_raffle_winners")
      .update({
        winner_email: email,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", winnerId)
      .eq("event_id", event.id)
      .select("id, winner_email, claimed_at")
      .maybeSingle();

    if (error) {
      console.error("[raffle/winner-email]", error);
      return NextResponse.json(
        { error: error.message || "Error grabando email." },
        { status: 500 },
      );
    }
    if (!updated) {
      return NextResponse.json(
        { error: "No se pudo actualizar — solo el ganador puede registrar su email." },
        { status: 403 },
      );
    }

    return NextResponse.json({ ok: true, winner: updated });
  } catch (e: any) {
    console.error("[/api/events/[slug]/raffle/winner-email POST]", e);
    return NextResponse.json(
      { error: e?.message ?? "Error interno" },
      { status: 500 },
    );
  }
}
