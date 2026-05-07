// =============================================================================
// SC LABS — POST /api/events/[slug]/admin/raffle-state
//
// Controla el estado live del "modo sorteo" del evento. Solo accesible para
// admins listados en community_events.admin_user_ids.
//
// Acciones soportadas (body.action):
//   · "start"     → phase: "loading" — abre el modo sorteo en la pagina publica
//   · "loadPrize" → phase: "loaded"  — registra el premio actual (ship o item)
//                   body.prize: { type, ship_id?, ship_name?, ship_class?,
//                                 label?, description? }
//   · "spin"      → phase: "spinning" — el server pickea ganador random entre
//                   asistentes presentes y devuelve el ganador. El cliente
//                   anima la pasarela y transiciona a "won" cuando termina.
//                   body.exclude_previous_winners?: bool (default true)
//   · "award"     → phase: "won" — el cliente avisa al server que la
//                   pasarela termino de animar (visual sync entre admins).
//   · "reroll"    → phase: "spinning" otra vez con un nuevo ganador.
//   · "claim"     → phase: "claimed" + persiste el winner en
//                   event_raffle_winners. body.notes? para tag custom.
//   · "reset"     → phase: "loading" — limpia premio + winner para cargar otro.
//   · "end"       → phase: "idle" — cierra el modo sorteo (vuelve al mapa).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface PrizeInput {
  type?: "ship" | "item";
  ship_id?: string | null;
  ship_name?: string | null;
  ship_class?: string | null;
  label?: string | null;
  description?: string | null;
}

interface RaffleSession {
  phase: "idle" | "loading" | "loaded" | "spinning" | "won" | "claimed";
  prize: PrizeInput | null;
  winner: {
    registration_id: string;
    user_id: string | null;
    display_name: string;
    avatar_url: string | null;
    rsi_handle: string | null;
  } | null;
  won_at?: string | null;
  claim_deadline_seconds?: number;
  spin_seed?: number;
}

const IDLE_SESSION: RaffleSession = {
  phase: "idle",
  prize: null,
  winner: null,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Cargar evento + verificar admin
    const { data: event, error: eErr } = await supabase
      .from("community_events")
      .select("id, admin_user_ids, raffle_session")
      .eq("slug", slug)
      .maybeSingle();
    if (eErr) throw eErr;
    if (!event) return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });
    if (!event.admin_user_ids?.includes(user.id)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const current: RaffleSession = (event.raffle_session as any) ?? IDLE_SESSION;

    let next: RaffleSession;

    switch (action) {
      case "start": {
        next = { ...IDLE_SESSION, phase: "loading" };
        break;
      }

      case "loadPrize": {
        const p = (body?.prize ?? {}) as PrizeInput;
        if (!p.type || (p.type !== "ship" && p.type !== "item")) {
          return NextResponse.json(
            { error: "prize.type debe ser 'ship' o 'item'." },
            { status: 400 },
          );
        }
        if (p.type === "ship" && !p.ship_id) {
          return NextResponse.json(
            { error: "prize.ship_id es requerido cuando type=ship." },
            { status: 400 },
          );
        }
        if (p.type === "item" && !p.label) {
          return NextResponse.json(
            { error: "prize.label es requerido cuando type=item." },
            { status: 400 },
          );
        }
        next = {
          ...IDLE_SESSION,
          phase: "loaded",
          prize: {
            type: p.type,
            ship_id: p.ship_id ?? null,
            ship_name: p.ship_name ?? null,
            ship_class: p.ship_class ?? null,
            label: p.label ?? null,
            description: p.description ?? null,
          },
        };
        break;
      }

      case "spin":
      case "reroll": {
        if (!current.prize) {
          return NextResponse.json(
            { error: "Cargá un premio primero (loadPrize)." },
            { status: 400 },
          );
        }
        const excludePrev = body?.exclude_previous_winners !== false;

        // Pool elegible: registros con attended=true. Joineamos profile data
        // via profiles_public para tener avatar/display_name canonicos.
        const { data: regs, error: rErr } = await supabase
          .from("event_registrations")
          .select("id, user_id, display_name, rsi_handle")
          .eq("event_id", event.id)
          .eq("attended", true);
        if (rErr) throw rErr;
        if (!regs || regs.length === 0) {
          return NextResponse.json(
            { error: "No hay asistentes presentes en el pool elegible." },
            { status: 400 },
          );
        }

        let pool = regs;
        if (excludePrev) {
          const { data: prevWinners } = await supabase
            .from("event_raffle_winners")
            .select("registration_id")
            .eq("event_id", event.id);
          const excluded = new Set(
            (prevWinners ?? []).map((w: any) => w.registration_id),
          );
          // Tampoco re-pickeamos el ganador actual mientras esta sin reclamar.
          if (current.winner?.registration_id) {
            excluded.add(current.winner.registration_id);
          }
          pool = pool.filter((r: any) => !excluded.has(r.id));
        }

        if (pool.length === 0) {
          return NextResponse.json(
            { error: "Todos los presentes ya ganaron — desactivá 'excluir previos' o agregá premios." },
            { status: 400 },
          );
        }

        const pick = pool[Math.floor(Math.random() * pool.length)];

        // Buscar avatar via profiles_public (winners pueden no estar logueados,
        // tenemos display_name de la registration igual)
        let avatarUrl: string | null = null;
        if (pick.user_id) {
          const { data: prof } = await supabase
            .from("profiles_public")
            .select("avatar_url")
            .eq("id", pick.user_id)
            .maybeSingle();
          avatarUrl = prof?.avatar_url ?? null;
        }

        next = {
          phase: "spinning",
          prize: current.prize,
          winner: {
            registration_id: pick.id,
            user_id: pick.user_id ?? null,
            display_name: pick.display_name,
            avatar_url: avatarUrl,
            rsi_handle: pick.rsi_handle ?? null,
          },
          won_at: new Date().toISOString(),
          claim_deadline_seconds: 60,
          // Seed determinista para que todos los clientes animen sincronizados.
          spin_seed: Math.floor(Math.random() * 1_000_000),
        };
        break;
      }

      case "award": {
        // Solo confirma el final de la animacion; mismo winner, phase=won.
        if (!current.winner) {
          return NextResponse.json(
            { error: "No hay ganador en spinning para confirmar." },
            { status: 400 },
          );
        }
        next = { ...current, phase: "won" };
        break;
      }

      case "claim": {
        if (!current.winner || !current.prize) {
          return NextResponse.json(
            { error: "No hay ganador para reclamar." },
            { status: 400 },
          );
        }
        // Persistir el ganador en event_raffle_winners.
        const prizeLabel =
          current.prize.label ||
          current.prize.ship_name ||
          current.prize.description ||
          "Premio";
        const { data: insertedWinner, error: wErr } = await supabase
          .from("event_raffle_winners")
          .insert({
            event_id: event.id,
            registration_id: current.winner.registration_id,
            prize: prizeLabel,
            notes: body?.notes ?? null,
            drawn_by: user.id,
          })
          .select("id")
          .single();
        if (wErr) throw wErr;

        // Notificacion al bell del ganador (si esta logueado, tiene user_id).
        // RLS de notifications: from_user_id debe ser el caller (admin) y
        // user_id (recipient) puede ser cualquiera. Si la insercion falla
        // por algun motivo, no abortamos el claim — solo logueamos.
        if (current.winner.user_id) {
          const { error: nErr } = await supabase.from("notifications").insert({
            user_id: current.winner.user_id,
            from_user_id: user.id,
            type: "raffle_won",
            title: `🏆 Ganaste un sorteo!`,
            message: `Premio: ${prizeLabel}. Entrá a registrar tu email para que el equipo te lo envíe.`,
            link: `/events/${slug}?winner=${insertedWinner?.id ?? ""}`,
            metadata: {
              event_slug: slug,
              winner_id: insertedWinner?.id ?? null,
              prize: prizeLabel,
            },
          });
          if (nErr) {
            console.warn(
              "[raffle-state claim] notification insert failed:",
              nErr.message,
            );
          }
        }

        // Embebemos el winner_id en la session para que el cliente del
        // ganador encuentre su fila y pueda grabar el email sin tener que
        // abrir el bell (UX directo en la propia stage).
        next = {
          ...current,
          phase: "claimed",
          winner: { ...current.winner, winner_id: insertedWinner?.id ?? null } as any,
        };
        break;
      }

      case "reset": {
        // Limpia premio y ganador, vuelve a "loading" para cargar el siguiente.
        next = { ...IDLE_SESSION, phase: "loading" };
        break;
      }

      case "end": {
        next = { ...IDLE_SESSION };
        break;
      }

      default:
        return NextResponse.json(
          { error: `Accion desconocida: ${action}` },
          { status: 400 },
        );
    }

    const { error: uErr } = await supabase
      .from("community_events")
      .update({ raffle_session: next, updated_at: new Date().toISOString() })
      .eq("id", event.id);
    if (uErr) throw uErr;

    return NextResponse.json({ raffle_session: next });
  } catch (e: any) {
    console.error("[/api/events/[slug]/admin/raffle-state POST]", e);
    return NextResponse.json(
      { error: e?.message ?? "Error interno" },
      { status: 500 },
    );
  }
}
