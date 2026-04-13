// =============================================================================
// SC LABS — /api/trade/work-orders/[id]
//
// GET    — Fetch single work order (with participants + expenses)
// PATCH  — Update fields; auto-recompute totals + payouts on completion
// DELETE — Remove a work order (cascades to participants + expenses)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function computeTotals(row: {
  scu_bought?: number; scu_sold?: number;
  buy_price_per_scu?: number; sell_price_per_scu?: number;
  total_expenses?: number;
}) {
  const total_buy = (row.scu_bought || 0) * (row.buy_price_per_scu || 0);
  const total_sell = (row.scu_sold || 0) * (row.sell_price_per_scu || 0);
  const total_expenses = row.total_expenses || 0;
  const net_profit = total_sell - total_buy - total_expenses;
  return {
    total_buy: Math.round(total_buy * 100) / 100,
    total_sell: Math.round(total_sell * 100) / 100,
    net_profit: Math.round(net_profit * 100) / 100,
  };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("trade_work_orders")
      .select(`*, trade_wo_participants(*), trade_wo_expenses(*)`)
      .eq("id", id)
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    // Fetch current row to merge numbers for recompute
    const { data: current, error: curErr } = await supabase
      .from("trade_work_orders")
      .select("*, trade_wo_expenses(amount), trade_wo_participants(*)")
      .eq("id", id)
      .single();
    if (curErr) throw curErr;

    const allowed = [
      "title", "status", "party_id",
      "commodity_code", "commodity_name",
      "buy_station", "buy_system", "sell_station", "sell_system",
      "scu_bought", "scu_sold", "scu_lost",
      "buy_price_per_scu", "sell_price_per_scu",
      "notes",
    ];
    const updates: Record<string, any> = {};
    for (const k of allowed) if (k in body) updates[k] = body[k];

    const merged = { ...current, ...updates };
    const total_expenses = (current.trade_wo_expenses || []).reduce(
      (s: number, x: any) => s + (x.amount || 0), 0
    );
    const totals = computeTotals({ ...merged, total_expenses });
    updates.total_buy = totals.total_buy;
    updates.total_sell = totals.total_sell;
    updates.total_expenses = total_expenses;
    updates.net_profit = totals.net_profit;

    // When completing — snapshot payouts into each participant
    if (updates.status === "completed" && current.status !== "completed") {
      updates.completed_at = new Date().toISOString();
      const participants = current.trade_wo_participants || [];
      for (const p of participants) {
        const share = (totals.net_profit * (p.role_pct || 0)) / 100;
        const payout = (p.contribution_uec || 0) + share;
        await supabase
          .from("trade_wo_participants")
          .update({ payout_uec: Math.round(payout * 100) / 100 })
          .eq("id", p.id);
      }
    }

    const { data, error } = await supabase
      .from("trade_work_orders")
      .update(updates)
      .eq("id", id)
      .select(`*, trade_wo_participants(*), trade_wo_expenses(*)`)
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { error } = await supabase
      .from("trade_work_orders")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
