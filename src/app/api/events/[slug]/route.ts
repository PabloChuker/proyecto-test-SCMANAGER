// =============================================================================
// SC LABS — GET /api/events/[slug]
//
// Devuelve un evento con sus POIs, contadores, y (si auth) el registration
// del current user. Lectura pública.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Whitelist de columnas que admins pueden editar via PATCH. Mantenemos slug,
// id, owner_id, admin_user_ids fuera por seguridad (no se mueven por API).
const EDITABLE_FIELDS = [
  "name",
  "description",
  "tagline",
  "event_date",
  "location",
  "sponsor_name",
  "sponsor_url",
  "banner_url",
  "logo_url",
  "map_image_url",
  "google_maps_url",
  "discord_url",
  "twitter_url",
  "website_url",
  "custom_links",
  "is_active",
  "registration_open",
  "raffle_active",
  "raffle_prize_description",
  "raffle_rules",
] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Validar admin
    const { data: event } = await supabase
      .from("community_events")
      .select("id, admin_user_ids")
      .eq("slug", slug)
      .maybeSingle();
    if (!event) return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
    if (!event.admin_user_ids?.includes(user.id)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, any> = {};
    for (const f of EDITABLE_FIELDS) {
      if (f in body) updates[f] = body[f];
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nada para actualizar." }, { status: 400 });
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("community_events")
      .update(updates)
      .eq("id", event.id)
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ event: data });
  } catch (e: any) {
    console.error("[/api/events/[slug] PATCH]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}

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
