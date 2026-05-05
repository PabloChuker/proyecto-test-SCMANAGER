// =============================================================================
// SC LABS — GET / DELETE /api/chain-board/[id]
//
// GET    — Detalle completo de una cadena compartida (incluye snapshot).
// DELETE — Eliminar una cadena (auth + owner-only via RLS).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: chain, error } = await supabase
      .from("shared_chains_public")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !chain) {
      return NextResponse.json({ error: "Cadena no encontrada." }, { status: 404 });
    }

    // Snapshot completo (de la tabla base — RLS read pública)
    const { data: snap } = await supabase
      .from("shared_chains")
      .select("snapshot_json")
      .eq("id", id)
      .single();

    // Si user logueado, decir si votó
    const { data: { user } } = await supabase.auth.getUser();
    let votedByMe = false;
    if (user) {
      const { data: vote } = await supabase
        .from("chain_votes")
        .select("chain_id")
        .eq("chain_id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      votedByMe = !!vote;
    }

    return NextResponse.json({
      chain: {
        ...chain,
        snapshot: snap?.snapshot_json ?? null,
        voted_by_me: votedByMe,
      },
    });
  } catch (e: any) {
    console.error("[/api/chain-board/[id] GET]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // RLS bloquea si no es owner; nosotros chequeamos antes para devolver 403
    // limpio en lugar de 0 rows updated.
    const { data: chain } = await supabase
      .from("shared_chains")
      .select("owner_id")
      .eq("id", id)
      .single();
    if (!chain) return NextResponse.json({ error: "No encontrada." }, { status: 404 });
    if (chain.owner_id !== user.id) {
      return NextResponse.json({ error: "Solo el autor puede borrar." }, { status: 403 });
    }

    const { error } = await supabase.from("shared_chains").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[/api/chain-board/[id] DELETE]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}
