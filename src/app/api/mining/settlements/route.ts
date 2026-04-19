// =============================================================================
// SC LABS — /api/mining/settlements  [Fase D.5]
//
// GET   — Listar entries del mining_settlement_ledger con filtros +
//         opcional simplify=true que corre el algoritmo Splitwise greedy
//         y devuelve la lista minima de transferencias.
// PATCH — Marcar una entry como paid=true | paid=false (paid_at/paid_by).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { simplifyDebts, type LedgerEntryInput } from "@/lib/debt-simplifier";
import { sendNotification } from "@/lib/notifications";

// -- GET -------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sp = request.nextUrl.searchParams;
    const sessionId = sp.get("session_id");
    const distributionId = sp.get("distribution_id");
    const paid = sp.get("paid"); // "true" | "false" | null (todas)
    const simplify = sp.get("simplify") === "true";
    const direction = sp.get("direction"); // opcional

    let query = supabase
      .from("mining_settlement_ledger")
      .select("*")
      .order("created_at", { ascending: false });

    if (sessionId) query = query.eq("session_id", sessionId);
    if (distributionId) query = query.eq("distribution_id", distributionId);
    if (paid === "true") query = query.eq("paid", true);
    if (paid === "false") query = query.eq("paid", false);
    if (direction) query = query.eq("direction", direction);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []) as any[];

    if (!simplify) {
      return NextResponse.json({ data: rows });
    }

    // Mapear al shape del simplifier y correrlo
    const input: LedgerEntryInput[] = rows.map((r) => ({
      id: r.id,
      fromUserId: r.from_user_id,
      fromDisplayName: r.from_display_name,
      toUserId: r.to_user_id,
      toDisplayName: r.to_display_name,
      amountAuec: Number(r.amount_auec) || 0,
      paid: !!r.paid,
    }));

    const result = simplifyDebts(input);
    return NextResponse.json({ data: rows, simplified: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// -- PATCH -----------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { id, ids, paid, notes } = body ?? {};

    // Acepta tanto un id puntual como un array de ids (bulk) — util para
    // cerrar varias entries a la vez cuando se pago un transfer simplificado.
    const idList: string[] = Array.isArray(ids)
      ? ids.filter((x) => typeof x === "string")
      : id
      ? [id]
      : [];

    if (idList.length === 0) {
      return NextResponse.json({ error: "id or ids required" }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (typeof paid === "boolean") {
      updates.paid = paid;
      if (paid) {
        updates.paid_at = new Date().toISOString();
        updates.paid_by = user.id;
      } else {
        updates.paid_at = null;
        updates.paid_by = null;
      }
    }
    if (notes !== undefined) updates.notes = notes;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("mining_settlement_ledger")
      .update(updates)
      .in("id", idList)
      .select();
    if (error) throw error;

    // Fase E.3 — al marcar paid=true notificamos al receptor (to_user_id) con
    // "{from} te transfirió {amount} aUEC". Loopeamos porque el PATCH acepta
    // bulk (ids). Si falla la notif, no reventamos el endpoint: es best-effort.
    // Fase E.4 — si había un payout_pending previo para este ledger entry, lo
    // marcamos como leído (una transferencia cumplida no debería seguir
    // notificando un pago pendiente).
    if (paid === true && Array.isArray(data) && data.length > 0) {
      await Promise.all(
        data.map(async (row: any) => {
          if (!row?.to_user_id) return;
          const amountFmt = Math.round(
            Number(row.amount_auec) || 0,
          ).toLocaleString();
          const fromLabel =
            row.from_display_name || row.from_user_id || "Alguien";
          try {
            await sendNotification({
              supabase,
              recipientId: row.to_user_id,
              fromUserId: user.id,
              type: "payout_transferred",
              title: `${fromLabel} te transfirió ${amountFmt} aUEC`,
              message: row.notes || undefined,
              link: "/trade",
              metadata: {
                ledger_id: row.id,
                amount_auec: row.amount_auec,
                distribution_id: row.distribution_id,
                direction: row.direction,
              },
            });
            // Mark any prior payout_pending notif for this ledger entry read.
            await supabase
              .from("notifications")
              .update({ is_read: true })
              .eq("user_id", row.to_user_id)
              .eq("type", "payout_pending")
              .contains("metadata", { ledger_id: row.id });
          } catch {
            /* best-effort — no reventar el PATCH por una notif */
          }
        }),
      );
    }

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
