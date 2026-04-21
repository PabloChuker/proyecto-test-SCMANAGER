// =============================================================================
// SC LABS — /api/party/active
//
// Returns the currently-active party (if any) that the logged-in user belongs
// to. Used by the mining store (Fase H.13) to decide whether the scope toggle
// should expose a PARTY option and which party_id to target.
//
// Contract:
//   GET /api/party/active
//   response: { party: { id, name, status } | null }
// =============================================================================

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ party: null });
    }

    const { data: membership, error } = await supabase
      .from("party_members")
      .select("party_id, parties!inner(id, name, status)")
      .eq("user_id", user.id)
      .eq("parties.status", "active")
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ party: null });
    }

    const party = (membership?.parties as any) ?? null;
    return NextResponse.json({ party: party ? {
      id: party.id,
      name: party.name ?? null,
      status: party.status,
    } : null });
  } catch (e: any) {
    console.error("[/api/party/active] error:", e?.message ?? e);
    return NextResponse.json({ party: null });
  }
}
