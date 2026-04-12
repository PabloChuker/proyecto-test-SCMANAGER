// =============================================================================
// SC LABS — /api/mining/members
//
// GET    — List members of a mining session
// POST   — Add a member (manual or from party)
// PATCH  — Update role / share_pct
// DELETE — Remove a member
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

    const { data, error } = await supabase
      .from("mining_members")
      .select("*")
      .eq("session_id", sessionId)
      .order("joined_at", { ascending: true });

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
    const { session_id, user_id, display_name, avatar_url, role, share_pct } = body;

    if (!session_id || !display_name) {
      return NextResponse.json({ error: "session_id and display_name required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("mining_members")
      .insert({
        session_id,
        user_id: user_id || null,
        display_name,
        avatar_url: avatar_url || null,
        role: role || "miner",
        share_pct: share_pct ?? 0,
        is_from_party: false,
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
    const { id, role, share_pct } = body;
    if (!id) return NextResponse.json({ error: "member id required" }, { status: 400 });

    const updates: Record<string, any> = {};
    if (role !== undefined) updates.role = role;
    if (share_pct !== undefined) updates.share_pct = share_pct;

    const { data, error } = await supabase
      .from("mining_members")
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

    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "member id required" }, { status: 400 });

    const { error } = await supabase
      .from("mining_members")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
