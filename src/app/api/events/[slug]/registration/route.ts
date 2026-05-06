// =============================================================================
// SC LABS — POST/DELETE /api/events/[slug]/registration
//
// POST   — Registra al current user al evento (auth requerido). Si ya existe,
//          UPDATEa los campos (idempotente — sirve para "actualizar mi RSVP").
// DELETE — Cancela la registración del current user.
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
    const display_name = (body?.display_name ?? "").toString().trim();
    const rsi_handle = body?.rsi_handle ? body.rsi_handle.toString().trim().slice(0, 80) : null;
    const attendance_intent = ["confirmed", "maybe", "no"].includes(body?.attendance_intent)
      ? body.attendance_intent
      : "confirmed";
    const raffle_entry = !!body?.raffle_entry;
    const notes = body?.notes ? body.notes.toString().trim().slice(0, 500) : null;

    if (!display_name || display_name.length > 80) {
      return NextResponse.json(
        { error: "Nombre de visualización requerido (1-80 caracteres)." },
        { status: 400 },
      );
    }

    // Buscar el evento por slug
    const { data: event, error: eErr } = await supabase
      .from("community_events")
      .select("id, registration_open, raffle_active")
      .eq("slug", slug)
      .maybeSingle();
    if (eErr) throw eErr;
    if (!event) return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
    if (!event.registration_open) {
      return NextResponse.json({ error: "Las inscripciones están cerradas." }, { status: 403 });
    }

    // Upsert: si ya existe, update; si no, insert.
    const { data: existing } = await supabase
      .from("event_registrations")
      .select("id")
      .eq("event_id", event.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from("event_registrations")
        .update({
          display_name,
          rsi_handle,
          attendance_intent,
          raffle_entry: event.raffle_active ? raffle_entry : false,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ registration: data, action: "updated" });
    } else {
      const { data, error } = await supabase
        .from("event_registrations")
        .insert({
          event_id: event.id,
          user_id: user.id,
          display_name,
          rsi_handle,
          attendance_intent,
          raffle_entry: event.raffle_active ? raffle_entry : false,
          notes,
        })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ registration: data, action: "created" }, { status: 201 });
    }
  } catch (e: any) {
    console.error("[/api/events/[slug]/registration POST]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: event } = await supabase
      .from("community_events")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!event) return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });

    const { error } = await supabase
      .from("event_registrations")
      .delete()
      .eq("event_id", event.id)
      .eq("user_id", user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[/api/events/[slug]/registration DELETE]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}
