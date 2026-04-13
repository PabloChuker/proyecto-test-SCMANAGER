// =============================================================================
// SC LABS — /api/trade/work-orders
//
// GET  — List work orders for the current user (optionally filtered by party_id / status)
// POST — Create a new trade work order (optionally with initial participants + expenses)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Recompute totals from current numbers */
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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const partyId = request.nextUrl.searchParams.get("party_id");
    const status = request.nextUrl.searchParams.get("status");

    let query = supabase
      .from("trade_work_orders")
      .select(`
        *,
        trade_wo_participants(*),
        trade_wo_expenses(*)
      `)
      .order("created_at", { ascending: false });

    if (partyId) query = query.eq("party_id", partyId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const {
      title, party_id, status,
      commodity_code, commodity_name,
      buy_station, buy_system, sell_station, sell_system,
      scu_bought, scu_sold, scu_lost,
      buy_price_per_scu, sell_price_per_scu,
      notes,
      participants,
      expenses,
    } = body;

    const totals = computeTotals({
      scu_bought, scu_sold,
      buy_price_per_scu, sell_price_per_scu,
      total_expenses: 0,
    });

    const { data: order, error: orderErr } = await supabase
      .from("trade_work_orders")
      .insert({
        owner_id: user.id,
        party_id: party_id || null,
        title: title || "Trade Run",
        status: status || "draft",
        commodity_code: commodity_code || null,
        commodity_name: commodity_name || null,
        buy_station: buy_station || null,
        buy_system: buy_system || null,
        sell_station: sell_station || null,
        sell_system: sell_system || null,
        scu_bought: scu_bought || 0,
        scu_sold: scu_sold || 0,
        scu_lost: scu_lost || 0,
        buy_price_per_scu: buy_price_per_scu || 0,
        sell_price_per_scu: sell_price_per_scu || 0,
        total_buy: totals.total_buy,
        total_sell: totals.total_sell,
        total_expenses: 0,
        net_profit: totals.net_profit,
        notes: notes || null,
      })
      .select()
      .single();

    if (orderErr) throw orderErr;

    // Initial participants
    if (Array.isArray(participants) && participants.length) {
      const rows = participants.map((p: any) => ({
        work_order_id: order.id,
        user_id: p.user_id || null,
        display_name: p.display_name || "Unnamed",
        role: p.role || "crew",
        role_pct: p.role_pct || 0,
        contribution_uec: p.contribution_uec || 0,
        contribution_note: p.contribution_note || null,
      }));
      const { error: pErr } = await supabase.from("trade_wo_participants").insert(rows);
      if (pErr) throw pErr;
    }

    // Initial expenses
    if (Array.isArray(expenses) && expenses.length) {
      const rows = expenses.map((e: any) => ({
        work_order_id: order.id,
        payer_id: e.payer_id || null,
        payer_name: e.payer_name || "Unknown",
        description: e.description || "",
        amount: e.amount || 0,
        expense_type: e.expense_type || "general",
      }));
      const { error: eErr } = await supabase.from("trade_wo_expenses").insert(rows);
      if (eErr) throw eErr;

      // Recompute total_expenses + net_profit
      const totalExp = expenses.reduce((s: number, x: any) => s + (x.amount || 0), 0);
      const recomputed = computeTotals({
        scu_bought, scu_sold,
        buy_price_per_scu, sell_price_per_scu,
        total_expenses: totalExp,
      });
      await supabase
        .from("trade_work_orders")
        .update({ total_expenses: totalExp, net_profit: recomputed.net_profit })
        .eq("id", order.id);
    }

    // Return the fully hydrated order
    const { data: full } = await supabase
      .from("trade_work_orders")
      .select(`*, trade_wo_participants(*), trade_wo_expenses(*)`)
      .eq("id", order.id)
      .single();

    return NextResponse.json({ data: full || order }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
