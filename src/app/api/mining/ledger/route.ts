// =============================================================================
// SC LABS — /api/mining/ledger
//
// GET   — Get cross-session accumulated ledger for current user
// PATCH — Record a payment (marks balance as paid)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("mining_member_ledger")
      .select("id, session_id, display_name, balance, total_earned, total_paid, updated_at")
      .eq("user_id", user.id)
      .order("balance", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e: any) {
    console.error("[/api/mining/ledger GET]", e);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { payout_id } = body;

    if (!payout_id) {
      return NextResponse.json({ error: "payout_id required" }, { status: 400 });
    }

    // Mark payout as paid (triggers ledger update via DB trigger)
    const { data, error } = await supabase
      .from("mining_crew_payouts")
      .update({ paid: true, paid_at: new Date().toISOString() })
      .eq("id", payout_id)
      .select("id, paid, paid_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e: any) {
    console.error("[/api/mining/ledger PATCH]", e);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
