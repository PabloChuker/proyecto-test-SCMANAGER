// =============================================================================
// SC LABS — POST /api/events/[slug]/admin/cleanup
//
// Zona de peligro del panel admin: borra datos del evento con confirmacion.
// Solo accesible para admins listados en community_events.admin_user_ids.
//
// Body:
//   { action: "registrations" | "winners" | "raffle_session" | "all",
//     confirmation: "BORRAR" }
//
// La palabra "BORRAR" es un guard explicito — el cliente la pide al admin
// antes de hacer el POST. Sin ese token la API rechaza con 400.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CleanupAction = "registrations" | "winners" | "raffle_session" | "all";

const VALID_ACTIONS: CleanupAction[] = [
  "registrations",
  "winners",
  "raffle_session",
  "all",
];

const IDLE_SESSION = { phase: "idle", prize: null, winner: null };

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
    const action = String(body?.action ?? "") as CleanupAction;
    const confirmation = String(body?.confirmation ?? "");

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Accion invalida. Usar: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 },
      );
    }
    if (confirmation !== "BORRAR") {
      return NextResponse.json(
        { error: "Confirmacion requerida — escribi exactamente BORRAR para autorizar." },
        { status: 400 },
      );
    }

    // Validar admin
    const { data: event } = await supabase
      .from("community_events")
      .select("id, admin_user_ids")
      .eq("slug", slug)
      .maybeSingle();
    if (!event) {
      return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
    }
    if (!event.admin_user_ids?.includes(user.id)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    const counts = { registrations: 0, winners: 0, raffle_session_reset: false };

    if (action === "winners" || action === "all") {
      // Borrar ganadores ANTES que registrations — los winners tienen FK a
      // registrations. Si borramos registrations primero el ON DELETE
      // probablemente cascadea, pero hacerlo explicito es mas seguro y nos
      // permite contar.
      const { data: deletedW, error: wErr } = await supabase
        .from("event_raffle_winners")
        .delete()
        .eq("event_id", event.id)
        .select("id");
      if (wErr) throw wErr;
      counts.winners = deletedW?.length ?? 0;
    }

    if (action === "registrations" || action === "all") {
      const { data: deletedR, error: rErr } = await supabase
        .from("event_registrations")
        .delete()
        .eq("event_id", event.id)
        .select("id");
      if (rErr) throw rErr;
      counts.registrations = deletedR?.length ?? 0;
    }

    if (action === "raffle_session" || action === "all") {
      const { error: sErr } = await supabase
        .from("community_events")
        .update({ raffle_session: IDLE_SESSION, updated_at: new Date().toISOString() })
        .eq("id", event.id);
      if (sErr) throw sErr;
      counts.raffle_session_reset = true;
    }

    return NextResponse.json({ ok: true, action, counts });
  } catch (e: any) {
    console.error("[/api/events/[slug]/admin/cleanup POST]", e);
    return NextResponse.json(
      { error: e?.message ?? "Error interno" },
      { status: 500 },
    );
  }
}
