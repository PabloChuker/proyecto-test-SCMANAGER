// =============================================================================
// SC LABS — GET / POST /api/chain-board/[id]/comments
//
// GET  — Lista comentarios de una cadena (público).
// POST — Postear comentario (auth requerido).
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
    const { data, error } = await supabase
      .from("chain_comments")
      .select("id, chain_id, user_id, body, created_at")
      .eq("chain_id", id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    // Enriquecer con username/avatar via profiles_public
    const userIds = Array.from(new Set((data ?? []).map((c) => c.user_id)));
    let profilesById = new Map<string, { username: string | null; display_name: string | null; avatar_url: string | null }>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, username, display_name, avatar_url")
        .in("id", userIds);
      profilesById = new Map(
        (profiles ?? []).map((p: any) => [
          p.id,
          { username: p.username, display_name: p.display_name, avatar_url: p.avatar_url },
        ]),
      );
    }

    const enriched = (data ?? []).map((c) => {
      const author = profilesById.get(c.user_id);
      return {
        id: c.id,
        chain_id: c.chain_id,
        body: c.body,
        created_at: c.created_at,
        author_username: author?.username ?? null,
        author_display_name: author?.display_name ?? null,
        author_avatar_url: author?.avatar_url ?? null,
      };
    });

    return NextResponse.json({ comments: enriched });
  } catch (e: any) {
    console.error("[/api/chain-board/[id]/comments GET]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const text = (body?.body ?? "").toString().trim();
    if (!text || text.length < 1 || text.length > 2000) {
      return NextResponse.json({ error: "El comentario debe tener entre 1 y 2000 caracteres." }, { status: 400 });
    }

    // Validar que la cadena existe
    const { data: chain } = await supabase
      .from("shared_chains")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!chain) return NextResponse.json({ error: "Cadena no encontrada." }, { status: 404 });

    const { data, error } = await supabase
      .from("chain_comments")
      .insert({ chain_id: id, user_id: user.id, body: text })
      .select("id, chain_id, body, created_at, user_id")
      .single();
    if (error) throw error;
    return NextResponse.json({ comment: data }, { status: 201 });
  } catch (e: any) {
    console.error("[/api/chain-board/[id]/comments POST]", e);
    return NextResponse.json({ error: e?.message ?? "Error interno" }, { status: 500 });
  }
}
