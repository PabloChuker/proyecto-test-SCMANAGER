// =============================================================================
// SC LABS — /api/mining/ledger
//
// GET   — Get cross-session accumulated ledger for current user or all members
// PATCH — Record a payment (marks balance as paid)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // If ?all=true, return all ledger entries visible to this user
    // Otherwise return just the current user's ledger
    const all = request.nextUrl.searchParams.get("all") === "true";

    let query = supabase
      .from("mining_member_ledger")
      .select("*")
      .order("balance", { ascending: false });

    if (!all) {
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { payout_id, amount } = body;

    if (!payout_id) {
      return NextResponse.json({ error: "payout_id required" }, { status: 400 });
    }

    // Mark payout as paid (triggers ledger update via DB trigger)
    const { data, error } = await supabase
      .from("mining_crew_payouts")
      .update({ paid: true, paid_at: new Date().toISOString() })
      .eq("id", payout_id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
