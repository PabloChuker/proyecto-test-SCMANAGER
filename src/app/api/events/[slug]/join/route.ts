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

    // Cargar evento (necesitamos name + raffle_active para componer el
    // mensaje de la notificacion al bell despues del registro).
    const { data: event } = await supabase
      .from("community_events")
      .select("id, name, registration_open, raffle_active")
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

    let action: "created" | "updated";
    let registration: { id: string; display_name: string; attended: boolean };

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
      action = "updated";
      registration = updated;
    } else {
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
      action = "created";
      registration = created;
    }

    // Pablo (2026-05-07): "una vez inscrito... quisiera que le llegue la
    // confirmacion de que ya se encuentra inscrito en el sorteo".
    // Mandamos una notificacion al bell del user con type=raffle_joined.
    // from_user_id queda null (es del sistema, no de un user). Si la
    // insercion falla por algun motivo, no abortamos el join — el escaneo
    // ya tuvo exito y el user ya ve la pantalla de confirmacion.
    try {
      const title = action === "created"
        ? "Inscripción confirmada"
        : "Te marcamos como presente";
      const baseMsg = action === "created"
        ? `Estás inscripto en el sorteo de ${event.name}.`
        : `Ya estabas inscripto en ${event.name}, ahora figurás como presente.`;
      const message = event.raffle_active
        ? `${baseMsg} El sorteo se realiza entre los presentes — quedate atento al cartel.`
        : baseMsg;
      // El RLS de notifications exige `from_user_id = auth.uid()`. Como esta
      // es una self-notification del sistema (el user mismo "se inscribio"),
      // usamos su propio id en ambos campos. La UI del bell muestra titulo
      // y mensaje, no el avatar del from, asi que la semantica no afecta UX.
      await supabase.from("notifications").insert({
        user_id: user.id,
        from_user_id: user.id,
        type: "raffle_joined",
        title,
        message,
        link: `/events/${slug}`,
        metadata: {
          event_slug: slug,
          event_name: event.name,
          registration_id: registration.id,
          action,
        },
      });
    } catch (nErr) {
      console.warn("[/api/events/[slug]/join] notification insert failed", nErr);
    }

    return NextResponse.json({
      ok: true,
      action,
      registration,
    });
  } catch (e: any) {
    console.error("[/api/events/[slug]/join POST]", e);
    return NextResponse.json(
      { error: e?.message ?? "Error interno" },
      { status: 500 },
    );
  }
}
