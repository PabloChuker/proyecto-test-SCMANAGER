// =============================================================================
// SC LABS — /api/mining/inventory
//
// GET    — Get inventory + recent movements for a session
// POST   — Record an inventory action (sell, craft, distribute, manual, transfer_out)
// DELETE — Clear all inventory + movements for a session
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sessionId = request.nextUrl.searchParams.get("session_id");
    if (!sessionId) return NextResponse.json({ error: "session_id required" }, { status: 400 });

    const [inventoryRes, movementsRes] = await Promise.all([
      supabase
        .from("mining_inventory")
        .select("*")
        .eq("session_id", sessionId)
        .order("mineral_name", { ascending: true }),
      supabase
        .from("mining_movements")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (inventoryRes.error) throw inventoryRes.error;
    if (movementsRes.error) throw movementsRes.error;

    return NextResponse.json({
      inventory: inventoryRes.data,
      movements: movementsRes.data,
    });
  } catch (e: any) {
    console.error("[api/mining/inventory]", e?.message ?? e);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { session_id, mineral_id, mineral_name, quantity, reason,
            member_id, member_name, work_order_id, destination_ref } = body;

    if (!session_id || !mineral_id || !mineral_name || quantity === undefined || !reason) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Fase H.6 — idempotency guard. If the caller passes a `destination_ref`
    // (e.g. `trade_wo:<uuid>`), ensure we haven't already recorded a movement
    // with the same ref for this session + mineral. This is what prevents
    // the "double discount" Pablo saw when the bridge fired twice for the
    // same Trade WO (auto on Complete + manual "Apply to Inventory"). Without
    // this, two movements with the same trade_wo ref would both mutate the
    // inventory quantity and push it into negative territory.
    if (destination_ref) {
      const { data: existingMv } = await supabase
        .from("mining_movements")
        .select("id, created_at, delta")
        .eq("session_id", session_id)
        .eq("mineral_id", mineral_id)
        .eq("destination_ref", destination_ref)
        .maybeSingle();
      if (existingMv) {
        // Idempotent: return the prior movement, no-op the inventory.
        return NextResponse.json(
          { data: existingMv, deduped: true },
          { status: 200 },
        );
      }
    }

    // Determine delta sign based on reason
    const outgoing = ["sell", "craft", "distribute", "transfer_out", "manual_remove"];
    const delta = outgoing.includes(reason) ? -Math.abs(quantity) : Math.abs(quantity);

    // Update inventory
    const { data: existing } = await supabase
      .from("mining_inventory")
      .select("id, quantity, total_received")
      .eq("session_id", session_id)
      .eq("mineral_id", mineral_id)
      .single();

    if (existing) {
      const newQty = existing.quantity + delta;
      const newReceived = delta > 0
        ? existing.total_received + delta
        : existing.total_received;
      await supabase.from("mining_inventory").update({
        quantity: newQty,
        total_received: newReceived,
      }).eq("id", existing.id);
    } else if (delta > 0) {
      await supabase.from("mining_inventory").insert({
        session_id,
        mineral_id,
        mineral_name,
        quantity: delta,
        total_received: delta,
      });
    }

    // Log movement
    const { data: movement, error: movError } = await supabase
      .from("mining_movements")
      .insert({
        session_id,
        work_order_id: work_order_id || null,
        mineral_id,
        mineral_name,
        delta,
        reason,
        member_id: member_id || null,
        member_name: member_name || null,
        destination_ref: destination_ref || null,
      })
      .select()
      .single();

    if (movError) throw movError;
    return NextResponse.json({ data: movement }, { status: 201 });
  } catch (e: any) {
    console.error("[api/mining/inventory]", e?.message ?? e);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sessionId = request.nextUrl.searchParams.get("session_id");
    if (!sessionId) return NextResponse.json({ error: "session_id required" }, { status: 400 });

    // Delete movements first (FK or logical dependency), then inventory
    const { error: movErr } = await supabase
      .from("mining_movements")
      .delete()
      .eq("session_id", sessionId);
    if (movErr) throw movErr;

    const { error: invErr } = await supabase
      .from("mining_inventory")
      .delete()
      .eq("session_id", sessionId);
    if (invErr) throw invErr;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[api/mining/inventory]", e?.message ?? e);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
