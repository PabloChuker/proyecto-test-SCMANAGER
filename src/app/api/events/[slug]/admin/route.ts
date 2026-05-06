// =============================================================================
// SC LABS — GET /api/events/[slug]/admin
//
// Lista TODAS las registraciones del evento con datos de admin (incluye flag
// de asistencia confirmada). Solo accesible para admins del evento.
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Cargar evento + check admin
    const { data: event } = await supabase
      .from("community_events")
      .select("id, slug, name, admin_user_ids")
      .eq("slug", slug)
      .maybeSingle();
    if (!event) return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
    if (!event.admin_user_ids?.includes(user.id)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    // Registraciones con datos del usuario (username via profiles)
    const { data: regs, error } = await supabase
      .from("event_registrations")
      .select("id, user_id, display_name, rsi_handle, attendance_intent, notes, attended, attended_confirmed_at, attended_confirmed_by, created_at")
      .eq("event_id", event.id)
      .order("created_at", { ascending: true });
    if (error) throw error;

    // Enrich con username/avatar
    const userIds = Array.from(new Set((regs ?? []).map((r) => r.user_id)));
    let profilesById = new Map();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", userIds);
      profilesById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    }

    const enriched = (regs ?? []).map((r) => ({
      ...r,
      author_username: profilesById.get(r.user_id)?.username ?? null,
      author_avatar_url: profilesById.get(r.user_id)?.avatar_url ?? null,
    }));

    // Ganadores del sorteo
    const { data: winners } = await supabase
      .from("event_raffle_winners_public")
      .select("*")
      .eq("event_id", event.id)
      .order("drawn_at", { ascending: false });

    return NextResponse.json({
      event: { id: event.id, slug: event.slug, name: event.name },
      registrations: enriched,
      winners: winners ?? [],
    });
  } catch (e: any) {
    console.error("[/api/events/[slug]/admin GET]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}
