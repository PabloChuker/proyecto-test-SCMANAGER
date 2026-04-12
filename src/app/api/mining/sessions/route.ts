// =============================================================================
// SC LABS — /api/mining/sessions
//
// GET  — List sessions for current user (owned + party-visible)
// POST — Create a new mining session (optionally linked to a party)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("mining_sessions")
      .select("*")
      .order("created_at", { ascending: false });

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
    const { name, party_id, notes } = body;

    // 1. Create the session
    const { data: session, error: sessionError } = await supabase
      .from("mining_sessions")
      .insert({
        owner_id: user.id,
        name: name || `Session ${new Date().toLocaleDateString()}`,
        party_id: party_id || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    // 2. If party_id provided, auto-load party members as mining members
    let members: any[] = [];
    if (party_id) {
      // Fetch party members (simple join table: party_id, user_id, role)
      const { data: partyMembers, error: pmError } = await supabase
        .from("party_members")
        .select("user_id, role")
        .eq("party_id", party_id);

      if (pmError) console.error("Error fetching party_members:", pmError);

      if (partyMembers && partyMembers.length > 0) {
        // Fetch profiles for all party member user_ids
        const userIds = partyMembers.map((pm: any) => pm.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds);

        // Build a lookup map: user_id -> profile
        const profileMap = new Map<string, any>();
        if (profiles) {
          for (const p of profiles) profileMap.set(p.id, p);
        }

        const memberInserts = partyMembers.map((pm: any) => {
          const prof = profileMap.get(pm.user_id);
          return {
            session_id: session.id,
            user_id: pm.user_id,
            display_name: prof?.display_name || "Unknown",
            avatar_url: prof?.avatar_url || null,
            role: pm.role === "leader" ? "pilot" : "miner",  // default mapping
            share_pct: 0,  // will be auto-balanced by frontend
            is_from_party: true,
          };
        });

        const { data: insertedMembers, error: membersError } = await supabase
          .from("mining_members")
          .insert(memberInserts)
          .select();

        if (membersError) throw membersError;
        members = insertedMembers || [];
      }
    }

    // 3. Always add the owner as a member if not already included
    const ownerIncluded = members.some((m: any) => m.user_id === user.id);
    if (!ownerIncluded) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .single();

      const { data: ownerMember } = await supabase
        .from("mining_members")
        .insert({
          session_id: session.id,
          user_id: user.id,
          display_name: profile?.display_name || "You",
          avatar_url: profile?.avatar_url || null,
          role: "pilot",
          share_pct: 0,
          is_from_party: !!party_id,
        })
        .select()
        .single();

      if (ownerMember) members.push(ownerMember);
    }

    return NextResponse.json({ data: { session, members } }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
