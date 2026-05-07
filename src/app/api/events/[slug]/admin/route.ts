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

    // Cargar evento + check admin. Mantenemos el SELECT minimo para no
    // depender de columnas opcionales que pueden no existir todavia (ej.
    // raffle_session si la migracion 073 aun no se aplico en prod).
    const { data: event } = await supabase
      .from("community_events")
      .select("id, slug, name, admin_user_ids")
      .eq("slug", slug)
      .maybeSingle();
    if (!event) return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
    if (!event.admin_user_ids?.includes(user.id)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    // raffle_session: fetch separado y resiliente. Si la columna no existe
    // (migracion 073 no aplicada), silenciamos el error y usamos el default
    // {phase:"idle"} para que la pagina admin siga funcionando.
    let raffleSession: { phase: string; [k: string]: any } = { phase: "idle" };
    try {
      const { data: rs, error: rsErr } = await supabase
        .from("community_events")
        .select("raffle_session")
        .eq("id", event.id)
        .maybeSingle();
      if (!rsErr && rs && (rs as any).raffle_session) {
        raffleSession = (rs as any).raffle_session;
      }
    } catch {
      // Migracion 073 sin aplicar — fallback a idle.
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
      event: {
        id: event.id,
        slug: event.slug,
        name: event.name,
        raffle_session: raffleSession,
      },
      registrations: enriched,
      winners: winners ?? [],
    });
  } catch (e: any) {
    console.error("[/api/events/[slug]/admin GET]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}
