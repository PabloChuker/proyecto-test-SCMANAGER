// =============================================================================
// SC LABS — GET /api/events/[slug]/raffle/candidates
//
// Devuelve la lista publica de asistentes presentes (attended=true) con
// display_name + avatar_url. Se usa en la pasarela del modo sorteo para que
// los espectadores vean caras conocidas pasando antes de frenar en el ganador.
//
// IMPORTANTE: solo expone display_name + avatar — no PII (RSI handle, notes,
// user_id) salvo el avatar publico. El resto se queda en /admin.
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
      .select("id, raffle_session")
      .eq("slug", slug)
      .maybeSingle();
    if (!event) {
      return NextResponse.json({ candidates: [] }, { status: 200 });
    }

    // Solo devolvemos candidatos cuando el modo sorteo esta activo. Sino,
    // aunque sea publico, evitamos exponer la lista de presentes innecesariamente.
    const phase = (event.raffle_session as any)?.phase ?? "idle";
    if (phase === "idle") {
      return NextResponse.json({ candidates: [] }, { status: 200 });
    }

    const { data: regs } = await supabase
      .from("event_registrations")
      .select("id, display_name, user_id")
      .eq("event_id", event.id)
      .eq("attended", true);

    if (!regs || regs.length === 0) {
      return NextResponse.json({ candidates: [] }, { status: 200 });
    }

    // Pablo: "al marcar excluir ganadores estos no deben aparecer en la
    // tira de nombres". El endpoint admin/raffle-state ya excluye previous
    // winners del POOL DE PICKEO; ahora aplicamos la misma exclusion al
    // fetch publico que alimenta la pasarela visual, asi los nombres que
    // aparecen pasando son los mismos del pool real. Buscamos los winners
    // previos del evento e ignoramos sus registration_id.
    const { data: prevWinners } = await supabase
      .from("event_raffle_winners")
      .select("registration_id")
      .eq("event_id", event.id);
    const excludedRegIds = new Set(
      (prevWinners ?? []).map((w: any) => w.registration_id).filter(Boolean),
    );
    const filteredRegs = regs.filter((r: any) => !excludedRegIds.has(r.id));

    if (filteredRegs.length === 0) {
      return NextResponse.json({ candidates: [] }, { status: 200 });
    }

    // Hidrato avatares via profiles_public para los que tienen user_id.
    const userIds = filteredRegs.map((r: any) => r.user_id).filter(Boolean) as string[];
    const profilesById = new Map<string, { avatar_url: string | null }>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, avatar_url")
        .in("id", userIds);
      for (const p of profiles ?? []) {
        profilesById.set(p.id, { avatar_url: p.avatar_url ?? null });
      }
    }

    const candidates = filteredRegs.map((r: any) => ({
      display_name: r.display_name,
      avatar_url: r.user_id
        ? profilesById.get(r.user_id)?.avatar_url ?? null
        : null,
    }));

    return NextResponse.json({ candidates });
  } catch (e: any) {
    console.error("[/api/events/[slug]/raffle/candidates GET]", e);
    return NextResponse.json(
      { error: e?.message ?? "Error interno" },
      { status: 500 },
    );
  }
}
