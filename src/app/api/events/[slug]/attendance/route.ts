// =============================================================================
// SC LABS — POST /api/events/[slug]/attendance
//
// Toggle del flag "attended" de una registración. Admin-only.
// Body: { registration_id: string, attended: boolean }
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const registration_id = body?.registration_id;
    const attended = !!body?.attended;
    if (!registration_id) return NextResponse.json({ error: "registration_id requerido" }, { status: 400 });

    // Validar admin del evento
    const { data: event } = await supabase
      .from("community_events")
      .select("id, admin_user_ids")
      .eq("slug", slug)
      .maybeSingle();
    if (!event) return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
    if (!event.admin_user_ids?.includes(user.id)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    // Actualizar (RLS también lo permite por la policy event_registrations_admin_update)
    const { data, error } = await supabase
      .from("event_registrations")
      .update({
        attended,
        attended_confirmed_at: attended ? new Date().toISOString() : null,
        attended_confirmed_by: attended ? user.id : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", registration_id)
      .eq("event_id", event.id)
      .select("id, attended, attended_confirmed_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ registration: data });
  } catch (e: any) {
    console.error("[/api/events/[slug]/attendance POST]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}
