// =============================================================================
// SC LABS — /api/trade/work-orders/[id]/participants
//
// GET    — List all participants for a WO
// POST   — Add a participant
// PATCH  — Update a participant (role, %, contribution, paid flag)
// DELETE — Remove a participant
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("trade_wo_participants")
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
      .from("trade_wo_participants")
      .insert({
        work_order_id: id,
        user_id: body.user_id || null,
        display_name: body.display_name || "Unnamed",
        role: body.role || "crew",
        role_pct: body.role_pct || 0,
        contribution_uec: body.contribution_uec || 0,
        contribution_note: body.contribution_note || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
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
    const { id, ...rest } = body;
    if (!id) return NextResponse.json({ error: "participant id required" }, { status: 400 });

    const allowed = [
      "display_name", "role", "role_pct",
      "contribution_uec", "contribution_note",
      "payout_uec", "paid", "paid_at",
    ];
    const updates: Record<string, any> = {};
    for (const k of allowed) if (k in rest) updates[k] = rest[k];

    if (updates.paid === true && !updates.paid_at) {
      updates.paid_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("trade_wo_participants")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const participantId = request.nextUrl.searchParams.get("participant_id");
    if (!participantId) return NextResponse.json({ error: "participant_id required" }, { status: 400 });

    const { error } = await supabase
      .from("trade_wo_participants")
      .delete()
      .eq("id", participantId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
