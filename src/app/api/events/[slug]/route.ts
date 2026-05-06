// =============================================================================
// SC LABS — GET /api/events/[slug]
//
// Devuelve un evento con sus POIs, contadores, y (si auth) el registration
// del current user. Lectura pública.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const supabase = await createServerSupabaseClient();

    // Evento + counts (la view tiene los counts denormalizados)
    const { data: event, error: eErr } = await supabase
      .from("community_events_public")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (eErr) throw eErr;
    if (!event) return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });

    // POIs
    const { data: pois } = await supabase
      .from("event_pois")
      .select("*")
      .eq("event_id", event.id)
      .order("order_index", { ascending: true });

    // Anuncios
    const { data: announcements } = await supabase
      .from("event_announcements")
      .select("id, title, body, is_pinned, created_at")
      .eq("event_id", event.id)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });

    // Registration del current user (si está logueado)
    const { data: { user } } = await supabase.auth.getUser();
    let myRegistration: any = null;
    if (user) {
      const { data: reg } = await supabase
        .from("event_registrations")
        .select("id, display_name, rsi_handle, attendance_intent, raffle_entry, notes, created_at")
        .eq("event_id", event.id)
        .eq("user_id", user.id)
        .maybeSingle();
      myRegistration = reg ?? null;
    }

    return NextResponse.json({
      event,
      pois: pois ?? [],
      announcements: announcements ?? [],
      myRegistration,
    });
  } catch (e: any) {
    console.error("[/api/events/[slug] GET]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}
