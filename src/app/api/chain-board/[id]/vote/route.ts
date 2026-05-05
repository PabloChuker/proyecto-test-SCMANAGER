// =============================================================================
// SC LABS — POST /api/chain-board/[id]/vote
//
// Toggle del voto del usuario actual sobre una cadena. Si ya votó → unvote.
// Sino → vote. El votes_count se mantiene por trigger en BD.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Validar que la cadena existe (caemos en 404 si no, mejor que dar error
    // de FK al insert).
    const { data: chain } = await supabase
      .from("shared_chains")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!chain) return NextResponse.json({ error: "No encontrada." }, { status: 404 });

    // ¿Ya votó?
    const { data: existing } = await supabase
      .from("chain_votes")
      .select("chain_id")
      .eq("chain_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("chain_votes")
        .delete()
        .eq("chain_id", id)
        .eq("user_id", user.id);
      if (error) throw error;
      return NextResponse.json({ voted: false });
    } else {
      const { error } = await supabase
        .from("chain_votes")
        .insert({ chain_id: id, user_id: user.id });
      if (error) throw error;
      return NextResponse.json({ voted: true });
    }
  } catch (e: any) {
    console.error("[/api/chain-board/[id]/vote POST]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}
