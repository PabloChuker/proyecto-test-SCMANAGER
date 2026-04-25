// =============================================================================
// SC LABS — /api/mining/work-orders
//
// GET    — List work orders for a session
// POST   — Create a work order (with expenses + payouts)
// PATCH  — Update status (in_progress → completed → collected)
// DELETE — Remove a work order
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

    // Fetch work orders with their expenses and payouts
    const { data: orders, error } = await supabase
      .from("mining_work_orders")
      .select(`
        *,
        mining_expenses(*),
        mining_crew_payouts(*, mining_members(display_name, role, avatar_url))
      `)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data: orders });
  } catch (e: any) {
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { session_id, order_type, refinery_id, refinery_name, refining_method,
            ores, total_yield, gross_value, sell_price, net_profit, motrader_fee,
            countdown_seconds, expenses, payouts, notes } = body;

    if (!session_id || !order_type) {
      return NextResponse.json({ error: "session_id and order_type required" }, { status: 400 });
    }

    // 1. Create the work order
    const countdown_ends_at = countdown_seconds > 0
      ? new Date(Date.now() + countdown_seconds * 1000).toISOString()
      : null;

    const { data: order, error: orderError } = await supabase
      .from("mining_work_orders")
      .insert({
        session_id,
        created_by: user.id,
        order_type,
        status: countdown_seconds > 0 ? "in_progress" : "completed",
        refinery_id: refinery_id || null,
        refinery_name: refinery_name || null,
        refining_method: refining_method || null,
        ores: ores || [],
        total_yield: total_yield || 0,
        gross_value: gross_value || 0,
        sell_price: sell_price || 0,
        net_profit: net_profit || 0,
        motrader_fee: motrader_fee || 0,
        countdown_seconds: countdown_seconds || 0,
        countdown_ends_at,
        notes: notes || null,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // 2. Insert expenses if provided
    if (expenses && expenses.length > 0) {
      const expenseRows = expenses.map((e: any) => ({
        work_order_id: order.id,
        claimant_id: e.claimant_id || null,
        claimant_name: e.claimant_name,
        expense_name: e.expense_name,
        amount: e.amount,
        expense_type: e.expense_type || "general",
      }));
      await supabase.from("mining_expenses").insert(expenseRows);
    }

    // 3. Insert crew payouts if provided (triggers ledger update)
    if (payouts && payouts.length > 0) {
      const payoutRows = payouts.map((p: any) => ({
        work_order_id: order.id,
        member_id: p.member_id,
        share_pct: p.share_pct,
        payout_auec: p.payout_auec,
      }));
      await supabase.from("mining_crew_payouts").insert(payoutRows);
    }

    return NextResponse.json({ data: order }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { id, status, collected_at } = body;
    if (!id) return NextResponse.json({ error: "work order id required" }, { status: 400 });

    const updates: Record<string, any> = {};
    if (status) updates.status = status;
    if (status === "collected") updates.collected_at = collected_at || new Date().toISOString();

    const { data, error } = await supabase
      .from("mining_work_orders")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // If collecting, add ores to inventory
    if (status === "collected" && data.ores) {
      const ores = data.ores as any[];
      for (const ore of ores) {
        if (!ore.yieldQty || ore.yieldQty <= 0) continue;

        // Upsert inventory — try with quality first, fallback without if column missing
        const { data: existing } = await supabase
          .from("mining_inventory")
          .select("id, quantity, total_received")
          .eq("session_id", data.session_id)
          .eq("mineral_id", ore.id)
          .single();

        if (existing) {
          // Update existing inventory row
          const updates: Record<string, any> = {
            quantity: existing.quantity + ore.yieldQty,
            total_received: existing.total_received + ore.yieldQty,
          };
          if (ore.quality != null) updates.quality = ore.quality;
          const { error: updErr } = await supabase.from("mining_inventory").update(updates).eq("id", existing.id);
          // If quality column doesn't exist yet, retry without it
          if (updErr && ore.quality != null) {
            delete updates.quality;
            await supabase.from("mining_inventory").update(updates).eq("id", existing.id);
          }
        } else {
          // Insert new inventory row
          const row: Record<string, any> = {
            session_id: data.session_id,
            mineral_id: ore.id,
            mineral_name: ore.name,
            quantity: ore.yieldQty,
            total_received: ore.yieldQty,
          };
          if (ore.quality != null) row.quality = ore.quality;
          const { error: insErr } = await supabase.from("mining_inventory").insert(row);
          // If quality column doesn't exist yet, retry without it
          if (insErr && ore.quality != null) {
            delete row.quality;
            await supabase.from("mining_inventory").insert(row);
          }
        }

        // Log the movement
        const mvRow: Record<string, any> = {
          session_id: data.session_id,
          work_order_id: data.id,
          mineral_id: ore.id,
          mineral_name: ore.name,
          delta: ore.yieldQty,
          reason: "refine_complete",
        };
        if (ore.quality != null) mvRow.quality = ore.quality;
        const { error: mvErr } = await supabase.from("mining_movements").insert(mvRow);
        if (mvErr && ore.quality != null) {
          delete mvRow.quality;
          await supabase.from("mining_movements").insert(mvRow);
        }
      }
    }

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "work order id required" }, { status: 400 });

    const { error } = await supabase
      .from("mining_work_orders")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
