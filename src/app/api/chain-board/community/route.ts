// =============================================================================
// SC LABS — GET /api/chain-board/community
//
// Lista pública de cadenas compartidas. Sort = votes | savings | recent.
// Búsqueda por name/from/to/tags. Lectura pública (no requiere auth).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const sort = (searchParams.get("sort") ?? "votes") as "votes" | "savings" | "recent";
    const search = (searchParams.get("search") ?? "").trim();
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));

    let query = supabase
      .from("shared_chains_public")
      .select("*")
      .limit(limit);

    if (search) {
      const safe = search.replace(/[%_]/g, "");
      query = query.or(
        `name.ilike.%${safe}%,from_ship_name.ilike.%${safe}%,to_ship_name.ilike.%${safe}%`,
      );
    }

    if (sort === "votes") query = query.order("votes_count", { ascending: false });
    else if (sort === "savings") query = query.order("savings", { ascending: false });
    else query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    // Si user logueado, traer sus votos para el set
    const { data: { user } } = await supabase.auth.getUser();
    let votedIds: Set<string> = new Set();
    if (user && data && data.length > 0) {
      const ids = data.map((c: any) => c.id);
      const { data: votes } = await supabase
        .from("chain_votes")
        .select("chain_id")
        .eq("user_id", user.id)
        .in("chain_id", ids);
      votedIds = new Set((votes ?? []).map((v: any) => v.chain_id));
    }

    const enriched = (data ?? []).map((c: any) => ({
      ...c,
      voted_by_me: votedIds.has(c.id),
    }));

    return NextResponse.json({ chains: enriched });
  } catch (e: any) {
    console.error("[/api/chain-board/community GET]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}
