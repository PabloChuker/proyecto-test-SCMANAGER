// =============================================================================
// SC LABS — /api/events/[slug]/raffle
//
// GET    — Lista pública de ganadores (todos pueden ver).
// POST   — Sortea un ganador entre asistentes confirmados (admin only).
//          Body: { prize: string, exclude_previous_winners?: boolean, notes?: string }
// DELETE — Borrar un ganador específico (admin only).
//          Body: { winner_id: string }
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
    const { data: event } = await supabase
      .from("community_events")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!event) return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });

    const { data, error } = await supabase
      .from("event_raffle_winners_public")
      .select("*")
      .eq("event_id", event.id)
      .order("drawn_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ winners: data ?? [] });
  } catch (e: any) {
    console.error("[/api/events/[slug]/raffle GET]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}

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
    const prize = (body?.prize ?? "").toString().trim();
    const excludePrevious = body?.exclude_previous_winners !== false; // default true
    const notes = body?.notes ? body.notes.toString().trim().slice(0, 1000) : null;
    if (!prize || prize.length < 1 || prize.length > 200) {
      return NextResponse.json({ error: "Premio inválido (1-200 caracteres)." }, { status: 400 });
    }

    // Validar admin
    const { data: event } = await supabase
      .from("community_events")
      .select("id, admin_user_ids, raffle_active")
      .eq("slug", slug)
      .maybeSingle();
    if (!event) return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
    if (!event.admin_user_ids?.includes(user.id)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }
    if (!event.raffle_active) {
      return NextResponse.json({ error: "El sorteo está cerrado para este evento." }, { status: 403 });
    }

    // Obtener pool de elegibles: asistentes confirmados (attended=true)
    const { data: confirmed, error: ce } = await supabase
      .from("event_registrations")
      .select("id, display_name, user_id")
      .eq("event_id", event.id)
      .eq("attended", true);
    if (ce) throw ce;
    if (!confirmed || confirmed.length === 0) {
      return NextResponse.json(
        { error: "No hay asistentes confirmados todavía. Marcá presentes desde la lista antes de sortear." },
        { status: 400 },
      );
    }

    // Excluir ganadores previos si se pidió
    let pool = confirmed;
    if (excludePrevious) {
      const { data: prev } = await supabase
        .from("event_raffle_winners")
        .select("registration_id")
        .eq("event_id", event.id);
      const prevIds = new Set((prev ?? []).map((p: any) => p.registration_id));
      pool = confirmed.filter((c) => !prevIds.has(c.id));
    }
    if (pool.length === 0) {
      return NextResponse.json(
        { error: "Todos los asistentes confirmados ya ganaron algo. Desmarcá 'excluir ganadores previos' si querés permitir múltiples premios al mismo." },
        { status: 400 },
      );
    }

    // Random pick
    const winnerReg = pool[Math.floor(Math.random() * pool.length)];

    // Insertar en raffle_winners (RLS lo permite a admins)
    const { data, error } = await supabase
      .from("event_raffle_winners")
      .insert({
        event_id: event.id,
        registration_id: winnerReg.id,
        prize,
        notes,
        drawn_by: user.id,
      })
      .select("*")
      .single();
    if (error) throw error;

    // Devolver con datos enriquecidos
    const { data: enriched } = await supabase
      .from("event_raffle_winners_public")
      .select("*")
      .eq("id", data.id)
      .single();

    return NextResponse.json({
      winner: enriched ?? data,
      poolSize: pool.length,
    }, { status: 201 });
  } catch (e: any) {
    console.error("[/api/events/[slug]/raffle POST]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const winner_id = body?.winner_id;
    if (!winner_id) return NextResponse.json({ error: "winner_id requerido" }, { status: 400 });

    const { data: event } = await supabase
      .from("community_events")
      .select("id, admin_user_ids")
      .eq("slug", slug)
      .maybeSingle();
    if (!event) return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
    if (!event.admin_user_ids?.includes(user.id)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    const { error } = await supabase
      .from("event_raffle_winners")
      .delete()
      .eq("id", winner_id)
      .eq("event_id", event.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[/api/events/[slug]/raffle DELETE]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}
