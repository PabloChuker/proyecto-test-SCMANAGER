// =============================================================================
// SC LABS — POST /api/party/invite
//
// Invita a un usuario a una party. Si el invitee comparte ORGANIZACIÓN con el
// líder de la party, lo metemos directo sin pedirle confirmación (auto-join)
// — pensado para crews fijos de la misma org que no quieren la fricción de
// "te invitaron, abrí /party, hacé click en aceptar". La persona recibe una
// notificación INFORMATIVA ("ya estás en la party de X") y aparece adentro
// la próxima vez que abra el sitio.
//
// Contrato:
//   POST /api/party/invite
//   body: { party_id: string, invitee_id: string }
//
// Comportamiento:
//   1. Auth via cookie. user = leader que invita.
//   2. Verificar leader es miembro de party_id con role='leader' (sólo el
//      líder puede invitar — evita que cualquier miembro meta gente sin
//      consenso).
//   3. Verificar que invitee NO está ya en la party.
//   4. Verificar que la party no está full.
//   5. Detectar org compartida:
//      EXISTS(SELECT 1 FROM org_members AS om1
//             JOIN org_members AS om2 ON om1.org_id = om2.org_id
//             WHERE om1.user_id = leader AND om2.user_id = invitee)
//   6a. SI comparten org → INSERT party_members + notif tipo 'party_joined'
//       (informativa, no actionable). Aunque el invitee esté offline, queda
//       adentro y se entera cuando vuelve.
//   6b. SI NO comparten org → notif tipo 'party_invite' (actionable, link a
//       /party para que acepte). Flujo manual de siempre.
//
// Response:
//   { ok: true, mode: 'auto-join' | 'invite-sent', sharedOrg?: boolean }
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendNotification } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, reason: "no-session" }, { status: 401 });
    }

    let body: { party_id?: string; invitee_id?: string } = {};
    try {
      body = await request.json();
    } catch {}
    const { party_id, invitee_id } = body;
    if (!party_id || !invitee_id) {
      return NextResponse.json({ ok: false, reason: "missing-params" }, { status: 400 });
    }
    if (invitee_id === user.id) {
      return NextResponse.json({ ok: false, reason: "self-invite" }, { status: 400 });
    }

    // 2. Verificar que el caller es miembro líder de la party
    const { data: meRow } = await supabase
      .from("party_members")
      .select("role")
      .eq("party_id", party_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!meRow) {
      return NextResponse.json({ ok: false, reason: "not-a-member" }, { status: 403 });
    }
    if (meRow.role !== "leader") {
      return NextResponse.json({ ok: false, reason: "not-leader" }, { status: 403 });
    }

    // 3. Verificar que invitee no esté ya adentro
    const { data: existing } = await supabase
      .from("party_members")
      .select("user_id")
      .eq("party_id", party_id)
      .eq("user_id", invitee_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, mode: "already-member" });
    }

    // 4. Verificar capacidad y traer info de la party
    const { data: party } = await supabase
      .from("parties")
      .select("id, name, max_members, status, leader_id")
      .eq("id", party_id)
      .eq("status", "active")
      .maybeSingle();

    if (!party) {
      return NextResponse.json({ ok: false, reason: "party-not-active" }, { status: 404 });
    }

    const { count: memberCount } = await supabase
      .from("party_members")
      .select("user_id", { count: "exact", head: true })
      .eq("party_id", party_id);

    if ((memberCount ?? 0) >= (party.max_members ?? 8)) {
      return NextResponse.json({ ok: false, reason: "party-full" }, { status: 409 });
    }

    // 5. Detectar org compartida — usamos dos selects separados y JS intersect
    // para no pelearnos con los policies RLS de `org_members`. Si el caller
    // puede leer sus propias filas y las del invitee desde su propio user_id
    // (porque la política es "ver mi propia org"), el join funciona; si no,
    // igualmente el endpoint cae al modo invite manual.
    const [{ data: leaderOrgs }, { data: inviteeOrgs }] = await Promise.all([
      supabase.from("org_members").select("org_id").eq("user_id", user.id),
      supabase.from("org_members").select("org_id").eq("user_id", invitee_id),
    ]);
    const leaderOrgIds = new Set((leaderOrgs ?? []).map((r: any) => r.org_id));
    const sharedOrgId = (inviteeOrgs ?? []).find((r: any) => leaderOrgIds.has(r.org_id))?.org_id ?? null;

    const myName =
      (user.user_metadata as any)?.full_name ??
      (user.user_metadata as any)?.display_name ??
      "Alguien";

    if (sharedOrgId) {
      // 6a. AUTO-JOIN — mete directo + notif informativa
      const { error: insertErr } = await supabase
        .from("party_members")
        .insert({ party_id, user_id: invitee_id, role: "member" });
      if (insertErr) {
        // Race condition: lo añadió otro miembro entre el check y el insert.
        return NextResponse.json({ ok: true, mode: "already-member" });
      }

      // Refrescar last_seen_at de la party para que no se marque stale
      await supabase
        .from("parties")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", party_id);

      await sendNotification({
        supabase,
        recipientId: invitee_id,
        fromUserId: user.id,
        type: "party_joined",
        title: "Te uniste a una party",
        message: `${myName} te metió en su party (auto por organización)`,
        link: "/party",
        metadata: { party_id, auto_join: true, shared_org_id: sharedOrgId },
      });

      return NextResponse.json({
        ok: true,
        mode: "auto-join",
        sharedOrgId,
      });
    }

    // 6b. INVITE MANUAL — comportamiento histórico
    await sendNotification({
      supabase,
      recipientId: invitee_id,
      fromUserId: user.id,
      type: "party_invite",
      title: "Invitación a Party",
      message: `${myName} te invitó a su party`,
      link: "/party",
      metadata: { party_id, party_name: party.name },
    });

    return NextResponse.json({ ok: true, mode: "invite-sent" });
  } catch (e: any) {
    console.error("[/api/party/invite] error:", e?.message ?? e);
    return NextResponse.json(
      { ok: false, reason: "internal-error", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
