// =============================================================================
// SC LABS — POST /api/events/[slug]/join
//
// Auto-inscripcion al evento desde el QR del lugar. Si el user esta logueado
// con Discord:
//   · Si NO tiene registration: la creamos con attendance_intent="confirmed"
//     y attended=true (escaneo el QR fisicamente, lo damos por presente).
//   · Si YA tiene registration: solo flippeamos attended=true (mantenemos
//     display_name / rsi_handle / notes que ya tenga cargados).
//
// Body opcional (todo es ignorado salvo display_name si esta inscribiendose
// nuevo): { display_name?: string, rsi_handle?: string }.
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

    // Cargar evento
    const { data: event } = await supabase
      .from("community_events")
      .select("id, registration_open")
      .eq("slug", slug)
      .maybeSingle();
    if (!event) {
      return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
    }
    if (!event.registration_open) {
      return NextResponse.json(
        { error: "La inscripcion al evento esta cerrada." },
        { status: 403 },
      );
    }

    // Body opcional para nuevos inscriptos.
    const body = await request.json().catch(() => ({}));
    const submittedName: string | undefined = body?.display_name?.toString().trim();
    const submittedRsi: string | undefined = body?.rsi_handle?.toString().trim();

    // Resolver display_name fallback desde el profile / metadata Discord.
    const meta = (user.user_metadata as any) ?? {};
    const fallbackName: string =
      submittedName ||
      meta.full_name ||
      meta.name ||
      meta.user_name ||
      meta.preferred_username ||
      user.email?.split("@")[0] ||
      "Crew";

    // Buscar registration existente
    const { data: existing } = await supabase
      .from("event_registrations")
      .select("id, attended, display_name, rsi_handle, attendance_intent")
      .eq("event_id", event.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      // Solo bumpeamos attended=true (escaneo el QR en el lugar). No tocamos
      // display_name ni rsi_handle si ya estaban cargados.
      const { data: updated, error: uErr } = await supabase
        .from("event_registrations")
        .update({
          attended: true,
          attended_confirmed_at: new Date().toISOString(),
          attendance_intent: "confirmed",
        })
        .eq("id", existing.id)
        .select("id, display_name, attended")
        .single();
      if (uErr) throw uErr;
      return NextResponse.json({
        ok: true,
        action: "updated",
        registration: updated,
      });
    }

    // Crear registration nueva
    const { data: created, error: cErr } = await supabase
      .from("event_registrations")
      .insert({
        event_id: event.id,
        user_id: user.id,
        display_name: fallbackName,
        rsi_handle: submittedRsi || null,
        attendance_intent: "confirmed",
        attended: true,
        attended_confirmed_at: new Date().toISOString(),
        raffle_entry: true,
        notes: null,
      })
      .select("id, display_name, attended")
      .single();
    if (cErr) throw cErr;

    return NextResponse.json({
      ok: true,
      action: "created",
      registration: created,
    });
  } catch (e: any) {
    console.error("[/api/events/[slug]/join POST]", e);
    return NextResponse.json(
      { error: e?.message ?? "Error interno" },
      { status: 500 },
    );
  }
}
