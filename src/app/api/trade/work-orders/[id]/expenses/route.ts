// =============================================================================
// SC LABS — /api/trade/work-orders/[id]/expenses
//
// GET    — List expenses for a WO
// POST   — Add an expense (auto-recomputes total_expenses + net_profit on the WO)
// DELETE — Remove an expense (auto-recomputes totals)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function recomputeWorkOrderTotals(supabase: any, workOrderId: string) {
  const { data: wo } = await supabase
    .from("trade_work_orders")
    .select("scu_bought, scu_sold, buy_price_per_scu, sell_price_per_scu")
    .eq("id", workOrderId)
    .single();
  if (!wo) return;

  const { data: exps } = await supabase
    .from("trade_wo_expenses")
    .select("amount")
    .eq("work_order_id", workOrderId);

  const total_expenses = (exps || []).reduce((s: number, e: any) => s + (e.amount || 0), 0);
  const total_buy = (wo.scu_bought || 0) * (wo.buy_price_per_scu || 0);
  const total_sell = (wo.scu_sold || 0) * (wo.sell_price_per_scu || 0);
  const net_profit = total_sell - total_buy - total_expenses;

  await supabase
    .from("trade_work_orders")
    .update({
      total_expenses: Math.round(total_expenses * 100) / 100,
      total_buy: Math.round(total_buy * 100) / 100,
      total_sell: Math.round(total_sell * 100) / 100,
      net_profit: Math.round(net_profit * 100) / 100,
    })
    .eq("id", workOrderId);
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("trade_wo_expenses")
      .select("*")
      .eq("work_order_id", id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { data, error } = await supabase
      .from("trade_wo_expenses")
      .insert({
        work_order_id: id,
        payer_id: body.payer_id || null,
        payer_name: body.payer_name || "Unknown",
        description: body.description || "",
        amount: body.amount || 0,
        expense_type: body.expense_type || "general",
      })
      .select()
      .single();

    if (error) throw error;

    await recomputeWorkOrderTotals(supabase, id);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const expenseId = request.nextUrl.searchParams.get("expense_id");
    if (!expenseId) return NextResponse.json({ error: "expense_id required" }, { status: 400 });

    const { error } = await supabase
      .from("trade_wo_expenses")
      .delete()
      .eq("id", expenseId);

    if (error) throw error;

    await recomputeWorkOrderTotals(supabase, id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
